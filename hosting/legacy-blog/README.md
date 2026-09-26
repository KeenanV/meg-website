# Legacy blog redirects (not activated)

The public Sight On Stress post sitemap was inventoried September 25, 2026. All 46 articles have individual destinations in the imported blog; 13 changed their slugs. `redirects.json` records the mapping and the two standalone pages the user chose to retire (Resources and Free Quick Guide to Stress). These return the custom 404 notice with a link to the blog. Existing query strings do not determine the mapping. URL fragments such as `#respond` never reach the server; the old comment forms are not migrated.

Use a separate Firebase Hosting site (`megvandeusen-legacy-blog`) for `sightonstress.com` and `www.sightonstress.com`. This keeps the old blog root redirect separate from the new website homepage. The site exists and its `redirect-review` preview is tested. Both custom-domain resources are registered for HTTPS preparation; public DNS, live-channel redirects, and cutover remain untouched. Do not point either old hostname at the main Hosting site or install a blanket redirect that loses article paths.

Prepare and validate against an existing website build:

```sh
npm run check:redirects
node scripts/legacy-redirects.mjs --local
npx firebase emulators:exec --only hosting --project megvandeusen-website --config .firebase/legacy-preview.json "node scripts/check-redirect-http.mjs"
```

Preview rules use 302 redirects to the launch-review website and no-store/noindex headers. The optional `--production` generator uses 301 redirects to `https://megvandeusen.com` and refuses to proceed while standalone-page decisions remain unresolved. Generating either config does not deploy it. Cutover remains under the user's hold. At approved activation, deploy the generated production config with `npx firebase deploy --only hosting --project megvandeusen-website --config .firebase/legacy-production.json`. This release is separate from the main website workflow.

The hosted preview is https://megvandeusen-legacy-blog--redirect-review-hgk4kjae.web.app (expires seven days after deployment); all 105 URL variants and three notices passed HTTP checks. Notice links use the preview destination in preview builds. Finish HTTPS for both old hostnames before moving their traffic. At the approved cutover, deploy the production redirect configuration and change the old domain's web DNS to the values Firebase supplies. Keep domain registration active. Bluehost-specific redirects cease to help once traffic or hosting leaves Bluehost.

Known old category/tag/author/page archives lead to the new blog index because those groupings and page sizes are different. Unknown article URLs return a genuine 404 with a link to the blog, rather than silently redirecting every missing path to an unrelated page.

The old main-site `/share-stressed-in-the-us/` page redirects to `/books` through the main `firebase.json`. Its `/books/` and `/news/` paths already exist in the new site. The old main site's API/canonical links refer to a stale Bluehost staging hostname; that hostname is not controlled by this migration and is not a replacement for the public domain.

Before moving nameservers, export the full authoritative DNS zone and preserve mailbox/MX/SPF/DKIM/verification records. Keep the existing HTML copies and retain Bluehost hosting until full content/database/media backups are verified. The old blog remains registered with Bluehost; a registrar transfer is optional and is not required for redirects. Public sitemap snapshots used for this inventory are in `/tmp/meg-legacy-inventory` on the setup machine; that temporary inventory is not a full backup.
