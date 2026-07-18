# Movies with Avi 🎬

The custom site for [movieswithavi.com](https://movieswithavi.com) — 200+ reviews, two ways in:

- **Discover** — "What do you want to watch tonight?" Type a mood, get a ticket-stub pick.
- **Browse** — the full library, filterable by rating, category, tag, or search.

## One-time setup

```bash
npm install
python3 scripts/prepare_images.py   # copies posters from "Movies with Avi - Master Images" into public/posters/
npm run dev                          # local preview at localhost:4321
```

## Deploy (Railway)

1. Push this repo to GitHub (images folder included).
2. Railway → New Project → Deploy from GitHub repo. `railway.json` handles build (`npm run build`) and start (`serve dist`).
3. Add the custom domain `movieswithavi.com` in Railway settings and update DNS.

## Publishing a new review

1. Add `src/content/reviews/your-movie-slug.md` — copy any existing file as a template. Frontmatter fields: title, date, rating, ratingNum, oneLine, perfectFor, whereToWatch, foodPairing, categories, tags, image. The body of the file is The Deets.
2. Drop the poster in `public/posters/your-movie-slug.jpg` and set `image: "/posters/your-movie-slug.jpg"`.
3. Commit and push. Railway redeploys automatically.

That's it — no WordPress, no plugins, no Bluehost.
