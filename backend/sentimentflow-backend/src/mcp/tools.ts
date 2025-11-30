import { submitEntryFunction } from '../onchain/aptos_client';

const MODULE_ADDRESS = process.env.APTOS_MODULE_ADDRESS;
const MODULE_NAME = 'strategy'; // Based on your code: module sentiment_flow::strategy

/**
 * Register a strategy on-chain via Aptos
 */
export async function registerStrategyOnChain(params: {
  strategyId: string;
  ownerAddress: string; // We keep this in params for logging, but won't send it to chain
  marketId: string;
  sentimentTag: string;
  minPredictionProb: number;
  minSentimentScore: number;
  notionalAmount: number;
  maxSlippageBps: number;
  expiryTimestamp: number;
}): Promise<{ strategyId: string; txHash: string }> {
  
  if (!MODULE_ADDRESS) throw new Error("APTOS_MODULE_ADDRESS not set");

  const functionId = `${MODULE_ADDRESS}::${MODULE_NAME}::register_strategy`;

  // CORRECTION: Removed 'ownerAddress' from this array.
  // The Move contract calculates 'owner' automatically from the signer.
  const args = [
    params.strategyId,                               // String
    params.marketId,                                 // String
    params.sentimentTag,                             // String
    Math.floor(params.minPredictionProb).toString(), // u64
    Math.floor(params.minSentimentScore).toString(), // u64
    Math.floor(params.notionalAmount).toString(),    // u64
    Math.floor(params.maxSlippageBps).toString(),    // u64
    Math.floor(params.expiryTimestamp).toString()    // u64
  ];

  console.log(`[MCP] Registering Strategy ${params.strategyId} on-chain...`);

  const result = await submitEntryFunction(functionId, [], args);

  if (!result.success) {
    throw new Error(`On-chain registration failed: ${result.error}`);
  }

  return {
    strategyId: params.strategyId,
    txHash: result.txHash
  };
}

/**
 * Execute a strategy via Aptos On-Chain Contract
 * (Assuming your Move execute_strategy function follows a similar pattern)
 */
export async function executeStrategyViaMCP(params: {
  strategyId: string;
  marketId: string;
  probBps: number;
  sentimentBps: number;
}): Promise<{ success: boolean; txHash?: string; reason?: string }> {
  
  if (!MODULE_ADDRESS) return { success: false, reason: "APTOS_MODULE_ADDRESS missing" };

  // Note: Ensure your Move contract actually has this function exposed!
  const functionId = `${MODULE_ADDRESS}::${MODULE_NAME}::execute_strategy`;

  const args = [
    params.strategyId,
    params.marketId, // If your Move function needs this
    Math.floor(params.probBps).toString(),
    Math.floor(params.sentimentBps).toString()
  ];

  console.log(`[MCP] Executing Strategy ${params.strategyId} on-chain...`);

  const result = await submitEntryFunction(functionId, [], args);

  if (result.success) {
    return { success: true, txHash: result.txHash };
  } else {
    return { success: false, reason: result.error };
  }
}