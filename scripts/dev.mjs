import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const api = spawn(process.execPath, ['backend/server.mjs'], { cwd: root, stdio: 'inherit' });
const frontend = path.join(root, 'frontend');
const vite = spawn(
  process.execPath,
  [
    path.join(frontend, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--host',
    '127.0.0.1',
    '--port',
    '5173',
    '--strictPort',
  ],
  { cwd: frontend, stdio: 'inherit' },
);
const stop = () => {
  api.kill();
  vite.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of [api, vite]) {
  child.on('exit', (code) => {
    stop();
    process.exitCode = code ?? 1;
  });
}
