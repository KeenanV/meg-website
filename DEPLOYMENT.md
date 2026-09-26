# Deployment and launch status

## Current destinations

- Google Cloud / Firebase project: `megvandeusen-website` (number `348807509213`).
- Website: Firebase Hosting site `megvandeusen-website`, channel `launch-review`.
- Studio: <https://megvandeusen.sanity.studio/>; Sanity project `ap0mc9ri`, dataset `production`.
- Intended website domain: <https://megvandeusen.com>. Registered with GoDaddy; authoritative DNS remains Bluehost. DNS cutover is on hold.
- Legacy blog: `sightonstress.com` remains registered with Bluehost. A registrar transfer is not required for Firebase redirects; preserve its registration/renewal independently of website hosting.

The preview is public, expires seven days after each deployment, and sends a `noindex` response header. It is not the production launch. The deploy workflow cannot change DNS. It defaults to preview; the repository variable `HOSTING_RELEASE_CHANNEL` must explicitly be set to `live` at the approved launch to deploy the main website to production. It is currently unset. Merging this preparation does not activate production.

## GitHub checks and releases

Pull requests targeting `master` run `.github/workflows/check.yml`. After merge, `.github/workflows/deploy.yml` installs the four locked dependency trees and runs `npm run verify` before requesting cloud credentials and uploading the checked website to the configured channel (preview by default). Failed checks/builds leave the existing release untouched. GitHub records failure details in the Actions run; configure personal Actions email notifications in GitHub as desired.

The deploy workflow also supports **Run workflow** on `master` and a `sanity-published` repository dispatch event. The signed Sanity receiver uses the workflow-dispatch API, which permits an Actions-only token. Studio content changes rebuild the website; schema/interface changes require a separate Studio deployment.

Releases are serialized, with the active release allowed to finish and only the newest pending run retained. Workflows and actions are pinned to full commit hashes. PR checks have no cloud identity permission or deployment secrets.

Cloud authentication uses Workload Identity Federation:

| Setting | Value |
| --- | --- |
| Pool/provider | `projects/348807509213/locations/global/workloadIdentityPools/github/providers/meg-website` |
| Service account | `github-hosting@megvandeusen-website.iam.gserviceaccount.com` |
| Project roles | `roles/firebasehosting.admin`, `roles/serviceusage.serviceUsageConsumer` |
| Trusted repository/owner IDs | `1147149655` / `19698083` |
| Trusted branch | `refs/heads/master` |
| Trusted workflow | `KeenanV/meg-website/.github/workflows/deploy.yml@refs/heads/master` |
| Trusted events | `push`, `workflow_dispatch`, `repository_dispatch` |

No service-account private key or Firebase refresh token is stored in GitHub. The provider condition rejects other repositories, branches, workflows, and pull requests. Renaming the repository or deployment workflow requires updating that condition. Firebase Hosting Admin can manage this project's hosting sites; it does not grant billing or general project administration.

## Local deployment

Use Node 24 and install dependencies as described in the README. Authenticate interactively with `npx firebase login`, then run `npm run hosting:preview` to rebuild, check, and upload. `node scripts/deploy-preview.mjs` uploads an already-built website after checking its generated links; it always forces preview, even if the environment selects live. CI uses `scripts/deploy-hosting.mjs`, which accepts only `preview` or `live` through `HOSTING_RELEASE_CHANNEL`. Neither entry point replaces building changed content.

For Studio, run:

```sh
npm run check --prefix apps/studio
npm test --prefix apps/studio
cd apps/studio
npx sanity deploy --schema-required
```

The CLI config pins the hosted application ID. Automatic Studio package updates are disabled so deployed code matches the repository's tested lockfile. Sanity project membership still controls content access; a hosted Studio does not grant new users editing rights. Give Meg an appropriate editing role through project membership before her handoff.

The old Cloud Storage `cloudbuild.yaml` draft has been replaced by the GitHub workflows.

## Recovery

