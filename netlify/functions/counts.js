import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const params = new URLSearchParams(event.rawQuery || '');
  const date = params.get('date');

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'date param required (YYYY-MM-DD)' }),
    };
  }

  const key = `counts:${date}`;

  if (event.httpMethod === 'GET') {
    const data = await redis.get(key);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data ?? {}),
    };
  }

  if (event.httpMethod === 'POST') {
    const body = event.body ? JSON.parse(event.body) : null;
    if (!body || typeof body !== 'object') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid body' }) };
    }
    await redis.set(key, body, { ex: 30 * 24 * 60 * 60 });
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'method not allowed' }) };
};
