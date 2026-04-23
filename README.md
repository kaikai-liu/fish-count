# FishCount

Public San Diego charter boat fishing data aggregator. See `.planning/PROJECT.md` for full context and `CLAUDE.md` for contributor rules.

## Local development

```bash
npm install
npm run dev      # dev server on :5173
npm run build    # produce build/index.js
npm run test:run # run vitest suite once
```

## Container

```bash
docker build -t fishcount .
docker run -p 3000:3000 fishcount
```

## Planning

- Requirements: `.planning/REQUIREMENTS.md`
- Roadmap: `.planning/ROADMAP.md`
- Current phase: `.planning/phases/00-ops-guardrails/`
