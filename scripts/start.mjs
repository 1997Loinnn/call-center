// Backend (http://localhost:3000) va frontend (http://localhost:5173) ni bitta buyruq bilan
// ishlab chiqish rejimida ishga tushiradi: npm run start. To'xtatish: Ctrl+C.
import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const apps = [
  { name: 'backend', color: 36, args: ['--prefix', 'apps/backend', 'run', 'start:dev'] },
  { name: 'frontend', color: 35, args: ['--prefix', 'apps/frontend', 'run', 'dev'] },
];

// "npm run start" orqali ishga tushganda npm o'z yo'lini npm_execpath'da beradi: ilovalar
// aynan shu Node va npm bilan ishga tushadi (PATH'dagi boshqa Node versiyasi ishlatilmaydi)
const npmCli = process.env.npm_execpath;

function spawnNpm(args) {
  if (npmCli) return spawn(process.execPath, [npmCli, ...args], { env: process.env });
  return spawn(`npm ${args.join(' ')}`, { shell: true, env: process.env });
}

let stopping = false;

const children = apps.map(({ name, color, args }) => {
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const child = spawnNpm(args);

  for (const [stream, out] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ]) {
    let rest = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      const lines = (rest + chunk).split(/\r?\n/);
      rest = lines.pop() ?? '';
      for (const line of lines) out.write(`${prefix}${line}\n`);
    });
  }

  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`${prefix}to'xtadi (kod ${code}); qolgan jarayonlar ham to'xtatiladi`);
      stop(code ?? 1);
    }
  });
  return child;
});

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    // Windows'da npm -> node jarayonlar daraxtini to'liq yopish uchun taskkill
    if (isWindows) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 500);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
