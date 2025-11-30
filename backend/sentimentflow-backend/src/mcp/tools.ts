import { submitEntryFunction } from '../onchain/aptos_client';

// Constants for Liquidswap V2 (Mainnet)
const LIQUIDSWAP_ADDR = "0x190d44266241744264b964a37b8f09863167a12d3e70cda39376cfb4e3561e12";
const APT_COIN = "0x1::aptos_coin::AptosCoin";
// Note: Verify which USDC you want (LayerZero, Wormhole, or native). This is LayerZero USDC.
const USDC_COIN = "0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC";
const CURVE_UNCORRELATED = `${LIQUIDSWAP_ADDR}::curves::Uncorrelated`;

/**
 * Execute a Real Swap on Liquidswap V2 (APT -> USDC)
 */
export async function executeRealSwap(params: {
  amountIn: number; // Amount of APT to sell (in Octas)
  minAmountOut: number; // Minimum USDC to receive (Slippage protection)
}): Promise<{ success: boolean; txHash: string; error?: string }> {

  // Function: liquidswap::scripts_v2::swap
  const functionId = `${LIQUIDSWAP_ADDR}::scripts_v2::swap`;

  // Type Args: <X, Y, Curve> -> <APT, USDC, Uncorrelated>
  const typeArgs = [APT_COIN, USDC_COIN, CURVE_UNCORRELATED];

  // Args: [amount_in, min_amount_out]
  const args = [
    Math.floor(params.amountIn).toString(),
    Math.floor(params.minAmountOut).toString()
  ];

  console.log(`[Swap] 💱 Swapping ${params.amountIn} APT for USDC...`);

  return await submitEntryFunction(functionId, typeArgs, args);
}

const MODULE_ADDRESS = process.env.APTOS_MODULE_ADDRESS;
const MODULE_NAME = 'strategy'; // Based on your code: module sentiment_flow::strategy
/**
 * 
 * 
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