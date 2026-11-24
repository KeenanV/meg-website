# Security operations

This runbook accompanies the security-hardening release. Commands that use individual reviewers require that release to be deployed first. Run commands from the repository root with Node 24 and the authenticated Google Cloud CLI. Do not paste credentials into chat, command arguments, Git, or screenshots.

## Environment boundaries

| Environment | Google Cloud project | Sanity project / dataset |
| --- | --- | --- |
| Production | `megvandeusen-website` | `ap0mc9ri` / `production` |
| Staging after migration | `megvandeusen-staging` | `77uvsyo1` / `staging` |

The free staging Sanity dataset is **public**. Only use content safe for public disclosure. The reviewer login protects the rendered staging website, not Sanity's published records or image CDN. Write unpublished work as drafts in production Studio and use its authenticated Preview. Private recordings remain in private Cloud Storage buckets; do not upload them as ordinary Sanity file assets.

The sync worker reads only published production CMS content anonymously. Its Sanity writer and Studio deployment credentials belong exclusively to the staging project. It retains read access to production private recordings so it can copy them into staging; this is an intentional, narrower remaining cross-environment capability.

### Studio authentication and staging action authorization

Both Studios' “Refresh staging” controls and staging private-upload controls authenticate only at the production backend. Hosted Sanity Dashboard sessions can authorize multiple projects: they must not be sent to the staging backend. The production-trusted broker accepts these sessions but checks human editor membership in the exact project selected by a fixed route/Origin pair. Staging Studio requires staging membership; production Studio requires production membership. The browser cannot supply an arbitrary project or upstream URL. Production private uploads authenticate directly within the production backend and require production membership.

The broker signs a permission for one exact POST path/body and editor identity, valid for 30 seconds. Staging verifies the signature with a public key and atomically consumes its unique ID in Firestore. A captured upload or status permission cannot authorize a different action or body. The broker never forwards Sanity tokens or browser cookies, follows no redirects, and uses only a fixed staging destination. The production private key is not present in staging. MP3 bytes still go directly from the browser to the staging bucket using the narrowly scoped signed upload form; the broker handles only upload initiation/finalization JSON.

The private staging bucket's upload CORS rule must allow the current Studio origin, `https://meg-website-staging.sanity.studio`, not the retired `megvandeusen-staging.sanity.studio` hostname. `scripts/configure-staging-uploads.py` maintains that rule. Recheck it after a Studio-host migration: a successful authorization/start response does not prove the browser can complete the direct storage upload. CORS permits the browser exchange; it does not replace the signed upload policy or make objects public.

Staging rejects all direct human bearer sessions, including legitimately staging-scoped ones. This keeps the gateway independent of Sanity's choice of Dashboard versus standalone token. Test real hosted Studio flows after authentication changes, including private uploads, not only mocked token responses. A compromised Studio frontend can still steal the editor's Sanity session; the trusted broker protects the staging backend boundary, not a malicious editor browser or Studio bundle. Protect Studio deployment credentials and reviewed release artifacts accordingly.

Provision once with `node scripts/configure-sync-broker.mjs --apply` using the operator's authenticated Google Cloud account. It preserves existing key versions and grants the production backend access only to the private signing secret; staging receives only a public verification secret. It enables TTL cleanup for consumed permissions. For the Dashboard-session correction, coordinate rollout: deploy the staging capability receiver, then the production-trusted broker, then both Studios. Do not publish the new staging Studio while the broker still lacks `/api/studio/staging/*`. Sync and staging private uploads fail closed during a mixed-version interval; ordinary Sanity editing/publishing is unaffected. Existing readers and protected audio playback do not use this editor authentication path. Check plan/status through both Studios and a disposable private upload before release; do not apply/reset real content as a smoke test.

For emergency broker revocation, remove/disable verification at staging and stop production issuance. Rotating a key requires provisioning the matching verification key and deploying both services; do not replace one side silently. Expired permissions cannot be replayed even if Firestore TTL deletion is delayed. Network uncertainty after forwarding can still leave a plan queued: check status before retrying.

## Change the Resources password

After this release is deployed:

```sh
/opt/homebrew/bin/python3.14 scripts/manage-access.py production resources-password
```

For staging, replace `production` with `staging`. The command prompts twice without echoing the password. Use a unique passphrase of at least 16 characters. It writes a new Secret Manager version and deploys a revision pinned to that version. It preserves the staging reviewers when changing the staging book password. No plaintext password is written to disk by this action.

Verify the old password fails, the new one unlocks, audio plays/seeks, and locking works. Changing the password invalidates old Resources sessions. Already-issued audio URLs remain usable until their short expiry (normally up to 15 minutes). Staging Hosting is repinned and unneeded historical tags are retired automatically.

