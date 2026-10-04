"""Deploy only the authenticated staging proxy. Never upload static site files."""
import json
import os
from pathlib import Path
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
PROJECT = 'megvandeusen-staging'
ACCOUNT = 'keenanvandeusen@gmail.com'
GCLOUD = os.environ.get('GCLOUD_BIN', '/Users/keenanv/google-cloud-sdk/bin/gcloud')
env = dict(os.environ, CLOUDSDK_PYTHON='/opt/homebrew/bin/python3.14')
token = subprocess.check_output([GCLOUD, 'auth', 'print-access-token', '--account='+ACCOUNT], env=env, text=True).strip()
base = 'https://firebasehosting.googleapis.com/v1beta1/'
def request(method, route, body=None):
    req = urllib.request.Request(base + route, data=None if body is None else json.dumps(body).encode(),
        headers={'Authorization': 'Bearer '+token, 'x-goog-user-project': PROJECT, 'Content-Type': 'application/json'}, method=method)
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.load(response)

config = json.loads((ROOT/'firebase.staging.json').read_text())['hosting']
assert config['site'] == PROJECT
assert config['ignore'] == ['**/*']
assert config['rewrites'] == [{'source': '**', 'run': {'serviceId': 'staging-website', 'region': 'us-west1', 'pinTag': True}}]
# The API has no pinTag convenience. Pin the rewrite to an explicit Cloud Run
# revision tag before creating this release, preserving rollback behavior.
service = json.loads(subprocess.check_output([GCLOUD, 'run', 'services', 'describe', 'staging-website',
    '--project='+PROJECT, '--region=us-west1', '--account='+ACCOUNT, '--format=json'], env=env, text=True))
revision = service['status']['latestReadyRevisionName']
tag = 'hosting-' + revision.removeprefix('staging-website-')
subprocess.run([GCLOUD, 'run', 'services', 'update-traffic', 'staging-website', '--update-tags='+tag+'='+revision,
    '--project='+PROJECT, '--region=us-west1', '--account='+ACCOUNT, '--quiet'], env=env, check=True)
serving = {'rewrites': [{'glob': '**', 'run': {'serviceId': 'staging-website', 'region': 'us-west1', 'tag': tag}}],
    'headers': [{'glob': item['source'], 'headers': {h['key']: h['value'] for h in item['headers']}} for item in config['headers']]}
version = request('POST', 'sites/'+PROJECT+'/versions', {'config': serving})
request('PATCH', version['name']+'?updateMask=status', {'status': 'FINALIZED'})
release = request('POST', 'sites/'+PROJECT+'/releases?versionName='+version['name'], {'message': 'Private staging proxy; no static content uploaded'})
print('Released private staging proxy:', release['name'])
