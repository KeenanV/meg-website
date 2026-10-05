# Protected Resources: local and staging implementation

## Local testing

Use Node 24. From the repository root:

```sh
npm run resources:prepare -- --demo
npm run dev --prefix apps/web -- --host 0.0.0.0 --port 4323
```

The local-only demonstration password is `local-resources-only`. This is a public
fixture credential, not a password to print in the book or deploy to the cloud.
The setup script stores a salted scrypt hash, private metadata, and copies of the
published MP3s and cover images under the ignored `.private/resources/` directory.
It performs no writes to Sanity. Run without `--demo` to refresh local content
without resetting the password hash. Restart Astro after changing the password.
If Astro reports an existing dev server, use `astro dev stop` from `apps/web`
before starting it again.

Visit `/resources`, unlock it, play/seek, and use **Lock resources**. Reloading
retains an unexpired session; locking or restarting the dev server invalidates it.
The development integration also accepts the machine's current LAN IP so phones
can test on the same network. HTTP/LAN is for this demo only; cloud must use HTTPS.

## Security boundary

- Public HTML contains the gate, styles, and empty card/player templates only.
  Removing the gate does not reveal recordings. The server supplies the catalog
  only after successful authentication.
- The password is checked server-side using scrypt and constant-time comparison.
  Random 256-bit session tokens are stored only as SHA-256 hashes server-side.
- The `__session` cookie (required for Firebase Hosting rewrites) uses HttpOnly,
  SameSite=Strict, and a restricted API path. Secure is on by
  default in the handler and off only in the local HTTP integration.
- All catalog, image and audio endpoint requests authenticate the session.
  Local audio streams through the endpoint with Range support. In staging,
  authenticated audio GETs redirect to a GCS URL valid for 15 minutes; this avoids
  Firebase Hosting dropping Range headers on its dynamic proxy. The bucket itself
  remains private. A copied signed URL works until its expiry, including after
  logout; logout immediately revokes the session and prevents obtaining new URLs.
  The player can reauthorize once after an expired-link error and restore position.
- POST requires an allowed Origin, cross-site requests are rejected, and login
  attempts have a bounded per-address cooldown and concurrency limit.
- Sessions expire after eight hours. Logout revokes the token, clears the delivered
  DOM and buffered audio, and invalidates copied cookies. Page restoration rechecks
  authorization. API/media responses are private/no-store.
- Local fixture directories are denied through Vite's filesystem endpoint and are
  outside the Astro public folder. Build checks reject embedded recording URLs.

These controls do not stop an authorized reader from capturing the recording.
Existing Sanity CDN files remain public until deliberately migrated/retired; a local
copy does not revoke access to those originals.

## Before production deployment

Production is not configured for this feature. The static production output fails
closed until an authenticated same-origin `/api/resources/**` service is deployed.
Do not merge this change into the production deployment ahead of that service.

The staging adapter uses a private bucket and Firestore for sessions and attempt
limits, with TTL cleanup. Credential hashes namespace the sessions so changing the
reader password invalidates old sessions when the new secret version is deployed.
Local development uses bounded in-process maps. The staging reader-password
attempt limit is shared among reviewers behind the independent outer credential;
choose a verified trusted-ingress rate-limit policy before making the reader gate
public in production. Keep fixture credentials out of cloud build contexts.

Production Studio still uploads public Sanity assets. Staging Studio now has a
private upload control authenticated as a Sanity editor, issuing tightly scoped
uploads to the staging bucket and storing only object metadata in Sanity. Never
treat copying a public Sanity MP3 as revoking access to its original. Preserve
the two existing originals until the production private migration is verified.

Approved staging settings: GCP/Firebase project `megvandeusen-staging`, website
`staging.megvandeusen.com`, Sanity dataset `staging`, and a separate $10/month alert
budget on Meg Website Billing. All production resources remain separate. The
complete nonprod plan remains in `NONPROD_PLAN.local.md` (untracked).

## Staging foundation created October 4, 2026

- GCP/Firebase project `megvandeusen-staging` is active and linked to the
  dedicated website billing account. Billing identifiers stay in local records.
- A $10 monthly budget filters only this project, with actual-spend alerts at
  50%, 90%, and 100%. It is not a spending cap.
- Bucket `gs://megvandeusen-staging-resources` is in `us-west1`, with uniform
  bucket access and enforced public-access prevention. It contains private copies
  of the two test recordings, their covers, and a catalog snapshot.
- Sanity dataset `staging` was seeded with 73 published content documents and
  their image assets. Drafts, recording documents, and audio files were excluded.
  The export is ignored under `.private/`; production was read but not modified.
- Staging Hosting proxies every path to the `staging-website` Cloud Run service.
  It contains **no static site files** that could bypass authentication. Direct
  Cloud Run, tagged revisions, Firebase aliases, and the custom domain all use
  the same gate. All responses are private/no-store and noindex/nofollow/noarchive;
  every staging HTML page also includes noindex and a visible staging banner.
- An independent 256-bit random reviewer password protects the entire staging
  website using HTTP Basic authentication over HTTPS. Credentials are in the
  ignored, owner-readable `.private/staging-reviewer.txt`; their hashes are in
  staging Secret Manager. Do not use either staging password for the book.
  Use a private browser window and close it after review to clear the browser's
  cached Basic credentials. Rotating the reviewer hash revokes access on new
  requests after deployment. Anyone given that password can access staging.
- The runtime can read only the staging media bucket, access staging Firestore,
  read its staging secret, and sign as its own identity. It has no production roles.
- Contact sending is deliberately disabled in this initial staging build; it
  cannot send messages through the production contact endpoint.

## Staging deployment and remaining integration

`node scripts/prepare-staging-build.mjs` builds from Sanity's staging dataset and
assembles an allowlisted container context under `.private/`. It never copies
credentials or recordings into the image. With Node 24 and gcloud on PATH,
`node scripts/deploy-staging.mjs` builds, tests and deploys only staging, then pins
Firebase Hosting to that Cloud Run revision. `--prepared` reuses the last assembled
context. The local deployment helper requires the owner's existing gcloud login.

The custom domain is `staging.megvandeusen.com`; valid HTTPS and anonymous-access
denial were verified on October 4, 2026.
The Firebase alias is `https://megvandeusen-staging.web.app` and uses the same gate.

Private Studio uploads and the published Sanity catalog are now deployed and
verified in staging; see ABUSE_PROTECTION.md for controls and rollout requirements.
Still pending: separately deployed staging Studio, GitHub staging workflow/webhook
identities, and staging contact delivery configuration. The Sanity staging dataset
is public and contains copied public site content/images and private recording
object references, but no private audio bytes; do not put secrets
or confidential draft content in a public dataset. The site access gate does not
change Sanity CDN visibility.
