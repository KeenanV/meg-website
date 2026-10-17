// Report-only rollout: validate real browser reports before enforcement. Script
// inline exceptions are deliberately absent so remaining inline code is visible.
export const reportOnlyCsp = [
  "default-src 'self'",
  "script-src 'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://www.recaptcha.net/recaptcha/",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://cdn.sanity.io https://www.google.com https://www.gstatic.com",
  "font-src 'self' data:",
  "connect-src 'self' https://ap0mc9ri.api.sanity.io https://ap0mc9ri.apicdn.sanity.io https://77uvsyo1.api.sanity.io https://77uvsyo1.apicdn.sanity.io https://website-backend-348807509213.us-west1.run.app https://www.google.com/recaptcha/ https://www.recaptcha.net/recaptcha/",
  "media-src 'self' https://storage.googleapis.com",
  "frame-src https://www.google.com https://www.recaptcha.net",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'",
].join('; ');
