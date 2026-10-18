# Security operations

This runbook accompanies the security-hardening release. Commands that use individual reviewers require that release to be deployed first. Run commands from the repository root with Node 24 and the authenticated Google Cloud CLI. Do not paste credentials into chat, command arguments, Git, or screenshots.

## Environment boundaries

| Environment | Google Cloud project | Sanity project / dataset |
| --- | --- | --- |
| Production | `megvandeusen-website` | `ap0mc9ri` / `production` |
| Staging after migration | `megvandeusen-staging` | `77uvsyo1` / `staging` |

The free staging Sanity dataset is **public**. Only use content safe for public disclosure. The reviewer login protects the rendered staging website, not Sanity's published records or image CDN. Write unpublished work as drafts in production Studio and use its authenticated Preview. Private recordings remain in private Cloud Storage buckets; do not upload them as ordinary Sanity file assets.

The sync worker reads only published production CMS content anonymously. Its Sanity writer and Studio deployment credentials belong exclusively to the staging project. It retains read access to production private recordings so it can copy them into staging; this is an intentional, narrower remaining cross-environment capability.

## Change the Resources password

After this release is deployed:

```sh
/opt/homebrew/bin/python3.14 scripts/manage-access.py production resources-password
```

For staging, replace `production` with `staging`. The command prompts twice without echoing the password. Use a unique passphrase of at least 16 characters. It writes a new Secret Manager version and deploys a revision pinned to that version. It preserves the staging reviewers when changing the staging book password. No plaintext password is written to disk by this action.

Verify the old password fails, the new one unlocks, audio plays/seeks, and locking works. Changing the password invalidates old Resources sessions. Already-issued audio URLs remain usable until their short expiry (normally up to 15 minutes). Staging Hosting is repinned and unneeded historical tags are retired automatically.

Keep the old Secret Manager version only until verification is complete. Disable it afterward; keep a controlled recovery window before destroying versions. A disabled secret version does not revoke a credential already loaded into a running old revision, which is why tag retirement matters. Production backend deployment preserves the active secret reference.

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

Security email alerts cover service errors/quota denials and unexpected deployment identities. A safe staging test confirmed email delivery on 2026-10-17. Existing $10 monthly environment budgets are alerts, not spending caps. Review Monitoring pricing before September 2027; do not assume alerts remain free indefinitely.

Review GitHub secret/Dependabot/CodeQL findings weekly. New or expired npm exceptions fail the advisory gate; current unpatched exceptions expire 2026-11-16. Review pinned container digests and OS scans on every security update. A successful build does not imply a clean vulnerability scan.

### Container scan review (2026-10-17)

Trivy 0.76.0 scanned the deployed digests and four rebuilt candidate images. The rebuilt backend, staging gateway and preview each report 1 Critical and 56 High package findings; the sync worker reports 1 Critical and 57 High. These are package occurrences, including repeated source-package advisories, not independent exploitable request paths. None has a vendor-supplied fixed version in the current Debian Bookworm package channel. These counts are **not a clean scan**, and do not mean the old deployed images have been patched.

- The Critical `CVE-2023-45853` is attributed to Debian's `zlib1g`. Debian states that the vulnerable contributed MiniZip code is not built into the affected Bookworm zlib binary packages. This supports a package-specific non-applicability assessment, not a blanket exception for other MiniZip libraries. [Debian's assessment](https://security-tracker.debian.org/tracker/CVE-2023-45853).
- Most High occurrences come from util-linux mount, namespace or partition-parsing utilities. These containers run as `node`; the application does not expose these utilities or accept shell commands. For example, the mount race requires a local user authorized to mount an fstab entry with an attacker-writable ancestor. These are reduced-reachability findings, not proof that post-compromise exploitation is impossible. A move to a newer Debian base with fixes needs its own compatibility tests. [Mount advisory](https://security-tracker.debian.org/tracker/CVE-2026-53613).
- Remaining OS findings involve gzip's LZH parser, libacl symlink handling, systemd home-record verification, ncurses and Perl Archive::Tar. No application route invoking those affected interfaces was found in the reviewed source; indirect native/library use still needs reevaluation when dependencies or features change.
- The sync worker's additional High is the existing `braces` advisory, covered by the expiring npm exception. Its schema validation runs reviewed local code, but the package remains present in that image.

Owner: repository maintainer. Review these residuals by **2026-11-16**, on new vendor fixes, or before a new code path uses an affected parser/utility. Do not suppress all High/Critical findings globally. Raw scans and image digests are retained privately with the local acceptance evidence; scan the final deployed digests again after rollout.

The new staging Sanity robot credentials expire 2027-04-17. Rotate them before expiry, grant only the required project role, deploy/test, then revoke old credentials. Review other GitHub/Sanity/Resend credentials quarterly and after any exposure; never rotate a shared credential without identifying every consumer.

Preview cookies are bearer credentials valid for 30 minutes; preview media links last five minutes. Clearing the browser cookie does not invalidate a previously copied stateless preview cookie. Rotating the preview session signing secret is the emergency revocation mechanism. Separate-tab handoffs use fragments that never reach the server URL. Sanity Presentation still generates query-based iframe links: the bootstrap immediately clears the URL before a one-time POST exchange, and every configurable project log sink excludes requests containing `sanity-preview-secret` before retention. Keep those exclusions in place, including on any new sinks. A second POST redemption fails. An existing valid preview session can navigate without re-redeeming a cached iframe link. Historic logs are not automatically erased.

Cloud Armor remains off. CAPTCHA, bounded instances, local throttles and shared budgets reduce abuse cost, but a distributed attacker can still exhaust allowances or cause availability loss. Durable webhook claims prevent ordinary replay across restarts, but a crash after GitHub accepts a dispatch and before its acknowledgement is stored can still produce a retry; exactly-once delivery across those systems is not promised. GitHub serializes releases and retains only the newest pending rebuild.

Signed publishing events also share a durable allowance of 120 dispatch attempts/hour and 500/day per environment, reserved before contacting GitHub. Duplicates and sync-suppressed events do not consume dispatch slots. Exhaustion returns a retryable failure and alerts rather than pretending publication succeeded. Once the allowance recovers, redeliver the failed event or run a content deployment; Sanity's finite retry window is not an unlimited queue.
