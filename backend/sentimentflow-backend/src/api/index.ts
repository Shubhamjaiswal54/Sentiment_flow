import type { FastifyInstance } from 'fastify';
import strategyRoutes from './routes/strategy';
import marketRoutes from './routes/markets';
import sentimentRoutes from './routes/sentiment';
import simulationRoutes from './routes/simulation';
import executeRoutes from './routes/execute';

export default async function apiRoutes(fastify: FastifyInstance) {
  fastify.register(strategyRoutes, { prefix: '/strategy' });
  fastify.register(marketRoutes, { prefix: '/markets' });
  fastify.register(sentimentRoutes, { prefix: '/sentiment' });
  fastify.register(simulationRoutes, { prefix: '/simulate' });
  fastify.register(executeRoutes, { prefix: '/execute' });
}