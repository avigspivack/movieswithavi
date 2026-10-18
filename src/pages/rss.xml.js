// RSS feed with fully-styled, email-safe HTML per review.
// Buttondown (Settings → "Send emails from your RSS feed") watches this and
// emails each NEW review automatically. Buttondown tracks item guids, so
// editing/re-publishing a review (same URL guid) never re-sends it.
import { getCollection } from 'astro:content';
import { marked } from 'marked';

const SITE = 'https://movieswithavi.com';
const MAX_ITEMS = 20; // enough for the ESP to detect new posts; keeps the feed lean

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const abs = u => !u ? '' : (/^https?:/.test(u) ? u : SITE + (u.startsWith('/') ? u : '/' + u));

// Brand palette
const C = { cream: '#F6EFE4', dark: '#1B1214', ink: '#2A1E1B', soft: '#6B5A52', red: '#C0392E', butter: '#F2B838' };
// Web fonts don't render in most email clients — fall back to a clean system stack.
const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

// Inline-styled, table-based HTML for one review — the body of the email.
function emailHtml(d, bodyHtml, url) {
  const section = (label, inner) => inner
    ? `<tr><td style="padding:22px 0 0;"><div style="${FONT}color:${C.red};font-weight:700;font-size:11px;letter-spacing:.14em;text-transform:uppercase;">${label}</div><div style="${FONT}color:${C.ink};font-size:16px;line-height:1.6;margin-top:6px;">${inner}</div></td></tr>`
    : '';
  const poster = d.image
    ? `<tr><td align="center" style="padding:0 0 20px;"><img src="${esc(abs(d.image))}" alt="${esc(d.title)} poster" width="220" style="width:220px;max-width:60%;border-radius:14px;display:block;" /></td></tr>`
    : '';
  const rating = (d.ratingNum != null)
    ? `<tr><td align="center" style="padding:0 0 6px;"><span style="display:inline-block;background:${C.dark};color:${C.butter};${FONT}font-weight:700;font-size:15px;padding:6px 14px;border-radius:999px;">&#9733; ${Number(d.ratingNum).toFixed(2)} / 4</span></td></tr>`
    : '';
  const verdict = d.ratingText
    ? `<tr><td align="center" style="${FONT}color:${C.red};font-weight:700;font-size:14px;padding:0 0 4px;">${esc(d.ratingText)}</td></tr>`
    : '';
  const one = d.oneLine
    ? `<tr><td align="center" style="${FONT}color:${C.soft};font-style:italic;font-size:17px;line-height:1.5;padding:6px 8px 0;">${esc(d.oneLine)}</td></tr>`
    : '';
  const cats = (d.categories || []).length
    ? `<tr><td align="center" style="${FONT}color:${C.soft};font-size:12px;letter-spacing:.04em;padding:16px 0 0;">${d.categories.map(esc).join('&nbsp;&middot;&nbsp;')}</td></tr>`
    : '';

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};margin:0;padding:0;">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;padding:26px 24px;">
    ${poster}
    <tr><td align="center" style="${FONT}color:${C.ink};font-weight:800;font-size:26px;line-height:1.15;padding:0 0 10px;">${esc(d.title)}</td></tr>
    ${rating}
    ${verdict}
    ${one}
    ${section('The Deets', bodyHtml)}
    ${section('Perfect for', d.perfectFor ? esc(d.perfectFor) : '')}
    ${section('Where to watch', d.whereToWatch ? esc(d.whereToWatch) : '')}
    ${section('Food pairing', d.foodPairing ? esc(d.foodPairing) : '')}
    ${cats}
    <tr><td align="center" style="padding:26px 0 2px;">
      <a href="${esc(url)}" style="${FONT}background:${C.red};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:10px;display:inline-block;">Read it on Movies with Avi &rarr;</a>
    </td></tr>
  </table>
</td></tr>
</table>`.trim();
}

export async function GET() {
  const reviews = (await getCollection('reviews'))
    .sort((a, b) => String(b.data.date).localeCompare(String(a.data.date)))
    .slice(0, MAX_ITEMS);

  const items = reviews.map(r => {
    const d = r.data;
    const url = `${SITE}/reviews/${r.id}/`;
    const body = marked.parse(r.body || '', { async: false });
    // CDATA can't contain the literal "]]>" — neutralise just in case.
    const html = emailHtml(d, body, url).replace(/]]>/g, ']]&gt;');
    const pub = new Date(`${d.date}T12:00:00Z`).toUTCString();
    return `  <item>
    <title>${esc(d.title)}</title>
    <link>${esc(url)}</link>
    <guid isPermaLink="true">${esc(url)}</guid>
    <pubDate>${pub}</pubDate>
    <description>${esc(d.oneLine || d.title)}</description>
    <content:encoded><![CDATA[${html}]]></content:encoded>
  </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Movies with Avi</title>
  <link>${SITE}/</link>
  <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml" />
  <description>Avi's latest movie reviews &mdash; one honest take at a time.</description>
  <language>en-us</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
