import { spawnSync } from 'node:child_process';
import path from 'node:path';

function run(command, args, cwd = process.cwd()) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false, cwd });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [path.join('node_modules', '@angular', 'cli', 'bin', 'ng.js'), 'build']);
run(process.execPath, [path.join('node_modules', '@capacitor', 'cli', 'bin', 'capacitor'), 'sync', 'android']);
const androidDirectory = path.join(process.cwd(), 'android');
if (process.platform === 'win32') {
  run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'gradlew.bat', 'assembleDebug'], androidDirectory);
} else {
  run('./gradlew', ['assembleDebug'], androidDirectory);
}