Before launch, a failed preview deployment can be retried with **Run workflow** on `master` or `npm run hosting:preview`. To revert a bad code change, revert it through a reviewed PR and merge; the workflow rebuilds using the current published Sanity content. A code revert does not revert content. Recover content separately through Sanity document history as needed.

An isolated `rollback-check` preview rehearsed releasing version A, releasing B, and restoring A; Firebase confirmed the restored version and its served homepage bytes matched. Before the production launch, record the actual live release/version IDs for use with the same rollback mechanism. Do not assume the expiring preview is a backup. Retain legacy-site/database/media exports and a DNS-zone export independently of these deployments.

## Required before DNS cutover

DNS changes require Keenan's explicit go-ahead after:

- Remaining News imports can follow launch: Keenan saved the old pages as HTML. Full legacy file/database backups are still outstanding; keep Bluehost hosting accessible until they are captured and verified. The redirect inventory is complete.
- Browser Back across ordinary pages, articles, and pagination passes the final smoke test. Keenan reports the earlier issue is resolved; its cause was not established.
- Sanity publication, unpublication, and deletion trigger signed, authenticated, serialized rebuilds.
- Contact delivery is connected and tested with validation, abuse protection, and useful success/failure feedback. Recipient and provider credentials remain server-side.
- Before moving nameservers, export and reproduce the full authoritative DNS zone, including email and verification records. Before moving the old blog, activate its tested redirects and HTTPS. Its cutover can occur separately from the main website. Full old-site backups are required before decommissioning Bluehost, not before an otherwise reversible website switch.
- The production deployment, HTTPS, rollback, and root/www behavior have passed their launch review.

Keep Bluehost services and mail records until their remaining dependencies are explicitly migrated or retired.

## Contact backend

`apps/backend` runs on Cloud Run at `https://website-backend-348807509213.us-west1.run.app` in `us-west1`. It scales to zero, allows at most one configured instance, uses 256 MiB and one request-billed CPU, and allows eight concurrent requests. Instance limits and budget alerts are not hard spending caps.

- `/contact`: JSON POST with `name`, `email`, `message`, reCAPTCHA `token`, UUID `requestId`, and empty honeypot `website`. Exact origin allowlist, 32 KiB request limit, server-side field validation, and Google reCAPTCHA checks precede Resend. The sender and recipient are Cloud Run environment settings; visitors only control Reply-To and plain-text message content.
- Resend accepts retries with the same request ID/content idempotently. Rate limits are bounded and process-local: 60 contact requests/minute, three valid-form attempts/email/10 minutes, and 30 assessments/hour overall. They reset on instance replacement and are secondary abuse controls, not durable quotas.
- The verified sender is `Meg website <contact@updates.megvandeusen.com>`, with Keenan's inbox as the current test recipient. Resend domain verification completed, Keenan confirmed the branded test arrived, and the preview contact form successfully sent through Cloud Run revision `website-backend-00004-875`. Keep `CONTACT_RECIPIENT` set to Keenan's inbox through DNS cutover and the production delivery test. Only after those succeed, switch it to Meg's professional inbox and test delivery and Reply-To again. Sender verification records must preserve Bluehost mail and do not require moving website DNS.
- The frontend receives only `PUBLIC_CONTACT_API_URL` and `PUBLIC_RECAPTCHA_SITE_KEY`. The workflow sets them; local `.env` can leave them empty. reCAPTCHA permits the preview and intended main domain, not localhost. Do not add a production CAPTCHA bypass for local testing.
- Runtime identity: `website-backend@megvandeusen-website.iam.gserviceaccount.com`, with `roles/recaptchaenterprise.agent` and accessor permission on the three specific secrets only. Build identity: `backend-builder@megvandeusen-website.iam.gserviceaccount.com`, with `roles/run.builder`. No service-account keys.

Backend code deployment is currently an explicit operator command, separate from automatic static-site deployment:

```sh
node scripts/deploy-backend.mjs
```

