"""Configure only staging upload permissions, CORS, temporary-file cleanup and TTL.

No production writes, Cloud Armor, public bucket grants, or source deletions.
"""
import json
import os
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
PROJECT = 'megvandeusen-staging'
BUCKET = 'gs://megvandeusen-staging-resources'
GCLOUD = os.environ.get('GCLOUD_BIN', '/Users/keenanv/google-cloud-sdk/bin/gcloud')
ENV = dict(os.environ, CLOUDSDK_PYTHON='/opt/homebrew/bin/python3.14')
FLAGS = ['--project=' + PROJECT, '--account=keenanvandeusen@gmail.com', '--quiet']

def run(args):
    subprocess.run([GCLOUD] + args + FLAGS, cwd=ROOT, env=ENV, check=True)

private = ROOT / '.private'
private.mkdir(mode=0o700, exist_ok=True)
cors = private / 'staging-upload-cors.json'
cors.write_text(json.dumps([{
    'origin': ['http://localhost:3333', 'http://localhost:3334', 'https://megvandeusen-staging.sanity.studio'],
    'method': ['POST'], 'responseHeader': ['Content-Type'], 'maxAgeSeconds': 600,
}]))
lifecycle = private / 'staging-upload-lifecycle.json'
lifecycle.write_text(json.dumps({'rule': [{
    'action': {'type': 'Delete'}, 'condition': {'age': 1, 'matchesPrefix': ['incoming/']},
}]}))
# Creator can add new objects but cannot overwrite or delete existing recordings.
run(['storage', 'buckets', 'add-iam-policy-binding', BUCKET,
     '--member=serviceAccount:staging-website@megvandeusen-staging.iam.gserviceaccount.com',
     '--role=roles/storage.objectCreator'])
run(['storage', 'buckets', 'update', BUCKET, '--cors-file=' + str(cors),
     '--lifecycle-file=' + str(lifecycle)])
for group in ['resourceUploads', 'abuseLimits']:
    run(['firestore', 'fields', 'ttls', 'update', 'expires', '--collection-group=' + group,
         '--enable-ttl', '--async'])
