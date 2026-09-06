// Discover: turn a few mood words into one of Avi's picks.
// Pure client-side scoring over the library index — no backend required.

let LIB = null;
let VOCAB = null; // { terms:Set<phrase>, words:Set<stem> } auto-derived from the library
async function lib() {
  if (!LIB) {
    LIB = await (await fetch('/library.json')).json();
    VOCAB = buildVocab(LIB);
  }
  return LIB;
}

// Mood vocabulary -> the library's actual categories/tags. Only bridges that
// CAN'T be inferred from the words themselves live here; every category/tag is
// already matched directly by its own words (see buildVocab / #9).
const SYNONYMS = {
  funny: ['comedy', 'feel-good', 'fun'], fun: ['comedy', 'feel-good'],
  laugh: ['comedy'], comedy: ['comedy'],
  tense: ['thriller', 'intense', 'suspense'], thriller: ['thriller', 'suspense'],
  suspense: ['thriller', 'suspense', 'intense'], scary: ['thriller', 'intense'],
  heist: ['con movie', 'heist', 'thriller'], con: ['con movie'],
  crime: ['thriller', 'con movie', 'crime'],
  spy: ['spy flick', 'espionage', 'thriller'], espionage: ['spy flick'],
  romantic: ['romance', 'love'], romance: ['romance', 'love'], love: ['romance'],
  cry: ['drama', 'moving', 'family drama'], moving: ['moving', 'drama'],
  emotional: ['moving', 'drama', 'family drama'],
  food: ['foodie', 'cooking', 'chef'], foodie: ['foodie'], cooking: ['foodie', 'cooking'],
  french: ['french'], german: ['german'], italian: ['italian'], spanish: ['spanish'],
  japanese: ['japanese'], korean: ['korean'], israeli: ['israeli'], indian: ['indian'],
  iranian: ['iranian'], foreign: ['french', 'german', 'italian', 'spanish', 'japanese', 'korean', 'israeli', 'iranian', 'danish', 'norwegian', 'brazilian'],
  european: ['french', 'german', 'italian', 'spanish', 'danish', 'norwegian'],
  gem: ['hidden gem'], hidden: ['hidden gem'],
  classic: ['classic'], old: ['classic'],
  true: ['true story', 'biopic'], real: ['true story'], biopic: ['biopic'],
  sports: ['sports'], legal: ['legal', 'courtroom'], courtroom: ['legal'],
  war: ['war'], scifi: ['sci-fi'], 'sci-fi': ['sci-fi'], space: ['sci-fi'],
  smart: ['intense drama', 'slow burn', 'great cast'], slow: ['slow burn'],
  family: ['family drama', 'family'], oscar: ['oscar winner'],
  documentary: ['documentary'], doc: ['documentary'],
};

// Pure noise: words that turn up across most reviews and carry no genre signal.
// Dropped BEFORE scoring so they can't inflate or flatten the ranking (#1).
// Two-word phrases are still recognised from the raw query (see recommend),
// so a stopword like "great" still matches the "great cast" category.
const STOP = new Set([
  'movie', 'movies', 'film', 'films', 'flick', 'flicks', 'watch', 'watching', 'watched',
  'see', 'seen', 'tonight', 'night', 'today', 'now', 'something', 'anything', 'stuff',
  'thing', 'things', 'some', 'any', 'want', 'wanna', 'need', 'feel', 'feeling', 'mood',
  'looking', 'look', 'give', 'get', 'got', 'find', 'pick', 'show', 'recommend', 'suggest',
  'suggestion', 'please', 'good', 'nice', 'great', 'really', 'very', 'about', 'with',
  'that', 'this', 'they', 'them', 'from', 'into', 'your', 'you', 'the', 'and', 'for',
]);

// lowercase, drop punctuation, treat hyphens as spaces ("sci-fi" == "sci fi"), collapse spaces
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

// Tiny plural stemmer so "thrillers"==="thriller", "comedies"==="comedy" (#4).
function stem(w) {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) return w.slice(0, -1);
  return w;
}
// Set of stemmed, real words (length > 1) in a string.
const wordSet = s => new Set(norm(s).split(' ').filter(w => w.length > 1).map(stem));

// #9: build the matchable vocabulary from the categories/tags actually in use,
// so a new category is searchable by its own words with no synonym upkeep.
function buildVocab(L) {
  const terms = new Set(), words = new Set();
  for (const p of L) {
    for (const v of [...(p.categories || []), ...(p.tags || [])]) {
      const t = norm(v);
      if (!t) continue;
      terms.add(t); // whole phrase, e.g. "family drama"
      for (const w of t.split(' ')) if (w.length > 1) words.add(stem(w));
    }
  }
  return { terms, words };
}

