# Local hardening — September 15, 2026

Historical record of the initial hardening pass. See [DEPENDENCIES.md](DEPENDENCIES.md) for the September 24 dependency versions, compatibility decisions, and current verification procedure.

This pass is confined to the local website and Studio. GCP, contact delivery, the links page, and reader accounts are deferred. No CMS documents were changed.

## Content safety and correctness

- A shared Portable Text renderer preserves headings, lists, emphasis, links, and inline images in About, blog, and news.
- URL schemes are allowlisted, HTML attributes are escaped, external tabs use `noopener noreferrer`, and incomplete image blocks are skipped safely.
- News dates and article publication dates use explicit English/UTC formatting. The February 6 event now remains February 6.
- Published Sanity queries use the live API. Missing environment configuration fails with an actionable message; drafts are excluded explicitly.
- Article content is passed with static-route props instead of fetching it again after resolving the slug. Missing/invalid slugs cannot produce broken routes; duplicate slugs fail clearly.
- Studio now requires article slugs, dates, and bodies, validates links, and offers optional image alternatives. These schema changes apply when editing/publishing; they do not mutate existing data.

## Interface and accessibility

- Books uses a glass panel with a readable cover size, title/description hierarchy, and purchase actions.
- News listings and details match the shared surfaces. Blog and news details share their renderer and layout.
- Mobile navigation uses a native modal dialog with keyboard focus cycling, Escape dismissal, focus restoration, scroll locking, and breakpoint cleanup. A no-JavaScript navigation fallback remains available.
- About uses native disclosures that work by keyboard and without JavaScript, enhanced with reversible 300 ms opening/closing animations. Reduced-motion preferences skip animation; collapsed content is absent from the accessibility tree.
- Added a skip link, current-page navigation state, visible focus, reduced-motion support, proper primary headings, and empty states.
- Site Settings supplies layout title/description defaults. Page descriptions, basic sharing metadata, a favicon, and a custom 404 are present. The debug route and placeholder domain are removed.

## Images

All eight original images have been relocated intact to `design-assets/backgrounds`. An image preparation script creates smaller source WebPs, then Astro generates three responsive widths per background. This prevents the original JPEGs from being copied into the site by Astro's image import graph.

The generated output is approximately **3.03 MiB**, down from the original roughly 76 MiB. This is build size, not a Lighthouse score or a measurement of every visitor's network transfer. Original images remain available for future design work.

## Runtime and dependencies

Node 24 LTS is selected through `.nvmrc` and package engines. Astro is 7.3.2; Sanity and Vision are 6.13.2. React and React DOM are pinned together to 19.2.8, satisfying the Studio editor's peer dependency. Tailwind 3 stays in place to preserve the existing design, through PostCSS instead of the obsolete Astro integration.

Removed the unused legacy `@sanity/structure` package. Astro's checker and TypeScript are declared dependencies. Studio checks include its CLI and navigation structure. Root commands now run the real apps; the obsolete root TypeScript scaffold is removed.

After compatible updates, the Studio CLI still had advisories in pinned transitive dependencies. Scoped overrides select patched versions:

| Consumer | Dependency | Override |
| --- | --- | --- |
| `@vercel/frameworks` | `js-yaml` | `^3.15.2` |
| `@vercel/frameworks` | `smol-toml` | `^1.8.0` |
| `@module-federation/dts-plugin` | `adm-zip` | `^0.6.1` |
| `typeid-js` | `uuid` | `^11.1.1` |

The UUID override crosses a major version while preserving TypeID's used v7/buffer/stringification APIs. The Studio test exercises its actual CommonJS and ESM consumers with 200 unique IDs and UUID round trips. Builds and startup are also checked. Revisit these overrides when upstream packages update; they should not become permanent unexplained pins.

The latest npm audits for both apps report **zero known vulnerabilities**. This is the registry's dependency result at review time, not a guarantee of complete application security.

## Verification

- Astro/Studio type checks.
- Nine web regression tests covering injection attempts, safe links, missing content/images, rich-text formatting, date behavior across timezones, route collisions, and environment validation.
- One Studio compatibility test covering both module formats of its TypeID dependency.
- Production builds of both apps.
- Generated HTML checks: 13 pages including the custom 404, 312 local link/image targets, one primary heading and a description per page, no debug output or placeholder domain, and a 10 MiB build-size ceiling.
- Desktop and 390px browser inspection, with keyboard tests for navigation and About disclosures. Authenticated Studio publishing remains for the editor to verify.

Run `npm run verify` from the root after installing each app's locked dependencies. See [README.md](README.md) for startup and preview commands.

## Follow-up

Finalize content and design choices with Meg, then implement contact delivery and the separate links page. Before public launch, configure the real domain and GCP hosting, sitemap and social sharing artwork, deployment/security headers, old-URL redirects, and an end-to-end publish/rollback workflow. User accounts and blog interaction remain a later phase.

Migration references: [Astro 6](https://docs.astro.build/en/guides/upgrade-to/v6/), [Astro 7](https://docs.astro.build/en/guides/upgrade-to/v7/), and [Sanity 6](https://www.sanity.io/docs/help/v5-to-v6).
