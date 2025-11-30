import { prisma } from '../db/client';
import { executeStrategyViaMCP, registerStrategyOnChain } from '../mcp/tools';
import { StrategyStatus } from '@prisma/client';

// Helper to prevent API Rate Limits (prevents "Anonymous IP" ban)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Discover potential strategies from recent snapshots and auto-create them.
 * This fulfills the "find and add more strategies" requirement.
 */
async function discoverAndCreateStrategies(): Promise<void> {
  console.log('Running strategy discovery...');

  // 1. Get recent positive sentiment snapshots (last 24h, score > 0.1)
  const recentSentiments = await prisma.sentimentSnapshot.findMany({
    where: {
      timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      score: { gt: 0.1 }
    },
    orderBy: { score: 'desc' },
    distinct: ['tag']
  });

  // 2. Get recent active market snapshots (last 24h)
  const recentMarkets = await prisma.marketSnapshot.findMany({
    where: {
      timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    },
    orderBy: { timestamp: 'desc' },
    distinct: ['marketId']
  });

  // 3. Define Strategy Mapping Logic
  // This helper function decides which Sentiment Tag pairs with a given Market ID.
  const getSentimentTagForMarket = (marketId: string): string | null => {
    // A. Exact Matches (Specific Market -> Specific Sentiment)
    const exactMap: Record<string, string> = {
      'TRUMP_CABINET': 'TRUMP',
      'TRUMP_NOMINEE': 'TRUMP',
      'ELECTION_2028': 'ELECTION',
      'FED_RATES': 'FED',
      'ECON_RECESSION': 'STOCK_MARKET',
      'FINANCE_NVIDIA': 'STOCK_MARKET',
    };

    if (exactMap[marketId]) return exactMap[marketId];

    // B. Prefix/Category Matches (Generic Handling)
    if (marketId.startsWith('CRYPTO_')) return 'CRYPTO'; // Maps CRYPTO_BTC, CRYPTO_HYPE -> CRYPTO
    if (marketId.startsWith('SPORTS_')) return 'SPORTS'; // Requires a 'SPORTS' sentiment source
    if (marketId.startsWith('POLITICS_')) return 'POLITICS'; // Requires 'POLITICS' sentiment source

    return null;
  };

  // 4. Iterate through ACTIVE MARKETS to find matches
  for (const market of recentMarkets) {
    const requiredSentimentTag = getSentimentTagForMarket(market.marketId);

    // If we don't know which sentiment applies to this market, skip it
    if (!requiredSentimentTag) continue;

    // Check if we actually have recent sentiment data for this tag
    const sentimentData = recentSentiments.find(s => s.tag === requiredSentimentTag);
    if (!sentimentData) continue;

    // 5. Check if a strategy already exists
    const existingStrategy = await prisma.strategy.findFirst({
      where: {
        marketId: market.marketId,
        sentimentTag: requiredSentimentTag,
        status: { in: ['ACTIVE' as StrategyStatus, 'PENDING' as StrategyStatus] }
      }
    });

    if (!existingStrategy) {
      console.log(`★ Discovered new opportunity: ${sentimentData.tag} + ${market.marketId}`);
      
      // 1. Create in Database (Postgres)
      const newStrategy = await prisma.strategy.create({
        data: {
          ownerAddress: process.env.DEFAULT_ADMIN_WALLET || '0x_ADMIN_WALLET',
          marketId: market.marketId,
          sentimentTag: sentimentData.tag,
          minPredictionProb: 0.05,
          minSentimentScore: 0.15,
          notionalAmount: 50.0,
          maxSlippageBps: 100,
          expiryTimestamp: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 
          status: 'ACTIVE' as StrategyStatus,
          // userId removed to prevent "Foreign key constraint violated"
        }
      });

      console.log(`[DB] Created Strategy ${newStrategy.id}`);

      // 2. 👇 NEW: Register on Blockchain (Aptos)
      // This is crucial: without this, execute_strategy will fail later with E_STRATEGY_STORE_NOT_FOUND
      console.log(`[Chain] Registering Strategy ${newStrategy.id}...`);
      try {
          await registerStrategyOnChain({
            strategyId: newStrategy.id,
            ownerAddress: newStrategy.ownerAddress, // Used for logging only
            marketId: newStrategy.marketId,
            sentimentTag: newStrategy.sentimentTag,
            minPredictionProb: Math.round(newStrategy.minPredictionProb * 10000), // Convert to BPS
            minSentimentScore: Math.round(newStrategy.minSentimentScore * 10000), // Convert to BPS
            notionalAmount: Math.round(newStrategy.notionalAmount),
            maxSlippageBps: newStrategy.maxSlippageBps,
            expiryTimestamp: Math.floor(newStrategy.expiryTimestamp.getTime() / 1000)
          });
          console.log(`✓ On-Chain Registration Successful!`);
          
          // Wait a bit after registration to be safe and avoid rate limits
          await delay(2000);
      } catch (error) {
          console.error(`❌ Failed to register on-chain:`, error);
          // We continue anyway, but execution might fail later if this didn't work
      }
    }
  }
}

