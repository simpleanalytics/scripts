# Agent Instructions

This repository contains the public scripts for Simple Analytics. When making changes keep the following points in mind.

## Development

- Use the Node.js version pinned in `.nvmrc` (currently **24.18.0**).
- Run `npm run build` to compile the scripts. This generates the files in `dist/` which should be committed.
- Format code with Prettier before committing. You can run `npx prettier -w .` or validate with `npm run prettier`.

## Script size and naming

- Write code in `src/` to minimize the bytes in the compiled scripts, not just the source. Reuse the predefined variables for repeated values: the compiler turns these into very short variable names, saving bytes wherever they are reused.
- Keep source code readable and check the compiled output and size after building to verify that a change actually saves bytes.
- Names in `overwriteOptions` and script attributes are public settings. Balance short names with readable, human-friendly names, using existing options and attributes as the reference (for example, `ignorePages` / `data-ignore-pages`). These names cannot be shortened by variable minification.

## Testing

- Execute `npm run test:unit` to run the unit tests
- When adding a new feature or fixing a bug, please add a test.
- For every change, run `npm run build` to ensure the test uses the latest compiled version.
- Ignore most files in the `dist/` directory when checking for diffs, just check `dist/latest/latest.dev.js` and `dist/latest/auto-events.js` (whichever is relevant).
- Only tests in `test/unit/` are relevant for the AI and agents (it can run without internet access).

## References

Most work happens in `src/` with `compile.js` creating the distributable versions. Read `README.md` for more details about contributing and running scripts locally.
