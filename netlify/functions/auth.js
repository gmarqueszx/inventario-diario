import { Redis } from '@upstash/redis';
import { createHash, randomUUID } from 'node:crypto';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const USERS_KEY = 'users';
const SESSION_TTL = 28800; // 8 horas

const hash = (str) => createHash('sha256').update(str).digest('hex');

const h = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-session-token',
};
const ok  = (data) => ({ statusCode: 200, headers: h, body: JSON.stringify(data) });
const err = (code, msg) => ({ statusCode: code, headers: h, body: JSON.stringify({ error: msg }) });

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: h, body: '' };

  const params = new URLSearchParams(event.rawQuery || '');
  const action = params.get('action');

  // ── GET ─────────────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    if (action === 'check-setup') {
      const users = await redis.get(USERS_KEY) ?? [];
      return ok({ needsSetup: users.length === 0 });
    }

    if (action === 'me') {
      const token = (event.headers['x-session-token'] || '').trim();
      if (!token) return err(401, 'no token');
      const session = await redis.get(`session:${token}`);
      if (!session) return err(401, 'session expired');
      return ok(session);
    }

    return err(400, 'unknown action');
  }

  // ── POST ────────────────────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    const body = event.body ? JSON.parse(event.body) : {};

    if (action === 'setup') {
      const users = await redis.get(USERS_KEY) ?? [];
      if (users.length > 0) return err(403, 'setup already done');
      const { username, name, password } = body;
      if (!username || !name || !password) return err(400, 'username, name and password required');
      const admin = {
        id: randomUUID(),
        username: username.trim().toLowerCase(),
        name: name.trim(),
        role: 'admin',
        passwordHash: hash(password),
      };
      await redis.set(USERS_KEY, [admin]);
      return ok({ ok: true });
    }

    if (action === 'login') {
      const { username, password } = body;
      if (!username || !password) return err(400, 'username and password required');
      const users = await redis.get(USERS_KEY) ?? [];
      const user = users.find(u => u.username === username.trim().toLowerCase());
      if (!user || user.passwordHash !== hash(password)) return err(401, 'invalid credentials');
      const token = randomUUID();
      const session = { userId: user.id, username: user.username, name: user.name, role: user.role };
      await redis.set(`session:${token}`, session, { ex: SESSION_TTL });
      return ok({ token, ...session });
    }

    if (action === 'logout') {
      const token = (event.headers['x-session-token'] || '').trim();
      if (token) await redis.del(`session:${token}`);
      return ok({ ok: true });
    }

    return err(400, 'unknown action');
  }

  return err(405, 'method not allowed');
};
