import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const handlers=vi.hoisted(()=>({request:null,error:null}));
vi.mock('axios',()=>({default:{create:()=>({interceptors:{request:{use:handler=>handlers.request=handler},response:{use:(_ok,error)=>handlers.error=error}}})}}));
import '../../services/api.js';
import {activateFamilyDevice,clearFamilyDevice,familyDeviceContext} from '../familyContext.js';
beforeEach(()=>{localStorage.clear();sessionStorage.clear();});afterEach(clearFamilyDevice);
it('uses only the in-memory scoped family credential and approved API host even when staff credentials exist',()=>{
 localStorage.setItem('authToken','unrelated-staff-token');const onLocked=vi.fn();activateFamilyDevice({sessionToken:'family-only',apiOrigin:'https://auricwell.com',onLocked});
 const request=handlers.request({url:'/guardian-portal/overview',headers:{Authorization:'Bearer unrelated-staff-token'},withCredentials:true});
 expect(request).toMatchObject({baseURL:'https://auricwell.com/api',withCredentials:false,skipAuthRedirect:true,headers:{'X-Auricwell-Family':'1','X-Quick-View-Session':'family-only'}});expect(request.headers.Authorization).toBeUndefined();expect(sessionStorage.length).toBe(0);expect(localStorage.getItem('authToken')).toBe('unrelated-staff-token');clearFamilyDevice();expect(familyDeviceContext()).toBeNull();
});
it('locks the current family surface on expiry while ignoring an old account response',async()=>{
 const onLocked=vi.fn();activateFamilyDevice({sessionToken:'new-family',apiOrigin:'',onLocked});
 const error={config:{headers:{'X-Auricwell-Family':'1','X-Quick-View-Session':'old-family'}},response:{status:401}};await expect(handlers.error(error)).rejects.toBe(error);expect(onLocked).not.toHaveBeenCalled();
 error.config.headers['X-Quick-View-Session']='new-family';await expect(handlers.error(error)).rejects.toBe(error);expect(onLocked).toHaveBeenCalledOnce();
});
