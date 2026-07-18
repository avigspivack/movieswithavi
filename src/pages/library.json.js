import { getCollection } from 'astro:content';

export async function GET() {
  const reviews = await getCollection('reviews');
  const lib = reviews.map(r => ({
    slug: r.id,
    title: r.data.title,
    date: r.data.date,
    ratingNum: r.data.ratingNum,
    oneLine: r.data.oneLine,
    perfectFor: r.data.perfectFor,
    foodPairing: r.data.foodPairing,
    categories: r.data.categories,
    tags: r.data.tags,
    image: r.data.image,
    deets: r.body,
  })).sort((a, b) => b.date.localeCompare(a.date));
  return new Response(JSON.stringify(lib), { headers: { 'Content-Type': 'application/json' } });
}
