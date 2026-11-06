import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi} from 'vitest';
import MedicalBillingView from '../MedicalBillingView.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(async path=>({data:path.endsWith('/status')?{flags:{medicalBillingEnabled:true},claimMd:{configured:false}}:{items:[],claims:[{id:13,claim_reference:'002-2026-11-009',claim_lifecycle:'submitted'}]}}))}}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:1,slug:'manager'}})}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:10,role:'support',billingAgencyIds:[2]}})}));
vi.mock('../../../components/admin/ClaimMdWorkspace.vue',()=>({default:{template:'<div />'}}));
vi.mock('../../../components/admin/MedicalBillingReportsPanel.vue',()=>({default:{template:'<div />'}}));
vi.mock('../../../components/clinical/ClinicalNoteCosignReview.vue',()=>({default:{template:'<div />'}}));
it('loads delegated billing settings without requesting chart or supervisor signing access',async()=>{
  const w=mount(MedicalBillingView,{props:{billingAgencyId:2,billingAgencySlug:'practice'},global:{stubs:{RouterLink:true}}});await flushPromises();
  expect(w.text()).toContain('Service locations');expect(w.text()).not.toContain('Client chart');expect(w.text()).not.toContain('Notes awaiting cosign');
  const paths=api.get.mock.calls.map(([path])=>path);
  expect(w.text()).toContain('002-2026-11-009');expect(w.text()).not.toContain('#13');expect(paths).toContain('/medical-billing/claims');expect(paths.some(p=>p.includes('/notes/')||p.includes('/chart'))).toBe(false);
  for(const [,options] of api.get.mock.calls)expect(options.params.agencyId).toBe(2);
  w.unmount();
});