/**
 * Check if a strategy should be executed based on current market and sentiment data
 */
async function shouldExecuteStrategy(strategy: any): Promise<{
  shouldExecute: boolean;
  probability: number;
  sentiment: number;
  reason: string;
}> {
  // Get latest market snapshot
  const latestMarketSnapshot = await prisma.marketSnapshot.findFirst({
    where: { marketId: strategy.marketId },
    orderBy: { timestamp: 'desc' }
  });
  
  // Get latest sentiment snapshot
  const latestSentimentSnapshot = await prisma.sentimentSnapshot.findFirst({
    where: { tag: strategy.sentimentTag },
    orderBy: { timestamp: 'desc' }
  });
  
  // If we don't have data for either market or sentiment, we can't execute
  if (!latestMarketSnapshot || !latestSentimentSnapshot) {
    return {
      shouldExecute: false,
      probability: 0,
      sentiment: 0,
      reason: `Missing data`
    };
  }
  
  const probability = latestMarketSnapshot.probability;
  const sentiment = latestSentimentSnapshot.score;
  
  // Check if thresholds are met
  const meetsProbabilityThreshold = probability >= strategy.minPredictionProb;
  const meetsSentimentThreshold = sentiment >= strategy.minSentimentScore;
  
  return {
    shouldExecute: meetsProbabilityThreshold && meetsSentimentThreshold,
    probability,
    sentiment,
    reason: meetsProbabilityThreshold && meetsSentimentThreshold 
      ? 'All thresholds met' 
      : `Thresholds not met: Prob(${probability.toFixed(2)})>=${strategy.minPredictionProb} ${meetsProbabilityThreshold ? '✓' : '✗'}, Sent(${sentiment.toFixed(2)})>=${strategy.minSentimentScore} ${meetsSentimentThreshold ? '✓' : '✗'}`
  };
}

/**
 * Execute a strategy and log the result
 */
async function executeStrategy(strategy: any): Promise<void> {
  try {
    // Check if we should execute
    const { shouldExecute, probability, sentiment, reason } = await shouldExecuteStrategy(strategy);
    
    if (!shouldExecute) {
      console.log(`Skipping strategy ${strategy.id}: ${reason}`);
      return;
    }
    
    console.log(`⚡ Executing Strategy ${strategy.id} (Prob: ${probability}, Sent: ${sentiment})`);

    // Execute via MCP (Blockchain Transaction)
    const executionResult = await executeStrategyViaMCP({
      strategyId: strategy.id,
      marketId: strategy.marketId,
      probBps: Math.round(probability * 10000),
      sentimentBps: Math.round((sentiment + 1) * 5000) // Convert -1..1 to 0..10000 BPS
    });
    
    // Update strategy status if execution was successful
    if (executionResult.success) {
      await prisma.strategy.update({
        where: { id: strategy.id },
        data: {
          status: 'EXECUTED' as StrategyStatus,
          lastExecutedAt: new Date(),
          lastTxHash: executionResult.txHash
        }
      });
      console.log(`✓ Strategy ${strategy.id} executed successfully! Tx: ${executionResult.txHash}`);
    }
    
    // Log execution
    await prisma.executionLog.create({
      data: {
        strategyId: strategy.id,
        success: executionResult.success,
        txHash: executionResult.txHash,
        reason: executionResult.reason
      }
    });
    
  } catch (error) {
    console.error(`Error executing strategy ${strategy.id}:`, error);
    
    // Log the error
    await prisma.executionLog.create({
      data: {
        strategyId: strategy.id,
        success: false,
        reason: `Execution error: ${error instanceof Error ? error.message : String(error)}`
      }
    });
  }
}

