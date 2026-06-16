import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const PRIORITIES_KEY = 'priorities';

const h = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-session-token',
};
const ok  = (data) => ({ statusCode: 200, headers: h, body: JSON.stringify(data) });
const err = (code, msg) => ({ statusCode: code, headers: h, body: JSON.stringify({ error: msg }) });

async function getSession(event) {
  const token = (event.headers['x-session-token'] || '').trim();
  if (!token) return null;
  return await redis.get(`session:${token}`);
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: h, body: '' };

  const session = await getSession(event);
  if (!session) return err(401, 'unauthorized');

  if (event.httpMethod === 'GET') {
    const data = await redis.get(PRIORITIES_KEY);
    return ok(data ?? {});
  }

  if (event.httpMethod === 'POST') {
    if (session.role !== 'admin') return err(403, 'forbidden');
    const body = event.body ? JSON.parse(event.body) : null;
    if (!body || typeof body !== 'object') return err(400, 'invalid body');
    await redis.set(PRIORITIES_KEY, body);
    return ok({ ok: true });
  }

  return err(405, 'method not allowed');
};
