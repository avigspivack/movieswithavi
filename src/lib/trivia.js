// Movie trivia game for /play.
// Reads /trivia.json (reviews that carry a `trivia` clue), asks a short round,
// and every answer — right or wrong — reveals the film and links to its review.
//
// The round/scoring/reveal machinery is answer-mode-agnostic: it only needs the
// slug the player chose. v1 ships MODE 'choice' (tap a poster). A future 'type'
// mode (guess the title) can slot into presentAnswer()/normalizeGuess() without
// touching the rest.
const MODE = 'choice';
const ROUND = 5;      // questions per game
const OPTIONS = 4;    // posters shown per question in 'choice' mode

const cells = (rn) => rn == null ? '' :
  '<span class="cells">' + [0, 1, 2, 3].map(i =>
    `<span class="cell"><i style="width:${Math.max(0, Math.min(1, rn - i)) * 100}%"></i></span>`).join('') +
  `<span class="rnum">${rn.toFixed(2)} / 4</span></span>`;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Deterministic-enough shuffle (Fisher–Yates). Math.random is fine on the client.
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sample(arr, n) { return shuffle(arr).slice(0, n); }

export async function initTrivia() {
  const $ = (id) => document.getElementById(id);
  const startPanel = $('start'), gamePanel = $('game'), endPanel = $('end'), noq = $('noq');
  const clueEl = $('clue'), optionsEl = $('options'), revealEl = $('reveal');
  const progressEl = $('q-progress'), scoreEl = $('q-score');
  if (!gamePanel) return;

  let pool = [];
  try {
    pool = await fetch('/trivia.json').then(r => r.json());
  } catch { pool = []; }

  if (!Array.isArray(pool) || pool.length < 2) {
    if (startPanel) startPanel.hidden = true;
    if (noq) noq.hidden = false;
    return;
  }

  const state = { round: [], idx: 0, score: 0, answered: false };

  function show(el, on) { if (el) el.hidden = !on; }

  function start() {
    state.round = sample(pool, Math.min(ROUND, pool.length));
    state.idx = 0; state.score = 0;
    show(startPanel, false); show(endPanel, false); show(gamePanel, true);
    renderQuestion();
  }

  function renderQuestion() {
    const q = state.round[state.idx];
    state.answered = false;
    progressEl.textContent = `Clue ${state.idx + 1} of ${state.round.length}`;
    scoreEl.textContent = `Score ${state.score}`;
    clueEl.textContent = q.trivia;
    show(revealEl, false);
    revealEl.innerHTML = '';
    presentAnswer(q);
  }

  // ── answer widgets (mode-specific) ──────────────────────────────────
  function presentAnswer(q) {
    if (MODE === 'choice') return presentChoice(q);
    // Future: MODE === 'type' would render an input here and call submit()
    // with the slug matched from the typed guess (see normalizeGuess()).
    return presentChoice(q);
  }

  function presentChoice(q) {
    // correct option + distractors drawn from the rest of the pool
    const distractors = sample(pool.filter(p => p.slug !== q.slug), Math.max(0, OPTIONS - 1));
    const opts = shuffle([q, ...distractors]);
    optionsEl.style.display = '';
    optionsEl.innerHTML = opts.map(o => `
      <button class="opt" type="button" data-slug="${esc(o.slug)}">
        <img loading="lazy" src="${esc(o.image)}" alt="">
        <span class="opt-title">${esc(o.title)}</span>
      </button>`).join('');
  }

  // normalizeGuess(text) → slug|null   (reserved for the future 'type' mode)
  // function normalizeGuess(text) {
  //   const g = text.trim().toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '');
  //   return pool.find(p => p.title.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '') === g)?.slug || null;
  // }

  function submit(chosenSlug) {
    if (state.answered) return;
    state.answered = true;
    const q = state.round[state.idx];
    const correct = chosenSlug === q.slug;
    if (correct) state.score++;

    // mark the option tiles
    optionsEl.querySelectorAll('.opt').forEach(b => {
      b.disabled = true;
      if (b.dataset.slug === q.slug) b.classList.add('right');
      else if (b.dataset.slug === chosenSlug) b.classList.add('wrong');
    });
    scoreEl.textContent = `Score ${state.score}`;

    const last = state.idx === state.round.length - 1;
    revealEl.className = 'reveal on-dark';
    revealEl.innerHTML = `
      <div class="reveal-card">
        <div class="reveal-verdict">${correct ? 'Nailed it. 🎯' : 'Not this time.'}</div>
        <div class="reveal-body">
          ${q.image ? `<img src="${esc(q.image)}" alt="">` : ''}
          <div>
            <div class="reveal-it">It's <b>${esc(q.title)}</b></div>
            ${cells(q.ratingNum)}
            ${q.oneLine ? `<p class="reveal-one">${esc(q.oneLine)}</p>` : ''}
            <a class="reveal-link" href="/reviews/${esc(q.slug)}/">Read the review →</a>
          </div>
        </div>
        <button class="big-btn" id="next-btn" type="button">${last ? 'See your score' : 'Next clue'}</button>
      </div>`;
    optionsEl.style.display = 'none';
    show(revealEl, true);
    $('next-btn').addEventListener('click', next);
    revealEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function next() {
    if (state.idx < state.round.length - 1) { state.idx++; renderQuestion(); }
    else showEnd();
  }

  function showEnd() {
    const n = state.round.length, s = state.score;
    show(gamePanel, false); show(endPanel, true);
    const grade = s === n ? "A perfect house. You know Avi's taste cold."
      : s >= Math.ceil(n * 0.6) ? 'Strong showing — you clearly do your homework.'
      : s > 0 ? 'A respectable start. The library awaits.'
      : "Rough round — but now you've got some reviews to read.";
    $('end-title').textContent = `You scored ${s} / ${n}`;
    $('end-msg').textContent = grade;
    wireScoreShare(s, n);
  }

  // Options / reveal are delegated so re-renders don't need re-binding.
  optionsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.opt'); if (!b) return;
    submit(b.dataset.slug);
  });
  $('start-btn')?.addEventListener('click', start);
  $('again-btn')?.addEventListener('click', start);

  // ── share your score (native sheet, else copy/email/whatsapp) ────────
  function wireScoreShare(score, n) {
    const root = $('score-share'); if (!root) return;
    const url = location.origin + location.pathname;
    const text = `I scored ${score}/${n} on Movies with Avi movie trivia. Think you can beat me?`;
    root.dataset.text = text;
    const email = root.querySelector('#share-email');
    const wa = root.querySelector('#share-wa');
    if (email) email.href = `mailto:?subject=${encodeURIComponent('Movies with Avi trivia')}&body=${encodeURIComponent(text + '\n\n' + url)}`;
    if (wa) wa.href = `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`;
    if (root.dataset.wired) return;   // bind listeners once; they read live dataset/text
    root.dataset.wired = '1';
    const btn = root.querySelector('.share-btn');
    const menu = root.querySelector('.share-menu');
    btn?.addEventListener('click', async () => {
      const payload = { title: 'Movies with Avi trivia', text: root.dataset.text, url };
      if (navigator.share) {
        try { await navigator.share(payload); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
      }
      if (menu) { menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); }
    });
    const done = root.querySelector('#share-done');
    let t = null;
    root.querySelector('#share-copy')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(url); }
      catch {
        const ta = document.createElement('textarea'); ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch {} ta.remove();
      }
      if (done) { done.hidden = false; clearTimeout(t); t = setTimeout(() => { done.hidden = true; }, 2000); }
    });
  }
}
