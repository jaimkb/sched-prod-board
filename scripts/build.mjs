// Copies app/ to dist/ and stamps the build: the git sha of HEAD goes into <meta name="build"> and the footer (R6).
import { execSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const sha = execSync('git rev-parse HEAD').toString().trim();
if (execSync('git status --porcelain -- app').toString().trim()) {
  throw new Error('app/ has uncommitted changes: commit first, so the sha names this build.');
}
rmSync('dist', { recursive: true, force: true });
cpSync('app', 'dist', { recursive: true });
const html = readFileSync('dist/index.html', 'utf8').replaceAll('__BUILD_SHA__', sha);
writeFileSync('dist/index.html', html);
console.log(`built dist/ at ${sha}`);
