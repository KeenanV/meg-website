# Deployment and launch status

## Current destinations

- Google Cloud / Firebase project: `megvandeusen-website` (number `348807509213`).
- Website: Firebase Hosting site `megvandeusen-website`, channel `launch-review`.
- Studio: <https://megvandeusen.sanity.studio/>; Sanity project `ap0mc9ri`, dataset `production`.
- Intended website domain: <https://megvandeusen.com>. DNS cutover is on hold.

The preview is public, expires seven days after each deployment, and sends a `noindex` response header. It is not the production launch. The deploy workflow cannot change DNS and currently contains no live-channel deployment command.

## GitHub checks and releases

Pull requests targeting `master` run `.github/workflows/check.yml`. After merge, `.github/workflows/deploy.yml` installs the four locked dependency trees and runs `npm run verify` before requesting cloud credentials and uploading the checked website to the preview channel. Failed checks/builds leave the existing release untouched. GitHub records failure details in the Actions run; configure personal Actions email notifications in GitHub as desired.

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

Use Node 24 and install dependencies as described in the README. Authenticate interactively with `npx firebase login`, then run `npm run hosting:preview` to rebuild, check, and upload. `node scripts/deploy-preview.mjs` uploads an already-built website after checking its generated links; this is the CI entry point, not a replacement for building changed content.

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

Before enabling the live channel, record and test the Firebase Hosting release rollback procedure against a previous release. Do not assume the expiring preview is a backup. Retain legacy-site/database/media exports and a DNS-zone export independently of these deployments.

## Required before DNS cutover

DNS changes require Keenan's explicit go-ahead after:

- Remaining News imports can follow launch: Keenan saved the old pages as HTML. A full legacy backup and redirect inventory are still required.
- Browser Back across ordinary pages, articles, and pagination passes the final smoke test. Keenan reports the earlier issue is resolved; its cause was not established.
- Sanity publication, unpublication, and deletion trigger signed, authenticated, serialized rebuilds.
- Contact delivery is connected and tested with validation, abuse protection, and useful success/failure feedback. Recipient and provider credentials remain server-side.
- Legacy URLs have redirects, both old sites are backed up, and the DNS zone (including email records) is exported.
- The production deployment, HTTPS, rollback, and root/www behavior have passed their launch review.

Keep Bluehost services and mail records until their remaining dependencies are explicitly migrated or retired.

## Contact backend

`apps/backend` runs on Cloud Run at `https://website-backend-348807509213.us-west1.run.app` in `us-west1`. It scales to zero, allows at most one configured instance, uses 256 MiB and one request-billed CPU, and allows eight concurrent requests. Instance limits and budget alerts are not hard spending caps.

- `/contact`: JSON POST with `name`, `email`, `message`, reCAPTCHA `token`, UUID `requestId`, and empty honeypot `website`. Exact origin allowlist, 32 KiB request limit, server-side field validation, and Google reCAPTCHA checks precede Resend. The sender and recipient are Cloud Run environment settings; visitors only control Reply-To and plain-text message content.
- Resend accepts retries with the same request ID/content idempotently. Rate limits are bounded and process-local: 60 contact requests/minute, three valid-form attempts/email/10 minutes, and 30 assessments/hour overall. They reset on instance replacement and are secondary abuse controls, not durable quotas.
- The test sender is `Meg website <onboarding@resend.dev>`, with Keenan's Resend-account inbox as the test recipient. Before launch, verify a domain in Resend, replace `CONTACT_SENDER`, switch `CONTACT_RECIPIENT` to Meg's professional inbox, and test delivery and Reply-To again. Sender verification records must preserve Bluehost mail and do not require moving website DNS.
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
