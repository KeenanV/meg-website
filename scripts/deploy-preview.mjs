// Local preview commands remain preview-only even after CI switches to live.
process.env.HOSTING_RELEASE_CHANNEL = 'preview';
await import('./deploy-hosting.mjs');
