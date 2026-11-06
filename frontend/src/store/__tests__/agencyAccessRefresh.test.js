import {beforeEach,expect,it,vi} from 'vitest';
import {createPinia,setActivePinia} from 'pinia';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../services/api',()=>({default:api}));
import {useAuthStore} from '../auth';
beforeEach(()=>{localStorage.clear();setActivePinia(createPinia());vi.clearAllMocks();});
it('keeps the latest company role when an older company refresh finishes later',async()=>{
 const auth=useAuthStore();auth.user={id:5,role:'provider',agencyAccess:{agencyId:2}};
 let first,second;
 api.get.mockImplementationOnce(()=>new Promise(resolve=>{first=resolve;})).mockImplementationOnce(()=>new Promise(resolve=>{second=resolve;}));
 const oldRequest=auth.refreshUser(),newRequest=auth.refreshUser();
 second({data:{id:5,role:'admin',agencyAccess:{agencyId:6},capabilities:{canManageHiring:true}}});await newRequest;
 first({data:{id:5,role:'provider',agencyAccess:{agencyId:2},capabilities:{canManageHiring:false}}});await oldRequest;
 expect(auth.user.role).toBe('admin');expect(auth.user.agencyAccess.agencyId).toBe(6);expect(auth.user.capabilities.canManageHiring).toBe(true);
});
