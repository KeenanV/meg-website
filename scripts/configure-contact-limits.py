"""Provision persistent contact counters only; no email, DNS or Armor changes."""
import json
import os
import subprocess

PROJECT = 'megvandeusen-website'
GCLOUD = os.environ.get('GCLOUD_BIN', '/Users/keenanv/google-cloud-sdk/bin/gcloud')
ENV = dict(os.environ, CLOUDSDK_PYTHON='/opt/homebrew/bin/python3.14')
FLAGS = ['--project=' + PROJECT, '--account=keenanvandeusen@gmail.com', '--quiet']

def run(args, capture=False):
    return subprocess.run([GCLOUD] + args + FLAGS, env=ENV, check=True,
                          text=True, capture_output=capture)

run(['services', 'enable', 'firestore.googleapis.com'])
databases = json.loads(run(['firestore', 'databases', 'list', '--format=json'], True).stdout)
default = next((db for db in databases if db['name'].endswith('/(default)')), None)
if default is None:
    run(['firestore', 'databases', 'create', '--database=(default)', '--location=us-west1',
         '--type=firestore-native', '--delete-protection'])
elif default.get('locationId') != 'us-west1' or default.get('type') != 'FIRESTORE_NATIVE':
    raise SystemExit('Unexpected existing database; review before changing anything.')
run(['projects', 'add-iam-policy-binding', PROJECT,
     '--member=serviceAccount:website-backend@megvandeusen-website.iam.gserviceaccount.com',
     '--role=roles/datastore.user', '--condition=None'])
run(['firestore', 'fields', 'ttls', 'update', 'expires', '--collection-group=abuseLimits',
     '--enable-ttl', '--async'])
print('Production contact counter storage ready. Backend deployment is separate.')
