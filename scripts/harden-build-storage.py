"""Scope build source reads and enforce source-bucket safeguards (operator only)."""
import argparse
import json
import os
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('environment', choices=['staging', 'production'])
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
project = 'megvandeusen-staging' if args.environment == 'staging' else 'megvandeusen-website'
builder = ('staging-builder' if args.environment == 'staging' else 'backend-builder') + '@' + project + '.iam.gserviceaccount.com'
member = 'serviceAccount:' + builder
buckets = [project + '_cloudbuild', 'run-sources-' + project + '-us-west1']
root = Path(__file__).resolve().parent.parent
backup = root / '.private' / 'build-storage' / project
backup.mkdir(parents=True, exist_ok=True, mode=0o700)

def cloud(*argv, optional=False):
    result = subprocess.run([os.environ.get('GCLOUD_BIN', 'gcloud'), *argv, '--quiet', '--format=json'], capture_output=True, text=True)
    if result.returncode:
        if optional:
            return None
        raise RuntimeError(f'Cloud command failed: {" ".join(argv[:3])}\n{result.stderr}')
    return json.loads(result.stdout) if result.stdout.strip() else {}

def preserve(filename, value):
    # Retain the pre-change baseline across retries.
    path = backup / filename
    if not path.exists():
        path.write_text(json.dumps(value, indent=2) + '\n')
        path.chmod(0o600)

policy = cloud('projects', 'get-iam-policy', project)
preserve('project-iam.json', policy)
role = cloud('iam', 'roles', 'describe', 'roles/run.builder')
permissions = sorted(p for p in role['includedPermissions'] if not p.startswith('storage.'))
# Refuse silently inheriting future new privileges from the provider role.
expected = sorted(['artifactregistry.repositories.deleteArtifacts', 'artifactregistry.repositories.downloadArtifacts',
                   'artifactregistry.repositories.uploadArtifacts', 'logging.logEntries.create', 'source.repos.get'])
if permissions != expected:
    raise RuntimeError('Provider builder role changed; review before applying.')

for bucket in buckets:
    settings = cloud('storage', 'buckets', 'describe', 'gs://' + bucket)
    iam = cloud('storage', 'buckets', 'get-iam-policy', 'gs://' + bucket)
    preserve(bucket + '-settings.json', settings)
    preserve(bucket + '-iam.json', iam)
    if any(m in ['allUsers', 'allAuthenticatedUsers'] for binding in iam.get('bindings', []) for m in binding.get('members', [])):
        raise RuntimeError('Unexpected public source-bucket binding; investigate before changing it.')

print(f'{project}: replace project-wide builder storage access with reads from {buckets}; enforce UBLA/PAP.')
if not args.apply:
    print('Inspection only. Use --apply after reviewing the saved baseline.')
    raise SystemExit(0)

for role_id, title, included in [('websiteBuilder', 'Website build without project storage access', permissions),
                                 ('websiteBuildSourceReader', 'Website build source object reader', ['storage.objects.get'])]:
    existing = cloud('iam', 'roles', 'describe', role_id, '--project=' + project, optional=True)
    role_file = backup / (role_id + '.json')
    role_file.write_text(json.dumps({'title': title, 'description': title, 'stage': 'GA', 'includedPermissions': included}))
    cloud('iam', 'roles', 'update' if existing else 'create', role_id, '--project=' + project, '--file=' + str(role_file))

cloud('projects', 'add-iam-policy-binding', project, '--member=' + member,
      '--role=projects/' + project + '/roles/websiteBuilder', '--condition=None')
for bucket in buckets:
    cloud('storage', 'buckets', 'add-iam-policy-binding', 'gs://' + bucket, '--member=' + member,
          '--role=projects/' + project + '/roles/websiteBuildSourceReader', '--condition=None')
    cloud('storage', 'buckets', 'update', 'gs://' + bucket, '--uniform-bucket-level-access', '--public-access-prevention')
# Remove only the dedicated builder's unconditional broad binding.
if any(b['role'] == 'roles/run.builder' and member in b.get('members', []) and not b.get('condition') for b in policy.get('bindings', [])):
    cloud('projects', 'remove-iam-policy-binding', project, '--member=' + member, '--role=roles/run.builder', '--condition=None')
# The legacy default builder is not a service agent. Retire its broad role only
# after an explicit inventory proves no retained build/trigger uses it.
number = cloud('projects', 'describe', project)['projectNumber']
legacy = 'serviceAccount:' + str(number) + '@cloudbuild.gserviceaccount.com'
if any(b['role'] == 'roles/cloudbuild.builds.builder' and legacy in b.get('members', []) for b in policy.get('bindings', [])):
    inventory = {}
    for region in ['global', 'us-west1']:
        builds = cloud('builds', 'list', '--project=' + project, '--region=' + region, '--limit=1000')
        triggers = cloud('builds', 'triggers', 'list', '--project=' + project, '--region=' + region)
        inventory[region] = {'builds': builds, 'triggers': triggers}
        if len(builds) >= 1000 or triggers or any(b.get('serviceAccount') != 'projects/' + project + '/serviceAccounts/' + builder for b in builds):
            raise RuntimeError('Legacy builder consumers need review; scoped dedicated builder changes are already applied.')
    preserve('legacy-builder-consumers.json', inventory)
    cloud('projects', 'remove-iam-policy-binding', project, '--member=' + legacy,
          '--role=roles/cloudbuild.builds.builder', '--condition=None')
print('Applied. Verify effective source/private-object access and a real build before promoting.')
