# Publishing from your phone

The site has a publish page at **movieswithavi.com/admin/publish**. Open it on your
phone, enter your admin key (same one as the Projection Booth — it's remembered for
the session), fill in the form, add the poster from your camera roll, and tap
**Publish**. The server commits the review and poster to GitHub, Railway redeploys,
and the review is live in about two minutes.

**Save as draft** commits the review to the `drafts/` folder instead — version-
controlled but invisible on the site. When it's ready, move the file into
`src/content/reviews/` (GitHub app: open the file → ⋯ → Edit → change the path)
and it publishes on the next deploy.

Re-publishing with the same title overwrites the existing review, so fixing a typo
is just: open the publish page, re-enter the review, Publish again.

---

## One-time setup

1. **Add the two files to the repo**
   - `publish.html` → `public/admin/publish.html`
   - Open `server.mjs` and paste the contents of `server-additions.mjs` anywhere
     after `const app = express();` (the code comments in that file say the same).

2. **Create a GitHub token**
   - github.com → Settings → Developer settings → Fine-grained personal access tokens
     → Generate new token
   - Repository access: **Only select repositories** → your movieswithavi repo
   - Permissions: **Contents → Read and write**. Nothing else.
   - Set a long expiration (you'll get an email before it lapses; make a new one then).

3. **Add Railway variables** (project → Variables)
   - `GITHUB_TOKEN` = the token you just made
   - `GITHUB_REPO` = `yourusername/movieswithavi`
   - `GITHUB_BRANCH` = `main` (only needed if your default branch isn't main)

4. **Commit and push.** Railway redeploys, and `/admin/publish` is live.

Tip: on your phone, open `/admin/publish` in Safari/Chrome and use
**Add to Home Screen** — it becomes a one-tap publishing app.

## Notes

- Posters are downscaled on your phone before upload (max 1400px, JPEG), so
  publishing works fine on cellular and keeps the repo lean.
- The endpoint makes two commits (poster, then review). Railway may briefly show
  two builds; the second one is the one that ships both.
- The page is `noindex` and everything is gated behind your `ADMIN_KEY`, which is
  checked on the server for every publish.
