import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {GoogleAuth} from 'google-auth-library';

// A signed, short-lived browser identifier, not a login credential. It avoids
// trusting forwarding headers. Clearing cookies can evade its per-browser
// limit, so the independent global allowance and CAPTCHA remain mandatory.
export function readerChallenge(secret, now = Date.now) {
  if (typeof secret !== 'string' || secret.length < 64) throw new Error('Reader signing secret required');
  const sign = value => createHmac('sha256', secret).update(value).digest('hex');
  function identify(value) {
    const match = /^p\.([a-f0-9]{32})\.(\d{13})\.([a-f0-9]{64})$/.exec(value || '');
    if (!match || Number(match[2]) <= now() || Number(match[2]) > now() + 900_000) return null;
    return timingSafeEqual(Buffer.from(match[3], 'hex'), Buffer.from(sign(`p.${match[1]}.${match[2]}`), 'hex')) ? match[1] : null;
  }
  return {identify,
    session(value) { return `s.${value}.${sign('s.' + value)}`; },
    reader(value) {
      const match = /^s\.([a-f0-9]{64})\.([a-f0-9]{64})$/.exec(value || '');
      return match && timingSafeEqual(Buffer.from(match[2], 'hex'), Buffer.from(sign('s.' + match[1]), 'hex')) ? match[1] : null;
    },
    issue() {
    const value = `p.${randomBytes(16).toString('hex')}.${now() + 900_000}`;
    return `${value}.${sign(value)}`;
  }};
}

export function readerCaptcha({project, siteKey, origins, request = fetch, auth = new GoogleAuth({scopes: ['https://www.googleapis.com/auth/cloud-platform']})}) {
  if (!siteKey || !project || !origins.length) throw new Error('Reader CAPTCHA configuration required');
  const hostnames = origins.map(origin => new URL(origin).hostname);
  return async (token, userAgent) => {
    const access = await auth.getAccessToken();
    const response = await request(`https://recaptchaenterprise.googleapis.com/v1/projects/${project}/assessments`, {
      method: 'POST', signal: AbortSignal.timeout(10_000), redirect: 'error',
      headers: {Authorization: `Bearer ${access}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({event: {token, siteKey, expectedAction: 'resources_login', userAgent: String(userAgent || '').slice(0, 1024)}}),
    });
    if (!response.ok) throw new Error('Reader verification unavailable');
    const result = await response.json();
    return result.tokenProperties?.valid === true && result.tokenProperties.action === 'resources_login'
      && hostnames.includes(result.tokenProperties.hostname)
      && typeof result.riskAnalysis?.score === 'number' && result.riskAnalysis.score >= 0.5;
  };
}
