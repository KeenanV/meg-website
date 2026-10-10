# Editorial previews and staging refreshes

## Everyday editing

Use production Studio at https://megvandeusen.sanity.studio. Save a draft, open
**Preview**, check its appearance, then **Publish** when ready. Preview is an
authenticated, live renderer of the same Astro pages; creating or editing drafts
does not run a GitHub deployment. Publishing retains the existing content-only
deployment workflow. Resources uses its existing dynamic published catalog.

From an open document, expand **Used on … pages** and choose its page to open
Preview at the right location. On a narrow screen, **Structure** and
**Presentation** switch between the editor and the page. Draft edits refresh the
preview automatically; the refresh icon can also reload it without publishing.
For a separate tab, choose **Open private preview** from the document actions
menu. This creates a fresh authenticated handoff for that tab. Refresh a separate
tab after editing; the embedded Preview tool handles draft refreshes automatically.

The separate staging Studio remains at https://megvandeusen-staging.sanity.studio
for code/schema testing. Each Studio's Preview reads its own dataset. Full code
deployments update the corresponding renderer; ordinary publications do not
rebuild it. New draft slugs, listing pages, homepage references and private
recordings can all be previewed. Contact submission is disabled in previews.

The preview service requires a Sanity-generated, validated handoff, then issues
a signed HttpOnly, Secure, partitioned 30-minute cookie. All content and local
assets are behind the gate; a Resources password does not grant preview access.
Responses are private/no-store and noindex. Framing is limited to the matching
Studio and its Sanity Dashboard parent (plus localhost Studios for staging development).
Only the matching Studio can initiate the authenticated handoff. Browser restrictions
on third-party cookies may require opening Preview in a new tab from Studio.
Use the document's **Open private preview** action for a new tab; the generic
Presentation launch icon cannot transfer a partitioned session between tabs.
Do not share preview URLs or cookies. The public website remains static.

## Refresh staging from Studio

Open **Refresh staging** from the Studio tool menu. No GitHub account is needed.

1. Choose **Review update from production** or **Review complete reset**.
2. Read the summary and expand the lists of affected items.
3. Resolve conflicts or prepare an explicitly reviewed reset.
4. Type the displayed confirmation and click **Back up and update/reset staging**.
5. Leave the job running; returning to the tool in the same tab restores status.

**Update** adds missing production items and updates matching items only when
staging has not changed since the last verified sync. It preserves staging-only
experiments, and blocks when a matching item has an unpublished staging draft.
An initial differing item with no baseline is a conflict, not an implied
permission to overwrite it. Production deletions are retained in this mode.

**Reset** makes managed staging content match a snapshot of published production
content, removing staging-only items and drafts. It never copies production drafts,
content-release versions, credentials, settings, sessions, counters or upload tickets.
Sanity system documents and unused asset objects are retained. Code stays on the
staging branch. A reset is a content reset, not an infrastructure reset.

Both modes back up staging documents, Sanity image/file bytes, and referenced
private audio before replacing documents. Imported images keep their content IDs;
recordings are copied to immutable staging object names, checked by size/CRC32C,
and pinned to the destination generation. The active catalog reads staging's own
bucket, never production's. Legacy public-audio fields are not reintroduced.

Plans expire after an hour and are bound to the editor who requested them. A
changed source/target revision invalidates the review. Content replacement uses
one bounded Sanity transaction with revision preconditions. The worker validates
against the staging Studio schema. The initial implementation deliberately stops
above 400 managed documents or an 8 MiB mutation payload instead of silently
splitting a reset into partial transactions.

## Job coordination and recovery

Studio verifies Sanity editor membership and starts a fixed staging Cloud Run job.
It cannot select arbitrary projects, datasets, commands or deployment branches.
There are hourly plan limits as well as request burst limits. The worker scales
to zero and has one task, no automatic retries, and a 15-minute execution limit.

A Firestore operation lock prevents overlap with other refreshes and GitHub
staging deployments. During replacement, the staging gateway displays a brief
maintenance response. Webhook deliveries are coalesced and imported revisions
are remembered so delayed deliveries do not produce a build per document. A
successful job queues the existing staging content workflow exactly once in
the normal path. If an upstream dispatch response is lost, investigate before
retrying; distributed services do not provide a global exactly-once transaction.

An uncertain mutation result or post-copy failure leaves staging in maintenance
rather than assuming it is safe. Do not manually clear that flag without checking
the run and content. No worker failure writes to production.

Private backups are under
`gs://megvandeusen-staging-editorial/sync/<operation-id>/`.
The run status is in staging Firestore `studioSyncRuns/<operation-id>` and the
operation lock is `studioOperations/sync`. The baseline is the private bucket's
`state/baseline.json`. Backup objects are not publicly accessible or in Git.

For an operator-reviewed recovery, after the failed operation has stopped and
its lease expired, execute the existing worker with the backup ID:

```sh
gcloud run jobs execute studio-content-sync \
  --project=megvandeusen-staging --region=us-west1 \
  --args=src/restore-sync-job.mjs,BACKUP_ID,RESTORE_STAGING --wait
```

This backs up the current staging state again, restores content and missing media,
verifies the result, clears the stale baseline, then releases maintenance. Run
the staging content deployment afterward. The Studio API cannot invoke this
operator recovery entrypoint. Review the content summary before any reset; the
backup is a recovery mechanism, not a substitute for review.

## Provisioning and deployment

One-time setup: `python3 scripts/provision-editorial.py`. It creates preview
identities, Secret Manager entries, a staging-only copier identity and a private,
versioned backup bucket. It reuses existing secrets. Tokens created by this setup
expire **2027-10-09**; rotate them in Secret Manager before then. No secrets are
printed by the script or included in source build contexts.

`node scripts/deploy-editorial.mjs staging|production` deploys the preview renderer.
Staging also builds/deploys the copy worker. `--worker-only` and `--preview-only`
support isolated testing. Full GitHub deployments run this script; content-only
deployments continue to skip Studio and renderer builds.

Cloud storage permissions separate production read from staging write. Sanity's
standard editor token is project-scoped on the current plan: the staging writer
must be treated as a sensitive credential, even though the worker's transport
hardcodes staging writes and rejects production mutations. A future plan with
custom dataset-scoped roles could further restrict that token at the provider
level. No such token is placed in Studio's JavaScript or browser storage.

Review backup retention/storage periodically; the initial setup preserves backups
and object versions until a deliberate retention policy is agreed and configured.
This deployment does not introduce always-running instances or Cloud Armor.
