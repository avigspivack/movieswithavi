// Shared email-capture behavior for the signup cards (review page + homepage).
// Progressive enhancement: the form posts to /api/subscribe and, on success,
// swaps the card for a "you're on the list" confirmation.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function initSignup(root) {
  if (!root || root.dataset.wired) return;
  root.dataset.wired = '1';
  const form = root.querySelector('.signup-form');
  const msg = root.querySelector('.signup-msg');
  const inner = root.querySelector('.signup-in');
  if (!form || !inner) return;
  const btn = form.querySelector('button');
  const source = root.dataset.source === 'review' ? 'review' : 'homepage';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (form.querySelector('input[name="email"]')?.value || '').trim();
    const name = (form.querySelector('input[name="name"]')?.value || '').trim();
    if (msg) { msg.textContent = ''; msg.classList.remove('err'); }
    if (!EMAIL_RE.test(email)) {
      if (msg) { msg.textContent = "That email doesn't look right — mind checking it?"; msg.classList.add('err'); }
      return;
    }
    if (btn) btn.disabled = true;
    try {
      const r = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, source }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Something went wrong — try again in a moment.');
      const first = name ? `, ${name.split(/\s+/)[0]}` : '';
      root.classList.add('done');
      inner.innerHTML =
        `<h2>You're on the list \u{1F39F}\u{FE0F}</h2>` +
        `<p class="signup-msg">Thanks${escapeHtml(first)} — I'll be in touch when there's something worth watching.</p>`;
    } catch (err) {
      if (msg) { msg.textContent = err.message || 'Something went wrong — try again in a moment.'; msg.classList.add('err'); }
      if (btn) btn.disabled = false;
    }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
