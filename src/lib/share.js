// "Share this review with a friend."
// Uses the native share sheet (Web Share API) when the browser has it — ideal
// on phones, where a reader can fire the review straight to a friend via
// Messages/WhatsApp/Mail. Falls back to copy-link / email / WhatsApp elsewhere.
export function initShare(root) {
  if (!root || root.dataset.wired) return;
  root.dataset.wired = '1';
  const btn = root.querySelector('.share-btn');
  if (!btn) return;
  const menu = root.querySelector('.share-menu');

  const title = root.dataset.title || document.title;
  const text = root.dataset.text || title;
  // Canonical page URL — drop any query/hash so shared links stay clean.
  const url = location.origin + location.pathname;

  // Pre-wire the email + WhatsApp anchors so they behave as ordinary links.
  const email = root.querySelector('#share-email');
  const wa = root.querySelector('#share-wa');
  if (email) email.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text + '\n\n' + url)}`;
  if (wa) wa.href = `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`;

  const setMenu = (on) => {
    if (!menu) return;
    menu.hidden = !on;
    btn.setAttribute('aria-expanded', String(on));
  };

  btn.addEventListener('click', async () => {
    if (navigator.share) {
      try { await navigator.share({ title, text, url }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; /* unsupported payload → fall back */ }
    }
    setMenu(menu ? menu.hidden : false); // toggle the fallback row
  });

  const copyBtn = root.querySelector('#share-copy');
  const done = root.querySelector('#share-done');
  let doneTimer = null;
  copyBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const t = document.createElement('textarea');
      t.value = url; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch {}
      t.remove();
    }
    if (done) {
      done.hidden = false;
      clearTimeout(doneTimer);
      doneTimer = setTimeout(() => { done.hidden = true; }, 2000);
    }
  });
}
