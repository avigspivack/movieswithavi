import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const reviews = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/reviews' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date().transform(d => d.toISOString().slice(0, 10)),
    rating: z.string().nullable().optional(),
    ratingNum: z.number().nullable().optional(),
    ratingText: z.string().nullable().optional(),
    oneLine: z.string().nullable().optional(),
    perfectFor: z.string().nullable().optional(),
    whereToWatch: z.string().nullable().optional(),
    foodPairing: z.string().nullable().optional(),
    categories: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    image: z.string().nullable().optional(),
    originalUrl: z.string().nullable().optional(),
  }),
});
export const collections = { reviews };