It checks/tests the backend and deploys its source with explicit project and identities, preserving the service's recipient, origins, and pinned secret versions. Run it after backend code changes. CI tests backend changes but does not deploy the Cloud Run service automatically. Cloud Run retains prior revisions for rollback; route traffic to a known-good revision when required.

## Sanity publishing

Webhook **Website published-content rebuild** (`WFtSNiArFyLkX4JB`) targets `/sanity-hook`. It covers create/update/delete for the six rendered document types, excludes drafts/releases, and sends only document metadata. Deletion/unpublication uses `before()` metadata. The backend validates the raw-body HMAC signature and expected project/dataset/type before dispatching `deploy.yml` on `master`.

Successful dispatches are deduplicated in a bounded 24-hour process-local cache. GitHub serializes releases and retains the newest pending run during bursts. Failed dispatches return 503 so Sanity can retry; failed builds leave Hosting unchanged. Sanity retries are finite, so inspect delivery attempts and manually run the deployment workflow after an outage or credential expiry. This setup does not yet include a periodic reconciliation job.

Manage the hook through the authenticated Studio CLI (signing secret stays in memory):

```sh
cd apps/studio
npx sanity exec scripts/configure-publishing.mjs --with-user-token -- --url=https://website-backend-348807509213.us-west1.run.app --enable
```

Omit `--enable` to disable it. The script creates a missing hook; for an existing hook it only toggles enabled state. Change an existing filter/projection or rotate its signing secret through Sanity's webhook settings and deploy the matching secret version to Cloud Run.

`npx sanity exec scripts/test-publishing.mjs --with-user-token` creates, updates, and deletes its own temporary `siteSettings` fixture at a noncanonical ID that the website never reads. It verifies the three signed deliveries and excludes a temporary draft. It triggers real preview builds; it does not change Meg's content.

## Credential rotation

Google Secret Manager stores `resend-api-key`, `github-workflow-token`, and `sanity-webhook-secret`. Cloud Run pins explicit version numbers. Nothing secret belongs in `.env` for Astro, Git, or chat.

The fine-grained GitHub token is restricted to this repository and Actions read/write (automatic Metadata read). It expires after 90 days; replace it before expiry. This launch credential needs operator renewal; a GitHub App with short-lived installation tokens is a future maintenance improvement.

To store a replacement provider token privately from the repository root:

```sh
/opt/homebrew/bin/python3.14 scripts/configure-service-secret.py resend-api-key
/opt/homebrew/bin/python3.14 scripts/configure-service-secret.py github-workflow-token
```

Then use `gcloud run services update website-backend --update-secrets=ENV_NAME=secret-name:VERSION --region=us-west1 --project=megvandeusen-website --account=keenanvandeusen@gmail.com` with the corresponding environment name (`RESEND_API_KEY` or `GITHUB_WORKFLOW_TOKEN`) and new version. Test before revoking the previous credential. Keep the previous version available for rollback until verified.


## Legacy URL migration preparation

The redirect inventory and test commands live in [hosting/legacy-blog/README.md](hosting/legacy-blog/README.md). All 46 old articles have exact destinations, including the 13 renamed slugs. The separate `megvandeusen-legacy-blog` Hosting site has a temporary `redirect-review` channel. All 105 tested URL variations passed against its HTTPS preview. Custom-domain resources for both old-blog names have been created for certificate preparation; neither public DNS nor live-channel redirects have been activated. The user chose to retire the old Resources and Quick Guide signup pages with a clear notice and blog link.

## Branded sender DNS preparation

As checked September 25, 2026, `ns1.bluehost.com` and `ns2.bluehost.com` are authoritative for `megvandeusen.com`. Add the Resend verification records there; copying records into GoDaddy alone will not make them live before a later nameserver migration. Preserve these records in any future DNS-zone migration.

The sending domain is `updates.megvandeusen.com`. User-supplied Resend records use:

