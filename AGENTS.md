# AGENTS

- `dist/` is generated output. Builds and `pnpm test` rewrite it (each build stamps the date), and a maintainer builds and commits it separately before deploying. Never commit `dist/` changes in feature work; restore it with `git checkout HEAD -- dist` before committing, and skip `dist/` when reviewing or validating changes.
