import {spawn, spawnSync} from 'node:child_process';
import {openSync, readFileSync, writeFileSync, unlinkSync, existsSync} from 'node:fs';
import path from 'node:path';

const command = process.argv[2] ?? 'status';
const root = process.cwd();
const pidFile = path.join(root, '.dev-server.pid');
const current = () => {
  if (!existsSync(pidFile)) return;
  const pid = Number(readFileSync(pidFile, 'utf8'));
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    try {
      unlinkSync(pidFile);
    } catch {}
    return;
  }
};
const waitUntilReady = async (pid) => {
  const deadline = Date.now() + 30_000;
  let lastError = 'not ready';
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
      const response = await fetch('http://127.0.0.1:3000/', {signal: AbortSignal.timeout(1_000)});
      if (response.ok) return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Opportunity OS did not become ready within 30 seconds: ${lastError}`);
};

if (command === 'status') {
  const pid = current();
  console.log(
    JSON.stringify(
      {status: pid ? 'RUNNING' : 'STOPPED', pid: pid ?? null, url: pid ? 'http://127.0.0.1:3000' : null},
      null,
      2,
    ),
  );
} else if (command === 'start') {
  const existing = current();
  if (existing) {
    await waitUntilReady(existing);
    console.log(`Opportunity OS is ready at http://127.0.0.1:3000 (PID ${existing}).`);
  } else {
    const out = openSync(path.join(root, '.dev-server.log'), 'a'),
      err = openSync(path.join(root, '.dev-server-error.log'), 'a');
    const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
    const child = spawn(process.execPath, [nextBin, 'dev', '-H', '127.0.0.1', '-p', '3000'], {
      cwd: root,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', out, err],
    });
    child.unref();
    writeFileSync(pidFile, String(child.pid));
    try {
      await waitUntilReady(child.pid);
      console.log(
        `Opportunity OS is ready at http://127.0.0.1:3000 (PID ${child.pid}). Use npm run dev:stop to stop it.`,
      );
    } catch (error) {
      try {
        unlinkSync(pidFile);
      } catch {}
      throw error;
    }
  }
} else if (command === 'stop') {
  const pid = current();
  if (!pid) console.log('Opportunity OS is already stopped.');
  else {
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {stdio: 'ignore', windowsHide: true});
    else {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        process.kill(pid, 'SIGTERM');
      }
    }
    try {
      unlinkSync(pidFile);
    } catch {}
    console.log(`Opportunity OS stopped (PID ${pid}).`);
  }
} else {
  console.error('Usage: npm run dev:start | dev:stop | dev:status');
  process.exitCode = 1;
}
