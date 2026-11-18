import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { discoverBackendFrontendRuntimeImports, checkBackendRuntimeSharedImports } from './check-backend-runtime-shared-imports.mjs';

export const MIGRATIONS = ['1846_narriva_plan_provider_signoffs.sql', '1847_narriva_platform_generator_settings.sql', '1848_itsco_provider_account_conversions.sql'];
const token = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${(result.error?.message || result.stderr || '').slice(0, 500)}`);
  return result.stdout.trim();
};
export function validateReleaseOptions(options) {
  for (const name of ['backendBase', 'frontendBase']) if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*@sha256:[a-f0-9]{64}$/.test(options[name] || '')) throw new Error(`${name} must be a pinned image digest.`);
  for (const name of ['backendImage', 'frontendImage']) if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*:[a-zA-Z0-9._-]+$/.test(options[name] || '')) throw new Error(`${name} must be a destination image tag.`);
  for (const name of ['sourceCommit', 'baseCommit']) if (!/^[a-f0-9]{40}$/.test(options[name] || '')) throw new Error(`${name} must be a full Git commit.`);
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(options.project || '')) throw new Error('Provide the GCP project ID.');
  const builder = options.builder || `github-deployer@${options.project}.iam.gserviceaccount.com`;
  if (builder !== `github-deployer@${options.project}.iam.gserviceaccount.com`) throw new Error('Use the established project github-deployer builder account.');
  if (!token.test(options.buildId || '')) throw new Error('The built frontend needs a valid release build ID.');
  return { ...options, builder };
}
export function releaseDockerfiles(options) {
  const o = validateReleaseOptions(options);
  return {
    backend: `FROM ${o.backendBase}\nLABEL org.opencontainers.image.revision="${o.sourceCommit}"\nENV APP_BUILD_ID="${o.buildId}"\nCOPY backend/src/ /app/src/\nCOPY frontend/ /frontend/\nRUN printf '%s\\n' '{"type":"module"}' > /frontend/package.json\n${MIGRATIONS.map(name => `COPY database/migrations/${name} /app/database/migrations/${name}`).join('\n')}\n`,
    frontend: `FROM ${o.frontendBase}\nLABEL org.opencontainers.image.revision="${o.sourceCommit}"\nRUN rm -rf /usr/share/nginx/html\nCOPY frontend/dist/ /usr/share/nginx/html/\nCOPY frontend/nginx.conf /etc/nginx/conf.d/default.conf\nCOPY frontend/dist/itsco-public.nginx.conf /etc/nginx/conf.d/itsco-public.conf\nCOPY frontend/dist/tenant-legal-locations.conf /etc/nginx/tenant-legal-locations.conf\nRUN rm /usr/share/nginx/html/itsco-public.nginx.conf /usr/share/nginx/html/tenant-legal-locations.conf && nginx -t\n`
  };
}
export function cloudBuildConfiguration(options, component) {
  const o = validateReleaseOptions(options);
  return {
    serviceAccount: `projects/${o.project}/serviceAccounts/${o.builder}`,
    steps: [{ name: 'gcr.io/cloud-builders/docker', args: ['build', '--pull', '-t', o[`${component}Image`], '.'] }],
    images: [o[`${component}Image`]], options: { logging: 'CLOUD_LOGGING_ONLY' }, timeout: '1200s'
  };
}
export function releaseFiles(root, relativeDirectory, { excludeRuntimeTests = false } = {}) {
  const files = [];
  function walk(relative) {
    const absolute = path.join(root, relative);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Release payload contains a symlink: ${relative}`);
    if (stat.isDirectory()) for (const entry of fs.readdirSync(absolute).sort()) {
      if (excludeRuntimeTests && ['__tests__', 'scripts'].includes(entry)) continue;
      walk(path.join(relative, entry));
    } else if (stat.isFile()) {
      if (/[\r\n\0]/.test(relative) || /(?:^|\/)\.env(?:\.|$)/.test(relative)) throw new Error('Unexpected private or invalid release payload path.');
      files.push(relative.split(path.sep).join('/'));
    }
  }
  walk(relativeDirectory);
  return files;
}
async function digestFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function fingerprint(root, files) {
  const hash = crypto.createHash('sha256'); let bytes = 0;
  for (const file of files) {
    const absolute = path.join(root, file), stat = await fsp.stat(absolute);
    bytes += stat.size; hash.update(`${file}\0${await digestFile(absolute)}\n`);
  }
  return { files: files.length, bytes, sha256: hash.digest('hex') };
}
// Stream each original file into tar once. No second 845 MB dist directory,
// hardlink tree, dependency copy, build or cloud command is created/executed.
export async function createContextArchive({ root, files, dockerfile, output }) {
  if (fs.existsSync(output)) throw new Error('Refusing to overwrite an existing release archive.');
  if (files.some(file => path.isAbsolute(file) || file.split('/').includes('..') || /[\r\n\0]/.test(file))) throw new Error('Invalid release archive member.');
  const staging = await fsp.mkdtemp(path.join(path.dirname(output), '.narriva-context-'));
  try {
    await fsp.writeFile(path.join(staging, 'Dockerfile'), dockerfile);
    // Link only ancestor directories; archive operands are explicit regular
    // files, so tar reads their bytes without storing a symlink or copying dist.
    for (const directory of new Set(files.map(file => file.split('/')[0]))) await fsp.symlink(path.join(root, directory), path.join(staging, directory), 'dir');
    await fsp.writeFile(path.join(staging, 'files.list'), ['Dockerfile', ...files].join('\0') + '\0');
    const before = files.map(file => { const stat = fs.statSync(path.join(root, file)); return `${stat.size}:${stat.mtimeMs}`; });
    run('tar', ['--null', '-czf', output, '-C', staging, '-T', path.join(staging, 'files.list')]);
    if (files.some((file, index) => { const stat = fs.statSync(path.join(root, file)); return before[index] !== `${stat.size}:${stat.mtimeMs}`; })) throw new Error('Source changed while packaging; remove this candidate archive and package the final validated tree.');
  } catch (error) { await fsp.rm(output, { force: true }); throw error; }
  finally { await fsp.rm(staging, { recursive: true, force: true }); }
}
export async function packageRelease(raw) {
  const root = fs.realpathSync(raw.worktree || process.cwd());
  const version = JSON.parse(await fsp.readFile(path.join(root, 'frontend/dist/version.json'), 'utf8'));
  const o = validateReleaseOptions({ ...raw, buildId: raw.buildId || version.buildId });
  if (version.buildId !== o.buildId || version.requiredBackendBuildId !== o.buildId) throw new Error('Frontend version.json is not paired with this backend release. Rebuild the final frontend first.');
  if (run('git', ['rev-parse', 'HEAD'], root) !== o.sourceCommit) throw new Error('sourceCommit does not match worktree HEAD.');
  run('git', ['cat-file', '-e', `${o.baseCommit}^{commit}`], root);
  for (const file of ['backend/package.json', 'backend/package-lock.json']) {
    const installed = await fsp.readFile(path.join(root, file), 'utf8');
    if (installed.trim() !== run('git', ['show', `${o.baseCommit}:${file}`], root)) throw new Error('Backend dependencies changed relative to the pinned base commit; a full backend image build is required.');
  }
  const dirty = run('git', ['status', '--porcelain', '--untracked-files=all', '--', 'backend/src', 'frontend/src', 'frontend/nginx.conf', 'database/migrations'], root).split('\n').filter(Boolean);
  if (dirty.length && !o.allowDirty) throw new Error('Release source has uncommitted changes. Commit the validated tree or explicitly use --allow-dirty with manifest provenance.');
  const shared = discoverBackendFrontendRuntimeImports(root).map(file => path.relative(root, file).split(path.sep).join('/'));
  checkBackendRuntimeSharedImports(root);
  const backendFiles = [...releaseFiles(root, 'backend/src', { excludeRuntimeTests: true }), ...MIGRATIONS.map(name => `database/migrations/${name}`), ...shared].sort();
  const frontendFiles = [...releaseFiles(root, 'frontend/dist'), 'frontend/nginx.conf'].sort();
  for (const file of ['index.html', 'itsco-public.nginx.conf', 'tenant-legal-locations.conf']) if (!fs.existsSync(path.join(root, 'frontend/dist', file))) throw new Error(`Required frontend output missing: ${file}`);
  const fingerprints = { backend: await fingerprint(root, backendFiles), frontend: await fingerprint(root, frontendFiles) };
  const parent = raw.outputParent || '/private/tmp', space = await fsp.statfs(parent);
  const freeBytes = space.bavail * space.bsize;
  if (freeBytes < fingerprints.backend.bytes + fingerprints.frontend.bytes + 256 * 1024 * 1024) throw new Error('Insufficient free space for conservatively bounded compressed release archives.');
  const out = await fsp.mkdtemp(path.join(parent, 'narriva-release-'));
  console.log(JSON.stringify({ outputDirectory: out, preflight: fingerprints, freeBytes, archiveMethod: 'streaming-gzip-no-dist-copy' }));
  const dockerfiles = releaseDockerfiles(o), contexts = {};
  for (const component of ['backend', 'frontend']) {
    const archive = path.join(out, `${component}-context.tar.gz`);
    await createContextArchive({ root, files: component === 'backend' ? backendFiles : frontendFiles, dockerfile: dockerfiles[component], output: archive });
    await fsp.writeFile(path.join(out, `${component}.Dockerfile`), dockerfiles[component]);
    await fsp.writeFile(path.join(out, `${component}.cloudbuild.json`), JSON.stringify(cloudBuildConfiguration(o, component), null, 2) + '\n');
    contexts[component] = { archive: path.basename(archive), archiveBytes: (await fsp.stat(archive)).size, archiveSha256: await digestFile(archive), ...fingerprints[component] };
  }
  const manifest = { schemaVersion: 1, sourceCommit: o.sourceCommit, baseCommit: o.baseCommit, buildId: o.buildId, sourceDirty: dirty.length > 0, changedSourcePaths: dirty, backendBase: o.backendBase, frontendBase: o.frontendBase, backendImage: o.backendImage, frontendImage: o.frontendImage, builderServiceAccount: o.builder, sharedRuntimeImports: shared.length, migrations: MIGRATIONS, contexts };
  await fsp.writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ outputDirectory: out, buildId: o.buildId, contexts, sharedRuntimeImports: shared.length }));
  return { outputDirectory: out, manifest };
}
function argumentsFrom(argv) {
  const names = { '--worktree': 'worktree', '--source-commit': 'sourceCommit', '--base-commit': 'baseCommit', '--backend-base': 'backendBase', '--frontend-base': 'frontendBase', '--backend-image': 'backendImage', '--frontend-image': 'frontendImage', '--project': 'project', '--builder-service-account': 'builder', '--build-id': 'buildId', '--output-parent': 'outputParent' };
  const result = {};
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--allow-dirty') result.allowDirty = true;
    else if (names[argv[index]] && argv[index + 1] && !argv[index + 1].startsWith('--')) result[names[argv[index]]] = argv[++index];
    else throw new Error(`Unknown or incomplete option: ${argv[index]}`);
  }
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  packageRelease(argumentsFrom(process.argv.slice(2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
