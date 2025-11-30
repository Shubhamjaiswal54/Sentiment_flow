import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/client';
import { getCache, setCache } from '../../utils/cache';

const getSentimentSchema = z.object({
  tag: z.string(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().int().positive().optional().default(100),
});

async function sentimentRoutes(fastify: FastifyInstance) {
  // GET /sentiment/:tag - Get sentiment timeline for a tag
  fastify.get('/:tag', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { tag } = request.params as { tag: string };
      const { from, to, limit } = getSentimentSchema.parse({
        ...(request.query as Record<string, unknown>),
        tag
      });
      
      // Create cache key
      const cacheKey = `sentiment:${tag}:${from || 'all'}:${to || 'all'}:${limit}`;
      
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
      const where: any = { tag };
      
      if (from || to) {
        where.timestamp = {};
        if (from) where.timestamp.gte = new Date(from);
        if (to) where.timestamp.lte = new Date(to);
      }
      
      // Get sentiment snapshots
      const sentimentData = await prisma.sentimentSnapshot.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit
      });
      
      // Cache for 5 minutes
      setCache(cacheKey, sentimentData, 300);
      
      return reply.code(200).send({
        success: true,
        data: sentimentData,
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
        error: 'Failed to fetch sentiment data'
      });
    }
  });
}

export default sentimentRoutes;