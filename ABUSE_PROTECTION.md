# Abuse protection and private recording uploads

## Application controls

Contact delivery uses Firestore transactions to reserve all applicable limits
before calling Resend: five sends per ten minutes, ten per hour, thirty per day,
and three per submitted email address per ten minutes. These are server-wide
limits, including across instances and restarts; changing an email address does
not bypass the global limits. Windows start on first use, rather than aligning
with clock boundaries. Failed delivery attempts still consume an allowance.
The earlier reCAPTCHA validation remains required. At most thirty assessments
per hour are allowed across instances. A failed database operation fails closed.

A cheap in-memory burst check runs before contact request bodies are consumed.
Denied shared limits are briefly remembered until their expiry, avoiding a
Firestore request for each repeated rejection. This bounds normal application
work; it is not an edge firewall or a guarantee against denial of service.
Counters in `abuseLimits` need TTL on `expires`; expiry is checked in code even
if Firestore cleanup has not run yet. No email addresses or message bodies are
stored in the counters. Setting low global allowances intentionally trades
availability of the form during abuse for protecting the recipient's inbox.

The production backend now requires its project's Firestore database and
`roles/datastore.user` for its existing runtime service account before deploying
this version. The new environment workflows deploy the backend before releasing
Hosting and use their own runtime/deployment identities.

The durable contact limits were deployed to production on October 4, 2026
(`website-backend-00006-9z2`). Live checks confirmed health, input/origin/size
rejections, invalid CAPTCHA rejection, a persisted allowance counter, and denied
anonymous Firestore access. These checks deliberately did not send email.
The owner also tested the published contact form and confirmed its success response.

Resources login rejects excess work before hashing, with a thirty-request local
burst limit per minute and four concurrent scrypt operations. Shared Firestore
budgets cap password calculations at thirty per minute / three hundred per hour.
Each signed browser identifier gets ten attempts per fifteen minutes. Cloud
login requires reCAPTCHA with a valid token, the exact action and an allowed
hostname, and a score of at least 0.5. The global allowance is reserved before
assessment or hashing, so rejected bot assessments also count toward it.

A fifteen-minute HMAC-signed pre-login cookie supplies the browser identifier;
it cannot authorize catalog or media access. Login replaces it with the opaque
reader session. Resetting cookies evades the browser limit, but not the global
allowance or CAPTCHA. We do not trust arbitrary forwarding headers. This is
application throttling, not per-IP edge protection, and shared allowance
exhaustion can deny legitimate sign-ins. The owner accepted this tradeoff while
Cloud Armor is on hold.

The outer staging gate also limits invalid reviewer requests locally to sixty
per minute. Valid reviewer credentials remain usable during that cooldown.
This small in-process guard is not a replacement for edge filtering.

`edgeClientIdentity()` prepares public per-client throttling for a future trusted
load balancer. It requires a secret edge header and a validated client-IP header;
it never trusts arbitrary `X-Forwarded-For`. It is **not enabled** on the current
Firebase proxy. The future load balancer must overwrite both headers, restrict
origin ingress, and verify bypass attempts before this policy is activated.

## Private Studio uploads

Start Studio with `SANITY_STUDIO_DATASET=staging npm run dev --prefix apps/studio
-- --port 3334`. The dataset and title visibly identify staging. The existing
production Studio is updated by the Production workflow after the private
backend is deployed. Each Studio dataset maps to its own fixed API and bucket.

The new private upload control sends the editor's existing Sanity session token
only to our upload API. The backend checks the human identity with Sanity and
verifies administrator/editor/developer membership in this project. Viewer,
anonymous and wrong-project credentials are rejected. No shared write token is
embedded in Studio, and the reader password never grants upload permission.
Identity and membership checks use Sanity's project-scoped API, matching Studio
session scope. The local staging Studio's browser upload and Publish flow were
verified against the deployed staging API on October 4, 2026.

Uploads use a five-minute GCS POST policy with an exact temporary object name,
exact size and audio MIME type, capped at 100 MiB. Audio bytes go directly to GCS;
the Sanity credential is never sent to GCS. Finalization checks owner, expiration,
size, MIME and an MP3 signature, then copies the verified object generation into
an immutable recording path. File-signature checking is not a full audio decoder
or antivirus scan. Replaying the temporary upload cannot replace the finalized
copy. The runtime can create/read objects but cannot overwrite/delete recordings.

