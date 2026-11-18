"""Update existing Cloud Run deployment alerts; preserves channels and rate limits."""
import argparse
import json
import os
import subprocess
import urllib.request

METHOD_PATTERN = r'^google\.cloud\.run\.v[12]\.(Services|Jobs)\.(CreateService|UpdateService|ReplaceService|DeleteService|CreateJob|UpdateJob|ReplaceJob|DeleteJob|SetIamPolicy)$'


def deployment_filter(project):
    if project not in ['megvandeusen-staging', 'megvandeusen-website']:
        raise ValueError('Unknown project')
    allowed = ['keenanvandeusen@gmail.com', f'github-hosting@{project}.iam.gserviceaccount.com']
    principal = 'protoPayload.authenticationInfo.principalEmail'
    real = ('log_id("cloudaudit.googleapis.com/activity") '
            'AND protoPayload.serviceName="run.googleapis.com" '
            f'AND protoPayload.methodName=~{json.dumps(METHOD_PATTERN)} '
            'AND NOT (' + ' OR '.join(f'{principal}={json.dumps(value)}' for value in allowed) + ')')
    return '(' + real + ') OR (log_id("meg-security-test") AND jsonPayload.event="security_alert_test")'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not args.apply:
        for project in ['megvandeusen-staging', 'megvandeusen-website']:
            print(project, deployment_filter(project))
        return
    token = subprocess.run(['gcloud', 'auth', 'print-access-token', '--account=keenanvandeusen@gmail.com'],
                           capture_output=True, text=True, check=True, env={**os.environ, 'CLOUDSDK_PYTHON': '/opt/homebrew/bin/python3.14'}).stdout.strip()
    def api(path, body=None):
        request = urllib.request.Request('https://monitoring.googleapis.com/v3/' + path,
            headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
            data=json.dumps(body).encode() if body else None, method='PATCH' if body else 'GET')
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    for project in ['megvandeusen-staging', 'megvandeusen-website']:
        policies = api('projects/' + project + '/alertPolicies').get('alertPolicies', [])
        policy = next(p for p in policies if p['displayName'] == 'Meg website unexpected deployment identity')
        conditions = policy['conditions']
        assert len(conditions) == 1 and 'conditionMatchedLog' in conditions[0]
        conditions[0]['conditionMatchedLog']['filter'] = deployment_filter(project)
        saved = api(policy['name'] + '?updateMask=conditions', {'name': policy['name'], 'conditions': conditions})
        assert saved['notificationChannels'] == policy['notificationChannels']
        assert saved['alertStrategy'] == policy['alertStrategy']
        print(project, 'deployment alert updated; channels and limits preserved')


if __name__ == '__main__':
    main()
