import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { releaseDockerfiles, validateReleaseOptions, cloudBuildConfiguration, releaseFiles, createContextArchive } from './package-narriva-release.mjs';
import { checkBackendRuntimeSharedImports } from './check-backend-runtime-shared-imports.mjs';
const options = { project: 'fictional-project', sourceCommit: 'a'.repeat(40), baseCommit: 'b'.repeat(40), buildId: 'synthetic-release', backendBase: `example.test/backend@sha256:${'c'.repeat(64)}`, frontendBase: `example.test/frontend@sha256:${'d'.repeat(64)}`, backendImage: 'example.test/backend:synthetic', frontendImage: 'example.test/frontend:synthetic' };
test('overlay requires pinned provenance and the established builder identity', () => {
 assert.throws(() => validateReleaseOptions({ ...options, backendBase: 'example.test/backend:latest' }), /pinned/);
 assert.throws(() => validateReleaseOptions({ ...options, builder: 'default-compute@example.test' }), /github-deployer/);
 const files = releaseDockerfiles(options);
 assert.match(files.backend, /ENV APP_BUILD_ID="synthetic-release"/);
 assert.match(files.backend, /1846_narriva_plan_provider_signoffs/);
 assert.match(files.backend, /1847_narriva_platform_generator_settings/);
 assert.match(files.backend, /1848_itsco_provider_account_conversions/);
 assert.doesNotMatch(files.backend, /npm|SECRET|ENV .*KEY/);
 assert.match(files.frontend, /tenant-legal-locations.conf/);
 assert.match(files.frontend, /nginx -t/);
 assert.equal(cloudBuildConfiguration(options, 'backend').serviceAccount, 'projects/fictional-project/serviceAccounts/github-deployer@fictional-project.iam.gserviceaccount.com');
});
test('archive streams only the explicitly reviewed payload, excluding runtime tests/scripts', async () => {
 const root = await fs.mkdtemp('/private/tmp/narriva-package-test-');
 try {
  await fs.mkdir(path.join(root, 'backend/src/__tests__'), { recursive: true });
  await fs.mkdir(path.join(root, 'backend/src/scripts'), { recursive: true });
  await fs.writeFile(path.join(root, 'backend/src/server.js'), 'export const synthetic = true;');
  await fs.writeFile(path.join(root, 'backend/src/__tests__/hidden.js'), 'test-only');
  await fs.writeFile(path.join(root, 'backend/src/scripts/private.js'), 'script-only');
  const files = releaseFiles(root, 'backend/src', { excludeRuntimeTests: true });
  assert.deepEqual(files, ['backend/src/server.js']);
  const output = path.join(root, 'synthetic.tar.gz');
  await createContextArchive({ root, files, dockerfile: 'FROM synthetic@sha256:test\n', output });
  const listed = spawnSync('tar', ['-tzf', output], { encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(listed.stdout.trim().split('\n').sort(), ['Dockerfile', 'backend/src/server.js']);
  await fs.symlink('server.js', path.join(root, 'backend/src/link.js'));
  assert.throws(() => releaseFiles(root, 'backend/src', { excludeRuntimeTests: true }), /symlink/);
 } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('runtime import check catches an omitted transitive module and rejects Vue source', async () => {
 const root = await fs.mkdtemp('/private/tmp/narriva-runtime-test-');
 try {
  await fs.mkdir(path.join(root, 'backend/src'), { recursive: true });
  await fs.mkdir(path.join(root, 'frontend/src/utils'), { recursive: true });
  await fs.writeFile(path.join(root, 'backend/src/server.js'), "import '../../frontend/src/utils/first.js';");
  await fs.writeFile(path.join(root, 'frontend/src/utils/first.js'), "export { second as first } from './second.js';");
  await fs.writeFile(path.join(root, 'frontend/src/utils/second.js'), 'export const second = true;');
  const docker = 'COPY backend/src ./src\nCOPY frontend/src/utils/first.js /frontend/src/utils/first.js\n';
  await fs.writeFile(path.join(root, 'backend/Dockerfile'), docker);
  assert.throws(() => checkBackendRuntimeSharedImports(root), /missing .*second.js/);
  await fs.appendFile(path.join(root, 'backend/Dockerfile'), 'COPY frontend/src/utils/second.js /frontend/src/utils/second.js\n');
  assert.deepEqual(checkBackendRuntimeSharedImports(root), { sharedRuntimeImports: 2, runtimeCopiesComplete: true });
  await fs.writeFile(path.join(root, 'frontend/src/utils/first.js'), "export { default as first } from './component.vue';");
  await fs.writeFile(path.join(root, 'frontend/src/utils/component.vue'), '<template>Browser only</template>');
  assert.throws(() => checkBackendRuntimeSharedImports(root), /non-Node frontend asset/);
 } finally { await fs.rm(root, { recursive: true, force: true }); }
});