// Per-review search index, memoised on the (cached) library object.
function indexReview(p) {
  if (p._idx) return p._idx;
  const catTerms = (p.categories || []).map(norm).filter(Boolean);
  const tagTerms = (p.tags || []).map(norm).filter(Boolean);
  p._idx = {
    catTerms, tagTerms,
    catWords: new Set(catTerms.flatMap(t => t.split(' ')).map(stem)),
    tagWords: new Set(tagTerms.flatMap(t => t.split(' ')).map(stem)),
    titleWords: wordSet(p.title),
    titleNorm: norm(p.title),
    textWords: wordSet((p.oneLine || '') + ' ' + (p.perfectFor || '') + ' ' + (p.deets || '')),
  };
  return p._idx;
}

// Fisher-Yates, so the deck order is genuinely random each time.
function shuffle(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

export async function recommend(query) {
  const q = (query || '').trim();
  // only log real searches, not "surprise me" taps
  if (q) { try { fetch('/api/track', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ type: 'search', term: q }) }); } catch {} }

  const L = await lib();

  // No words? Dealer's choice — a shuffled deck from the whole library.
  if (!q) {
    const deck = shuffle(L).slice(0, 6);
    return { pick: deck[0], runners: [], fallback: false, random: true, deck };
  }

  // --- turn the query into single-word and phrase signals ---
  const raw = norm(query).split(' ').filter(w => w.length > 1);
  const kept = raw.filter(w => !STOP.has(w)); // #1: noise words removed before scoring

  const words = new Set();    // stemmed single words to match
  const phrases = new Set();  // multi-word terms to match (vocab bigrams + synonyms)

  for (const w of kept) words.add(stem(w));

  // #9: adjacent raw words that form a real category/tag phrase ("true story",
  // "family drama", "great cast") — checked on raw so stopwords still count here.
  for (let i = 0; i < raw.length - 1; i++) {
    const bg = raw[i] + ' ' + raw[i + 1];
    if (VOCAB.terms.has(bg)) phrases.add(bg);
  }

  // hand-curated mood -> genre bridges (looked up by raw and stemmed form)
  for (const w of kept) {
    for (const syn of (SYNONYMS[w] || SYNONYMS[stem(w)] || [])) {
      const t = norm(syn);
      if (!t) continue;
      if (t.includes(' ')) phrases.add(t);
      else words.add(stem(t));
    }
  }

  // Only stopwords typed? Nothing to score on — fall back to the top shelf.
  if (!words.size && !phrases.size) {
    const deck = shuffle(L.filter(p => (p.ratingNum || 0) >= 3.7)).slice(0, 6);
    return { pick: deck[0], runners: [], fallback: true, deck };
  }

  const scored = L.map(p => {
    const ix = indexReview(p);
    let s = 0;
    for (const w of words) {
      if (ix.catWords.has(w) || ix.tagWords.has(w)) s += 3; // curated metadata (#2: whole word)
      if (ix.titleWords.has(w)) s += 2;
      else if (ix.textWords.has(w)) s += 1;                 // full review body, whole word
    }
    for (const ph of phrases) {
      if (ix.catTerms.some(t => t.includes(ph)) || ix.tagTerms.some(t => t.includes(ph))) s += 3;
      else if (ix.titleNorm.includes(ph)) s += 2;
    }
    // gentle nudge toward Avi's higher ratings, never decisive alone
    if (s > 0 && p.ratingNum) s += p.ratingNum / 4;
    return { p, s };
  }).filter(x => x.s >= 2).sort((a, b) => b.s - a.s);

  if (!scored.length) {
    // graceful fallback: a deck from the top shelf
    const deck = shuffle(L.filter(p => (p.ratingNum || 0) >= 3.7)).slice(0, 6);
    return { pick: deck[0], runners: [], fallback: true, deck };
  }

  // Build a deck of up to 6 distinct candidates so "Deal me another" always has
  // somewhere to go: the near-best shuffled first, then topped up in score order.
  const best = scored[0].s;
  const near = shuffle(scored.filter(x => x.s >= best - 1).slice(0, 6));
  const deckScored = near.slice();
  for (const x of scored) {
    if (deckScored.length >= 6) break;
    if (!deckScored.includes(x)) deckScored.push(x);
  }
  const deck = deckScored.map(x => x.p);
  return { pick: deck[0], runners: deck.slice(1, 3), fallback: false, deck };
}
