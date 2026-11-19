import {mount,flushPromises} from '@vue/test-utils';
import {afterEach,it,expect,vi} from 'vitest';
import Status from '../PlotlineReleaseStatus.vue';
let w;
afterEach(()=>{w?.unmount();vi.unstubAllGlobals();});
it('shows rollout skew instead of calling a mismatched release ready, then recognizes the matching pair',async()=>{
 let backend='old';const fetch=vi.fn(async path=>({ok:true,json:async()=>path.startsWith('/version')?{schemaVersion:1,buildId:'new',requiredBackendBuildId:'new'}:{buildId:backend,ready:true}}));vi.stubGlobal('fetch',fetch);
 w=mount(Status,{props:{buildId:'new'}});await flushPromises();expect(w.attributes('data-status')).toBe('rolling-out');expect(w.text()).toContain('Keep this tab open');
 backend='new';await w.get('button').trigger('click');await flushPromises();expect(w.attributes('data-status')).toBe('ready');
 expect(fetch.mock.calls.every(([,options])=>options.credentials==='omit')).toBe(true);
});
it('preserves the current page and asks for a deliberate refresh when a newer pair is ready',async()=>{
 vi.stubGlobal('fetch',vi.fn(async path=>({ok:true,json:async()=>path.startsWith('/version')?{schemaVersion:1,buildId:'next',requiredBackendBuildId:'next'}:{buildId:'next',ready:true}})));
 w=mount(Status,{props:{buildId:'loaded'}});await flushPromises();expect(w.attributes('data-status')).toBe('update-available');expect(w.text()).toContain('Save your work');expect(w.text()).toContain('loaded');
});
it('never retains a ready label after a failed metadata check',async()=>{
 const fetch=vi.fn(async path=>({ok:true,json:async()=>path.startsWith('/version')?{schemaVersion:1,buildId:'current',requiredBackendBuildId:'current'}:{buildId:'current',ready:true}}));vi.stubGlobal('fetch',fetch);
 w=mount(Status,{props:{buildId:'current'}});await flushPromises();expect(w.attributes('data-status')).toBe('ready');fetch.mockRejectedValue(new Error('offline'));await w.get('button').trigger('click');await flushPromises();expect(w.attributes('data-status')).toBe('unconfirmed');
});
