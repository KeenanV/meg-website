# Deployment and launch status

## Current destinations

- Google Cloud / Firebase project: `megvandeusen-website` (number `348807509213`).
- Website: Firebase Hosting site `megvandeusen-website`, channel `launch-review`.
- Studio: <https://megvandeusen.sanity.studio/>; Sanity project `ap0mc9ri`, dataset `production`.
- Intended website domain: <https://megvandeusen.com>. DNS cutover is on hold.

The preview is public, expires seven days after each deployment, and sends a `noindex` response header. It is not the production launch. The deploy workflow cannot change DNS and currently contains no live-channel deployment command.

## GitHub checks and releases

Pull requests targeting `master` run `.github/workflows/check.yml`. After merge, `.github/workflows/deploy.yml` installs the three locked dependency trees and runs `npm run verify` before requesting cloud credentials and uploading the checked website to the preview channel. Failed checks/builds leave the existing release untouched. GitHub records failure details in the Actions run; configure personal Actions email notifications in GitHub as desired.

The deploy workflow also supports **Run workflow** on `master` and a `sanity-published` repository dispatch event. The latter is only an entry point: the signed Sanity webhook receiver is not connected yet. Publishing content currently requires a manual workflow run or local preview deployment. Studio content changes require a website rebuild; schema/interface changes require a separate Studio deployment.

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

- Remaining News items have been imported and checked against the old site.
- Browser Back across ordinary site pages is reproduced, fixed if necessary, and verified in a regular browser, alongside article/pagination history.
- Sanity publication, unpublication, and deletion trigger signed, authenticated, serialized rebuilds.
- Contact delivery is connected and tested with validation, abuse protection, and useful success/failure feedback. Recipient and provider credentials remain server-side.
- Legacy URLs have redirects, both old sites are backed up, and the DNS zone (including email records) is exported.
- The production deployment, HTTPS, rollback, and root/www behavior have passed their launch review.

Keep Bluehost services and mail records until their remaining dependencies are explicitly migrated or retired.
