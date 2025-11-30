import * as dotenv from 'dotenv';
dotenv.config(); //
import * as cron from 'node-cron';
import { runPolymarketFetcher } from './ingestion/polymarket_fetcher';
import { runSentimentFetcher } from './ingestion/sentiment_fetcher';
import { runStrategyExecutionEngine } from './strategy/execution_engine';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Main startup function
async function startWorker() {
  console.log('Starting worker with scheduled tasks...');

  // Initial run with delays
  await runPolymarketFetcher();
  await delay(2000);
  await runSentimentFetcher();
  await delay(2000);
  await runStrategyExecutionEngine();

  // Schedule Polymarket fetcher (every 5 minutes)
  const polymarketInterval = parseInt(process.env.POLYMARKET_FETCH_INTERVAL_MINUTES || '5');
  setInterval(runPolymarketFetcher, polymarketInterval * 60 * 1000);
  console.log(`Polymarket fetcher scheduled every ${polymarketInterval} minutes`);

  // Schedule sentiment fetcher (every 10 minutes)
  const sentimentInterval = parseInt(process.env.SENTIMENT_FETCH_INTERVAL_MINUTES || '10');
  setInterval(runSentimentFetcher, sentimentInterval * 60 * 1000);
  console.log(`Sentiment fetcher scheduled every ${sentimentInterval} minutes`);

  // Schedule strategy execution engine (every 60 seconds)
  cron.schedule('*/60 * * * * *', async () => {
    await runStrategyExecutionEngine();
  });
  console.log('Strategy execution engine scheduled every 60 seconds');

  console.log('Worker started successfully!');
}

// Start the worker
startWorker().catch(error => {
  console.error('Failed to start worker:', error);
  process.exit(1);
});