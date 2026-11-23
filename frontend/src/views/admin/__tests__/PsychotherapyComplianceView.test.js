import {it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:2}})}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn(async()=>({data:{matched:[],unmatched:[]}}))}}));
import api from '../../../services/api';
import View from '../PsychotherapyComplianceView.vue';
it('keeps prior July fiscal years available after replacing the legacy import panel',async()=>{
 const w=mount(View,{global:{stubs:{RouterLink:true,SessionCountImport:true}}});await flushPromises();
 const picker=w.get('select'),years=picker.findAll('option').map(option=>option.element.value);expect(years).toHaveLength(3);
 await picker.setValue(years[1]);await flushPromises();expect(api.get).toHaveBeenLastCalledWith('/psychotherapy-compliance/summary',{params:{agencyId:2,fiscalYearStart:years[1]}});w.unmount();
});
