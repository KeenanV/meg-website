export {};
type Captcha = { enterprise: { ready: (callback: () => void) => void; execute: (key: string, options: { action: string }) => Promise<string> } };
declare global { interface Window { grecaptcha?: Captcha } }

let captchaLoading: Promise<void> | undefined;
function loadCaptcha(key: string): Promise<void> {
  if (window.grecaptcha?.enterprise) return Promise.resolve();
  if (captchaLoading) return captchaLoading;
  captchaLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(key)}`;
    script.async = true;
    const timer = window.setTimeout(() => { script.remove(); reject(new Error('Spam check timed out. Please try again.')); }, 15_000);
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('The spam check could not load. Please try again.')); };
    document.head.append(script);
  }).catch(error => { captchaLoading = undefined; throw error; });
  return captchaLoading;
}

function initialize() {
  const form = document.querySelector<HTMLFormElement>('#contact-form');
  if (!form || form.dataset.initialized) return;
  form.dataset.initialized = 'true';
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const status = form.querySelector<HTMLParagraphElement>('#contact-status')!;
  const { endpoint, siteKey } = form.dataset;
  const enabled = Boolean(endpoint && siteKey);
  button.disabled = !enabled;
  if (enabled) status.textContent = '';
  let submitting = false;
  let lastContent = '';
  let requestId = '';
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!enabled || !endpoint || !siteKey || submitting || !form.reportValidity()) return;
    const fields = new FormData(form);
    const data = { name: String(fields.get('name') ?? '').trim(), email: String(fields.get('email') ?? '').trim(), message: String(fields.get('message') ?? '').trim(), website: String(fields.get('website') ?? '') };
    if (!data.name || !data.email || !data.message) { status.textContent = 'Please fill in your name, email address, and message.'; return; }
    const content = JSON.stringify(data);
    if (content !== lastContent) { requestId = crypto.randomUUID(); lastContent = content; }
    submitting = true;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status.textContent = 'Sending your message…';
    try {
      await loadCaptcha(siteKey);
      const captcha = window.grecaptcha!;
      const token = await Promise.race([
        new Promise<string>((resolve, reject) => captcha.enterprise.ready(() => {
          captcha.enterprise.execute(siteKey, { action: 'contact' }).then(resolve, reject);
        })),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('The spam check timed out. Please try again.')), 15_000)),
      ]);
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, token, requestId }), signal: AbortSignal.timeout(35_000),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error(typeof result.message === 'string' ? result.message : 'Your message could not be sent. Please try again shortly.');
      status.textContent = 'Your message has been sent. Thank you!';
      // Preserve any edits made while this particular message was being sent.
      const current = new FormData(form);
      if (['name', 'email', 'message', 'website'].every(key => String(current.get(key) ?? '').trim() === data[key as keyof typeof data])) form.reset();
      lastContent = '';
    } catch (error) {
      status.textContent = error instanceof Error && error.name === 'Error'
        ? error.message : 'Your message could not be sent. Your text is still here; please try again shortly.';
    } finally {
      submitting = false;
      button.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
}
initialize();
document.addEventListener('astro:page-load', initialize);
