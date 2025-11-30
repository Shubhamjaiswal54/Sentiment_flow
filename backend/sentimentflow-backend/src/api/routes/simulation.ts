import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/client';
import { simulateStrategyExecution } from '../../strategy/execution_engine';

const simulateSchema = z.object({
  strategyId: z.string(),
  fromTimestamp: z.string().datetime().optional(),
  toTimestamp: z.string().datetime().optional(),
});

async function simulationRoutes(fastify: FastifyInstance) {
  // POST /simulate - Run historical evaluation of a strategy
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { strategyId, fromTimestamp, toTimestamp } = simulateSchema.parse(request.body);
      
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
      
      // Run simulation
      const simulationResult = await simulateStrategyExecution(
        strategy,
        fromTimestamp ? new Date(fromTimestamp) : undefined,
        toTimestamp ? new Date(toTimestamp) : undefined
      );
      
      return reply.code(200).send({
        success: true,
        result: simulationResult
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
        error: 'Failed to run simulation'
      });
    }
  });
}

export default simulationRoutes;