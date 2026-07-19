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
