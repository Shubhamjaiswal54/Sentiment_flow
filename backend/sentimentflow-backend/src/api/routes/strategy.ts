import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/client';
import { registerStrategyOnChain } from '../../mcp/tools';

const createStrategySchema = z.object({
  ownerAddress: z.string(),
  marketId: z.string(),
  sentimentTag: z.string(),
  minPredictionProb: z.number().min(0).max(1),
  minSentimentScore: z.number().min(-1).max(1),
  notionalAmount: z.number().positive(),
  maxSlippageBps: z.number().int().min(0).max(10000),
  expiryTimestamp: z.string().datetime(),
});

async function strategyRoutes(fastify: FastifyInstance) {
  // POST /strategy - Create a new strategy
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedData = createStrategySchema.parse(request.body);
      
      // Check if user exists
      let user = await prisma.user.findUnique({
        where: { address: validatedData.ownerAddress }
      });
      
      // Create user if doesn't exist
      if (!user) {
        user = await prisma.user.create({
          data: {
            address: validatedData.ownerAddress
          }
        });
      }
      
      // Create strategy in database
      const strategy = await prisma.strategy.create({
        data: {
          ...validatedData,
          expiryTimestamp: new Date(validatedData.expiryTimestamp),
        }
      });
      
      // Register strategy on-chain via MCP
      const onchainResult = await registerStrategyOnChain({
        strategyId: strategy.id,
        ownerAddress: validatedData.ownerAddress,
        marketId: validatedData.marketId,
        sentimentTag: validatedData.sentimentTag,
        minPredictionProb: Math.round(validatedData.minPredictionProb * 10000),
        minSentimentScore: Math.round((validatedData.minSentimentScore + 1) * 5000), // Convert -1..1 to 0..10000 BPS
        notionalAmount: validatedData.notionalAmount,
        maxSlippageBps: validatedData.maxSlippageBps,
        expiryTimestamp: Math.floor(new Date(validatedData.expiryTimestamp).getTime() / 1000)
      });
      
      // Update strategy with on-chain ID
      await prisma.strategy.update({
        where: { id: strategy.id },
        data: {
          onchainStrategyId: BigInt(onchainResult.strategyId)
        }
      });
      
      return reply.code(201).send({
        success: true,
        strategy: {
          ...strategy,
          onchainStrategyId: onchainResult.strategyId,
          txHash: onchainResult.txHash
        }
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
        error: 'Failed to create strategy'
      });
    }
  });
  
  // GET /strategy/:id - Get strategy details
  fastify.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      
      const strategy = await prisma.strategy.findUnique({
        where: { id },
        include: {
          executionLogs: {
            orderBy: { timestamp: 'desc' },
            take: 10
          }
        }
      });
      
      if (!strategy) {
        return reply.code(404).send({
          success: false,
          error: 'Strategy not found'
        });
      }
      
      return reply.code(200).send({
        success: true,
        strategy
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch strategy'
      });
    }
  });
}

export default strategyRoutes;