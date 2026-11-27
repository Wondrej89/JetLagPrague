import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const result = spawnSync(process.execPath, [
  resolve('node_modules/wrangler/bin/wrangler.js'), 'deploy', '--dry-run',
  '--config', 'apps/multiplayer/wrangler.toml', '--outdir', resolve('dist/multiplayer'),
], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
