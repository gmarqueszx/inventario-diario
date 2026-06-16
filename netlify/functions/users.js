import { Redis } from '@upstash/redis';
import { createHash, randomUUID } from 'node:crypto';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const USERS_KEY = 'users';
const hash = (str) => createHash('sha256').update(str).digest('hex');

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
  if (session.role !== 'admin') return err(403, 'forbidden');

  const params = new URLSearchParams(event.rawQuery || '');
  const action = params.get('action');

  // ── GET: lista usuários ─────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const users = await redis.get(USERS_KEY) ?? [];
    return ok(users.map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role })));
  }

  // ── POST ────────────────────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    const body = event.body ? JSON.parse(event.body) : {};

    if (action === 'create') {
      const { username, name, password, role } = body;
      if (!username || !name || !password) return err(400, 'username, name and password required');
      if (!['admin', 'operador'].includes(role)) return err(400, 'role must be admin or operador');
      const users = await redis.get(USERS_KEY) ?? [];
      if (users.find(u => u.username === username.trim().toLowerCase())) {
        return err(400, 'username already exists');
      }
      const newUser = {
        id: randomUUID(),
        username: username.trim().toLowerCase(),
        name: name.trim(),
        role,
        passwordHash: hash(password),
      };
      users.push(newUser);
      await redis.set(USERS_KEY, users);
      return ok({ ok: true });
    }

    if (action === 'delete') {
      const { userId } = body;
      if (!userId) return err(400, 'userId required');
      if (userId === session.userId) return err(400, 'cannot delete yourself');
      let users = await redis.get(USERS_KEY) ?? [];
      users = users.filter(u => u.id !== userId);
      await redis.set(USERS_KEY, users);
      return ok({ ok: true });
    }

    if (action === 'change-password') {
      const { userId, newPassword } = body;
      if (!userId || !newPassword) return err(400, 'userId and newPassword required');
      let users = await redis.get(USERS_KEY) ?? [];
      const idx = users.findIndex(u => u.id === userId);
      if (idx < 0) return err(404, 'user not found');
      users[idx].passwordHash = hash(newPassword);
      await redis.set(USERS_KEY, users);
      return ok({ ok: true });
    }

    return err(400, 'unknown action');
  }

  return err(405, 'method not allowed');
};
