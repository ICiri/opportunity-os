import {spawnSync} from 'node:child_process';

const confirmation = '--confirm-destroy-local-data';

if (!process.argv.slice(2).includes(confirmation)) {
  console.error(
    [
      'DESTRUCTIVE LOCAL DATABASE RESET BLOCKED.',
      'This erases imported Gmail messages, encrypted CV payloads, Hunter history, and all other local database changes.',
      'Back up any data you need, verify that this is the disposable local Supabase project, then run:',
      `  npm run infra:reset -- ${confirmation}`,
    ].join('\n'),
  );
  process.exitCode = 1;
} else {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['run', 'supabase:reset'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    windowsHide: true,
  });

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
