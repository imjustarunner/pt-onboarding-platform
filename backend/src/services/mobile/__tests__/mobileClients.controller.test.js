import {beforeEach,expect,it,vi} from 'vitest';

vi.mock('../clientDirectory.service.js',()=>({listMobileClients:vi.fn(),mobileClientDirectoryContext:vi.fn()}));
vi.mock('../../../controllers/mobileClinical.controller.js',()=>({getMobileClientSummary:vi.fn()}));
vi.mock('../../../utils/agencyAccessContext.js',()=>({runWithAgencyAccess:vi.fn((id,fn)=>fn())}));
vi.mock('../../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
import {getMobileDirectoryClientSummary} from '../../../controllers/mobileClients.controller.js';
import {mobileClientDirectoryContext} from '../clientDirectory.service.js';
import {getMobileClientSummary} from '../../../controllers/mobileClinical.controller.js';

const request=()=>({quickView:{userId:7,agencyId:10,mobileDeviceSessionId:9},params:{clientId:'2'},query:{agencyId:'20'},headers:{'x-quick-view-session':'device-session'},body:{}});
const response=()=>({set:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()});
const context={client:{id:2,full_name:'Other Tenant',date_of_birth:'2014-04-14',client_type:'school'},actor:{id:7,role:'provider'},agency:{id:20,name:'Other agency'},clinical:true,fullProfileUrl:'https://app.example/other/admin/clients/2'};
beforeEach(()=>vi.clearAllMocks());

it('reuses clinical summary authorization in the authorized target scope without rotating the device session',async()=>{
 mobileClientDirectoryContext.mockResolvedValue(context);
 getMobileClientSummary.mockImplementation(async(req,res)=>res.json({client:{id:2,maskedName:'Oth* Ten*'},contacts:[]}));
 const req=request(),res=response(),next=vi.fn(),json=res.json;await getMobileDirectoryClientSummary(req,res,next);
 const scoped=getMobileClientSummary.mock.calls[0][0];
 expect(scoped.quickView).toMatchObject({agencyId:20,mobileDeviceSessionId:9});
 expect(scoped.headers['x-quick-view-session']).toBe('device-session');
 expect(req.quickView.agencyId).toBe(10);
 expect(json).toHaveBeenCalledWith(expect.objectContaining({agencyId:20,fullProfileUrl:context.fullProfileUrl,client:{id:2,maskedName:'Oth* Ten*'}}));
 expect(next).not.toHaveBeenCalled();
});

it('keeps basic support summaries free of clinical data and guardian contact lookups',async()=>{
 mobileClientDirectoryContext.mockResolvedValue({...context,actor:{id:7,role:'support'},clinical:false});
 const res=response();await getMobileDirectoryClientSummary(request(),res,vi.fn());
 expect(getMobileClientSummary).not.toHaveBeenCalled();
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({basicOnly:true,contacts:[],client:{id:2,maskedName:'Oth* Ten*',age:expect.any(Number)}}));
 expect(JSON.stringify(res.json.mock.calls)).not.toContain('Other Tenant');
 expect(JSON.stringify(res.json.mock.calls)).not.toContain('2014-04-14');
});

it('returns access rejection before loading clinical data',async()=>{
 mobileClientDirectoryContext.mockRejectedValue(Object.assign(Error('This client is unavailable.'),{status:404}));
 const res=response();await getMobileDirectoryClientSummary(request(),res,vi.fn());
 expect(res.status).toHaveBeenCalledWith(404);expect(getMobileClientSummary).not.toHaveBeenCalled();
});
