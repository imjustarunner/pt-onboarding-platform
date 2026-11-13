import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),recipient:vi.fn(),intake:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../clientUpdate.service.js',()=>({currentClientUpdateRecipient:m.recipient}));
vi.mock('../intakeCommunicationChoices.service.js',()=>({latestIntakeCommunicationChoices:m.intake}));
import {familyNotificationDeliveryGate} from '../familyNotificationChoices.service.js';
const input={agencyId:2,clientId:5,to:'caregiver@example.invalid',channel:'email',templateType:'client_update'};
beforeEach(()=>{vi.clearAllMocks();m.recipient.mockResolvedValue({});m.intake.mockResolvedValue(null);m.execute.mockImplementation(async sql=>sql.includes('FROM family_notification_choices')?[[{choices_json:{documents:'email'}}]]:[[]]);});
it.each(['client_update','client_portal_share'])('revalidates current portal authority for %s on the real delivery gate, including approval retries',async templateType=>{m.recipient.mockRejectedValue(Object.assign(new Error('Clinical grant revoked'),{status:403}));expect(await familyNotificationDeliveryGate({...input,templateType})).toEqual({allowed:false,reason:'client_update_portal_access_changed'});expect(m.execute).not.toHaveBeenCalled();});
it('preserves document-notification opt-outs even when a staff member selected the update',async()=>{m.execute.mockImplementation(async sql=>sql.includes('FROM family_notification_choices')?[[{choices_json:{documents:'off'}}]]:[[]]);expect(await familyNotificationDeliveryGate(input)).toEqual({allowed:false,reason:'family_notification_category_off'});});
it('preserves confidential no-automatic-email instructions',async()=>{m.intake.mockResolvedValue({noAutomaticEmail:true,recipientEmail:input.to});expect(await familyNotificationDeliveryGate(input)).toEqual({allowed:false,reason:'enrollment_automatic_email_off'});});
it('does not add a new SMS route',async()=>{expect(await familyNotificationDeliveryGate({...input,channel:'sms'})).toEqual({allowed:false,reason:'client_updates_email_only'});expect(m.recipient).not.toHaveBeenCalled();});
it('permits the current authorized contact with document email enabled',async()=>{expect(await familyNotificationDeliveryGate(input)).toEqual({allowed:true});expect(m.recipient).toHaveBeenCalledWith({agencyId:2,clientId:5,to:input.to});});
it('revalidates re-enrollment at delivery and preserves document-email opt-outs without adding texts',async()=>{
 expect(await familyNotificationDeliveryGate({...input,templateType:'care_reenrollment'})).toEqual({allowed:true});expect(m.recipient).toHaveBeenCalledWith({agencyId:2,clientId:5,to:input.to,reenrollment:true});
 m.execute.mockImplementation(async sql=>sql.includes('FROM family_notification_choices')?[[{choices_json:{documents:'off'}}]]:[[]]);expect(await familyNotificationDeliveryGate({...input,templateType:'care_reenrollment'})).toMatchObject({allowed:false});
 expect(await familyNotificationDeliveryGate({...input,templateType:'care_reenrollment',channel:'sms'})).toMatchObject({allowed:false});
});
