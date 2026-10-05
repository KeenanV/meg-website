export function productionGateway({service, resources, studio}) {
  return async (req, res) => {
    let path;
    try { path = new URL(req.url, 'http://localhost').pathname; }
    catch { res.writeHead(400, {'Cache-Control': 'no-store'}); res.end('Invalid request.'); return; }
    if (path.startsWith('/api/resources/') || path.startsWith('/api/studio/uploads/')) {
      if (!resources || !studio) {
        res.writeHead(503, {'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex'});
        res.end(JSON.stringify({message: 'Resources are not configured yet.'}));
        return;
      }
      return path.startsWith('/api/resources/') ? resources(req, res) : studio(req, res);
    }
    return service(req, res);
  };
}
