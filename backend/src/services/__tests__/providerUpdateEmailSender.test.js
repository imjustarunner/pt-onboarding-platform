import {beforeEach,it,expect,vi} from 'vitest';
const list=vi.hoisted(()=>vi.fn());
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{list}}));
import {resolveProviderUpdateSender} from '../providerUpdateEmailSender.service.js';
beforeEach(()=>vi.clearAllMocks());
it('uses the current agency PO address for From and Reply-To, not Technology or a default mailbox',async()=>{list.mockResolvedValue([{id:1,agency_id:3,from_email:'po@other.test'},{id:2,agency_id:2,from_email:'technology@itsco.health'},{id:3,agency_id:2,from_email:'PO@itsco.health',reply_to:'technology@itsco.health',is_active:1}]);const result=await resolveProviderUpdateSender(2);expect(result.identity.id).toBe(3);expect(result.replyTo).toBe('po@itsco.health');expect(list).toHaveBeenCalledWith({agencyId:2,includePlatformDefaults:false,onlyActive:true});});
it('blocks a send instead of silently choosing another sender when PO is absent or inactive',async()=>{list.mockResolvedValue([{id:1,agency_id:2,from_email:'po@itsco.health',is_active:0}]);await expect(resolveProviderUpdateSender(2)).rejects.toMatchObject({status:409});});
