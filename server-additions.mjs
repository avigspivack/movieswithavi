// ============================================================
// PASTE THIS INTO server.mjs, anywhere after `const app = express();`
// (and before the static-file serving / app.listen at the bottom).
//
// Railway env vars you need to add (Settings → Variables):
//   GITHUB_TOKEN  — fine-grained personal access token, Contents: read & write,
//                   scoped to ONLY the movieswithavi repo
//   GITHUB_REPO   — e.g. "yourusername/movieswithavi"
//   GITHUB_BRANCH — optional, defaults to "main"
// ============================================================

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
