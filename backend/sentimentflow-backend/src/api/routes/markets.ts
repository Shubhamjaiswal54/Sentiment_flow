import type  { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/client';
import  { getCache, setCache } from '../../utils/cache';

const getMarketsSchema = z.object({
  marketId: z.string().optional(),
  limit: z.number().int().positive().optional().default(100),
  offset: z.number().int().nonnegative().optional().default(0),
});

async function marketRoutes(fastify: FastifyInstance) {
  // GET /markets - Get market data (with caching)
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { marketId, limit, offset } = getMarketsSchema.parse(request.query);
      
      // Create cache key
      const cacheKey = `markets:${marketId || 'all'}:${limit}:${offset}`;
      
      // Try to get from cache
      const cachedData = getCache(cacheKey);
      if (cachedData) {
        return reply.code(200).send({
          success: true,
          data: cachedData,
          fromCache: true
        });
      }
      
      // Build query
      const where = marketId ? { marketId } : {};
      
      // Get latest snapshot for each market
      const latestSnapshots = await prisma.marketSnapshot.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
        distinct: ['marketId']
      });
      
      // Cache for 5 minutes
      setCache(cacheKey, latestSnapshots, 300);
      
      return reply.code(200).send({
        success: true,
        data: latestSnapshots,
        fromCache: false
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid request parameters',
          details: error.errors
        });
      }
      
      fastify.log.error(error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch market data'
      });
    }
  });
}

export default marketRoutes;