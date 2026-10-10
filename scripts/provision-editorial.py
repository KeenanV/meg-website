"""One-time editorial infrastructure. Secrets travel over stdin, never logs or Git."""
import json
import os
import secrets
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV = {**os.environ, 'CLOUDSDK_PYTHON': '/opt/homebrew/bin/python3.14',
       'PATH': '/Users/keenanv/.nvm/versions/node/v24.21.0/bin:' + os.environ['PATH']}
ACCOUNT = 'keenanvandeusen@gmail.com'

def cloud(*args, data=None, optional=False):
    result = subprocess.run(['gcloud', *args, '--account=' + ACCOUNT, '--quiet'],
                            input=data, text=True, capture_output=True, env=ENV)
    if result.returncode and not optional:
        # CLI errors can contain credentials; report only the operation.
        raise RuntimeError('Cloud operation failed: ' + ' '.join(args[:3]))
    return result

def token(label, role):
    result = subprocess.run(['./node_modules/.bin/sanity', 'tokens', 'create', label,
                             '--role=' + role, '--expires-at=2027-10-09', '--yes', '--json'],
                            cwd=ROOT / 'apps/studio', env=ENV, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('Sanity token creation failed; sign in to the Sanity CLI.')
    value = json.loads(result.stdout)
    secret = value.get('token') or value.get('secret') or value.get('key')
    if not isinstance(secret, str):
        raise RuntimeError('Unexpected token result. No credential printed.')
    return secret

def secret(project, name, generate, readers):
    existing = cloud('secrets', 'describe', name, '--project=' + project, optional=True)
    if existing.returncode:
        cloud('secrets', 'create', name, '--replication-policy=automatic', '--project=' + project)
    versions = cloud('secrets', 'versions', 'list', name, '--project=' + project,
                     '--filter=state:ENABLED', '--format=value(name)', optional=True)
    if not versions.stdout.strip():
        cloud('secrets', 'versions', 'add', name, '--data-file=-', '--project=' + project, data=generate())
    for reader in readers:
        cloud('secrets', 'add-iam-policy-binding', name, '--project=' + project,
              '--member=serviceAccount:' + reader, '--role=roles/secretmanager.secretAccessor')

def binding(project, member, role):
    cloud('projects', 'add-iam-policy-binding', project, '--member=serviceAccount:' + member,
          '--role=' + role, '--condition=None')

def bucket_role(bucket, member, role):
    cloud('storage', 'buckets', 'add-iam-policy-binding', 'gs://' + bucket,
          '--member=serviceAccount:' + member, '--role=' + role)

for project in ['megvandeusen-staging', 'megvandeusen-website']:
    preview = f'editorial-preview@{project}.iam.gserviceaccount.com'
    if cloud('iam', 'service-accounts', 'describe', preview, '--project=' + project, optional=True).returncode:
        cloud('iam', 'service-accounts', 'create', 'editorial-preview', '--project=' + project,
              '--display-name=Private Studio draft preview')
    secret(project, 'sanity-preview-token', lambda: token(project + ' draft preview', 'viewer'), [preview])
    secret(project, 'preview-session-secret', lambda: secrets.token_urlsafe(48), [preview])
    bucket_role(project + '-resources', preview, 'roles/storage.objectViewer')
    cloud('iam', 'service-accounts', 'add-iam-policy-binding', preview, '--project=' + project,
          '--member=serviceAccount:' + preview, '--role=roles/iam.serviceAccountTokenCreator')
    cloud('iam', 'service-accounts', 'add-iam-policy-binding', preview, '--project=' + project,
          '--member=serviceAccount:github-hosting@' + project + '.iam.gserviceaccount.com', '--role=roles/iam.serviceAccountUser')
    print('Private preview identity and secrets ready: ' + project, flush=True)

project = 'megvandeusen-staging'
worker = 'studio-content-sync@' + project + '.iam.gserviceaccount.com'
if cloud('iam', 'service-accounts', 'describe', worker, '--project=' + project, optional=True).returncode:
    cloud('iam', 'service-accounts', 'create', 'studio-content-sync', '--project=' + project,
          '--display-name=Production-read staging-write content copier')
secret(project, 'sanity-production-read-token', lambda: token('Studio sync production read', 'viewer'), [worker])
secret(project, 'sanity-staging-write-token', lambda: token('Studio sync staging writer', 'editor'), [worker])
cloud('secrets', 'add-iam-policy-binding', 'github-workflow-token', '--project=' + project,
      '--member=serviceAccount:' + worker, '--role=roles/secretmanager.secretAccessor')
binding(project, worker, 'roles/datastore.user')
binding(project, 'github-hosting@' + project + '.iam.gserviceaccount.com', 'roles/datastore.user')
bucket_role('megvandeusen-website-resources', worker, 'roles/storage.objectViewer')
for role in ['roles/storage.objectViewer', 'roles/storage.objectCreator']:
    bucket_role('megvandeusen-staging-resources', worker, role)
if cloud('storage', 'buckets', 'describe', 'gs://megvandeusen-staging-editorial', optional=True).returncode:
    cloud('storage', 'buckets', 'create', 'gs://megvandeusen-staging-editorial', '--project=' + project,
          '--location=us-west1', '--uniform-bucket-level-access', '--public-access-prevention')
cloud('storage', 'buckets', 'update', 'gs://megvandeusen-staging-editorial', '--versioning')
bucket_role('megvandeusen-staging-editorial', worker, 'roles/storage.objectUser')
cloud('iam', 'service-accounts', 'add-iam-policy-binding', worker, '--project=' + project,
      '--member=serviceAccount:github-hosting@' + project + '.iam.gserviceaccount.com', '--role=roles/iam.serviceAccountUser')
binding(project, 'staging-website@' + project + '.iam.gserviceaccount.com', 'roles/run.jobsExecutorWithOverrides')
print('Staging sync identity, private backups, and job-launch permissions ready.', flush=True)
