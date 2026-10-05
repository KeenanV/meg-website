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

export async function captchaToken(key: string, action: string): Promise<string> {
  await loadCaptcha(key);
  const captcha = window.grecaptcha!;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      new Promise<string>((resolve, reject) => captcha.enterprise.ready(() => {
        captcha.enterprise.execute(key, {action}).then(resolve, reject);
      })),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('The spam check timed out. Please try again.')), 15_000); }),
    ]);
  } finally { clearTimeout(timer); }
}
