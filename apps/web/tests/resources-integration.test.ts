import {test} from 'node:test';
import {execFileSync} from 'node:child_process';

test('static configuration loads without backend dependencies; only local development loads the backend', () => {
  const integrationUrl = new URL('../integrations/resources-local.mjs', import.meta.url).href;
  execFileSync(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    import {registerHooks} from 'node:module';
    registerHooks({resolve(specifier, context, nextResolve) {
      const resolved = nextResolve(specifier, context);
      if (resolved.url.includes('/apps/backend/')) throw new Error('Backend unavailable in content builds');
      return resolved;
    }});
    const {default: resourcesLocal} = await import(${JSON.stringify(integrationUrl)});
    const integration = resourcesLocal();
    await assert.rejects(integration.hooks['astro:server:setup']({server: {}}), /Backend unavailable in content builds/);
  `], {stdio: 'pipe'});
});
