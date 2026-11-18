import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourcePattern = /(?:from\s*|import\s*(?:\(\s*)?|new URL\(\s*)['"]([^'"]+)['"]/g;
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['__tests__', 'scripts'].includes(entry.name)) return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : /\.(?:m?js)$/.test(file) ? [file] : [];
  });
}
export function discoverBackendFrontendRuntimeImports(root) {
 const frontend = path.join(root, 'frontend');
 const dependencies = new Set(), pending = [];
 function collect(file) {
  for (const match of fs.readFileSync(file, 'utf8').matchAll(sourcePattern)) {
    if (!match[1].startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), match[1]);
    if (target.startsWith(frontend + path.sep)) pending.push(target);
  }
 }
 for (const file of walk(path.join(root, 'backend/src'))) collect(file);
 while (pending.length) {
  const file = pending.pop();
  if (dependencies.has(file)) continue;
  dependencies.add(file);
  if (!fs.existsSync(file)) throw new Error(`Shared runtime import is missing: ${path.relative(root, file)}`);
  if (!/\.(?:m?js|json)$/.test(file)) throw new Error(`Backend imported a non-Node frontend asset: ${path.relative(root, file)}`);
  if (!file.endsWith('.json')) collect(file);
 }
 return [...dependencies].sort();
}

export function checkBackendRuntimeSharedImports(root) {
 const docker = fs.readFileSync(path.join(root, 'backend/Dockerfile'), 'utf8').split('COPY backend/src ./src')[1];
 if (!docker) throw new Error('Backend runtime source COPY was not found.');
 const copies = [];
 for (const line of docker.split('\n')) {
  const match = line.match(/^COPY\s+(frontend\/\S+(?:\s+frontend\/\S+)*)\s+(\/frontend\/\S+)\s*$/);
  if (!match) continue;
  for (const source of match[1].split(/\s+/)) {
   const absolute = path.resolve(root, source);
   copies.push({ source: absolute, destination: match[2], directory: fs.statSync(absolute).isDirectory() });
  }
 }
 const dependencies = discoverBackendFrontendRuntimeImports(root);
 for (const file of dependencies) {
  const runtime = '/' + path.relative(root, file).split(path.sep).join('/');
  const copied = copies.some(copy => {
    if (copy.directory && file.startsWith(copy.source + path.sep)) return runtime === copy.destination.replace(/\/$/, '') + '/' + path.relative(copy.source, file).split(path.sep).join('/');
    if (!copy.directory && file === copy.source) return runtime === (copy.destination.endsWith('/') ? copy.destination + path.basename(file) : copy.destination);
    return false;
  });
  if (!copied) throw new Error(`Backend runtime Docker COPY is missing ${runtime}`);
 }
 return { sharedRuntimeImports: dependencies.length, runtimeCopiesComplete: true };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
 console.log(JSON.stringify(checkBackendRuntimeSharedImports(root)));
}
