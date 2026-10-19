import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
vi.mock('../../store/agency', () => ({useAgencyStore:()=>({currentAgency:{slug:'itsco'}})}));
import AppVersionReloadBanner from '../AppVersionReloadBanner.vue';
let wrapper, backend;
const frontend={schemaVersion:1,buildId:'test-new-release',requiredBackendBuildId:'test-new-release'};
beforeEach(()=>{
 vi.stubEnv('VITE_APP_BUILD_ID','test-current-release'); vi.useFakeTimers(); vi.setSystemTime(0); sessionStorage.clear(); backend={buildId:'old',ready:true};
 vi.stubGlobal('fetch',vi.fn(async url=>({ok:true,json:async()=>url.startsWith('/api')?backend:frontend})));
});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();});
async function tick(){await vi.advanceTimersByTimeAsync(60000);await flushPromises();}
describe('reload banner integration',()=>{
 it('only shows after backend readiness has been stable and clears after logout',async()=>{
  wrapper=mount(AppVersionReloadBanner,{props:{authenticated:true}});await flushPromises();expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  await tick();expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  backend={buildId:'test-new-release',ready:true};await tick();expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  await tick();expect(wrapper.text()).toContain('ITSCO');
  await wrapper.setProps({authenticated:false});expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  const calls=fetch.mock.calls.length;await tick();expect(fetch).toHaveBeenCalledTimes(calls);
 });
 it('keeps dismissal key events from invoking the parent reload action',async()=>{
  backend={buildId:'test-new-release',ready:true};wrapper=mount(AppVersionReloadBanner,{props:{authenticated:true}});await flushPromises();await tick();
  const count=fetch.mock.calls.length;const button=wrapper.get('button[aria-label="Dismiss"]');await button.trigger('keydown',{key:'Enter'});await flushPromises();expect(fetch).toHaveBeenCalledTimes(count);
  await button.trigger('click');expect(wrapper.find('[role="alert"]').exists()).toBe(false);
 });
});
