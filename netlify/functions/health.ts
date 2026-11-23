// =====================================================
// Netlify Function - 健康检查
// =====================================================
import { DEFAULT_MODEL } from '../../server/minimax.ts';

export default function handler(req: Request): Response {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  return new Response(
    JSON.stringify({
      serverKeyConfigured: Boolean(process.env.MINIMAX_API_KEY),
      model: DEFAULT_MODEL,
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    },
  );
}
