import { GoogleAuth } from 'google-auth-library';
import { createHandler } from './handler.mjs';
import {Firestore} from '@google-cloud/firestore';
import {contactProtection, firestoreAllowance} from './abuse.mjs';

const targets = {
  'megvandeusen-website': {dataset: 'production', branch: 'master', workflow: 'deploy.yml'},
  'megvandeusen-staging': {dataset: 'staging', branch: 'staging', workflow: 'deploy-staging.yml'},
};
export function deploymentTarget(project, dataset) {
  const target = targets[project];
  if (!target || target.dataset !== dataset) throw new Error('Deployment environment mismatch');
  return target;
}

export function createServiceHandler(env = process.env) {
  const target = deploymentTarget(env.GOOGLE_CLOUD_PROJECT, env.SANITY_DATASET);
  if (target.dataset === 'staging' && env.CONTACT_RECIPIENT !== 'keenanvandeusen@gmail.com') {
    throw new Error('Staging delivery must use the test inbox');
  }
  const config = {
    origins: (env.CONTACT_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean),
    recipient: env.CONTACT_RECIPIENT,
    sender: env.CONTACT_SENDER,
    resendKey: env.RESEND_API_KEY,
    siteKey: env.RECAPTCHA_SITE_KEY,
    project: env.GOOGLE_CLOUD_PROJECT,
    githubToken: env.GITHUB_WORKFLOW_TOKEN,
    webhookSecret: env.SANITY_WEBHOOK_SECRET,
    sanityProject: env.SANITY_PROJECT_ID,
    sanityDataset: env.SANITY_DATASET,
  };
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  async function post(url, authorization, body, extraHeaders = {}) {
    const response = await fetch(url, {
      method: 'POST', signal: AbortSignal.timeout(10_000),
      headers: { Authorization: authorization, 'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error('Upstream request failed');
    return response;
  }

  return createHandler({
    config,
    // Never silently fall back to process-local counters in a cloud deployment.
    protection: contactProtection(firestoreAllowance(new Firestore({projectId: config.project}), 'contact')),
    async assess(token, userAgent) {
      const accessToken = await auth.getAccessToken();
      const response = await post(
        `https://recaptchaenterprise.googleapis.com/v1/projects/${config.project}/assessments`,
        `Bearer ${accessToken}`,
        { event: { token, siteKey: config.siteKey, expectedAction: 'contact', userAgent } },
      );
      return response.json();
    },
    async sendEmail(payload, key) {
      await post('https://api.resend.com/emails', `Bearer ${config.resendKey}`, payload, { 'Idempotency-Key': key });
    },
    async dispatch(event) {
      if (target.dataset === 'staging' && env.STUDIO_SYNC_ENABLED === 'true') {
        const db = new Firestore({projectId: config.project});
        const suppressed = await db.runTransaction(async tx => {
          const lock = db.collection('studioOperations').doc('sync');
          const state = (await tx.get(lock)).data();
          const revision = typeof event?.revision === 'string' && /^[\w-]{1,128}$/.test(event.revision)
            ? await tx.get(db.collection('studioSyncRevisions').doc(event.revision)) : null;
          if (state?.maintenance) {tx.update(lock, {pendingPublications: true}); return true;}
          return revision?.exists === true;
        });
        if (suppressed) return;
      }
      await post(`https://api.github.com/repos/KeenanV/meg-website/actions/workflows/${target.workflow}/dispatches`,
        `Bearer ${config.githubToken}`, { ref: target.branch, inputs: {deployment_type: 'content'} }, {
          Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'meg-website-publishing',
        });
    },
  });

}
