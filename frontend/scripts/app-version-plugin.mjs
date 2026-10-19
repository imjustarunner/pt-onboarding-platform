import { randomUUID } from 'node:crypto';

// The bundle and its manifest must be produced by the same build, including
// local/manual builds that do not go through the Dockerfile.
export function appVersionPlugin(env = process.env) {
  const configured = String(env.VITE_APP_BUILD_ID || '').trim();
  const identifiedRelease = configured && !['dev', 'unknown'].includes(configured);
  const buildId = identifiedRelease ? configured : `local-${randomUUID()}`;
  const requiredBackendBuildId = String(env.VITE_REQUIRED_BACKEND_BUILD_ID || (identifiedRelease ? buildId : '')).trim() || null;
  return {
    name: 'app-version-manifest',
    config() {
      return { define: { 'import.meta.env.VITE_APP_BUILD_ID': JSON.stringify(buildId) } };
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ schemaVersion: 1, buildId, requiredBackendBuildId }) + '\n' });
    }
  };
}
