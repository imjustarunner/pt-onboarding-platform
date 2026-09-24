import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({user:vi.fn(),list:vi.fn(),away:vi.fn(),clear:vi.fn(),execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:mocks.user}}));
vi.mock('../../models/UserPresenceStatus.model.js',()=>({default:{isPrivilegedRole:r=>['admin','support','super_admin','clinical_practice_assistant'].includes(r)}}));
vi.mock('../../controllers/presence.controller.js',()=>({listAgencyPresence:mocks.list,setAwayStatus:mocks.away,clearMyPresenceStatus:mocks.clear}));
import {getQuickPresence,postQuickAway,postQuickPresenceClear,recordQuickPresenceActivity} from '../../controllers/quickViewPresence.controller.js';
const request=()=>({quickView:{userId:1,agencyId:7},headers:{},params:{agencyId:99},query:{role:'provider',agencyId:99},body:{agencyId:99,extendSession:true,reason:'meal'}});
const response=()=>{const res={json:vi.fn(),status:vi.fn()};res.status.mockReturnValue(res);return res;};
beforeEach(()=>{vi.clearAllMocks();mocks.user.mockResolvedValue({role:'admin'});});
describe('Quick View presence access',()=>{
 it('uses the session tenant and returns privileged teammates with timeout details only',async()=>{
   mocks.list.mockImplementation(async(req,res)=>res.json([{id:2,role:'admin',status:'idle',session_phase:'timedown',email:'private@example.org'},{id:3,role:'provider'}]));
   const req=request(),res=response(),json=res.json;await getQuickPresence(req,res,vi.fn());
   expect(req.params.agencyId).toBe('7');expect(req.query).toEqual({});
   expect(json.mock.calls[0][0]).toMatchObject({enabled:true,people:[{id:2,session_phase:'timedown'}]});
   expect(json.mock.calls[0][0].people[0]).not.toHaveProperty('email');
 });
 it('rejects status changes for nonprivileged users',async()=>{
   mocks.user.mockResolvedValue({role:'provider'});const res=response();await postQuickAway(request(),res,vi.fn());
   expect(res.status).toHaveBeenCalledWith(403);expect(mocks.away).not.toHaveBeenCalled();
 });
 it('fails closed if the account no longer exists',async()=>{
   mocks.user.mockResolvedValue(null);const res=response();await getQuickPresence(request(),res,vi.fn());
   expect(res.json).toHaveBeenCalledWith({enabled:false,people:[]});expect(mocks.list).not.toHaveBeenCalled();
 });
 it('sets only the signed-in user’s status and does not extend portal security',async()=>{
   const req=request();await postQuickAway(req,response(),vi.fn());
   expect(req.user.id).toBe(1);expect(req.body).toMatchObject({agencyId:7,extendSession:false,reason:'meal'});expect(mocks.away).toHaveBeenCalled();
   await postQuickPresenceClear(request(),response(),vi.fn());expect(mocks.clear).toHaveBeenCalled();
 });
});

it('reflects deliberate Quick View use as active presence for privileged users only',async()=>{
 await recordQuickPresenceActivity({userId:1,agencyId:7});
 expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining("session_phase='active'"),[1,7]);
 mocks.execute.mockClear();mocks.user.mockResolvedValue({role:'provider'});
 await recordQuickPresenceActivity({userId:1,agencyId:7});expect(mocks.execute).not.toHaveBeenCalled();
});
