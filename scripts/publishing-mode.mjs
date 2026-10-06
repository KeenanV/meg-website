import {appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

// Content runs share the full deployment's concurrency group. If one replaces a
// pending code release, it must deploy that code fully instead of skipping it.
export async function publishingMode({requested, event, repository, branch, sha, workflow, token, request = fetch}) {
  if (!['full', 'content'].includes(requested)) throw new Error('Unknown deployment type');
  if (repository !== 'KeenanV/meg-website'
    || ![['master', 'deploy.yml'], ['staging', 'deploy-staging.yml']].some(([ref, file]) => branch === ref && workflow === file)
    || !/^[a-f0-9]{40}$/.test(sha)) throw new Error('Unexpected deployment source');
  if (event === 'push' || requested === 'full') return 'full';
  if (event !== 'workflow_dispatch' || !token) throw new Error('Content deployment requires authenticated dispatch');
  async function api(path) {
    const response = await request(`https://api.github.com/repos/${repository}/${path}`, {
      headers: {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'},
      signal: AbortSignal.timeout(15_000), redirect: 'error',
    });
    if (!response.ok) throw new Error(`Deployment history unavailable (${response.status})`);
    return response.json();
  }
  const query = new URLSearchParams({branch, head_sha: sha, status: 'success', per_page: '100'});
  const matches = run => run.head_sha === sha && run.head_branch === branch && run.conclusion === 'success';
  // Pushes always run the full pipeline, even when a previous manual run exists.
  const pushed = await api(`actions/workflows/${workflow}/runs?${query}&event=push`);
  if (pushed.workflow_runs.some(matches)) return 'content';
  const dispatched = await api(`actions/workflows/${workflow}/runs?${query}&event=workflow_dispatch`);
  for (const run of dispatched.workflow_runs.filter(matches)) {
    const {jobs} = await api(`actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
    if (jobs.some(job => job.conclusion === 'success' && job.steps?.some(step =>
      step.name === 'Full deployment completed' && step.conclusion === 'success'))) return 'content';
  }
  // Missing/expired history is safe: perform all checks and deploy all components.
  return 'full';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = await publishingMode({requested: process.env.REQUESTED_DEPLOYMENT || 'full',
    event: process.env.GITHUB_EVENT_NAME, repository: process.env.GITHUB_REPOSITORY,
    branch: process.env.GITHUB_REF_NAME, sha: process.env.GITHUB_SHA,
    workflow: process.env.DEPLOYMENT_WORKFLOW, token: process.env.GH_TOKEN});
  if (!process.env.GITHUB_OUTPUT) throw new Error('GitHub output file required');
  await appendFile(process.env.GITHUB_OUTPUT, `mode=${mode}\n`);
  console.log(mode === 'content' ? 'Publishing content for previously deployed code.'
    : 'Full deployment required; Studio, backend and website will be verified and deployed.');
}
