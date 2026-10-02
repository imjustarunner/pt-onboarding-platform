import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{list:vi.fn(),findById:vi.fn()}}));
vi.mock('../../models/NotificationTrigger.model.js',()=>({default:{findByKey:vi.fn()}}));
vi.mock('../../models/AgencyNotificationTriggerSetting.model.js',()=>({default:{listForAgency:vi.fn(async()=>[])}}));
vi.mock('../emailSettings.service.js',()=>({getAgencyEmailSettings:vi.fn(async()=>({templateSenderIdentityIds:{},defaultSenderIdentityId:null}))}));
import Identity from '../../models/EmailSenderIdentity.model.js';
import {pickPreferredSenderIdentity,resolveConfiguredSenderIdentity,resolvePreferredSenderIdentityForAgency} from '../emailSenderIdentityResolver.service.js';
const personal={id:264,agency_id:280,identity_key:'personal_1',from_email:'superadmin@example.test',is_active:1};
const notifications={id:6,agency_id:2,identity_key:'notifications',from_email:'notifications@tenant.test',is_active:1};
beforeEach(()=>vi.clearAllMocks());
it('never substitutes the first personal identity when a requested role is missing',()=>{
 expect(pickPreferredSenderIdentity([personal],['notifications'])).toBeNull();
 expect(pickPreferredSenderIdentity([personal],[])).toBeNull();
});
it('falls through a school personal identity to the caring tenant notifications alias',async()=>{
 Identity.list.mockImplementation(async ({agencyId})=>agencyId===280?[personal]:[notifications]);
 expect(await resolveConfiguredSenderIdentity({agencyId:2,schoolOrganizationId:280,includePlatformDefaults:false})).toEqual(notifications);
});
it('selects notifications by default rather than any first mailbox',async()=>{
 Identity.list.mockResolvedValue([personal,notifications]);
 expect(await resolvePreferredSenderIdentityForAgency({agencyId:2})).toEqual(notifications);
});
it('returns no sender if no requested alias is configured',async()=>{
 Identity.list.mockResolvedValue([personal]);
 expect(await resolveConfiguredSenderIdentity({agencyId:2,schoolOrganizationId:280})).toBeNull();
});
