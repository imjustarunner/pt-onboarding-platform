import {it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
import {sendEmailFromIdentity,sendNotificationEmail} from '../unifiedEmail/unifiedEmailSender.service.js';
import {routineParentEmailGate} from '../routineParentEmailPause.service.js';
import {assertSchoolStatusEmailAudience} from '../../utils/schoolStatusEmailAudience.js';
it.each(['school_family_status_update','trigger:school_family_status_update'])('blocks the retired automatic family template before lookup/transport, including retries: %s',async templateType=>{
 m.execute.mockClear();
 await expect(sendNotificationEmail({templateType,agencyId:2,to:'parent@example.test'})).rejects.toMatchObject({code:'SCHOOL_FAMILY_ASSIGNMENT_NOTICES_RETIRED'});
 await expect(sendEmailFromIdentity({templateType,senderIdentityId:8,to:'parent@example.test',existingCommunicationId:99,source:'manual'})).rejects.toMatchObject({status:403});
 expect(await routineParentEmailGate({templateType,agencyId:2,to:'parent@example.test'},m)).toEqual({allowed:false,reason:'school_family_assignment_notices_retired'});
 expect(m.execute).not.toHaveBeenCalled();
});
it.each(['school_client_status_update','session_cancellation','school_session_notice','session_reminder','hub_email','school_contact_initial'])('preserves the separate %s notification rules',templateType=>{
 expect(()=>assertSchoolStatusEmailAudience({templateType})).not.toThrow();
});
it('cannot hide a retired trigger behind a different populated template name',async()=>{
 await expect(sendNotificationEmail({templateType:'hub_email',triggerKey:'school_family_status_update',agencyId:2,to:'parent@example.test'})).rejects.toMatchObject({status:403});
 expect(await routineParentEmailGate({templateType:'hub_email',triggerKey:'school_family_status_update'},m)).toMatchObject({allowed:false});
});
