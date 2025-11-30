import axios from 'axios';
import { prisma } from '../db/client';

// Polymarket Gamma API Endpoint
const POLYMARKET_API_URL = 'https://gamma-api.polymarket.com/markets';
const FETCH_INTERVAL_MINUTES = parseInt(process.env.POLYMARKET_FETCH_INTERVAL_MINUTES || '5');

// ==============================================================================
// 1. UPDATED MAPPING (CRITICAL FIX)
// ==============================================================================
// These keywords now match the actual markets found in your logs (Nov 2025).
// You must use these keys (e.g., 'TRUMP_CABINET') as the 'marketId' in your Strategy table.
const MARKET_KEYWORD_MAP: Record<string, string[]> = {
  // Found in logs: "Will John Ratcliffe be the first to leave the Trump Cabinet in 2025?"
  'TRUMP_CABINET': ['Ratcliffe', 'Trump', 'Cabinet'],

  // Found in logs: "Will Barack Obama win the 2028 Democratic presidential nomination?"
  'ELECTION_2028': ['Obama', '2028'],
  
  // Found in logs: "U.S. agrees to a new trade deal with 'Australia'?"
  'TRADE_AUSTRALIA': ['Trade', 'Deal', 'Australia'],

  // Crypto markets - add these to match your sentiment data
  'CRYPTO_BTC': ['Bitcoin', 'BTC', '$100'],
  'CRYPTO_ETH': ['Ethereum', 'ETH'],
  'CRYPTO_XRP': ['XRP', 'Up', 'Down'],         // Matches "XRP Up or Down"
  'CRYPTO_HYPE': ['Hyperliquid', 'Reach'],     // Matches "Will Hyperliquid reach..."
  'SPORTS_NFL': ['Mahomes', 'Fantasy'],
  'TRUMP_NOMINEE':      ['Trump', 'Nominate'],
  'POLITICS_TEXAS':     ['Dawn Buckingham', 'Texas'],
  'POLITICS_FLORIDA':   ['Gwen Graham', 'Florida'],
  'US_POLICY':          ['Ceasefire', 'Ukraine', '2025'],

  // --- CRYPTO & FINANCE ---
  'CRYPTO_SOL':         ['Solana', 'Price'],
  'CRYPTO_AIRDROP':     ['Airdrop', '2025'],
  'FED_RATES':          ['Fed', 'Rate', 'Cut'],
  'ECON_RECESSION':     ['Recession', '2025'],
  'FINANCE_NVIDIA':     ['Nvidia', 'Stock'],

  // --- SPORTS (NFL, NBA, SOCCER) ---
  'SPORTS_NFL_GAME':    ['NFL', 'Game', 'Winner'],
  'SPORTS_NFL_MAHOMES': ['Mahomes', 'Fantasy'],
  'SPORTS_NBA':         ['NBA', 'Winner'],
  'SPORTS_SOCCER_EPL':  ['Premier League', 'Winner'],
  'SPORTS_SOCCER_UCL':  ['Champions League', 'Winner'],
  'SPORTS_TENNIS':      ['Grand Slam', 'Winner'],

  // --- POP CULTURE & TECH ---
  'CULTURE_TIKTOK':     ['TikTok', 'Ban'],
  'CULTURE_YOUTUBE':    ['MrBeast', 'Subscriber'],
  'TECH_AI':            ['OpenAI', 'GPT'],
  'AWARDS_OSCARS':      ['Oscar', 'Best Picture'],
  'GAMING_GTA6':        ['GTA', 'VI', 'Release'],
  // --- MAJORS (L1s) ---
  'CRYPTO_ADA':         ['Cardano', 'ADA'],
  'CRYPTO_AVAX':        ['Avalanche', 'AVAX'],
  'CRYPTO_DOT':         ['Polkadot', 'DOT'],
  'CRYPTO_TRX':         ['TRON', 'TRX'],
  'CRYPTO_BNB':         ['Binance Coin', 'BNB'],
  'CRYPTO_TON':         ['Toncoin', 'TON'],
  
  // --- NEWER L1s (High Volatility) ---
  'CRYPTO_SUI':         ['Sui', 'SUI'],
  'CRYPTO_APT':         ['Aptos', 'APT'],
  'CRYPTO_SEI':         ['Sei', 'SEI'],
  'CRYPTO_TIA':         ['Celestia', 'TIA'],

  // --- MEMECOINS (High Volume) ---
  'CRYPTO_DOGE':        ['Dogecoin', 'DOGE'],
  'CRYPTO_SHIB':        ['Shiba', 'SHIB'],
  'CRYPTO_PEPE':        ['Pepe'],
  'CRYPTO_WIF':         ['dogwifhat', 'WIF'],
  'CRYPTO_BONK':        ['Bonk'],

  // --- LAYER 2s & DEFI ---
  'CRYPTO_ARB':         ['Arbitrum', 'ARB'],
  'CRYPTO_OP':          ['Optimism', 'OP'],
  'CRYPTO_MATIC':       ['Polygon', 'MATIC', 'POL'],
  'CRYPTO_LINK':        ['Chainlink', 'LINK'],
  'CRYPTO_UNI':         ['Uniswap', 'UNI'],
  'CRYPTO_LDO':         ['Lido', 'LDO'],

  // --- THEMES & EVENTS ---
  'CRYPTO_ETF':         ['ETF', 'Approval', 'Inflow'],   // Matches "Solana ETF", "XRP ETF"
  'CRYPTO_STABLE':      ['Tether', 'USDC', 'Depeg'],     // Matches "Will USDT depeg?"
  'CRYPTO_REG':         ['SEC', 'Gensler', 'Regulation'],// Matches "Will Gary Gensler resign?"
  'CRYPTO_EXCHANGE':    ['Binance', 'Coinbase', 'FTX'],  // Matches "Coinbase earnings", "Binance listing"
  'CRYPTO_NFT':         ['NFT', 'Floor Price', 'Punk'],  // Matches "Bored Ape Floor"

  // --- NON-CRYPTO (Keep these for variety/testing) ---
  'ECON_INFLATION':     ['Inflation', '2025'],
  'ECON_JOBLESS':       ['Unemployment', 'Rate'],
  'POLITICS_IMPEACH':   ['Impeachment', '2025'],
  'POLITICS_MIDTERMS':  ['Midterm', 'Elections', '2026'],
  'POLITICS_CLIMATE':   ['Climate', 'Policy', '2025'],
  'HEALTH_COVID':       ['COVID', 'Cases', '2025'],
  'HEALTH_VACCINE':     ['Vaccine', 'Approval'],

};

