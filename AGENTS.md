# Agent instructions

Before working here, read the shared [Simple Analytics instructions](https://github.com/simpleanalytics/ide-config/blob/main/AGENTS.md) through the approved GitHub access method. Apply them alongside applicable parent and nested instructions; more specific instructions take precedence.

## Dist

- `dist/` is gitignored build output. Builds and `pnpm test` write it locally; never commit it.
- Releases are cut by bumping `VERSION` in `compile.js` on `main`. The Release workflow then builds, tests, and publishes GitHub Release `vN` with `scripts-vN.tar.gz`, which `pnpm run deploy` uploads. Published `vN` SRI files never change.

## Tracker changes

1. **Minimize shipped bytes.** Keep changes small and reuse existing helpers and variables. Measure minified, gzip, and brotli byte differences for affected scripts against the target branch using the same build and compression settings. Test proposed optimizations: extracting repeated strings can increase gzip size.

   The tracker should balance size against edge cases, not handle every edge case. Cover the common browsers and flows; accept small data loss in rare cases, such as old browser versions, unusual event orders, or invalid settings, instead of adding code for them. When a change fixes edge cases, list each part with its minified/gzip/brotli cost and what is lost without it, so each part can be kept or dropped on purpose.

2. **Preserve existing installations.** Unless the user explicitly accepts a behavior change, preserve existing settings and integrations. Check affected combinations against the [customer documentation](https://docs.simpleanalytics.com/), including manual pageviews, query handling, attribution, namespaces, ignored metrics, metadata, and automatic events. Report concrete before/after effects on customer data, event names, and counts, separately from additions that leave existing installations unchanged.

3. **Prefer simple implementations.** Add fallbacks, polling, abstractions, or compatibility layers only for a demonstrated requirement. Respect explicitly accepted tradeoffs, especially for unused beta helpers, rather than adding speculative compatibility machinery.

4. **Preserve website behavior.** Tracking must respect cancelled actions, existing handlers, form validation, submitter settings, modified clicks, new tabs, and downloads. Let the browser or website own navigation and submission; send tracking without forcing either action.

5. **Keep collection deliberate.** Honor collection settings and opt-outs. Distinguish query-parameter names from values when checking what is sent. Keep form field values out of automatic form tracking, sanitize automatically reported URLs, and keep extra diagnostic requests such as 404 confirmation opt-in. Make changes to collection defaults explicit for review.

6. **Preserve browser and build compatibility.** Keep visitor-facing output ES5-compatible and respect feature boundaries such as event-free `light.js`. Build affected scripts from source to verify them, but leave `dist/` out of commits (see Dist). Review source and build inputs first, using relevant generated output to verify those changes. Keep previously published pinned versions and their SRI bytes unchanged unless explicitly requested.

## Validation and review

7. **Verify affected behavior locally.** Use the Node and pnpm versions declared by the repository configuration and the commands available in `package.json`; see `README.md` for setup. For script changes, rebuild before focused before/after payload and browser-interaction checks. Prefer the offline suites in `test/unit/` for local runs. Follow the shared testing policy and ensure committed tests run with declared dependencies. Leave the full BrowserStack matrix to CI unless explicitly requested, and report local verification separately from remote CI.

8. **Keep PRs easy to review.** Prefer one logical change per PR. Group related fixes under one issue, state dependencies and merge order, and branch from and target the integration branch requested by the user. Keep unrelated test-infrastructure repairs separate from tracker behavior changes.
