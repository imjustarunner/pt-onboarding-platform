import { describe, it, expect } from 'vitest';
import { appVersionPlugin } from './app-version-plugin.mjs';
function metadata(env) {
  const p=appVersionPlugin(env); let asset; p.generateBundle.call({emitFile:value=>{asset=value;}});
  return {embedded:JSON.parse(p.config().define['import.meta.env.VITE_APP_BUILD_ID']),manifest:JSON.parse(asset.source),name:asset.fileName};
}
describe('build provenance', () => {
  it('embeds the same release as the generated manifest', () => {
    const r=metadata({VITE_APP_BUILD_ID:'ci-release'}); expect(r.name).toBe('version.json'); expect(r.embedded).toBe(r.manifest.buildId); expect(r.manifest.requiredBackendBuildId).toBe('ci-release');
  });
  it.each([{}, {VITE_APP_BUILD_ID:'dev'}])('gives manual builds a unique consistent identity without claiming backend readiness', env => {
    const r=metadata(env); expect(r.embedded).toBe(r.manifest.buildId); expect(r.embedded).toMatch(/^local-/); expect(r.manifest.requiredBackendBuildId).toBeNull(); expect(metadata(env).embedded).not.toBe(r.embedded);
  });
  it('supports explicitly identified separate backend builds', () => {
    expect(metadata({VITE_APP_BUILD_ID:'front',VITE_REQUIRED_BACKEND_BUILD_ID:'back'}).manifest.requiredBackendBuildId).toBe('back');
  });
});
