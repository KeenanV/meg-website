# Dependency review — September 24, 2026

Both app manifests were compared with npm's stable release tags. Compatible direct and transitive dependencies were refreshed, and both lockfiles were checked with clean `npm ci` installations. No prerelease packages, forced peer resolution, or `npm audit fix --force` were used.

## Current direct dependencies

| Website | Installed version |
| --- | --- |
| Astro | 7.3.5 |
| Sanity client | 8.7.0 |
| GROQ | 6.16.0 |
| Portable Text HTML / types | 6.0.0 / 4.0.2 |
| Sanity image URL builder | 2.1.1 |
| Astro checker | 0.9.10 |
| Tailwind typography | 0.5.20 |
| Autoprefixer / PostCSS | 10.6.1 / 8.5.28 |
| Sharp | 0.35.4 |
| Tailwind CSS | 3.4.19 |

| Studio | Installed version |
| --- | --- |
| Sanity / Vision | 6.16.0 |
| React / React DOM | 19.3.0 |
| React types | 19.3.0 |
| styled-components | 6.5.3 |

Both apps use TypeScript 6.0.3 and Node types 24.13.6. The runtime remains Node 24 LTS. Installed versions are reproducible through the checked-in lockfiles; some unchanged manifest ranges already admit the current stable release.

## Deliberate compatibility limits

- **TypeScript 7.0.2:** not adopted. The current `@astrojs/check` peer range is `^5.0.0 || ^6.0.0`. Both apps advance from 5.9.3 to the newest compatible 6.0.3 release, retaining one compiler generation for the project and Studio tooling.
- **Tailwind 4.3.3:** deferred to a dedicated visual migration. Version 4 changes utility scales/defaults, configuration, and browser requirements. This site relies extensively on Tailwind 3 utilities and `@apply`; retain the latest 3.4 release for launch. See the [official migration guide](https://tailwindcss.com/docs/upgrade-guide).
- **Node types 26.6.2:** not adopted because the app engines target Node 24. Types stay current within that runtime's major version.

These are the only remaining direct-package differences reported by `npm outdated` after the update. The baseline and updated audits both reported zero known vulnerabilities; an audit is a time-specific advisory check, not a guarantee that code is vulnerability-free.

## Security overrides

All four existing scoped overrides remain necessary: the updated dependency tree still requests older versions upstream.

| Consumer | Upstream request | Retained override / resolved version |
| --- | --- | --- |
| `@vercel/frameworks@3.29.0` | `js-yaml@3.13.1` | `^3.15.2` / 3.15.2 |
| `@vercel/frameworks@3.29.0` | `smol-toml@1.5.2` | `^1.8.0` / 1.9.0 |
| `@module-federation/dts-plugin@2.9.0` | `adm-zip@0.6.0` | `^0.6.1` / 0.6.1 |
| `typeid-js@1.2.0` | `uuid@^10.0.0` | `^11.1.1` / 11.1.1 |

The existing Studio compatibility test exercises TypeID's real CommonJS and ESM consumers, including unique identifiers and UUID round trips. Revisit overrides when those upstream requests change.

## Verification

Use `npm run verify` for Astro and Studio type checks, the web regression suite, the Studio compatibility test, both production builds, and generated-page validation. Audit each app with `npm audit --prefix apps/web` and `npm audit --prefix apps/studio`.

Completed this review: clean installs and valid dependency trees in both apps; zero known vulnerabilities in both audits; zero Astro/Studio diagnostics; all 14 tests passed; both production builds passed; 71 generated pages and 3,122 local targets verified. Desktop and 390px/320px browser checks covered icon placement, the scrollable menu footer, keyboard focus wrapping, and an external social link opening without navigating the original page. No website console warnings/errors were reported.

The updated Studio development server started successfully and rendered its origin-registration screen on the temporary test port. Authenticated editing/publishing was not exercised, and no CORS permissions or CMS documents were changed. Restart an already-running Studio process to load the new installed versions.

Clean installs also report unapproved optional install scripts for esbuild/fsevents under the current local npm policy. No global installation policy was changed; verify builds/startup before deciding an install script needs approval.