On 2026-11-18, production `resources-access` version 1 and staging `staging-access` versions 1–3 were disabled after checking every serving/tagged revision. Active versions 2 and 4 respectively remain enabled, with passwords unchanged.

Keep an old Secret Manager version only until verification is complete. Disable it afterward; keep a controlled recovery window before destroying versions. A disabled secret version does not revoke a credential already loaded into a running old revision, which is why tag retirement matters. Production backend deployment preserves the active secret reference.

## Add and remove staging reviewers

List usernames:

```sh
/opt/homebrew/bin/python3.14 scripts/manage-access.py staging reviewer-list
```

Add a separate account, for example:

```sh
/opt/homebrew/bin/python3.14 scripts/manage-access.py staging reviewer-add meg
```

The generated password is saved to a new owner-readable file under `.private/`, whose path the command prints. Share it through a password manager or another private channel. Never commit that file. Use an ordinary browser window with no remembered staging credentials to verify access.

Remove an account:

```sh
/opt/homebrew/bin/python3.14 scripts/manage-access.py staging reviewer-remove meg
```

Removal preserves other accounts and refuses to remove the last account. Browser HTTP authentication can retain credentials until a browser restart; subsequent server requests still reject removed credentials.

The original `reviewer` account is used by GitHub's staging smoke checks. Before retiring it, create and test a dedicated CI reviewer, then replace the **Staging environment** secret `STAGING_REVIEWER` with JSON in this shape (use the real values only in GitHub's secret editor):

```json
{"username":"ci-reviewer","password":"<generated password>"}
```

Run a successful staging deployment before removing the original account with `--confirm-ci-updated`. The switch intentionally has a guard to avoid breaking deployments. To rotate an individual reviewer, add/test a replacement account, then remove the old account.

## Release sequence for the staging project migration

Do not merge the hardening release unattended. Old default-branch workflows still know the original shared Sanity project until this release is merged.

1. Keep the old staging dataset, private audio, baseline and backup exports. Pause staging editing for the short migration window; compare all managed documents again and reconcile any edits since the migration snapshot. Do not overwrite newer edits silently.
2. Deploy the new staging Studio (`meg-website-staging.sanity.studio`) in project `77uvsyo1`; grant the intended human editors access. Its registered app ID is pinned in the reviewed CLI configuration. Check embedded and separate-tab Preview. Do not expose credentials in the browser bundle.
3. The Staging GitHub environment's `SANITY_ISOLATED_DEPLOY_TOKEN` holds the isolated `sanity-staging-v2-deploy` credential. Keep the old `SANITY_DEPLOY_TOKEN` temporarily for the old workflow until migration completes. Configure the new project's publication webhook with the staging endpoint and secret; leave production's webhook unchanged. Disable the old staging webhook when the new path is verified.
4. Merge to staging. Build/test jobs have no cloud OIDC or deployment secrets. The deployment job verifies the immutable build artifact before extraction. Studio deployment runs separately without GCP OIDC. Confirm all three jobs succeed.
5. Verify new staging uploads/catalog/preview and normal sync planning. The fixed sync job takes no caller-provided command, arguments, environment or job name. Then grant the gateway **job-scoped** `roles/run.jobsExecutor` and remove project `roles/run.jobsExecutorWithOverrides`. Verify effective override denial as the gateway identity, not just the policy text.
6. Test an approved sync with disposable staging fixtures: stale and unapproved requests must fail; changed content must invalidate a plan. Preserve a backup before any reset. Do not reset real staging experiments without their owner's approval.
7. Revoke the old staging preview/writer/deployment and production-read robot tokens after proving no active service/workflow needs them. Remove their unused GCP secret bindings. Do not revoke production's own preview/deployment credentials. Retain the old dataset as a temporary migration backup, not an editing environment.
8. Verify real browser contact/CAPTCHA, Resources, preview frames/new tabs, and mobile playback. Inspect report-only CSP warnings before tightening the policy; report-only does not block scripts.
9. Merge staging to master, deploy, and repeat production smoke checks. Confirm content-only publishing still skips Studio/backend deployment. Only then close the local acceptance checklist or create v1.

## Recovery and retention policy

