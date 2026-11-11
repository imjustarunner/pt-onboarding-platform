import {expect,it,vi} from 'vitest';
vi.mock('../../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
import {identifyMobileContext,createMobileActionAudit} from '../audit.service.js';
const context={user:{id:7,role:'support'},workspace:{id:10},device:{id:44,client_id:'web',agency_id:10}};
it('links successful device identification to the existing central request evidence',async()=>{const req={auditIdentify:vi.fn()};await identifyMobileContext(req,context);expect(req.auditIdentify).toHaveBeenCalledWith({id:7,role:'support',sessionId:'mobile:44'});expect(req.mobileAuditContext).toBe(context);});
it('does not hide an evidence failure',async()=>{await expect(identifyMobileContext({auditIdentify:async()=>{throw new Error('Evidence unavailable');}},context)).rejects.toThrow('Evidence unavailable');});
it('logs only allowlisted lifecycle events and structural metadata without request content',async()=>{const log=vi.fn(),req={body:{passcode:'DO-NOT-LOG',token:'DO-NOT-LOG'},mobileAuditContext:context};await createMobileActionAudit({log})(req,'unlocked');const event=log.mock.calls[0][1];expect(event).toMatchObject({actionType:'mobile_unlocked',userId:7,agencyId:10,targetId:44});expect(JSON.stringify(event)).not.toContain('DO-NOT-LOG');await createMobileActionAudit({log})(req,'arbitrary');expect(log).toHaveBeenCalledTimes(1);});
