/**
 * Convert probability (0-1) to basis points (0-10000)
 */
export function probToBps(probability: number): number {
  return Math.round(probability * 10000);
}

/**
 * Convert sentiment (-1 to 1) to basis points (0-10000)
 */
export function sentimentToBps(sentiment: number): number {
  return Math.round((sentiment + 1) * 5000);
}

/**
 * Convert basis points (0-10000) to probability (0-1)
 */
export function bpsToProb(bps: number): number {
  return bps / 10000;
}

/**
 * Convert basis points (0-10000) to sentiment (-1 to 1)
 */
export function bpsToSentiment(bps: number): number {
  return (bps / 5000) - 1;
}

/**
 * Sleep for the specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxAttempts) {
        throw lastError;
      }
      
      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * baseDelay;
      await sleep(delay);
    }
  }
  
  throw lastError!;
}