// Discover: turn a few mood words into one of Avi's picks.
// Pure client-side scoring over the library index — no backend required.

let LIB = null;
async function lib() {
  if (!LIB) LIB = await (await fetch('/library.json')).json();
  return LIB;
}

// mood vocabulary -> the library's actual categories/tags
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
  short: [], long: [], tonight: [], something: [], movie: [], film: [], watch: [],
};

function tokens(q) {
  return q.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 1);
}

export async function recommend(query) {
  try { fetch('/api/track', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ type: 'search', term: query }) }); } catch {}

  const L = await lib();
  const words = tokens(query);
  const expanded = new Set(words);
  for (const w of words) (SYNONYMS[w] || []).forEach(s => expanded.add(s));

  const scored = L.map(p => {
    let s = 0;
    const cats = p.categories.map(c => c.toLowerCase());
    const tags = p.tags.map(t => t.toLowerCase());
    const title = p.title.toLowerCase();
    const text = ((p.oneLine || '') + ' ' + (p.perfectFor || '') + ' ' + (p.deets || '')).toLowerCase();
    for (const w of expanded) {
      if (cats.some(c => c.includes(w))) s += 3;
      if (tags.some(t => t.includes(w))) s += 3;
      if (title.includes(w)) s += 2;
      else if (text.includes(w)) s += 1;
    }
    // gentle nudge toward Avi's higher ratings, never decisive alone
    if (s > 0 && p.ratingNum) s += p.ratingNum / 4;
    return { p, s };
  }).filter(x => x.s >= 2).sort((a, b) => b.s - a.s);

  if (!scored.length) {
    // graceful fallback: a random pick from the top shelf
    const top = L.filter(p => (p.ratingNum || 0) >= 3.7);
    const pick = top[Math.floor(Math.random() * top.length)];
    return { pick, runners: [], fallback: true };
  }

  // variety: choose randomly among the near-best so "Deal me another" works
  const best = scored[0].s;
  const pool = scored.filter(x => x.s >= best - 1).slice(0, 6);
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  const runners = scored.filter(x => x.p !== chosen.p).slice(0, 2).map(x => x.p);
  return { pick: chosen.p, runners, fallback: false };
}
