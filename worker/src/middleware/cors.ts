import { cors } from 'hono/cors';

export const corsMiddleware = cors({
  origin: '*', 
  allowHeaders: ['Content-Type', 'x-turnstile-token', 'Authorization', 'x-upload-token'],
  allowMethods: ['POST', 'GET', 'PUT', 'OPTIONS'],
});
