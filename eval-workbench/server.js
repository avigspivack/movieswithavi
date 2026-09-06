// Eval Workbench — static host + a thin, key-holding proxy in front of the Claude API.
//
// The browser never sees the API key: every model call is a POST to /api/claude,
// which this server re-issues with the server-side key. That's the whole reason
// this file exists — the original artifact could call Anthropic directly only
// because it ran inside Claude's sandbox.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(HERE, 'public');
const PORT = Number(process.env.PORT) || 3000;

const API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();
// Trim the password: a trailing newline pasted into a host's env var would
// otherwise never match what the user types in the browser.
const APP_PASSWORD = (process.env.APP_PASSWORD || '').trim();
const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN) || 40;

// Models the UI may ask for. An allowlist, not a passthrough: this endpoint is
// reachable by anyone who can open the page.
const MODELS = [
  { id: 'claude-opus-5', label: 'Opus 5 — most capable', effort: true },
  { id: 'claude-sonnet-5', label: 'Sonnet 5 — balanced', effort: true },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5 — fastest, cheapest', effort: false },
];
const MODEL_IDS = new Set(MODELS.map((m) => m.id));
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

const pick = (envVar, fallback) => {
  const v = (process.env[envVar] || '').trim();
  return MODEL_IDS.has(v) ? v : fallback;
};
const ASSISTANT_MODEL = pick('ASSISTANT_MODEL', 'claude-opus-5');
const JUDGE_MODEL = pick('JUDGE_MODEL', 'claude-opus-5');

const client = API_KEY ? new Anthropic({ apiKey: API_KEY }) : null;

/* ---------- password gate ---------- */
function passwordOk(req) {
  if (!APP_PASSWORD) return true;
  const given = String(req.headers['x-app-password'] || '');
  const a = Buffer.from(given);
  const b = Buffer.from(APP_PASSWORD);
  // timingSafeEqual throws on length mismatch, so compare hashes of equal size.
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/* ---------- crude per-IP rate limit, so a public URL can't drain the key ---------- */
const buckets = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const b = buckets.get(ip) || { count: 0, resetAt: now + 60_000 };
  if (now > b.resetAt) { b.count = 0; b.resetAt = now + 60_000; }
  b.count += 1;
  buckets.set(ip, b);
  if (buckets.size > 5000) buckets.clear(); // bounded memory; a blunt but adequate sweep
  return b.count > RATE_LIMIT_PER_MIN;
}

/* ---------- helpers ---------- */
function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.join(PUBLIC_DIR, rel);
  // Never serve outside public/ — path traversal guard.
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== PUBLIC_DIR) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': rel === '/index.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(data);
  });
}

/* ---------- the model call ---------- */
async function handleClaude(req, res) {
  if (!client) {
    sendJSON(res, 503, { error: 'ANTHROPIC_API_KEY is not set on the server.' });
    return;
  }
  if (!passwordOk(req)) {
    sendJSON(res, 401, { error: 'Wrong or missing app password.' });
    return;
  }
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  if (rateLimited(ip)) {
    sendJSON(res, 429, { error: `Rate limit: more than ${RATE_LIMIT_PER_MIN} model calls in a minute.` });
    return;
  }

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    sendJSON(res, 400, { error: 'Bad JSON body.' });
    return;
  }

  const system = typeof body.system === 'string' ? body.system : '';
  const user = typeof body.user === 'string' ? body.user : '';
  if (!user.trim()) { sendJSON(res, 400, { error: 'Missing "user" text.' }); return; }

  const model = MODEL_IDS.has(body.model) ? body.model : ASSISTANT_MODEL;
  const supportsEffort = MODELS.find((m) => m.id === model)?.effort;
  const maxTokens = Math.min(Math.max(Number(body.maxTokens) || 4000, 256), 16000);

  const params = { model, max_tokens: maxTokens, messages: [{ role: 'user', content: user }] };
  if (system) params.system = system;
  if (supportsEffort) {
    // Effort is the cost/quality dial. Haiku 4.5 rejects it, hence the guard.
    params.output_config = { effort: EFFORTS.has(body.effort) ? body.effort : 'medium' };
  }

  try {
    const msg = await client.messages.create(params);
    if (msg.stop_reason === 'refusal') {
      sendJSON(res, 200, { text: '', refusal: msg.stop_details?.explanation || 'The model declined this request.' });
      return;
    }
    const text = (msg.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    sendJSON(res, 200, {
      text,
      model: msg.model,
      truncated: msg.stop_reason === 'max_tokens',
      usage: { input: msg.usage?.input_tokens, output: msg.usage?.output_tokens },
    });
  } catch (err) {
    // Most specific first — the status is what the UI needs to explain itself.
    let status = 502;
    let message = 'The model call failed.';
    if (err instanceof Anthropic.AuthenticationError) { status = 401; message = 'The server API key was rejected. Check ANTHROPIC_API_KEY.'; }
    else if (err instanceof Anthropic.RateLimitError) { status = 429; message = 'Anthropic rate limit — wait a moment and retry.'; }
    else if (err instanceof Anthropic.BadRequestError) { status = 400; message = 'Bad request: ' + err.message; }
    else if (err instanceof Anthropic.APIError) { status = err.status || 502; message = `Anthropic API error ${err.status}: ${err.message}`; }
    console.error('[claude]', err?.message || err);
    sendJSON(res, status, { error: message });
  }
}

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname === '/api/health') {
    sendJSON(res, 200, { ok: true, hasKey: Boolean(client) });
    return;
  }
  if (pathname === '/api/config') {
    sendJSON(res, 200, {
      hasKey: Boolean(client),
      needsPassword: Boolean(APP_PASSWORD),
      models: MODELS,
      assistantModel: ASSISTANT_MODEL,
      judgeModel: JUDGE_MODEL,
    });
    return;
  }
  if (pathname === '/api/claude') {
    if (req.method !== 'POST') { sendJSON(res, 405, { error: 'POST only.' }); return; }
    await handleClaude(req, res);
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { sendJSON(res, 405, { error: 'Method not allowed.' }); return; }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Eval Workbench on http://localhost:${PORT}`);
  if (!client) console.warn('WARNING: ANTHROPIC_API_KEY is not set — generation, runs and the judge will be disabled.');
  if (!APP_PASSWORD) console.warn('NOTE: APP_PASSWORD is not set — anyone with the URL can spend your API key.');
});
