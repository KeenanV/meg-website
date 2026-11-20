export function auditFindings(audit, exceptions, now = Date.now()) {
  if (audit.error || !audit.metadata?.vulnerabilities) throw new Error('Audit unavailable');
  const findings = new Map();
  for (const pkg of Object.values(audit.vulnerabilities || {})) {
    for (const via of pkg.via) {
      if (typeof via !== 'object') continue;
      const id = new URL(via.url).pathname.split('/').at(-1);
      const exception = exceptions.find(e => e.advisory === id && e.packages.includes(pkg.name)
        && Number.isFinite(Date.parse(e.expires + 'T23:59:59Z')) && Date.parse(e.expires + 'T23:59:59Z') > now);
      findings.set(id + ':' + pkg.name, {id, package: pkg.name, severity: via.severity, exception});
    }
  }
  return [...findings.values()];
}
