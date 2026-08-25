# MonkType

A typing + vocabulary practice website with a frosted-glass UI.
Type each word; when you finish it (press **space**), its meaning is revealed below.
Great for drilling vocabulary lists — English, Pali, or anything else.

## Features

- smooth typing experience: letter-by-letter coloring, gradient blinking caret, red underline on error words, auto-scrolling word grid
- glassmorphism design: aurora gradient backdrop, frosted-glass panels, dark & light themes
- meaning of each finished word shown in a panel above the typing area (optional **eye toggle** shows meanings while you type)
- **practice mistakes**: after a test, retype only the words you got wrong until you master them
- results screen: WPM, accuracy, raw, characters, time, a WPM-per-second chart, and a review of every typed word with its meaning (mistakes highlighted)
- **test history**: the last 50 completed tests are saved in the browser and shown in Settings
- word-count modes: 10 / 25 / 50 / 100 / 250 / 500 words per test
- **random or in-order word selection**: pick a random subset each test, or go through the list in order — the next test continues where the last one left off (position is remembered per list)
- **drill difficult words**: type `*` after a word (e.g. `test*`) and it is repeated 3 more times in the same test; typing the star again resets it to 3 more repeats
- **memorize words across tests**: type `/` after a word (e.g. `test/`) and it shows up in later tests to help you remember it — once in each of the next 3 tests, then 3× in every later test (type it with `/` again to stop memorizing)
- bundled lists (English 250 words, Pali) + import your own lists in the browser (stored in localStorage, exportable as JSON)
- dark & light themes
- keyboard: `space` finishes a word · `tab` restarts · `enter` starts a new test · `⌫` at the start of a word goes back · `*` after a word drills it 3× · `/` after a word memorizes it

## Adding your own word lists

### Option A — import in the browser (no rebuild)

Open **Settings** (gear icon) → paste JSON → **Import**. Lists are saved in your browser's
localStorage and appear in the list dropdown immediately. You can also paste your raw vocabulary
into the **Generate a list with AI** box, pick the language you want meanings translated into,
copy the prompt, and let an AI chat convert it to JSON for you.

```json
{
  "name": "My Vocabulary",
  "words": [
    { "word": "apple", "meaning": "a round fruit", "ipa": "/ˈæpəl/" },
    { "word": "sati", "meaning": "mindfulness" }
  ]
}
```

`ipa` is optional and mainly for English lists — when present it is shown next to the meaning
while typing and in the results review. Omit it for other languages (e.g. Pali) and it will not
be displayed. `pronunciation` is also accepted as an alias for `ipa`.

Plain arrays are also accepted:
`[ { "word": "apple", "meaning": "a fruit" } ]` or `["apple", "banana"]` (no meanings).

### Option B — bundled files (shipped with the site)

1. Create `public/words/<name>.json` using the same format as above.
2. Add `"<name>.json"` to `BUILT_IN_FILES` in `src/data/lists.ts`.
3. Rebuild and redeploy.

The files are loaded with `fetch` at runtime, so you can edit them without rebuilding — but a
rebuild + redeploy is needed to ship changes to visitors.

## Development

```bash
npm install
npm run dev        # local dev server
```

## Build

```bash
npm run build      # typecheck + build into dist/
```

## Upload to GitHub

```bash
git init
npm install
npm run build
```

Create an empty repository on GitHub, then:

```bash
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

`node_modules/` and `dist/` are already gitignored.

## Deploy to GitHub Pages

### Automatic (recommended) — GitHub Actions

The repo includes `.github/workflows/deploy.yml`, which builds the app and deploys it to
GitHub Pages automatically on every push to `main` (and can be triggered manually from the
**Actions** tab).

To enable it, once the repo is on GitHub:

1. Go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.

That's it — the next push to `main` builds and publishes the site at
`https://<user>.github.io/<repo>/`. The Vite config uses a relative base (`./`), so the site
works under the repo subpath without any extra configuration.

### Manual — gh-pages branch

```bash
npm run deploy     # builds and pushes dist/ to the gh-pages branch
```

Then enable GitHub Pages in your repo settings pointing at the **gh-pages** branch.

> Note: if you open `dist/index.html` directly from disk (`file://`), fetching the bundled word
> lists is blocked by the browser — the app then falls back to a small built-in list. Serve it
> (via GitHub Pages or any static host) for the full experience.
