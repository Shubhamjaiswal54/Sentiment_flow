import { AptosClient, AptosAccount, HexString } from 'aptos';
import * as dotenv from 'dotenv';

// Ensure env vars are loaded
dotenv.config();

const NODE_URL = process.env.APTOS_NODE_URL || 'https://fullnode.testnet.aptoslabs.com/v1';
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY; 
const API_KEY = process.env.APTOS_API_KEY;

let aptosClient: AptosClient | null = null;

export function getAptosClient(): AptosClient {
  if (!aptosClient) {
    const customHeaders: Record<string, string> = {};

    if (API_KEY) {
      console.log(`[Aptos] 🔑 Loading API Key: ${API_KEY.slice(0, 6)}...`);
      customHeaders['Authorization'] = `Bearer ${API_KEY}`;
      // Some nodes strictly require Origin or User-Agent
      customHeaders['Origin'] = 'http://localhost'; 
    } else {
      console.error(`[Aptos] ❌ NO API KEY FOUND. Rate limits will apply.`);
    }

    // FIX: Changed 'HEADERS' to 'headers' (lowercase)
    aptosClient = new AptosClient(NODE_URL, { 
      HEADERS: customHeaders 
    });
  }
  return aptosClient;
}

export function getAdminAccount(): AptosAccount {
  if (!ADMIN_PRIVATE_KEY) throw new Error("ADMIN_PRIVATE_KEY missing in .env");
  const cleanKey = ADMIN_PRIVATE_KEY.replace(/^0x/, '');
  return new AptosAccount(HexString.ensure(cleanKey).toUint8Array());
}

export async function submitEntryFunction(
  functionId: string,
  typeArgs: string[],
  args: any[]
): Promise<{ success: boolean; txHash: string; error?: string }> {
  const client = getAptosClient();
  const account = getAdminAccount();

  try {
    const rawTxn = await client.generateTransaction(account.address(), {
      function: functionId,
      type_arguments: typeArgs,
      arguments: args,
    });

    const bcsTxn = await client.signTransaction(account, rawTxn);
    const pendingTxn = await client.submitTransaction(bcsTxn);
    
    console.log(`[Chain] ⏳ Tx Submitted: ${pendingTxn.hash}`);
    await client.waitForTransaction(pendingTxn.hash, { checkSuccess: true });
    
    return { success: true, txHash: pendingTxn.hash };
  } catch (error: any) {
    // Retry logic for Rate Limits (429)
    if (JSON.stringify(error).includes("429") || error.message?.includes("limit")) {
        console.warn(`[Chain] ⚠️ Rate Limit Hit. Pausing for 10s before retry...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
        // Simple recursive retry (one time)
        return submitEntryFunction(functionId, typeArgs, args);
    }
    return { success: false, txHash: "", error: error.message || String(error) };
  }
}