import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
process.env.GOOGLE_CLOUD_QUOTA_PROJECT = 'megvandeusen-website';

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Build first: publishing in Sanity does not update static Hosting files by itself.
run('npm', ['run', 'build', '--prefix', 'apps/web'], {
  ...process.env, SITE_URL: 'https://megvandeusen.com',
});
run(process.execPath, ['scripts/deploy-preview.mjs']);
