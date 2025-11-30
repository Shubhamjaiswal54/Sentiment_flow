import dotenv from 'dotenv';
import Fastify from 'fastify';
import apiRoutes from './api';
import cors from '@fastify/cors';

// Load environment variables
dotenv.config();

// Create Fastify instance
const fastify = Fastify({
  logger: true
});

// Register CORS plugin
fastify.register(cors, {
  origin: '*', // Adjust this in production for security
});

// Register API routes
fastify.register(apiRoutes);

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000');
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Server listening on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();