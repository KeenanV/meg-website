**Meg website — project review and local startup guide**

**Historical baseline:** Local hardening is documented in [HARDENING.md](HARDENING.md); current startup commands are in [README.md](README.md). The findings below describe the project before that work.

Reviewed September 14, 2026 against the laptop working tree, GitHub, published Sanity content, production builds, and the local browser preview.

The architecture is a good fit for a content-focused professional website. The project is a working prototype with real content and a partially completed visual redesign. It needs a focused completion and deployment pass before launch; there is no evidence here that it needs to be rebuilt with a different stack.

**How it works**

| Part | Responsibility | Current state |
| --- | --- | --- |
| `apps/studio` | Sanity's React-based editing interface | Sanity 5.7.0; builds and starts successfully |
| Sanity Content Lake | Hosted documents and media | Project `ap0mc9ri`, dataset `production`; public published content is readable |
| `apps/web` | Public website | Astro 5.17.3, Tailwind 3, static output |
| `src/lib/queries.ts` | GROQ content queries | Fetches About, books, posts, news, and site settings |
| `src/lib/portableText.ts` | Converts rich text to HTML | Used by About and blog articles; news uses a separate lossy renderer |
| `cloudbuild.yaml` | Intended GCP build and upload pipeline | Present only locally, with launch-blocking configuration problems |
| Root package | Small TypeScript scaffold | Not an npm workspace and not a working site build entry point |

Studio is an editor for the hosted Sanity database. Running it locally does not start a local database. Both local apps currently point at the production dataset. Website viewing needs internet access to read Sanity, but does not require Studio to be running. Studio is needed when editing content.

In development, Astro executes the page queries when serving pages. Publish a change in Studio and refresh the website to see it; no draft-preview or live-update integration is implemented. The current cached API configuration may introduce a short delay.

