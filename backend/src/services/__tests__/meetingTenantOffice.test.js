import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
const execute=vi.hoisted(()=>vi.fn());
vi.mock('../../config/database.js',()=>({default:{execute}}));
import ProviderMyRoom from '../../models/ProviderMyRoom.model.js';
describe('tenant office lookup',()=>{
 it('scopes a provider room to the selected tenant instead of reusing their first office',async()=>{execute.mockImplementation(async(_sql,args)=>[[{id:args[1],user_id:args[0],agency_id:args[1],slug:`office-${args[1]}`,is_active:1}]]);const a=await ProviderMyRoom.findByUserId(5,1),b=await ProviderMyRoom.findByUserId(5,2);expect(a.slug).not.toBe(b.slug);expect(execute.mock.calls.every(([sql])=>sql.includes('AND agency_id = ?'))).toBe(true);});
 it('registers public check-in before authenticated catch-all routers',()=>{const src=readFileSync(new URL('../../server.js',import.meta.url),'utf8');const office=src.indexOf("app.use('/api/my-room', providerMyRoomRoutes)");expect(office).toBeGreaterThan(-1);for(const route of ['userCommunicationRoutes','userAdminDocsRoutes'])expect(office).toBeLessThan(src.indexOf(`app.use('/api', ${route})`));});
});
