import { kv } from '@vercel/kv';

const HISTORY_KEY = 'history';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const data = await kv.get(HISTORY_KEY);
    return res.status(200).json(data ?? []);
  }

  if (req.method === 'POST') {
    const entry = req.body;
    if (!entry || !entry.date) {
      return res.status(400).json({ error: 'body with date required' });
    }

    let history = await kv.get(HISTORY_KEY) ?? [];
    const idx = history.findIndex(h => h.date === entry.date);
    if (idx >= 0) {
      history[idx] = entry;
    } else {
      history.unshift(entry);
    }

    await kv.set(HISTORY_KEY, history);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
