import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/client';
import { executeStrategyViaMCP } from '../../mcp/tools';

const executeSchema = z.object({
  strategyId: z.string(),
});

async function executeRoutes(fastify: FastifyInstance) {
  // POST /execute - Manually execute a strategy via Aptos MCP
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { strategyId } = executeSchema.parse(request.body);
      
      // Get strategy
      const strategy = await prisma.strategy.findUnique({
        where: { id: strategyId }
      });
      
      if (!strategy) {
        return reply.code(404).send({
          success: false,
          error: 'Strategy not found'
        });
      }
      
      if (strategy.status !== 'ACTIVE') {
        return reply.code(400).send({
          success: false,
          error: `Cannot execute strategy with status: ${strategy.status}`
        });
      }
      
      // Get latest market and sentiment data
      const latestMarketSnapshot = await prisma.marketSnapshot.findFirst({
        where: { marketId: strategy.marketId },
        orderBy: { timestamp: 'desc' }
      });
      
      const latestSentimentSnapshot = await prisma.sentimentSnapshot.findFirst({
        where: { tag: strategy.sentimentTag },
        orderBy: { timestamp: 'desc' }
      });
      
      if (!latestMarketSnapshot || !latestSentimentSnapshot) {
        return reply.code(400).send({
          success: false,
          error: 'Missing market or sentiment data'
        });
      }
      
      // Execute strategy via MCP
      const executionResult = await executeStrategyViaMCP({
        strategyId: strategy.id,
        marketId: strategy.marketId,
        probBps: Math.round(latestMarketSnapshot.probability * 10000),
        sentimentBps: Math.round((latestSentimentSnapshot.score + 1) * 5000) // Convert -1..1 to 0..10000 BPS
      });
      
      // Update strategy status if execution was successful
      if (executionResult.success) {
        await prisma.strategy.update({
          where: { id: strategy.id },
          data: {
            status: 'EXECUTED',
            lastExecutedAt: new Date(),
            lastTxHash: executionResult.txHash
          }
        });
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
      
      return reply.code(200).send({
        success: true,
        result: executionResult
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid request data',
          details: error.errors
        });
      }
      
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to execute strategy'
      });
    }
  });
}

export default executeRoutes;   