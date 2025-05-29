# Agent Instructions

This repository contains the public scripts for Simple Analytics. When making changes keep the following points in mind.

## Development

- Use **Node.js 22.16** (see `.nvmrc`).
- Run `npm run build` to compile the scripts. This generates the files in `dist/` which should be committed.
- Format code with Prettier before committing. You can run `npx prettier -w .`.
- Execute `npm run test:unit` to run the unit tests.

## References

Most work happens in `src/` with `compile.js` creating the distributable versions. Read `README.md` for more details about contributing and running scripts locally.
