// Fragments are not sent to servers or included in HTTP referrers. The landing
// page removes this fragment before redeeming it in a one-time POST.
export function previewHandoff(origin: string, secret: string, path = '/') {
  const target = new URL(path, origin);
  const route = target.origin === origin ? target.pathname + target.search : '/';
  const url = new URL('/api/preview/enable', origin);
  url.hash = new URLSearchParams({secret, path: route}).toString();
  return url.href;
}
