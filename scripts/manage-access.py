"""Rotate access credentials without putting plaintext in arguments, Git or logs."""
import argparse
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
ENV = {**os.environ, 'CLOUDSDK_PYTHON': sys.executable}

def cloud(*args, data=None):
    result = subprocess.run(['gcloud', *args, '--quiet', '--format=json'], input=data,
                            text=True, capture_output=True, env=ENV)
    if result.returncode:
        raise RuntimeError('Cloud operation failed: ' + ' '.join(args[:3]) + '. No credentials printed.')
    return json.loads(result.stdout) if result.stdout.strip() else None

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('environment', choices=['staging', 'production'])
    parser.add_argument('action', choices=['resources-password', 'reviewer-list', 'reviewer-add', 'reviewer-remove'])
    parser.add_argument('username', nargs='?')
    parser.add_argument('--confirm-ci-updated', action='store_true', help='Allow removing reviewer after replacing the Staging environment STAGING_REVIEWER secret and testing that login.')
    args = parser.parse_args()
    if args.action.startswith('reviewer-') and args.environment != 'staging':
        parser.error('Reviewer accounts exist only in staging.')
    if args.action in ['reviewer-add', 'reviewer-remove'] and not re.fullmatch(r'[a-zA-Z0-9_-]{1,32}', args.username or ''):
        parser.error('Supply a username of 1–32 letters, numbers, underscores or hyphens.')
    project = 'megvandeusen-staging' if args.environment == 'staging' else 'megvandeusen-website'
    service = 'staging-website' if args.environment == 'staging' else 'website-backend'
    variable = 'STAGING_ACCESS' if args.environment == 'staging' else 'RESOURCES_ACCESS'
    config = cloud('run', 'services', 'describe', service, '--project=' + project, '--region=us-west1')
    ref = next(item['valueFrom']['secretKeyRef'] for item in config['spec']['template']['spec']['containers'][0]['env'] if item['name'] == variable)
    result = subprocess.run(['gcloud', 'secrets', 'versions', 'access', ref['key'], '--secret=' + ref['name'], '--project=' + project],
                            capture_output=True, text=True, env=ENV)
    if result.returncode:
        raise RuntimeError('Unable to read the currently deployed credential version.')
    value = json.loads(result.stdout)
    reviewers = value.get('reviewers', {'reviewer': value.get('basicHash')})
    if args.action == 'reviewer-list':
        print('\n'.join(sorted(reviewers))); return
    output = None
    if args.action == 'resources-password':
        password = getpass.getpass('New Resources password (at least 16 characters): ')
        if len(password) < 16 or len(password) > 200 or password != getpass.getpass('Repeat password: '):
            raise ValueError('Passwords must match and contain 16–200 characters.')
        salt = secrets.token_hex(16)
        record = {'salt': salt, 'hash': hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64).hex()}
        if args.environment == 'staging':
            value['resources'] = record
        else:
            value = record
    elif args.action == 'reviewer-add':
        if args.username in reviewers:
            raise ValueError('Username already exists. Remove it first to revoke its previous password.')
        if len(reviewers) >= 20:
            raise ValueError('Maximum 20 reviewer accounts.')
        password = secrets.token_urlsafe(32)
        reviewers[args.username] = hashlib.sha256((args.username + ':' + password).encode()).hexdigest()
        directory = ROOT / '.private'
        directory.mkdir(mode=0o700, exist_ok=True)
        output = directory / ('reviewer-' + args.username + '-' + secrets.token_hex(4) + '.txt')
        fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as file:
            file.write('Username: ' + args.username + '\nPassword: ' + password + '\n')
    else:
        if args.username == 'reviewer' and not args.confirm_ci_updated:
            raise ValueError('The reviewer account is used by deployment checks. Configure a replacement CI account and STAGING_REVIEWER GitHub secret before retiring it.')
        if args.username not in reviewers:
            raise ValueError('Unknown reviewer.')
        if len(reviewers) == 1:
            raise ValueError('Keep at least one reviewer.')
        del reviewers[args.username]
    if args.action.startswith('reviewer-'):
        value['reviewers'] = reviewers
        value.pop('basicHash', None)
    version = cloud('secrets', 'versions', 'add', ref['name'], '--project=' + project, '--data-file=-', data=json.dumps(value))
    number = version['name'].rsplit('/', 1)[1]
    cloud('run', 'services', 'update', service, '--project=' + project, '--region=us-west1',
          '--update-secrets=' + variable + '=' + ref['name'] + ':' + number)
    if args.environment == 'staging':
        subprocess.run(['node', 'scripts/deploy-staging-hosting.mjs'], cwd=ROOT, env=ENV, check=True)
        print('Staging Hosting now points to the new credential revision; unneeded historical Hosting tags were retired.')
    if output:
        print('New reviewer credentials saved privately to: ' + str(output))
    print('Credential version deployed: ' + number + '. Test access before disabling older Secret Manager versions.')

if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, StopIteration, KeyError, subprocess.CalledProcessError) as error:
        print(str(error) if isinstance(error, (RuntimeError, ValueError)) else 'Access update stopped. Inspect service configuration; no secrets printed.')
        raise SystemExit(1)