- Recordings are immutable, generation-pinned objects. Preserve every object referenced by published content, drafts, retained backups or approved rollback content. Never apply a blanket age-based deletion to `recordings/`.
- Incomplete `incoming/` uploads expire after one day. One-time preview redemption digests also expire after one day; their lifetime exceeds the Sanity handoff lifetime.
- Keep sync/reset backups for at least 90 days, plus the latest verified recovery backup. Review older backups monthly before deleting any: retained backup documents can reference old recordings/images. Staging editorial storage is versioned; recording buckets have a seven-day soft-delete recovery window. Neither is a substitute for a verified backup.
- Keep build source archives for a 30-day investigation/rollback window, then review before cleanup. Images/revisions remain available for controlled redeployment; public staging tags are limited to those pinned by active Hosting releases/channels. A rollback must include current access controls and credentials.
- Firestore stores ephemeral sessions/limits, webhook deduplication and editorial operation state. Deletion protection is enabled. TTL is used for temporary records. PITR is not enabled; its recurring cost has not been approved. Preserve operation records/backup IDs needed for recovery before maintenance.
- Before a destructive staging restore, stop editing and deployments, verify the intended backup and schema version, create a fresh backup of current content/media, and acquire the maintenance lock. The operator-only `restore-sync-job.mjs <backup UUID> RESTORE_STAGING` verifies restored documents and recording checksums. Run it through a separately authorized operator recovery execution; the web gateway cannot invoke argument overrides. If validation fails, leave maintenance on and inspect the private backup; do not unlock an unverified state.
- Perform a quarterly disposable staging restore drill and after changes to the backup format. Check content hashes, image references, audio size/CRC32C, seeking, and both draft/published records. A storage-copy test alone is not a complete application restore drill.

Cleanup is deliberately a reviewed operation, not an automatic deletion of potentially referenced recordings or backups. A future cleanup automation must collect references from CMS drafts/published content and retained backups, use a grace period, and require a dry-run manifest before deletion.

## Monitoring, credentials and residual risks

Security email alerts cover service errors/quota denials and unexpected deployment identities. A safe staging test confirmed email delivery on 2026-11-18; the operator confirmed receipt. Existing $10 monthly environment budgets are alerts, not spending caps. Review Monitoring pricing before September 2027; do not assume alerts remain free indefinitely.

Review GitHub secret/Dependabot/CodeQL findings weekly. The November 18 follow-up removes all npm exceptions after updated lockfiles passed all four registry audits. The old braces and sprintf-js advisories were withdrawn upstream; those packages are still present and must not be described as patched. Both full and content deployments run the advisory gate in the unprivileged build job before packaging; disallowed findings or expired exceptions block publishing as well as code releases. Resolve the dependency first and rerun the release. Do not silently disable this gate for urgent content changes; an emergency exception needs a narrowly scoped, reviewed change with a stated expiry. Both branches also require CodeQL results with no medium-or-higher security alerts or analysis errors. Review pinned container digests and OS scans on every security update. A successful build does not imply a clean vulnerability scan.

`python3 scripts/security-alerts.py --apply` updates existing deployment alerts without replacing channels or limits. Their real-event branch covers Cloud Run v1/v2 create/update/replace/delete and IAM methods using exact allowed-principal equality. A compromised allowlisted deploy identity remains outside this particular signal. Test against actual method fixtures as well as notification delivery; the synthetic test branch alone does not establish coverage.

Dependabot groups compatible security updates to reduce duplicate PRs. Node runtime and TypeScript major migrations remain separate reviewed work; automatic patch/minor and Node 24 image digest updates remain enabled.

### Container scan review (2026-11-18)

Four candidate images were built on the official Node 24 Debian Trixie slim base, pinned by digest, with available OS updates applied. The sync worker also passed schema extraction inside its container. Trivy 0.76.0 with its current database reports **0 Critical and 46 High package occurrences per image**, all in OS packages and none with a fixed version reported in that release's package channel. These are package occurrences, not 46 independently reachable application flaws. This is **not a clean scan**, nor evidence that serving images have been updated before rollout.

