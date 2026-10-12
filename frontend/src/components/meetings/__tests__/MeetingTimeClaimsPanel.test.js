// @vitest-environment jsdom
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Panel from '../MeetingTimeClaimsPanel.vue';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));vi.mock('../../../services/api',()=>({default:api}));
let w;const rows=[{userId:465,name:'Aunya',manualPolicy:'review',totalMinutes:30},{userId:477,name:'Destiny',manualPolicy:'review',totalMinutes:30}];
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{eligible:true,canEdit:true,canManageCompensation:true,rows}});api.post.mockResolvedValue({data:{ok:true}});});afterEach(()=>w?.unmount());
it('shows admin-only duplicate review with separate notes for each attendee',async()=>{w=mount(Panel,{props:{eventId:7}});await flushPromises();const forms=w.findAll('form');expect(forms).toHaveLength(2);await forms[0].get('textarea').setValue('Office admin time already covers this.');expect(forms[1].get('textarea').element.value).toBe('');await forms[0].trigger('submit');await flushPromises();expect(api.post).toHaveBeenCalledWith('/team-meetings/7/manual-log/465/resolve',{action:'covered',note:'Office admin time already covers this.'});});
it('does not give attendees payroll overlap controls',async()=>{api.get.mockResolvedValue({data:{eligible:true,canEdit:false,canManageCompensation:false,rows:[rows[0]]}});w=mount(Panel,{props:{eventId:7}});await flushPromises();expect(w.findAll('form')).toHaveLength(0);expect(w.text()).toContain('Payroll review is needed');});
