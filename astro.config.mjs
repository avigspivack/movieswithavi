import { defineConfig } from 'astro/config';
export default defineConfig({
  site: 'https://movieswithavi.com',
  // Old WordPress slug -> clean URL. Keeps any existing links working.
  redirects: {
    '/reviews/65-2': '/reviews/emily-the-criminal',
  },
});