/**
 * Main function to run the strategy execution engine
 */
export async function runStrategyExecutionEngine(): Promise<void> {
  console.log('Running strategy execution engine...');
  
  try {
    // 1. First, try to discover and create NEW strategies based on fresh data
    await discoverAndCreateStrategies();

    // 2. Then, get all active strategies
    const activeStrategies = await prisma.strategy.findMany({
      where: { status: 'ACTIVE' as StrategyStatus }
    });
    
    console.log(`Found ${activeStrategies.length} active strategies`);
    
    // 3. Process each strategy
    for (const strategy of activeStrategies) {
      // Check if strategy has expired
      if (new Date() > strategy.expiryTimestamp) {
        // Update status to expired
        await prisma.strategy.update({
          where: { id: strategy.id },
          data: { status: 'EXPIRED' as StrategyStatus }
        });
        
        console.log(`Strategy ${strategy.id} has expired`);
        continue;
      }
      
      // Execute strategy if conditions are met
      await executeStrategy(strategy);

      // RATE LIMIT PROTECTION: Wait 3 seconds between transactions
      console.log("⏳ Waiting 3s...");
      await delay(3000);
    }
    
    console.log('Strategy execution engine completed successfully');
  } catch (error) {
    console.error('Error in strategy execution engine:', error);
  }
}

/**
 * Simulate strategy execution over a historical time period
 */
export async function simulateStrategyExecution(
  strategy: any,
  fromTimestamp?: Date,
  toTimestamp?: Date
): Promise<{
  executionPoints: Array<{
    timestamp: Date;
    probability: number;
    sentiment: number;
    wouldExecute: boolean;
  }>;
  totalExecutions: number;
}> {
  // Default to last 7 days if no time range provided
  const to = toTimestamp || new Date();
  const from = fromTimestamp || new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  // Get market snapshots in the time range
  const marketSnapshots = await prisma.marketSnapshot.findMany({
    where: {
      marketId: strategy.marketId,
      timestamp: {
        gte: from,
        lte: to
      }
    },
    orderBy: { timestamp: 'asc' }
  });
  
  // Get sentiment snapshots in the time range
  const sentimentSnapshots = await prisma.sentimentSnapshot.findMany({
    where: {
      tag: strategy.sentimentTag,
      timestamp: {
        gte: from,
        lte: to
      }
    },
    orderBy: { timestamp: 'asc' }
  });
  
  // Merge the data by timestamp (simplified approach - using market timestamps)
  const executionPoints = [];
  let totalExecutions = 0;
  
  for (const marketSnapshot of marketSnapshots) {
    // Find the closest sentiment snapshot before or at the same time
    const sentimentSnapshot = sentimentSnapshots
      .filter((s: typeof sentimentSnapshots[0]) => s.timestamp <= marketSnapshot.timestamp)
      .sort((a: typeof sentimentSnapshots[0], b: typeof sentimentSnapshots[0]) => b.timestamp.getTime() - a.timestamp.getTime())[0];
    
    if (!sentimentSnapshot) continue;
    
    const probability = marketSnapshot.probability;
    const sentiment = sentimentSnapshot.score;
    
    // Check if thresholds would be met
    const wouldExecute = 
      probability >= strategy.minPredictionProb && 
      sentiment >= strategy.minSentimentScore;
    
    if (wouldExecute) totalExecutions++;
    
    executionPoints.push({
      timestamp: marketSnapshot.timestamp,
      probability,
      sentiment,
      wouldExecute
    });
  }
  
  return {
    executionPoints,
    totalExecutions
  };
}