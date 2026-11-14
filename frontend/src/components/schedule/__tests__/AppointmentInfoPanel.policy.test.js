import {beforeEach,expect,it,vi} from 'vitest';
import {createPinia,setActivePinia} from 'pinia';
import {flushPromises,mount} from '@vue/test-utils';
import Panel from '../AppointmentInfoPanel.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
const parent={guardian_user_id:31,relationship_type:'guardian',first_name:'Parent',last_name:'Example'};
const props={clientId:21,clientName:'Example client',agencyId:2,tenantLabel:'Example practice',canOpenProvider:true,statusLabel:'scheduled',serviceLabel:'90837 + 99051 · Psychotherapy',typeLabel:'Psychotherapy',whenDateLabel:'Sunday, November 29, 2026'};
beforeEach(()=>{setActivePinia(createPinia());vi.clearAllMocks();api.get.mockImplementation(async url=>({data:url.endsWith('guardians')?[parent]:[{agency_id:2,agency_name:'Example practice'}]}));});
it('keeps one Service row, shows the weekday and unconfirmed RSVP, and omits a single agency',async()=>{
 const w=mount(Panel,{props});await flushPromises();const labels=w.findAll('.aip-k').map(item=>item.text());expect(labels).toContain('Service');expect(labels).not.toContain('Type');expect(labels).not.toContain('Agency');expect(w.text()).toContain('Sunday, November 29');expect(w.text()).toContain('99051');expect(w.findAll('.aip-badge').map(item=>item.text())).toEqual(['Unconfirmed']);w.unmount();
});
it('opens the existing guardian account through the authorized account action',async()=>{
 const w=mount(Panel,{props});await flushPromises();await w.findAll('button').find(button=>button.text()==='Parent Example').trigger('click');expect(w.emitted('open-provider')).toEqual([[31]]);w.unmount();
});
it('shows the Agency row only for multiple active affiliations',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('guardians')?[parent]:[{agency_id:2,agency_name:'Example practice'},{agency_id:3,agency_name:'Second practice'}]}));const w=mount(Panel,{props});await flushPromises();expect(w.findAll('.aip-k').map(item=>item.text())).toContain('Agency');expect(w.text()).toContain('Second practice');w.unmount();
});
it('shows a linked account without an unauthorized profile link',async()=>{
 const w=mount(Panel,{props:{...props,canOpenProvider:false}});await flushPromises();expect(w.text()).toContain('Parent Example');expect(w.findAll('button').some(button=>button.text()==='Parent Example')).toBe(false);expect(api.get.mock.calls.some(([url])=>url.endsWith('agency-affiliations'))).toBe(false);w.unmount();
});