Only the object reference, generation and size are saved in Sanity. This metadata
is public; the referenced bytes are protected by GCS. Covers remain public Sanity
images. Published private recordings appear in the protected catalog within
thirty seconds, without a website rebuild. Drafts do not appear. Studio's normal
Publish action controls availability. Already-issued signed media URLs retain
their earlier expiration if a recording is subsequently unpublished.

Temporary uploads expire via an `incoming/` lifecycle rule after one day; ticket
documents use Firestore TTL. Finalized but unattached uploads are not automatically
deleted, because deletion needs a reviewed reference inventory.

## Retirement sequence

1. Back up production recording documents and the original MP3 bytes outside Git.
2. Copy into private staging storage; verify anonymous denial, editor upload,
   published catalog, playback, seeking, expiry and logout.
3. Complete the reviewed production Resources API and private Studio deployment.
   Copy recordings into the production private bucket; do not reference staging.
4. Verify production playback and retain a tested rollback/backup copy.
5. Remove legacy public audio references and delete only the now-unreferenced
   Sanity file assets after checking all documents/drafts for dependencies.
6. Check the former CDN URLs. Sanity's asset CDN can retain cached data; deletion
   cannot recall downloads or guarantee immediate cache removal. Involve Sanity
   support for cache retirement if required.

`apps/studio/scripts/seed-private-recordings.mjs` previews by default. With
`--apply` it backs up originals and creates private staging copies only. It never
deletes originals or changes production documents. Do not run bulk dataset
replacement or broad asset deletion to perform this migration.

## Cloud Armor: deliberately not provisioned

Cloud Armor can filter API traffic at Google's edge, before Node or Firestore.
It requires an appropriate external Application Load Balancer and a backend
ingress policy that prevents callers bypassing it through `run.app`. Firebase
Hosting rewrites do not automatically acquire an Armor policy, and a backend-only
policy does not cover the public Firebase Hosting site or signed GCS downloads.

A proposed deployment must specify coverage and URLs first: an `api` origin for
contact/Resources would need frontend CORS, credential and cookie changes; retaining
same-origin APIs requires a different routing design. Keep the staging site gate
independent and do not break its Firebase rewrite when tightening ingress.
Use source-IP rate limits, endpoint-specific limits, a global emergency limit,
managed WAF rules in preview first, and explicit direct-origin bypass tests.
CAPTCHA and application-wide mail allowances remain necessary for distributed bots.

The current list price for the first group of global forwarding rules is
$0.025/hour (about $18.25 per 730-hour month), before Armor policies/rules, requests,
data processing and transfer. Separate project frontends may incur separate base
charges. Budget approval and a complete estimate precede provisioning. No Armor
resources, load balancers, DNS changes or paid subscriptions are created by this
change. No architecture can guarantee immunity to every DoS attack.

References, checked October 4, 2026:
- https://cloud.google.com/load-balancing/pricing
- https://cloud.google.com/armor/pricing
- https://docs.cloud.google.com/armor/docs/integrating-cloud-armor
- https://www.sanity.io/docs/apis-and-sdks/asset-cdn

## Cloud Armor estimate clarified October 5, 2026

USD, using 730 hours/month, separate global external Application Load Balancers
in staging and production, one Standard security policy per environment:

| Component | Per environment | Both environments |
| --- | ---: | ---: |
| First group of forwarding rules, $0.025/hour | $18.25 | $36.50 |
| Standard security policy, $0.006849315/hour | $5.00 | $10.00 |
| Example allowance of 5–10 rules at about $1/rule/month | $5–$10 | $10–$20 |
| Fixed subtotal | $28.25–$33.25 | $56.50–$66.50 |

The earlier $60–$70 estimate was a rounded planning allowance with several rules,
not a fixed minimum or an exact quoted bill. Rule count has not been designed or
provisioned. A minimal one-rule policy per environment would total about $48.50
for both environments before usage; production alone would roughly halve the
corresponding subtotal. Request inspection adds $0.75 per million for globally
scoped Standard policies; load-balancer processing and applicable transfer,
reCAPTCHA and existing service usage are additional. No Enterprise subscription
is included. The forwarding-rule base is charged separately per project, not
once across the billing account. Both pricing sources above support this math.
