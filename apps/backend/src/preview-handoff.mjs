import {createHash} from 'node:crypto';

export const handoffScript = `const data = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
history.replaceState(null, '', location.pathname);
async function openPreview() {
  try {
    const target = new URL(data.get('path') || data.get('sanity-preview-pathname') || '/', location.origin);
    const path = target.origin === location.origin && !target.pathname.startsWith('/api/') ? target.pathname + target.search : '/';
    if (document.querySelector('meta[name="preview-authorized"]')?.content === 'yes') {
      data.delete('secret'); data.delete('sanity-preview-secret');
      location.replace(path); return;
    }
    const response = await fetch('/api/preview/enable', {method: 'POST',
      headers: {'Content-Type': 'application/json'}, credentials: 'same-origin',
      body: JSON.stringify({secret: data.get('secret') || data.get('sanity-preview-secret'), path})});
    data.delete('secret'); data.delete('sanity-preview-secret');
    if (!response.ok) throw new Error('Denied');
    const result = await response.json();
    location.replace(result.path);
  } catch { document.getElementById('status').textContent = 'Open a fresh Preview from your signed-in Studio.'; }
}
openPreview();`;
export const handoffScriptHash = createHash('sha256').update(handoffScript).digest('base64');
export const handoffHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Opening private preview</title><p id="status">Opening private preview…</p><script>${handoffScript}</script></html>`;

// A validated Sanity handoff can be redeemed once, even across instances.
// Retain the digest longer than Sanity's one-hour secret validity.
export async function redeemPreviewSecret(bucket, dataset, secret, now = Date.now()) {
  if (typeof secret !== 'string' || secret.length < 16 || secret.length > 256) return false;
  const id = createHash('sha256').update(dataset + ':' + secret).digest('hex');
  try {
    await bucket.file(`preview-handoffs/${id}`).save('', {resumable: false, preconditionOpts: {ifGenerationMatch: 0},
      metadata: {cacheControl: 'private,no-store', metadata: {created: String(now)}}});
    return true;
  } catch (error) {
    if (Number(error.code) === 412) return false;
    throw error; // Storage failures must never turn off replay protection.
  }
}