The base upgrade removes the old MiniZip Critical report and uses the Debian fix for the newly reported zlib gzip-write overflow (`CVE-2026-85091`). The previous Bookworm candidates still contained that affected zlib package. [Debian zlib assessment](https://security-tracker.debian.org/tracker/CVE-2026-85091).

Residual High findings are:

- 36 occurrences of four util-linux advisories (`CVE-2026-76642`, `CVE-2026-78408`, `CVE-2026-78409`, `CVE-2026-78410`) spread across related binary packages. These concern privileged mount helpers, namespace/cgroup operations or bind-mount handling. Application routes do not expose shell commands or these utilities, and runtimes use the unprivileged `node` user. That reduces direct reachability; it is not a guarantee against post-compromise exploitation.
- Three SQLite FTS5/session-parser advisories (`CVE-2026-119373`, `CVE-2026-119374`, `CVE-2026-119379`). This application uses Firestore and Sanity, not SQLite, and accepts no SQLite database/changeset uploads. Reassess if a dependency starts using that native library.
- Seven occurrences covering libacl symlink traversal, systemd home-record verification, ncurses and Perl Archive::Tar. No request path invoking these affected interfaces was identified. Native dependencies and future features still require review.

The old November 16 exception deadline has passed. **It has not been silently renewed.** The candidate scans and this reachability assessment support review, not unconditional v1 sign-off. Before tagging v1, the maintainer must explicitly accept any remaining applicable OS risk with an owner/review date, or choose further runtime reduction and compatibility testing. Retain raw scans and immutable image digests privately, and scan final deployed digests after rollout. Do not suppress High/Critical findings globally.

The new staging Sanity robot credentials expire 2027-04-17. Rotate them before expiry, grant only the required project role, deploy/test, then revoke old credentials. Review other GitHub/Sanity/Resend credentials quarterly and after any exposure; never rotate a shared credential without identifying every consumer.

Preview cookies are bearer credentials valid for 30 minutes; preview media links last five minutes. Clearing the browser cookie does not invalidate a previously copied stateless preview cookie. Rotating the preview session signing secret is the emergency revocation mechanism. Separate-tab handoffs use fragments that never reach the server URL. Sanity Presentation still generates query-based iframe links: the bootstrap immediately clears the URL before a one-time POST exchange, and every configurable project log sink excludes requests containing `sanity-preview-secret` before retention. Keep those exclusions in place, including on any new sinks. A second POST redemption fails. An existing valid preview session can navigate without re-redeeming a cached iframe link. Historic logs are not automatically erased.

Cloud Armor remains off. CAPTCHA, bounded instances, local throttles and shared budgets reduce abuse cost, but a distributed attacker can still exhaust allowances or cause availability loss. Durable webhook claims prevent ordinary replay across restarts, but a crash after GitHub accepts a dispatch and before its acknowledgement is stored can still produce a retry; exactly-once delivery across those systems is not promised. GitHub serializes releases and retains only the newest pending rebuild.

Signed publishing events also share a durable allowance of 120 dispatch attempts/hour and 500/day per environment, reserved before contacting GitHub. Duplicates and sync-suppressed events do not consume dispatch slots. Exhaustion returns a retryable failure and alerts rather than pretending publication succeeded. Once the allowance recovers, redeliver the failed event or run a content deployment; Sanity's finite retry window is not an unlimited queue.

## v1.0.1 maintenance and release verification

Run `python3 scripts/harden-build-storage.py staging --apply` (then `production`
after staging acceptance) as the infrastructure owner. The default without
`--apply` only inspects and saves the baseline under `.private/build-storage/`.
Dedicated builders retain the reviewed non-storage build permissions; object
reads are granted only on the two named build-source buckets. Bucket-only
permissions do not narrow a project-wide grant, so the old `roles/run.builder`
binding is explicitly removed after replacement grants are installed. Newly
created IAM roles can take a few minutes to propagate; retry the idempotent
command if the bucket API has not recognized a new role yet.

Both source buckets must have uniform bucket-level access and explicit public
access prevention. Every service/job deployment checks these settings. Keep
source archives through the release recovery window; do not delete them in this
maintenance. Runtime rollback uses immutable images, but source archives are
also useful build evidence. Review archives older than 90 days against retained
release/build records before any separate cleanup; never apply this policy to
private recordings or editorial backups.

The four Dockerfiles require patched Trixie glibc (`libc6` and `libc-bin`
`2.41-12+deb13u5` or newer). A changed package-layer instruction forces this
maintenance rebuild; the guard makes a stale/unavailable patch fail the build.
For future OS maintenance, refresh the layer/base and scan the actual new
immutable images; a successful build is not a vulnerability scan.

Normal deployments require 100% LATEST traffic, a ready latest-created revision,
and matching immutable template/serving image digests. They refuse an existing
manual revision pin or canary rather than overwrite it. After an intentional
rollback, verify the chosen revision and image, then explicitly restore LATEST
routing when ready to resume normal releases. Staging Hosting additionally
verifies the live release's protected-service rewrite and actual revision tag.
The sync job is deployed by digest and read back. Content-only releases also
verify runtime routing, even though they do not rebuild the unchanged backend.
Verification records are saved under `.private/release-evidence/`; deployment
logs include revision/digest identity without application secrets.

A `v1.x.y` release is tagged only after the staging and production workflows and
acceptance checks succeed. Keep the version tag immutable and advance the `v1`
alias to that same commit only after verification. Keep the detailed internal
security evidence out of public release notes.
