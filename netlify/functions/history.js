import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const HISTORY_KEY = 'history';

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

  if (event.httpMethod === 'GET') {
    const data = await redis.get(HISTORY_KEY);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data ?? []),
    };
  }

  if (event.httpMethod === 'POST') {
    const entry = event.body ? JSON.parse(event.body) : null;
    if (!entry || !entry.date) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'body with date required' }) };
    }

    let history = await redis.get(HISTORY_KEY) ?? [];
    const idx = history.findIndex(h => h.date === entry.date);
    if (idx >= 0) {
      history[idx] = entry;
    } else {
      history.unshift(entry);
    }

    await redis.set(HISTORY_KEY, history);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'method not allowed' }) };
};
