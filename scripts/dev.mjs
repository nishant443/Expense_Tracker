// Runs the API and the web app together (cross-platform, no extra dependencies).
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const procs = [
  ['api', ['run', 'dev', '--workspace', 'backend'], '\x1b[36m'],
  ['web', ['run', 'dev', '--workspace', 'frontend'], '\x1b[35m'],
].map(([name, args, color]) => {
  const p = spawn(npm, args, { stdio: ['inherit', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  const prefix = `${color}[${name}]\x1b[0m `;
  const pipe = (stream, out) =>
    stream.on('data', (d) => out.write(d.toString().split(/\r?\n/).filter(Boolean).map((l) => prefix + l).join('\n') + '\n'));
  pipe(p.stdout, process.stdout);
  pipe(p.stderr, process.stderr);
  p.on('exit', (code) => {
    console.log(`${prefix}exited with ${code}`);
    procs.forEach((o) => o !== p && o.kill());
    process.exit(code ?? 0);
  });
  return p;
});

process.on('SIGINT', () => procs.forEach((p) => p.kill('SIGINT')));