| Type | Relative name in megvandeusen.com | Value |
| --- | --- | --- |
| TXT | `resend._domainkey.updates` | The public DKIM key shown in Resend |
| CNAME | `rsend.updates` | `rsend.forge.rmta.net` |
| CNAME | `send.updates` | `send.forge.rmta.net` |
| TXT | `_dmarc.updates` | `v=DMARC1; p=none;` |

The DMARC record is scoped to the sending subdomain to leave the root domain's mail policy unchanged. These additions do not move web traffic or replace existing mailbox MX/SPF records. Use provider-default TTLs. All four records were verified on both authoritative nameservers; Resend verified the domain. A branded test reached Keenan's inbox and Cloud Run now uses `Meg website <contact@updates.megvandeusen.com>`. The contact form passed its browser submission test after that update. Gmail authentication headers have not yet been independently inspected. Keep the recipient unchanged through production cutover and successful production delivery. The account's sending-only API key cannot manage domain settings; use the Resend dashboard for domain verification.


## Custom-domain HTTPS preparation (traffic not moved)

The main Hosting site now has custom-domain resources for `megvandeusen.com` and `www.megvandeusen.com`; the latter is configured to redirect to the apex once connected. Both requested dedicated certificates. Registration alone does not move traffic: Bluehost still serves the existing website, and no website A/CNAME or nameserver changes have been made.

Use Firebase's advanced migration flow to establish ownership and certificates before cutover. Add the `hosting-site=megvandeusen-website` TXT at the apex alongside existing TXT records, and the current ACME TXT challenges returned in each custom domain's `cert.verification.dns.desired` response. The initial challenge values were provided to Keenan; retrieve fresh values if Firebase rotates them rather than reusing a stale runbook value. Do not replace existing TXT records. ACME HTTP errors against the old website are expected while using the DNS challenge instead.

Wait for active ownership and a usable certificate, then complete the production release/rollback and full-zone migration checks before changing website traffic. Firebase's desired web A/CNAME changes are cutover instructions, not prerequisites to apply during this preparation step. Preserve existing mail and verification records. The separate legacy-blog Hosting site and its custom-domain resources are also provisioned for preview/certificate preparation; its live channel and public DNS remain untouched.


## Production activation and rollback

Keep `HOSTING_RELEASE_CHANNEL` unset until launch approval. After this PR is merged and checks succeed, set that GitHub repository variable to `live` and manually run `deploy.yml` on `master`. Subsequent master merges and signed Sanity publish events use the same production deployment path. Local `hosting:preview` remains preview-only. A successful release switches Hosting's served version after upload/finalization; a build failure leaves the previous version serving.

Before DNS cutover, test the main site's live `web.app` endpoint and both custom hostnames using their Firebase IP with TLS hostname verification. Confirm no preview `X-Robots-Tag` header is present on production pages, verify canonical root/www behavior, and record the live version ID. Public DNS and nameservers remain unchanged until that review succeeds.

The old blog's redirect-only release is separate from the main site's content rebuilds. Generate `.firebase/legacy-production.json` with `node scripts/legacy-redirects.mjs --production`, then deploy that config only at its approved activation. See `hosting/legacy-blog/README.md`. A main-site launch does not require migrating the old blog on the same day.

For immediate content rollback, pause further deployment triggers/runs, record the current release ID, and use Firebase Hosting's Release history **Roll back** action or the CLI's exact-version source syntax:

```sh
npx firebase hosting:clone 'megvandeusen-website@KNOWN_GOOD_VERSION_ID' 'megvandeusen-website:live' --project megvandeusen-website
```

Replace the placeholder with a verified retained version ID. Reverting source and rebuilding is different: it incorporates current Sanity content. A rollback does not revert Sanity documents, backend configuration, or DNS. Address the failing change before resuming deployments, otherwise a subsequent publish can replace the rollback. Keep old web DNS values recorded for a separate DNS rollback; changing them is subject to resolver caches.
