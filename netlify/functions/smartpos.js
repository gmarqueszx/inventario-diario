import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const SMARTPOS_BASE = 'https://api.smartpos.app/v1';
const PAGE_SIZE = 100;
const PRODUCTS_CACHE_KEY = 'smartpos:products';

const h = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-session-token',
};
const ok  = (data) => ({ statusCode: 200, headers: h, body: JSON.stringify(data) });
const err = (code, msg) => ({ statusCode: code, headers: h, body: JSON.stringify({ error: msg }) });

async function getSession(event) {
  const token = (event.headers['x-session-token'] || '').trim();
  if (!token) return null;
  return await redis.get(`session:${token}`);
}

// Somente GET: nunca altera nada no SmartPOS
async function smartposGet(path) {
  const r = await fetch(`${SMARTPOS_BASE}${path}`, {
    headers: {
      'X-Api-Key-Id': process.env.SMARTPOS_KEY_ID,
      'X-Api-Key-Secret': process.env.SMARTPOS_KEY_SECRET,
      'Accept': 'application/json',
    },
  });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
  return { status: r.status, body };
}

// Lista todos os caminhos de campos (ex.: "variants[].sku") de um objeto
function fieldPaths(obj, prefix = '', out = new Set()) {
  if (Array.isArray(obj)) {
    obj.forEach(v => fieldPaths(v, `${prefix}[]`, out));
  } else if (obj && typeof obj === 'object') {
    Object.entries(obj).forEach(([k, v]) => {
      const p = prefix ? `${prefix}.${k}` : k;
      out.add(p);
      fieldPaths(v, p, out);
    });
  }
  return out;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: h, body: '' };
  if (event.httpMethod !== 'GET') return err(405, 'method not allowed');

  const session = await getSession(event);
  if (!session) return err(401, 'unauthorized');

  if (!process.env.SMARTPOS_KEY_ID || !process.env.SMARTPOS_KEY_SECRET) {
    return err(500, 'SMARTPOS_KEY_ID / SMARTPOS_KEY_SECRET não configuradas');
  }

  const params = new URLSearchParams(event.rawQuery || '');
  const action = params.get('action');

  // Lista enxuta de produtos ativos para o catálogo (cache de 15 min no Redis)
  if (action === 'products') {
    const cached = await redis.get(PRODUCTS_CACHE_KEY);
    if (cached) return ok(cached);

    const products = [];
    for (let page = 1; page <= 50; page++) {
      const r = await smartposGet(`/products?page=${page}&size=${PAGE_SIZE}&archived=false`);
      if (r.status !== 200) return err(502, `SmartPOS respondeu ${r.status}`);
      const items = r.body?.items ?? [];
      items.forEach(p => {
        if (p.isArchived || !p.alphaCode) return;
        products.push({
          codigo: String(p.alphaCode).trim(),
          produto: p.name,
          custo: p.costValue ?? 0,
          categoria: (p.category?.description || '').trim(),
        });
      });
      if (items.length < PAGE_SIZE || products.length >= (r.body?.totalRecords ?? 0)) break;
    }

    await redis.set(PRODUCTS_CACHE_KEY, products, { ex: 15 * 60 });
    return ok(products);
  }

  if (session.role !== 'admin') return err(403, 'admin only');

  // Diagnóstico: mostra o formato real da resposta para descobrir se o estoque vem junto
  if (action === 'probe') {
    const codigo = params.get('codigo') || '396';
    const list    = await smartposGet('/products?page=1&size=3');
    const byCode  = await smartposGet(`/products?page=1&size=5&alpha-code=${encodeURIComponent(codigo)}`);
    const firstId = byCode.body?.items?.[0]?.id ?? list.body?.items?.[0]?.id;
    const single  = firstId ? await smartposGet(`/products/${firstId}`) : null;

    // endpoints de leitura de estoque não documentados — só para checar se existem
    const guesses = {};
    for (const p of ['/products/stock', '/stock', '/stocks', `/products/${firstId}/stock`]) {
      const r = await smartposGet(p);
      guesses[p] = { status: r.status, sample: JSON.stringify(r.body).slice(0, 300) };
    }

    return ok({
      listStatus: list.status,
      totalRecords: list.body?.totalRecords,
      fields: [...fieldPaths(list.body?.items ?? [])].sort(),
      byCode: { status: byCode.status, items: byCode.body?.items ?? byCode.body },
      single: single && { status: single.status, body: single.body },
      guesses,
    });
  }

  return err(400, 'unknown action');
};
