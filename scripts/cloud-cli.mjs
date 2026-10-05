import {spawnSync} from 'node:child_process';
export const accountFlags = process.env.CI ? [] : ['--account=keenanvandeusen@gmail.com'];
export const gcloud = process.env.GCLOUD_BIN || 'gcloud';
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {stdio: 'inherit', ...options});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
  return result.stdout;
}
