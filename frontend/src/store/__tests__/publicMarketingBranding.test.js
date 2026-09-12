import {afterEach,describe,expect,it,vi} from 'vitest';
import {createPinia,setActivePinia} from 'pinia';
import {useBrandingStore} from '../branding';
import api from '../../services/api';
vi.mock('../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
describe('standalone marketing branding',()=>{
 for(const pathname of ['/p/mh4kidz','/p/mh4kidz/about','/p/range','/p/rise/join']){
  it(`does not infer a tenant for ${pathname}`,async()=>{
   setActivePinia(createPinia());const store=useBrandingStore();
   vi.stubGlobal('window',{location:{hostname:'app.mh4kidz.com',pathname}});
   await store.initializePortalTheme();expect(api.get).not.toHaveBeenCalled();expect(store.portalAgency).toBeFalsy();
  });
 }
});
