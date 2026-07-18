import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const reviews = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/reviews' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date().transform(d => d.toISOString().slice(0, 10)),
    rating: z.string().nullable(),
    ratingNum: z.number().nullable(),
    oneLine: z.string().nullable(),
    perfectFor: z.string().nullable(),
    whereToWatch: z.string().nullable(),
    foodPairing: z.string().nullable(),
    categories: z.array(z.string()),
    tags: z.array(z.string()),
    image: z.string().nullable(),
    originalUrl: z.string(),
  }),
});
export const collections = { reviews };
