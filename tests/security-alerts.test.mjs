import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('real v1/v2 replacement, deletion and IAM methods are covered by exact-principal filters', () => {
  const result = spawnSync('python3', ['-c', `
import importlib.util,re
spec=importlib.util.spec_from_file_location('alerts','scripts/security-alerts.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
for version in ['v1','v2']:
 for resource,methods in [('Services',['CreateService','UpdateService','ReplaceService','DeleteService','SetIamPolicy']),('Jobs',['CreateJob','UpdateJob','ReplaceJob','DeleteJob','SetIamPolicy'])]:
  for method in methods: assert re.fullmatch(m.METHOD_PATTERN,'google.cloud.run.'+version+'.'+resource+'.'+method)
assert not re.fullmatch(m.METHOD_PATTERN,'google.cloud.run.v2.Services.GetService')
f=m.deployment_filter('megvandeusen-staging')
assert 'principalEmail="keenanvandeusen@gmail.com"' in f
assert 'principalEmail:' not in f
assert 'log_id("cloudaudit.googleapis.com/activity")' in f
`], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
});
