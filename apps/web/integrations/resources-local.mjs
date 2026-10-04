import {fileURLToPath} from 'node:url';
import {networkInterfaces} from 'node:os';
import {localResources} from '../../backend/src/resources-local.mjs';

export default function resourcesLocal() {
  return {name: 'resources-local', hooks: {
    'astro:server:setup': async ({server}) => {
      const hosts = new Set(['localhost', '127.0.0.1', '[::1]', ...Object.values(networkInterfaces()).flat().filter(Boolean).map(item => item.address)]);
      const handler = await localResources(fileURLToPath(new URL('../../../.private/resources/', import.meta.url)), origin => {
        try {
          const url = new URL(origin);
          return url.protocol === 'http:' && hosts.has(url.hostname) && Number(url.port) === server.httpServer?.address()?.port;
        } catch { return false; }
      });
      server.middlewares.use((req, res, next) => {
        // Never expose local fixtures through Vite's filesystem endpoints.
        let url;
        try { url = decodeURIComponent(req.url || ''); } catch { res.writeHead(400); return res.end(); }
        if (url.includes('/.private/')) { res.writeHead(404); return res.end(); }
        if (url.startsWith('/api/resources/')) return void handler(req, res);
        next();
      });
    },
  }};
}
