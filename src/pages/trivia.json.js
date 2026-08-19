import { getCollection } from 'astro:content';

// Only the reviews that carry a trivia clue, and only the fields the game needs.
// The answer to each clue is the movie itself, so a correct guess leads to its review.
export async function GET() {
  const reviews = await getCollection('reviews');
  const questions = reviews
    .filter(r => r.data.trivia && r.data.image)   // need a clue and a poster (multiple-choice shows posters)
    .map(r => ({
      slug: r.id,
      title: r.data.title,
      image: r.data.image,
      trivia: r.data.trivia,
      ratingNum: r.data.ratingNum,
      oneLine: r.data.oneLine,
    }));
  return new Response(JSON.stringify(questions), { headers: { 'Content-Type': 'application/json' } });
}