// Interface matching the actual Gamma API response
interface GammaMarket {
  id: string;
  question: string;
  active: boolean;
  closed: boolean;
  // Gamma API often returns these as JSON strings or arrays depending on the version
  outcomes: string | string[];
  outcomePrices: string | string[];
  volume: string;
  endDate: string;
}

/**
 * Fetch active market data from Polymarket Gamma API
 */
async function fetchPolymarketData(): Promise<GammaMarket[]> {
  try {
    // We add params to fetch only active markets and limit the size to avoid timeouts
    const response = await axios.get(POLYMARKET_API_URL, {
      params: {
        active: true,
        closed: false,
        limit: 1000, // Fetch top 100 active markets
        order: 'volume', // Sort by volume to get the most relevant markets
        ascending: false
      }
    });

    // The API might return the array directly or wrapped in { data: ... }
    const data = response.data instanceof Array ? response.data : response.data?.data || [];
    return data as GammaMarket[];
  } catch (error) {
    console.error('Error fetching Polymarket data:', error);
    return []; // Return empty array on failure so worker doesn't crash
  }
}

/**
 * Process and store market snapshots
 */
async function processMarketSnapshots(markets: GammaMarket[]): Promise<void> {
  const now = new Date();
  const snapshotsToCreate = [];

  // Iterate through our tracked tags
  for (const [internalTag, keywords] of Object.entries(MARKET_KEYWORD_MAP)) {

    // Find a market that contains ALL keywords for this tag
    // Case-insensitive search
    const matchingMarket = markets.find(m =>
      keywords.every(k => m.question.toLowerCase().includes(k.toLowerCase()))
    );

    if (matchingMarket) {
      // PARSE PRICES: Gamma API returns prices as ["0.55", "0.45"] or JSON strings
      let probability = 0;
      try {
        const prices = typeof matchingMarket.outcomePrices === 'string'
          ? JSON.parse(matchingMarket.outcomePrices)
          : matchingMarket.outcomePrices;

        // We assume the first outcome (index 0) is "Yes" or the primary outcome
        if (prices && prices.length > 0) {
          probability = parseFloat(prices[0]);
        }
      } catch (e) {
        console.warn(`Failed to parse prices for market ${matchingMarket.id}`);
      }

      console.log(`✓ Matched ${internalTag} -> "${matchingMarket.question}" (Prob: ${probability})`);

      snapshotsToCreate.push({
        marketId: internalTag, // We use OUR internal tag (e.g., TRUMP_CABINET) as the ID for consistency
        timestamp: now,
        probability: probability,
      });
    } else {
      // Optional: Comment this out to reduce log noise if many tags don't match
      // console.log(`No active market found for tag: ${internalTag}`);
    }
  }

  // Insert snapshots in batch
  if (snapshotsToCreate.length > 0) {
    await prisma.marketSnapshot.createMany({
      data: snapshotsToCreate,
      skipDuplicates: true
    });

    console.log(`✓ Created ${snapshotsToCreate.length} market snapshots`);
  } else {
    console.log(`⚠ No tracked markets matched keywords in this batch.`);
  }
}

/**
 * Main function to run the Polymarket fetcher
 */
export async function runPolymarketFetcher(): Promise<void> {
  console.log('Running Polymarket fetcher...');

  try {
    const markets = await fetchPolymarketData();
    console.log(`Fetched ${markets.length} active markets.`);
    console.log(markets);
    // Debug log to help identify new market opportunities
    if (markets.length > 0) {
      console.log("--- Top Market Sample ---");
      // Log just the first 3 for sanity check
      markets.slice(0, 3).forEach(m => console.log(`- ${m.question}`));
      console.log("-------------------------");
    }
    
    if (markets.length > 0) {
      await processMarketSnapshots(markets);
    } else {
      console.log('No markets returned from API');
    }
    console.log('Polymarket fetcher completed successfully');
  } catch (error) {
    console.error('Error in Polymarket fetcher:', error);
  }
}

/**
 * Schedule the Polymarket fetcher
 */
export function schedulePolymarketFetcher(): void {
  runPolymarketFetcher();
  setInterval(runPolymarketFetcher, FETCH_INTERVAL_MINUTES * 60 * 1000);
  console.log(`Polymarket fetcher scheduled to run every ${FETCH_INTERVAL_MINUTES} minutes`);
}