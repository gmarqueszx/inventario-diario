import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const date = req.query.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date param required (YYYY-MM-DD)' });
  }

  const key = `counts:${date}`;

  if (req.method === 'GET') {
    const data = await kv.get(key);
    return res.status(200).json(data ?? {});
  }

  if (req.method === 'POST') {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'invalid body' });
    }
    await kv.set(key, body, { ex: 30 * 24 * 60 * 60 });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
