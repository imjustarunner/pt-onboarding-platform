import {afterEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Component from '../ProviderSchoolsPrograms.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
const global={stubs:{RouterLink:{props:['to'],template:'<a :href="to"><slot/></a>'}}};
let w;afterEach(()=>{w?.unmount();vi.clearAllMocks();});
it('opens assigned portals on the current signed-in origin without a new window',async()=>{
 api.get.mockResolvedValue({data:[{schoolOrganizationId:451,name:'Cedar Grove',schoolSlug:'auricwell-qa-demo-school'}]});
 w=mount(Component,{props:{agencyId:450,userId:1433,compact:true},global});await flushPromises();
 expect(w.get('a').attributes('href')).toBe('/schoolcarebridge/app/auricwell-qa-demo-school');
 expect(w.get('a').attributes('target')).toBeUndefined();
 expect(api.get).toHaveBeenCalledExactlyOnceWith('/payroll/me/assigned-schools',{params:{agencyId:450},skipGlobalLoading:true});
 await w.get('button').trigger('click');expect(w.emitted('open')).toHaveLength(1);
});
it('rejects arbitrary external addresses and renders a useful empty state',async()=>{
 api.get.mockResolvedValue({data:[{schoolOrganizationId:451,name:'Unsafe',schoolSlug:'https://other.example/path'}]});
 w=mount(Component,{props:{agencyId:450,userId:1433},global});await flushPromises();expect(w.find('a').exists()).toBe(false);expect(w.text()).toContain('No active assigned schools');
});
