# Meg's website

Astro's static public website lives in `apps/web`; Sanity Studio lives in `apps/studio`. Each app has its own lockfile. GCP is not configured and is not needed for local work.

## Local setup

Use Node 24 LTS. From the repository root:

```sh
nvm install
nvm use
npm ci --prefix apps/web
npm ci --prefix apps/studio
```

If nvm is not loaded on this laptop, run `source /opt/homebrew/opt/nvm/nvm.sh` first. That is the Homebrew installation; the older `~/.nvm/nvm.sh` symlink points at an obsolete location.

The website needs `apps/web/.env`. If it does not exist, copy `apps/web/.env.example` and set:

```dotenv
PUBLIC_SANITY_PROJECT_ID=ap0mc9ri
PUBLIC_SANITY_DATASET=production
PUBLIC_SANITY_API_VERSION=2025-10-26
```

These are public project identifiers, not credentials. Never put a token in a `PUBLIC_*` variable. The existing public dataset needs no token for published-content reads.

Start these in separate terminals from the repository root:

```sh
npm run dev
```

```sh
npm run dev:studio
```

The website is normally at [127.0.0.1:4321](http://127.0.0.1:4321), and Studio at [localhost:3333](http://localhost:3333). Use the address printed by each command if its port is occupied.

Studio edits the hosted **production dataset**. Publish a document and refresh the website to see it. Draft preview is not implemented. The website reads Sanity directly and does not need the Studio server running. Internet access is required.

Use Control-C to stop a foreground dev server. Restart Astro after editing `.env`.

## Checks and production preview

From the root:

```sh
npm run verify
npm run preview
```

`verify` checks Astro templates and all Studio TypeScript, runs the content/security and dependency-compatibility tests, builds both apps, and checks generated pages and links. You can also run `npm run check`, `npm test`, and `npm run build` separately.

The static preview shows the last build, so rebuild after publishing new content. Astro 7's preview command runs a background process. Manage it with:

```sh
npm run preview -- status
npm run preview -- stop
```

Stop the preview before starting the development server on the same port. Neither building nor previewing deploys anything.

Audit the two lockfiles with:

```sh
npm audit --prefix apps/web
npm audit --prefix apps/studio
```

Studio has scoped security overrides documented in [HARDENING.md](HARDENING.md). Recheck them when upgrading Sanity.

The latest dependency review is recorded in [DEPENDENCIES.md](DEPENDENCIES.md).

## Images and content

Original photography is preserved in `design-assets/backgrounds`, outside the public output. `npm run images:prepare --prefix apps/web` generates the three smaller WebP source backgrounds. This also runs before website development and builds. Astro creates fingerprinted responsive variants from those sources.

Sanity content images use its image CDN, responsive widths, explicit dimensions, and automatic formats. Empty optional content gets an empty state. Invalid slugs are excluded from route generation; duplicate slugs fail the build with a clear error. Studio requires article slugs, dates, and bodies for new publications. A publication timestamp is editorial metadata, not a scheduling system.

Dates use English formatting and UTC consistently. Calendar-only news dates therefore cannot shift by a day between this laptop and a cloud build.

## Scope and later work

Blog and News cards open an animated article overlay with a horizontal flip and expansion. Click outside the pane, use its back link, or press Escape to return to the card; browser Back/Forward also tracks the article URL. Direct links and refreshes render the same grid with the requested article already open, without an opening animation. Closing returns it to its reserved grid cell. These are still static, shareable article URLs with pre-rendered content and article metadata. Reduced-motion preferences skip the 3D animation, and ordinary links still work without JavaScript or if an article cannot be loaded into the overlay.

Both archives show up to 12 cards per page. `/blog` and `/news` are the first pages; subsequent pages use `/blog/page/2/` and `/news/page/2/`. Pagination replaces just the grid and its controls, returns to the top, and records browser history and scroll positions. A direct article link includes only its own page of background cards. Archives with one page show no pagination controls. All page URLs are generated at build time, so publishing more content requires rebuilding the static site.

The viewer keeps at most five recently opened articles as HTML and metadata, releases replaced grids and their event listeners, and does not prefetch articles on hover. Only the current grid is retained; older pages can be fetched again using the browser's normal HTTP cache. Search is deferred until after launch.

- Local hardening and a consistent liquid-glass design come first.
- `/contact` has a glass form with Name, Email, and Message fields, linked from navigation, Home, and About. Email delivery is not connected yet: Send is a clickable preview button with no action, a visible availability note explains this, and the form prevents submission. No recipient email address is embedded in the page. Connect a server-side email service, validate submissions, and add abuse protection and delivery feedback before wiring up Send.
- `/links` is a standalone glass profile page with no sidebar or mobile navigation. In Studio, open **Links Page** to edit the display name, professional title, optional portrait, and link buttons. The name and portrait default to About. Drag links to reorder them; each has editable button text, an optional destination, and an icon picker (including a custom image option). Missing destinations appear as disabled “Coming soon” buttons. Internal destinations use paths such as `/blog`; external destinations use full URLs. Publish edits and rebuild the static site to show them publicly.
- Navigation and About reuse the LinkedIn, Instagram, and Bluesky destinations from **Links Page**, identified by their icon selection. Edit these URLs there once to update every location. Social icons with missing or invalid destinations are omitted; other link types remain exclusive to `/links`.
- GCP account, resources, DNS, HTTPS, build triggers, publish webhooks, and a hosted Studio are later work. `cloudbuild.yaml` is an unverified draft, not a ready-to-run deployment.
- A reader database, accounts, comments, and private messaging are a later phase, not launch requirements.

No placeholder production domain is emitted. When a domain is chosen, provide `SITE_URL` to the build process to enable canonical URLs, then finish sitemap, sharing imagery, hosting headers, and redirects as part of launch preparation.

[PROJECT_REVIEW.md](PROJECT_REVIEW.md) is the original assessment before hardening; [HARDENING.md](HARDENING.md) describes this pass.
