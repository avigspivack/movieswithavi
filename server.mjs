// Movies with Avi — static server + featherweight analytics
import express from 'express';
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import path from 'node:path';

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || './analytics.db'; // on Railway set DB_PATH=/data/analytics.db (volume)
const ADMIN_KEY = process.env.ADMIN_KEY || '';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS pageviews (
  id INTEGER PRIMARY KEY, day TEXT NOT NULL, path TEXT NOT NULL, visitor TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS searches (
  id INTEGER PRIMARY KEY, day TEXT NOT NULL, term TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS pv_day ON pageviews(day);
CREATE INDEX IF NOT EXISTS pv_path ON pageviews(path);
CREATE INDEX IF NOT EXISTS s_term ON searches(term);
`);

const app = express();
app.use(express.json({ limit: '2kb' }));

const GH_TOKEN = process.env.GITHUB_TOKEN || '';
const GH_REPO = process.env.GITHUB_REPO || '';
const GH_BRANCH = process.env.GITHUB_BRANCH || 'main';

// Commit one file to the repo via the GitHub Contents API.
// Updates the file if it already exists (re-publish = fix a typo).
async function ghPut(path, base64Content, message) {
  const url = `https://api.github.com/repos/${GH_REPO}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
  // If the file exists we need its sha to overwrite it
  let sha;
  const probe = await fetch(`${url}?ref=${GH_BRANCH}`, { headers });
  if (probe.ok) sha = (await probe.json()).sha;

  const r = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ message, content: base64Content, branch: GH_BRANCH, ...(sha && { sha }) }),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw new Error(`GitHub said ${r.status} for ${path}: ${detail.slice(0, 200)}`);
  }
}

const yq = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`; // yaml-safe quote
const ylist = (a) => `[${a.map(yq).join(', ')}]`;

app.post('/api/publish', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const b = req.body || {};
    if (!GH_TOKEN || !GH_REPO) return res.status(500).json({ error: 'GITHUB_TOKEN / GITHUB_REPO not set on the server.' });
    if (!ADMIN_KEY || b.key !== ADMIN_KEY) return res.status(401).json({ error: 'Wrong admin key.' });

    const slug = String(b.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!slug || !b.title || !b.oneLine || !b.deets) return res.status(400).json({ error: 'Missing title, summary, or Deets.' });

    const num = Number(b.ratingNum);
    const fm = [
      '---',
      `title: ${yq(b.title)}`,
      `date: ${b.date || new Date().toISOString().slice(0, 10)}`,
      `rating: ${yq(b.rating || `${num}/4`)}`,
      `ratingNum: ${Number.isFinite(num) ? num : 0}`,
      `oneLine: ${yq(b.oneLine)}`,
      b.perfectFor ? `perfectFor: ${yq(b.perfectFor)}` : null,
      b.whereToWatch ? `whereToWatch: ${yq(b.whereToWatch)}` : null,
      b.foodPairing ? `foodPairing: ${yq(b.foodPairing)}` : null,
      `categories: ${ylist(Array.isArray(b.categories) ? b.categories : [])}`,
      `tags: ${ylist(Array.isArray(b.tags) ? b.tags : [])}`,
      b.posterBase64 ? `image: ${yq(`/posters/${slug}.${b.posterExt || 'jpg'}`)}` : null,
      '---',
      '',
    ].filter(Boolean).join('\n');

    const md = fm + String(b.deets).trim() + '\n';
    const mdB64 = Buffer.from(md, 'utf8').toString('base64');

    // Poster first, then the review — so the review never goes live pointing
    // at a poster that isn't in the repo yet.
    if (b.posterBase64) {
      const ext = /^(jpg|jpeg|png|webp)$/.test(b.posterExt) ? b.posterExt : 'jpg';
      await ghPut(`public/posters/${slug}.${ext}`, b.posterBase64, `Poster: ${b.title}`);
    }

    const mdPath = b.draft ? `drafts/${slug}.md` : `src/content/reviews/${slug}.md`;
    await ghPut(mdPath, mdB64, b.draft ? `Draft: ${b.title}` : `Review: ${b.title}`);

    res.json({ ok: true, path: mdPath });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Publish failed.' });
  }
});

const today = () => new Date().toISOString().slice(0, 10);
// daily-rotating anonymous visitor id: hash of ip+ua+day, raw ip never stored
const visitorId = (req) => createHash('sha256')
  .update((req.headers['x-forwarded-for'] || req.ip || '') + '|' + (req.headers['user-agent'] || '') + '|' + today())
  .digest('hex').slice(0, 16);

app.post('/api/track', (req, res) => {
  try {
    const { type, path: p, term } = req.body || {};
    if (type === 'pageview' && typeof p === 'string' && p.length < 200) {
      db.prepare('INSERT INTO pageviews (day, path, visitor, ts) VALUES (?,?,?,?)')
        .run(today(), p.split('?')[0], visitorId(req), Date.now());
    } else if (type === 'search' && typeof term === 'string' && term.trim()) {
      db.prepare('INSERT INTO searches (day, term, ts) VALUES (?,?,?)')
        .run(today(), term.trim().toLowerCase().slice(0, 80), Date.now());
    }
  } catch {}
  res.status(204).end();
});

app.get('/api/stats', (req, res) => {
  if (!ADMIN_KEY || req.query.key !== ADMIN_KEY) return res.status(401).json({ error: 'unauthorized' });
  const days = Math.min(365, parseInt(req.query.days) || 30);
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  res.json({
    daily: db.prepare(`SELECT day, COUNT(*) views, COUNT(DISTINCT visitor) visitors
      FROM pageviews WHERE day >= ? GROUP BY day ORDER BY day`).all(since),
    topPages: db.prepare(`SELECT path, COUNT(*) views FROM pageviews
      WHERE day >= ? AND path LIKE '/reviews/%' GROUP BY path ORDER BY views DESC LIMIT 20`).all(since),
    topSearches: db.prepare(`SELECT term, COUNT(*) count FROM searches
      WHERE day >= ? GROUP BY term ORDER BY count DESC LIMIT 20`).all(since),
    totals: {
      views: db.prepare('SELECT COUNT(*) n FROM pageviews WHERE day >= ?').get(since).n,
      searches: db.prepare('SELECT COUNT(*) n FROM searches WHERE day >= ?').get(since).n,
    },
  });
});

app.use(express.static(path.resolve('dist'), { extensions: ['html'] }));
app.use((req, res) => res.status(404).sendFile(path.resolve('dist/404.html'), () => res.end('Not found')));

app.listen(PORT, () => console.log(`movieswithavi serving on :${PORT}, db at ${DB_PATH}`));
