import 'dotenv/config'; 
import axios from 'axios';
import { prisma } from '../db/client';

// API Configuration
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY; // Optional, for higher limits
const FETCH_INTERVAL_MINUTES = 10

// Sentiment tags with multi-source configuration
const TRACKED_TAGS = [
  { 
    tag: 'TRUMP', 
    sources: ['alphavantage'],
    keywords: ['trump', 'donald trump']
  },
  { 
    tag: 'BIDEN', 
    sources: ['alphavantage'],
    keywords: ['biden', 'joe biden']
  },
  { 
    tag: 'CRYPTO', 
    sources: ['coingecko', 'alphavantage'],
    keywords: ['cryptocurrency', 'bitcoin', 'ethereum'],
    cryptoIds: ['bitcoin', 'ethereum', 'cardano', 'solana', 'polkadot']
  },
  { 
    tag: 'STOCK_MARKET', 
    sources: ['alphavantage'],
    keywords: ['stock market', 'stocks', 'trading', 'S&P 500', 'nasdaq'],
    symbols: ['SPY', 'QQQ', 'DIA']
  },
  { 
    tag: 'FED', 
    sources: ['alphavantage'],
    keywords: ['federal reserve', 'interest rate', 'fed', 'monetary policy', 'jerome powell']
  },
];

// Interfaces
interface SentimentData {
  source: string;
  score: number;
  weight: number;
  count: number;
}

// ========== ALPHA VANTAGE API ==========

async function fetchAlphaVantageSentiment(tagConfig: typeof TRACKED_TAGS[0]): Promise<SentimentData | null> {
  if (!ALPHA_VANTAGE_KEY) {
    console.warn('Alpha Vantage API key not configured');
    return null;
  }

  try {
    // Fetch news sentiment for the tag's keywords
    const topics = tagConfig.keywords.join(',');
    
    const response = await axios.get('https://www.alphavantage.co/query', {
      params: {
        function: 'NEWS_SENTIMENT',
        topics: topics,
        apikey: ALPHA_VANTAGE_KEY,
        limit: 50,
        sort: 'RELEVANCE'
      }
    });

    if (!response.data.feed || response.data.feed.length === 0) {
      console.log(`  No Alpha Vantage data found for ${tagConfig.tag}`);
      return null;
    }

    let totalScore = 0;
    let totalWeight = 0;
    let count = 0;

    response.data.feed.forEach((article: any) => {
      // Alpha Vantage provides sentiment scores from -1 to 1
      const articleSentiment = parseFloat(article.overall_sentiment_score || 0);
      const relevance = parseFloat(article.relevance_score || 0.5);
      
      // Weight by relevance and recency
      const weight = relevance;
      
      totalScore += articleSentiment * weight;
      totalWeight += weight;
      count++;
    });

    const score = totalWeight > 0 ? totalScore / totalWeight : 0;

    return {
      source: 'alphavantage',
      score,
      weight: totalWeight,
      count
    };
  } catch (error: any) {
    if (error.response?.data?.Note) {
      console.warn('Alpha Vantage rate limit reached - 25 requests/day limit');
    } else if (error.response?.data?.Information) {
      console.warn('Alpha Vantage API info:', error.response.data.Information);
    } else {
      console.error(`Alpha Vantage sentiment error for ${tagConfig.tag}:`, error.message);
    }
    return null;
  }
}

// ========== COINGECKO API ==========

