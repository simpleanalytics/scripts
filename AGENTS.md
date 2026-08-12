# Agent Instructions

This repository contains the public scripts for Simple Analytics. When making changes keep the following points in mind.

## Development

- Use **Node.js 22.16** (see `.nvmrc`).
- Run `npm run build` to compile the scripts. This generates the files in `dist/` which should be committed.
- Format code with Prettier before committing. You can run `npx prettier -w .` or validate with `npm run prettier`.

## Testing

- Execute `npm run test:unit` to run the unit tests
- When adding a new feature or fixing a bug, please add a test.
- For every change, run `npm run build` to ensure the test uses the latest compiled version.
- Ignore most files in the `dist/` directory when checking for diffs, just check `dist/latest/latest.dev.js` and `dist/latest/auto-events.js` (whichever is relevant).
- Only tests in `test/unit/` are relevant for the AI and agents (it can run without internet access).

## References

Most work happens in `src/` with `compile.js` creating the distributable versions. Read `README.md` for more details about contributing and running scripts locally.
