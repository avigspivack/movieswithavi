# Eval Workbench

A one-page workbench for building an LLM eval set end to end: a small dataset with
deliberate holes, twenty questions a real user would type, a rubric, a run of the
assistant under test, your own pass/fail labels, an LLM judge, and the number that
matters — **how often the judge agrees with you**.

Originally a Claude artifact. This repo is the standalone version: same workflow,
but it runs as an ordinary Node web app you can deploy anywhere.

## What changed from the artifact

| Artifact | This repo |
|---|---|
| Called `api.anthropic.com` directly (only works inside Claude's sandbox) | Calls `/api/claude` on this server, which holds the API key |
| State in the artifact storage shim | State in `localStorage`, plus JSON export/import |
| One model, hard-coded | Model picker for the assistant and the judge, defaults from env |
| Serial runs | Three concurrent calls, with progress |
| — | Optional password gate, per-IP rate limit, results CSV export |

## Push it to a new GitHub repo

This folder is self-contained — copy it out of wherever you got it and it's a repo:

```bash
cp -r eval-workbench ~/eval-workbench
cd ~/eval-workbench
git init -b main
git add -A
git commit -m "Eval Workbench: standalone"
gh repo create eval-workbench --private --source=. --push   # or create it on github.com and add the remote
```

`.gitignore` already keeps `node_modules/` and `.env` out. The API key never belongs
in the repo — it goes in the host's environment variables (below).

## Run it locally

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # from https://console.anthropic.com/settings/keys
npm start                             # http://localhost:3000
```

No key? The app still loads and every hand-grading step works — only generation,
runs and the judge are disabled, and a banner says so.

## Deploy it

The app is a single Node process with one dependency. Any host that runs Node 20+
works. Set `ANTHROPIC_API_KEY` in the host's environment variables — never in the repo.

**Railway** — New Project → Deploy from GitHub repo → add `ANTHROPIC_API_KEY` (and
`APP_PASSWORD`) under Variables. `railway.json` supplies the start command.

**Render** — New → Web Service → point at the repo. `render.yaml` sets the build and
start commands and the health check; fill in the two secrets in the dashboard.

**Fly.io** — `fly launch` (it will pick up the `Dockerfile`), then
`fly secrets set ANTHROPIC_API_KEY=sk-ant-...` and `fly deploy`.

**Anything Docker** — `docker build -t eval-workbench . && docker run -p 3000:3000 -e ANTHROPIC_API_KEY=sk-ant-... eval-workbench`

> Vercel/Netlify's default static hosting won't work as-is: this needs a long-lived
> Node server for the proxy. Use one of the hosts above, or port `server.js` to a
> serverless function.

## Environment variables

| Variable | Required | Default | What it does |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes | — | Server-side key. The browser never sees it. |
| `APP_PASSWORD` | no | — | If set, the page asks for it before any model call. **Set this on a public URL** — otherwise anyone with the link spends your key. |
| `ASSISTANT_MODEL` | no | `claude-opus-5` | Default model for the assistant under test. |
| `JUDGE_MODEL` | no | `claude-opus-5` | Default judge model. |
| `RATE_LIMIT_PER_MIN` | no | `40` | Model calls allowed per IP per minute. |
| `PORT` | no | `3000` | Most hosts set this for you. |

Models offered in the UI: Opus 5, Sonnet 5, Haiku 4.5. The list is an allowlist in
`server.js` — edit `MODELS` there to change it.

## Cost

A full pass is roughly 20 assistant calls plus 20 judge calls, all short. On Opus 5
that is cents, not dollars; switch both pickers to Haiku 4.5 while you're iterating
on the rubric and it's a rounding error. Watch actual spend in the Anthropic console.

## The workflow

1. **Dataset** — 12–20 rows you can hold in your head, with holes (missing metric, stale row, sample too small). The holes are the exercise.
2. **Questions** — 20 the way people actually type: well-formed, vague, unanswerable, false-premise, adversarial.
3. **Rubric** — one line per criterion, precise enough that a stranger grades the way you would. This is the spec.
4. **Run** — the assistant answers every question against the dataset.
5. **Annotate** — your labels first, before the machine's.
6. **Judge & memo** — the judge scores the same answers; the agreement number tells you whether it can stand in for you. Below ~80%, sharpen a rubric line, not the judge.

Export the whole thing to JSON at any point (left sidebar) — that file, not the app, is the asset.

## Files

```
server.js           static host + /api/claude proxy + /api/config + /api/health
public/index.html   the entire app (no build step, no framework)
Dockerfile          for Fly.io or any container host
railway.json        Railway start command
render.yaml         Render service definition
```

## Security notes

- The key stays server-side; the browser only ever posts text to `/api/claude`.
- `/api/claude` accepts an allowlisted model, a bounded `max_tokens`, and a 512 KB body.
- The password gate and rate limit are deliberately simple. They stop casual abuse of
  a public URL; they are not authentication for sensitive data.
