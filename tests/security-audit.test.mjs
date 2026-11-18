import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditFindings} from '../scripts/security-audit-policy.mjs';
const id = 'GHSA-test-test-test';
const audit = {metadata: {vulnerabilities: {high: 1}}, vulnerabilities: {fixture: {name: 'fixture', via: [{url: 'https://github.com/advisories/' + id, severity: 'high'}]}}};
test('new, expired and wrong-package advisories are not excepted; unavailable scans fail closed', () => {
  const now = Date.parse('2026-11-18T12:00:00Z');
  const exception = {advisory: id, packages: ['fixture'], expires: '2026-11-19'};
  assert.equal(auditFindings(audit, [], now)[0].exception, undefined);
  assert.equal(auditFindings(audit, [exception], now)[0].exception, exception);
  assert.equal(auditFindings(audit, [{...exception, expires: '2026-11-17'}], now)[0].exception, undefined);
  assert.equal(auditFindings(audit, [{...exception, packages: ['other']}], now)[0].exception, undefined);
  assert.throws(() => auditFindings({error: 'registry unavailable'}, []));
});
test('full and content releases scan before packaging in the unprivileged build job', async () => {
  for (const file of ['deploy.yml', 'deploy-staging.yml']) {
    const workflow = await readFile(new URL('../.github/workflows/' + file, import.meta.url), 'utf8');
    const build = workflow.slice(workflow.indexOf('  build:'), workflow.indexOf('\n  deploy:'));
    const gate = build.indexOf('run: node scripts/check-security-audit.mjs');
    assert(gate > 0 && gate < build.indexOf('run: node scripts/deployment-artifact.mjs pack'));
    assert(!build.includes('id-token: write') && !build.includes('secrets.'));
    assert.match(build, /- name: Check current advisories and exception expiry\n        run: node scripts\/check-security-audit.mjs/);
  }
});
