# Council Brief

Council Brief is AICorps Team 3's front-end proof of concept for an AI-assisted City Council meeting-preparation system. The application demonstrates agenda ingestion, explainable preparation-priority scoring, source review, editable briefings, human approval, printing, and JSON export.

## Current scope

This repository contains a functional static prototype. Agenda uploads and keyword-based priority scoring run in the browser. The detailed example briefings are representative sample data. The project does not yet connect to an LLM, a persistent database, or a live City data source.

## Run locally

Install Node.js 22.13 or later and pnpm, then run:

```bash
pnpm install
pnpm dev
```

Open the local address printed by Vite.

## Build locally

```bash
pnpm build
pnpm preview
```

The static production website is generated in `dist/`.

## Publish with GitHub Pages

1. Push this project to a GitHub repository whose default branch is `main`.
2. Open the repository on GitHub.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, choose **GitHub Actions** as the source.
5. Open the **Actions** tab and monitor the `Deploy Council Brief to GitHub Pages` workflow.

Every later push to `main` automatically rebuilds and republishes the site.

## Important files

- `src/App.tsx` — main interface and browser-side application logic
- `src/demo-data.ts` — representative agenda, briefing, and source data
- `src/index.css` — global styles and print rules
- `src/components/ui/` — reusable interface components
- `examples/` — fictional agenda file for testing the upload workflow
- `.github/workflows/deploy-pages.yml` — automatic GitHub Pages deployment

## Future AI backend

GitHub Pages cannot safely hold an OpenAI API key or run server-side retrieval. A future AI version should send requests from this frontend to a separately hosted backend or serverless function. Keep all API keys in that backend's secret storage, never in this repository or browser code.
