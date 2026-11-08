import {it,expect,vi} from 'vitest';import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../../../services/api',()=>({default:{get:vi.fn()}}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'qa'}}),useRouter:()=>({push:vi.fn()})}));
import api from '../../../../services/api';import Overview from '../ClientOverviewHub.vue';import Records from '../ClientRecordsOverview.vue';
it.each([['Overview',Overview],['Records',Records]])('%s exposes uploaded packets and operational actions to support without a clinical request',async(name,component)=>{
 api.get.mockClear().mockImplementation(async url=>({data:url.endsWith('/enrollment-receipts')?[]:url.endsWith('/paper-packet-documents')?{documents:[{id:4109,original_name:'Synthetic paper.pdf',scan_status:'pending'}]}:{school_roi_signing:{completed_documents:[]}}}));
 const w=mount(component,{props:{clientId:2438,client:{id:2438,client_type:'school'},canProcessPaper:true,canViewMedicalRecord:false,operationalOnly:true,agencyId:450},global:{stubs:{ClientCareTimeline:true}}});await flushPromises();
 expect(w.text()).toContain('Synthetic paper.pdf');expect(api.get.mock.calls.some(([url])=>/chart-artifacts|medical-billing/.test(url))).toBe(false);
 await w.findAll('button').find(b=>b.text().toLowerCase().includes('process paper packet')).trigger('click');expect(w.emitted('client-actions')).toHaveLength(1);
 await w.findAll('button').find(b=>b.text().startsWith('Upload')).trigger('click');expect(w.emitted('upload')).toHaveLength(1);w.unmount();
});