In production, `astro build` fetches the published content and creates HTML files. GCP would serve those files, CSS, and assets. A Sanity edit requires another website build and deployment before it appears on the public site. This is the normal [Astro/Sanity static publishing model](https://www.sanity.io/docs/astro/static-and-server-rendering).

**What was verified**

- Reinstalled each app's existing lockfile with `npm ci`. The pre-existing `.bin` command entries were ordinary copied files with broken relative imports; the initial website build could not launch Astro. Reinstallation fixed this without upgrading package versions or changing lockfiles.
- Website production build passed and generated 13 pages: five main pages, six blog articles, one news article, and `/debug`.
- Studio production build passed. Both development servers started successfully.
- Studio's browser interface reached its login screen. Authenticated editing and publishing were not exercised.
- Checked 163 root-relative link occurrences in generated HTML; every target existed. This does not validate external destinations or hash fragments.
- Browser-reviewed Home, About, Books, Blog, one blog article, and one news article. The About accordion opened correctly. Observed Sanity images loaded, sometimes after the initial page capture.
- The web TypeScript files and Studio's configured TypeScript inputs passed `tsc --noEmit`. These checks do not replace Astro template diagnostics; Studio's current TypeScript include list also excludes `sanity.cli.ts` and `structure.ts`.
- `npm run check` in the web app could not run because `@astrojs/check` is missing. TypeScript is present transitively but is not declared as a web development dependency.
- The root TypeScript build configuration fails with TS18003 because it includes a nonexistent root `src` directory.
- Desktop browser inspection succeeded. The browser viewport override did not take effect, so phone-size visual verification remains outstanding; mobile findings below come from source inspection.
- GCP account resources, deployed routing, certificates, IAM, and existing Sanity webhook configuration were not inspected. Their existence cannot be inferred from the local YAML or README.

**Content and editing**

The published dataset currently supplies one book, six blog posts, one news item, and an About document with all three new sections populated. About contains two blocks, Approach one block, and Fees & Insurance nine blocks. The former `bio` field is absent on the published singleton, so the local schema's About migration appears complete for that document. No published blog/news document is currently missing a slug.

The Studio structure is appropriately simple: Site Settings and About are singletons, followed by Books, Blog Posts, and News. The singleton document IDs agree with the website queries, and the editor removes deletion and duplication actions for those types. This is useful groundwork for an editor who should not need to understand the implementation.

Before handoff, improve these areas:

- Require slugs for blog/news documents and validate content needed by their templates. A currently valid dataset can still be broken by publishing a new document without a slug or body. Add defensive handling in the website too.
- Move the blog article's null check ahead of `blogPost.body` access. It currently dereferences the result before checking whether it exists.
- Use one Portable Text renderer for blog and news. News currently joins child text and loses links, emphasis, headings, and list semantics.
- Escape HTML attribute values and validate URL schemes in the custom Portable Text renderer. It directly interpolates `href` and image `alt` into HTML that is injected with `set:html`. This is an unsafe content-rendering boundary even though ordinary visitors cannot edit the CMS. No exploit was executed against the site.
- Connect Site Settings to the real layout. `qSite` is unused by the public pages; the configured title, description, and social links do not control the normal site. Home copy and the professional identity are largely hardcoded.
- Decide whether editors need inline images, captions, image alt text, tags, draft preview, and scheduled publishing. Some related fields/helpers exist, but those complete workflows do not. Setting a future post date alone does not schedule visibility: the queries have no future-date filter.
- Replace `useCdn: true` with a build-appropriate client using `useCdn: false`, and make the published perspective explicit. Sanity [recommends the live API for static builds](https://www.sanity.io/docs/help/js-client-cdn-configuration) to avoid embedding stale cached content immediately after a publish webhook.

**Visual and visitor experience**

The scenic photography, dark translucent surfaces, and shared typography form a recognizable design. Home has a clear visual hierarchy; About's portrait and sections are a substantial improvement over a plain biography; blog cards and the article text treatment are useful reusable patterns. Most public interactions require very little JavaScript.

The design is uneven across routes. Books still uses `.card` and an old grid pattern from `styles.css`, but that stylesheet is not imported. It shows a disproportionately large cover and minimally styled text. Individual news articles similarly have no protective content panel, weak heading hierarchy, and text laid over a busy background. These should adopt the newer component system.

The highest-value visitor-facing changes are:

1. Add a clear contact or consultation path. There is no dedicated contact page, contact action, or implemented booking flow in the current code. The Psychotherapy button takes visitors to About, where they can read but have no clear next action.
2. Confirm the intended balance between clinical practice, books, and writing. Review the homepage language, current availability, contact details, and professional information with Meg. Published fees and insurance text should be explicitly checked by her before launch.
3. Review the archive presentation. The six current blog entries are from 2016 and the news item is from 2020. These can be useful archive content, but Home's “Latest writing” and “News” currently make the site appear inactive. Blog detail pages also omit the original publication date even though it is fetched.
4. Reduce background competition with text, particularly on news and listing headers. The photographic treatment is attractive, but small translucent text needs a reliable surface behind it. No formal contrast ratio or Lighthouse score was measured.
5. Fix the Tailwind width generation in `Layout.astro`. The expression `"mx-auto max-w-" + contentWidth` is not statically discoverable by Tailwind. The generated CSS has no `.max-w-6xl`, and the blog wrapper's computed `max-width` is `none`. `max-w-2xl` only survives because a literal occurrence exists elsewhere. Use a map of complete class names.

Accessibility needs a deliberate pass. The mobile menu uses a hidden checkbox and ordinary labels for Menu/Close, so its controls are not standard keyboard-focusable buttons. It also lacks focus management, Escape handling, and an expanded state on a real trigger. Its offscreen links remain in the document. Replace this with an accessible disclosure or dialog pattern.

About's collapsed panels are only visually clipped with `max-height: 0`; their contents remain exposed in the accessibility tree, as confirmed in the browser. Add proper panel relationships and hidden/inert handling, or use an appropriate native disclosure. Also review heading order (Blog and News listings currently start at `h2`), visible focus styles, a skip link, current-page navigation state, meaningful image alternatives, and reduced-motion behavior.

**Performance and correctness**

- The website build is about 76 MiB, largely because Astro copies every public image, including unused alternates. The active backgrounds alone are approximately 4.1 MiB for Home/About/Books, 12 MiB for Blog, and 10 MiB for News. Compress/resize them and serve appropriate modern formats. Remove unused source-size images from public output. These are observed file sizes, not measured per-visit transfer totals.
- Several content images lack explicit intrinsic dimensions or responsive sources. Some above-the-fold images are lazy-loaded; the article cover uses quality 100. Tune these choices and verify layout shifts and mobile loading.
- Date-only values are interpreted as UTC instants, then formatted in the machine's local timezone. The published news date is `2020-02-06`; the laptop renders `2/5/2020`. This affects Home, News, and the news article. Format calendar dates without timezone conversion and select an explicit locale/timezone policy for timestamps.
- The homepage downloads all posts and all news bodies before slicing each list to three items. Query only the fields and records each placement needs as the archive grows.
- Empty-state presentation and custom 404 handling are not implemented. Invalid Tailwind classes such as `h-65` and unsupported opacity steps also merit cleanup.

**GCP deployment blockers**

The current file is a starting point, not a verified deployment pipeline. Specific corrections are required:

1. **Get the actual source into GitHub.** `cloudbuild.yaml` and all local `apps/web/public` assets are untracked. The styling commit is also ahead of GitHub. A remote build cannot reproduce this laptop yet.
2. **Use the correct branch.** GitHub's only branch is `master`; the README tells you to trigger on `main`. There is a local `main` at the initial commit. Choose a branch deliberately and align the trigger/documentation.
3. **Supply Sanity build configuration.** The working `.env` is ignored, its example file is locally deleted, and the YAML declares no `PUBLIC_SANITY_PROJECT_ID`. A fresh remote build will need explicit environment values. Project ID, dataset, and API version are public configuration; no token is needed for the currently public published dataset.
4. **Pin the build runtime.** The `gcr.io/cloud-builders/npm` image is unversioned in this file. Use a specified supported Node environment consistent with local development. Node 24 is currently [an LTS release](https://nodejs.org/en/about/previous-releases); the laptop's Node 25.1.0 did pass this review's builds, but it should not be the long-term runtime baseline.
5. **Correct cache metadata paths.** The `rsync` places `dist/index.html` at the bucket root, but `find` emits `apps/web/dist/index.html`; the next step then targets `gs://meg-site-prod/apps/web/dist/index.html`. Strip the local prefix or run relative to `dist`.
6. **Separate cache policies by filename behavior.** One-year immutable caching is appropriate for fingerprinted assets, but not for fixed URLs such as `/bg.jpg`, whose contents may change. Otherwise repeat visitors can retain old images after deployment.
7. **Avoid duplicate uploads.** The `artifacts.objects` section uploads the same build output again to the website bucket. Prefer one intentional website deployment mechanism and a separate artifact destination if build archives are wanted.
8. **Configure and verify hosting.** Confirm the actual project and bucket, build service-account permissions, domain/DNS, HTTPS load balancer, certificate, CDN behavior, directory indexes, slash redirects, and error page. A Cloud Storage bucket alone does not provide custom-domain HTTPS; see [Google's static website guide](https://docs.cloud.google.com/storage/docs/hosting-static-website).
9. **Wire publishing to a real rebuild trigger.** A GitHub push trigger and a Sanity content webhook solve different problems. Configure a Cloud Build webhook trigger with its supported secret arrangement, then have Sanity invoke it for relevant published-document changes, including removals. The README's “published events” instruction is incomplete. Follow [Cloud Build's webhook documentation](https://docs.cloud.google.com/build/docs/automate-builds-webhook-events), test an edit-to-live cycle, and make failures observable.
10. **Choose a hosted Studio location.** The YAML only builds the website. Meg needs a stable editor URL once she is maintaining content, with appropriate Sanity access and CORS settings.

The pipeline uses `rsync -d`, which deletes bucket objects absent from the new output. Use a dedicated website bucket and retain a rollback strategy. No cloud deployment or deletion was performed during this review.

**SEO and maintenance**

All 13 generated pages lack meta descriptions. The layout accepts a description, but callers do not provide one, and Site Settings is not connected. `astro.config.mjs` still specifies `https://example.com`. Add the actual canonical domain, per-page title/description behavior, canonical links, sharing metadata, sitemap, robots policy, favicon, and a useful 404 page. Remove or development-gate `/debug`, which currently ships the Site Settings JSON as a public page.

GitHub is public and currently ends at `899a85c` (“Working studio”). The laptop is on `2ef7ee9` (“Styling”), one commit ahead, with additional staged and unstaged work. GitHub returned no issues, pull requests, or Actions runs during this review.

Fix repository hygiene before making a checkpoint: the root ignore entry `/node_modules` does not cover either app's dependency folder. Ignore nested dependency directories, `.astro`, `.sanity`, OS metadata, and editor-local files; remove already staged generated files from tracking while preserving the intentional source changes and assets. Do not blindly stage the current tree.

Live `npm audit` results for the unchanged lockfiles were:

| App | Total affected package entries | High | Critical |
| --- | ---: | ---: | ---: |
| Website | 20 | 12 | 1 |
| Studio | 37 | 21 | 2 |

These are package-audit results, not proof that every advisory is reachable in this application. Several concern development servers, build tooling, or features this static site does not use. They still justify a planned dependency upgrade and regression pass before launch. Some proposed fixes involve major releases; avoid a blind `npm audit fix --force`. `@sanity/structure` 2.36.2 appears unused: the application imports `sanity/structure`, so the old standalone package should be assessed for removal. Also update the deprecated image-builder import and establish reproducible Node/tooling versions.

**Run the project locally**

The two apps have separate installs and commands. Running `npm run build` at the repository root invokes the unrelated broken TypeScript scaffold.

The installed Node 25.1.0 worked during this review. If your shell cannot find Node/npm, initialize the existing nvm installation and select that version:

```sh
source "$HOME/.nvm/nvm.sh"
nvm use 25.1.0
node --version
npm --version
```

For routine website work, open one terminal:

```sh
cd /Users/keenanv/Documents/Programming/web/meg-website/apps/web
npm run dev
```

Open [the website](http://localhost:4321). Leave that terminal running.

To edit content, open a second terminal:

```sh
cd /Users/keenanv/Documents/Programming/web/meg-website/apps/studio
npm run dev
```

Open [Sanity Studio](http://localhost:3333), and sign in with the account that has access to this project. Edit a document, click Publish, then refresh the Astro page. Drafts are not shown by the current public-content workflow. Local Studio changes affect the hosted production dataset.

If starting from a fresh checkout or repairing dependencies, run `npm ci` in each app directory before its first `npm run dev`. Both installs were repaired during this review, so this is not necessary every time you start working.

The website needs `apps/web/.env`. The existing file worked. A future replacement can use these public project values and the configured API default:

```dotenv
PUBLIC_SANITY_PROJECT_ID=ap0mc9ri
PUBLIC_SANITY_DATASET=production
PUBLIC_SANITY_API_VERSION=2025-10-26
```

Restart Astro after changing environment variables. Restore a tracked `.env.example` so this setup is discoverable on another machine.

To test the actual static output:

```sh
cd /Users/keenanv/Documents/Programming/web/meg-website/apps/web
npm run build
npm run preview
```

Open the address printed by the preview command, normally `http://localhost:4321`. Stop the dev server first if you want to use that same port. Content in this preview stays frozen until you run another build. Neither this build nor preview deploys anything to GCP.

Press **Control-C** in a server's terminal to stop it. If a port is occupied, use the existing server or the alternate address printed by the new process.

At review completion, the assistant-started servers use [127.0.0.1:4321](http://127.0.0.1:4321) and [127.0.0.1:3333](http://127.0.0.1:3333). They remain available while those processes are running.

**Suggested next sequence**

1. Preserve the laptop work in a clean source-control checkpoint after fixing ignore rules and reviewing staged files.
2. Compare the older conversation with this review to recover product decisions: contact flow, design direction, content scope, original URL/redirect requirements, and domain.
3. Complete Books and News styling, contact actions, accessibility, dates, content validation, safe rendering, and image optimization.
4. Upgrade dependencies deliberately, pin Node, repair `astro check`, and add a small CI check/build workflow. Verify key routes, keyboard navigation, small screens, and publication behavior.
5. Finish metadata and the GCP/Studio deployment configuration; run an end-to-end staging publish test and a rollback test before launching the real domain.

This review added this document and repaired local dependency installations. It did not redesign application source, modify Sanity documents, commit or push changes, or deploy to GCP.
