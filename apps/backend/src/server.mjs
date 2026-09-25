import { createServer } from 'node:http';
import { GoogleAuth } from 'google-auth-library';
import { createHandler } from './handler.mjs';

const config = {
  origins: (process.env.CONTACT_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean),
  recipient: process.env.CONTACT_RECIPIENT,
  sender: process.env.CONTACT_SENDER,
  resendKey: process.env.RESEND_API_KEY,
  siteKey: process.env.RECAPTCHA_SITE_KEY,
  project: process.env.GOOGLE_CLOUD_PROJECT,
  githubToken: process.env.GITHUB_WORKFLOW_TOKEN,
  webhookSecret: process.env.SANITY_WEBHOOK_SECRET,
  sanityProject: process.env.SANITY_PROJECT_ID,
  sanityDataset: process.env.SANITY_DATASET,
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

const handler = createHandler({
  config,
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
  async dispatch() {
    await post('https://api.github.com/repos/KeenanV/meg-website/actions/workflows/deploy.yml/dispatches',
      `Bearer ${config.githubToken}`, { ref: 'master' }, {
        Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'meg-website-publishing',
      });
  },
});

const server = createServer({ maxHeaderSize: 16_384, requestTimeout: 20_000, headersTimeout: 15_000 }, handler);
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
process.on('SIGTERM', () => server.close());
