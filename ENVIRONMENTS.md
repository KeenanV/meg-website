# Staging and production releases

| Setting | Staging | Production |
| --- | --- | --- |
| Git branch / GitHub environment | `staging` / `Staging` | `master` / `Production` |
| GCP/Firebase project | `megvandeusen-staging` | `megvandeusen-website` |
| Website | https://staging.megvandeusen.com | https://megvandeusen.com |
| Hosted Studio | https://megvandeusen-staging.sanity.studio | https://megvandeusen.sanity.studio |
| Sanity dataset | `staging` | `production` |
| Workflow | `deploy-staging.yml` | `deploy.yml` |
| Contact delivery | Owner's test inbox only | Existing professional recipient |

## Branch flow

1. Open feature PRs against `staging`. Required checks are `verify` and
   `release-source`; feature PRs use squash merges.
2. Merging triggers a deploy using the exact **Staging** GitHub environment.
   It verifies source, builds the staging dataset, deploys staging Studio and
   the protected staging site/backend, then checks the live access controls.
3. Test the changed feature on staging. Automated checks deliberately do not
   bypass real CAPTCHA; unlock/playback and contact delivery need browser QA.
4. Open `staging` → `master`. Other sources are rejected by `release-source`.
   The master ruleset requires the successful **Staging** deployment as well as
   the checks. Use a **merge commit** to preserve release ancestry; do not squash
   this release PR or delete the permanent staging branch.
5. Merging runs the **Production** environment workflow: checks/build, backend,
   Studio, then Hosting. Verify contact and Resources after release.

The two environments use separate GitHub deployment service accounts and workload
identity providers; no downloadable GCP service-account key is stored in GitHub.
Staging's provider accepts only the staging branch and staging deploy workflow.
Production's provider accepts only master and the production deploy workflow.
The cloud runtime chooses its Sanity dataset/workflow/ref from a fixed mapping;
an incoming webhook cannot choose a branch, workflow, repository or cloud project.

## Content publishing

Sanity dispatches the matching deployment workflow with `deployment_type: content`.
These runs are labeled **Publish Sanity content — production/staging** in Actions.
Branch merges and manual runs default to `full`, labeled **Deploy code**. Keeping
both paths in the same workflow preserves the existing environment approvals,
workload identities, and shared deployment concurrency group.

The content path installs only website/Hosting dependencies and validates and
builds the website, including local links and redirects. It skips Studio and
backend checks already completed for the deployed code. Production publishes only
Firebase Hosting; it does not redeploy Cloud Run or Studio. Staging still replaces
its authenticated Cloud Run bundle because that bundle contains the generated
pages, but skips Studio and avoids building the website twice. It continues to
check the live staging gate and reader CAPTCHA after publishing.

The shortcut requires evidence of a successful full deployment of the **exact
commit and branch**. A content run with new or unverified code performs a full
deployment instead. This also handles a content dispatch replacing a pending code
run in GitHub's concurrency queue. History API errors stop publishing; missing or
expired history conservatively selects a full deployment.

All static pages are rebuilt together. A post's current slug is queried again for
the homepage and article lists, keeping generated links consistent after release.
Renaming a slug does not automatically create a redirect from its previous URL.

The existing production webhook still targets the production backend. A second
signed webhook, restricted to the staging dataset, targets the staging backend.
It uses a separate signing secret and dispatches `deploy-staging.yml` on staging.
Neither hook includes drafts or version documents. Standard published site content
triggers its environment's rebuild; private recording metadata is also read live
by its catalog, with a thirty-second cache, so it needs no static rebuild.

The staging hook is configured, but its workflow must be merged into the default
staging branch before its first dispatch can succeed. Publishing a small staging
content change after that merge verifies the complete chain. Check that only the
staging workflow runs and only the staging site changes. Test production publishing
separately after promotion. Do not replace the production dataset with staging.

## Credentials and renewals

- Environment secrets `SANITY_DEPLOY_TOKEN` are separate deploy-only Sanity
  tokens expiring October 5, 2027. Replace them in the matching GitHub environment.
  Sanity project-level Studio deployment privileges are not dataset-scoped.
- `STAGING_REVIEWER` is confined to the Staging environment. It supplies CI with
  the outer reviewer login, never a public CAPTCHA bypass.
- Staging `RECAPTCHA_SITE_KEY` is a public environment variable; provider secrets,
  webhook secrets and reader password hashes live in each project's Secret Manager.
- The existing Resend sending key and GitHub workflow token have separate staging
  secret copies; they are shared provider credentials, not separately issued keys.
  The service enforces a staging-only recipient and fixed staging workflow target.
- Staging remains authenticated, noindex, and no-store through Hosting aliases and
  direct Cloud Run URLs. Signed webhooks and editor uploads authenticate separately.
- Each deployed Cloud Run service retains its provisioned environment and pinned
  Secret Manager versions during code deploys. Credential rotation requires updating
  the corresponding pinned reference as well as the secret.

## Initial Resources production release

The private production bucket, runtime permissions, session TTLs and password hash
have been provisioned. Both existing MP3s were backed up outside Git and copied
into private production storage with size/MD5 checks before adding `privateAudio`
references. Existing public originals and `audio` references remain for rollback.

After the staging release is reviewed:

1. Merge the release PR from staging to master and wait for Production deployment.
2. Verify anonymous catalog/audio requests fail; unlock with the production book
   password; test both recordings, seek, pause/resume, reload and logout.
3. Test one private MP3 upload through production Studio, including publishing and
   playback. The upload must use the production bucket, never staging.
4. Only after these checks, remove legacy `audio` references and delete the exact
   unreferenced public Sanity file assets. Check drafts and all references first.
   Keep original bytes and document backups outside Git. Cached or previously
   downloaded public copies cannot be recalled; check CDN retirement separately.

The production password is in the owner-readable ignored
`.private/production-resources-password.txt`. Choose the final book password before
printing or publishing it. A shared password and signed URLs cannot prevent readers
from sharing or recording the material.

Cloud Armor and its load balancers are on hold. See ABUSE_PROTECTION.md for the
approved CAPTCHA/application limits and itemized alternative pricing.