async function fetchCoinGeckoSentiment(tagConfig: typeof TRACKED_TAGS[0]): Promise<SentimentData | null> {
  if (!tagConfig.cryptoIds || tagConfig.cryptoIds.length === 0) {
    return null;
  }

  try {
    const headers: any = {
      'Accept': 'application/json'
    };
    
    if (COINGECKO_API_KEY) {
      headers['x-cg-demo-api-key'] = COINGECKO_API_KEY;
    }

    let totalScore = 0;
    let totalWeight = 0;
    let count = 0;

    for (const coinId of tagConfig.cryptoIds) {
      try {
        const response = await axios.get(
          `https://api.coingecko.com/api/v3/coins/${coinId}`,
          {
            headers,
            params: {
              localization: false,
              tickers: false,
              community_data: true,
              developer_data: false,
              sparkline: false
            }
          }
        );

        const coin = response.data;
        
        // Calculate sentiment based on price change and community data
        const priceChange24h = coin.market_data?.price_change_percentage_24h || 0;
        const priceChange7d = coin.market_data?.price_change_percentage_7d || 0;
        const sentimentVotesUp = coin.sentiment_votes_up_percentage || 50;
        
        // Normalize price changes to sentiment scores
        const priceSentiment = Math.max(-1, Math.min(1, (priceChange24h + priceChange7d) / 20));
        const communitySentiment = (sentimentVotesUp - 50) / 50; // -1 to 1 range
        
        // Weighted combination (price weighted more heavily)
        const coinScore = (priceSentiment * 0.7 + communitySentiment * 0.3);
        const marketCap = coin.market_data?.market_cap?.usd || 0;
        const weight = Math.log(1 + marketCap / 1000000); // Normalize by millions
        
        totalScore += coinScore * weight;
        totalWeight += weight;
        count++;

        // Rate limiting for free tier
        await new Promise(resolve => setTimeout(resolve, COINGECKO_API_KEY ? 500 : 2000));
      } catch (error: any) {
        console.error(`Error fetching ${coinId}:`, error.message);
      }
    }

    if (count === 0) {
      console.log(`  No CoinGecko data found for ${tagConfig.tag}`);
      return null;
    }

    const score = totalWeight > 0 ? totalScore / totalWeight : 0;

    return {
      source: 'coingecko',
      score,
      weight: totalWeight,
      count
    };
  } catch (error: any) {
    console.error(`CoinGecko sentiment error for ${tagConfig.tag}:`, error.message);
    return null;
  }
}

// ========== AGGREGATION & STORAGE ==========

function aggregateSentiments(sentiments: (SentimentData | null)[]): number {
  const validSentiments = sentiments.filter((s): s is SentimentData => s !== null);
  
  if (validSentiments.length === 0) return 0;

  let totalScore = 0;
  let totalWeight = 0;

  validSentiments.forEach(s => {
    totalScore += s.score * s.weight;
    totalWeight += s.weight;
  });

  return totalWeight > 0 ? totalScore / totalWeight : 0;
}

async function processSentimentSnapshots(): Promise<void> {
  const now = new Date();
  
  for (const tagConfig of TRACKED_TAGS) {
    try {
      console.log(`\nProcessing ${tagConfig.tag}...`);
      
      const sentimentPromises: Promise<SentimentData | null>[] = [];
      
      // Fetch from configured sources
      if (tagConfig.sources.includes('alphavantage')) {
        sentimentPromises.push(fetchAlphaVantageSentiment(tagConfig));
      }
      
      if (tagConfig.sources.includes('coingecko')) {
        sentimentPromises.push(fetchCoinGeckoSentiment(tagConfig));
      }

      const sentiments = await Promise.all(sentimentPromises);
      
      // Log individual source results
      sentiments.forEach(s => {
        if (s) {
          console.log(`  ${s.source}: score=${s.score.toFixed(4)}, count=${s.count}, weight=${s.weight.toFixed(2)}`);
        }
      });

      // Aggregate scores
      const finalScore = aggregateSentiments(sentiments);
      
      // Only store if we have valid data
      if (sentiments.some(s => s !== null)) {
        await prisma.sentimentSnapshot.create({
          data: {
            tag: tagConfig.tag,
            timestamp: now,
            score: finalScore
          }
        });
        
        console.log(`✓ Created sentiment snapshot for ${tagConfig.tag}: ${finalScore.toFixed(4)}`);
      } else {
        console.log(`⚠ No data available for ${tagConfig.tag}, skipping snapshot`);
      }
    } catch (error: any) {
      console.error(`Error processing sentiment for tag ${tagConfig.tag}:`, error.message);
    }
  }
}

export async function runSentimentFetcher(): Promise<void> {
  console.log('=================================');
  console.log('Running Sentiment Fetcher');
  console.log('Sources: Alpha Vantage + CoinGecko');
  console.log('=================================');
  
  try {
    await processSentimentSnapshots();
    console.log('\n✓ Sentiment fetcher completed successfully\n');
  } catch (error: any) {
    console.error('Error in sentiment fetcher:', error.message);
  }
}

export function scheduleSentimentFetcher(): void {
  runSentimentFetcher();
  
  setInterval(runSentimentFetcher, FETCH_INTERVAL_MINUTES * 60 * 1000);
  
  console.log(`Sentiment fetcher scheduled to run every ${FETCH_INTERVAL_MINUTES} minutes`);
  console.log('Sources: Alpha Vantage + CoinGecko\n');
}