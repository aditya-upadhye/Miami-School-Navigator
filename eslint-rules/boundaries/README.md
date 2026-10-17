# Hexagonal boundaries (L37)

`config.js` configures `eslint-plugin-boundaries` v7 (one `boundaries/dependencies` rule,
`default: allow`, `checkAllOrigins: true`). Policies are evaluated in order and **the last match wins**.
The element map and every policy are documented at the top of `config.js` and pinned by
`boundaries.test.ts`. The path conventions are tabulated in `../archie-view-law/README.md`.

Summary of the decisions:

- `@archie/**` is denied from EVERY element except `infrastructure-archie`, `app` (by symbol:
  `AuthGuard`, `useArchieClient`; `import type` from the js-sdk; re-exports must keep the same name),
  `src/main.tsx` (by symbol: `createClient`, `ArchieProvider`, `ArchieDevToolProvider`) and `client`.
- `src/components/Layout.tsx` and `src/routes.config.tsx` (the two enumerated L42 exceptions gv2 overwrites) are classified `app`: same rights as `src/app/**`.
- `domain` imports only domain (and no react / graphql / HTTP client); `application` only domain;
  `presentation` application, domain, ui-plane, legacy-gen, i18n; `infrastructure` only domain.
- ui-plane, i18n and `src/lib/gen` can never import infrastructure, application, presentation or app.
- Every other `src/**` file/folder is the catch-all `other`: no SDK, no infrastructure; nothing in
  presentation/application/domain may import it.
- Kit-D: `src/screens/**` is presentation; `src/components/kit/**` and `src/styles/kitd/**` are ui-plane;
  `src/lib/gen/**` is `legacy-gen`.
- An import that does not resolve to a file (`ts-alias-resolver.cjs` maps `@/` and relative paths) is
  classified external and not judged: `tsc` owns that error.
- Not expressible: "presentation -> domain is type-only".
