# Meg Site (Astro + Sanity on GCP)

## Prereqs
- Node 20+
- A GCP project with Cloud Build, Cloud Storage, and Cloud CDN enabled
- A public bucket named e.g. `meg-site-prod`
- Sanity account (free), project + dataset

## Dev
cd apps/studio && npm install && npm run dev  # run Studio locally
cd apps/web    && npm install && npm run dev  # run Astro locally

## Build
cd apps/web && npm run build

## Deploy (Cloud Build)
- Create a Cloud Build trigger (GitHub → branch: main)
- The trigger uses `cloudbuild.yaml` at repo root
- Set a substitution: _BUCKET=gs://meg-site-prod

## Sanity → Rebuild
- In Sanity Studio: Project Settings → Webhooks
- Add a webhook to your Cloud Build trigger URL (on `published` events)