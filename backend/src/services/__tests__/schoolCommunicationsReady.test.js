import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),identities:vi.fn(),send:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{list:m.identities}}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({inferAgencyMailDomain:async()=> 'itsco.health'}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
import {compactSchoolCareBridgeEmail} from '../schoolCareBridgeEmail.service.js';
import {isSchoolCommunication} from '../schoolCommunicationContext.service.js';
import {sendSchoolRoiEmail,schoolRoiDelivery} from '../schoolRoiEmail.service.js';
import {emailRequiresAdminApproval} from '../emailSettings.service.js';
import {guardianCanReadIntakeDocuments} from '../../utils/guardianDocumentAccess.js';
import {guardianTestAccessAllowed,requireUnexpiredGuardianTestAccess} from '../guardianTestAccess.service.js';
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([[]]);m.identities.mockResolvedValue([{id:12,agency_id:2,from_email:'Schools@ITSCO.health'}]);m.send.mockResolvedValue({id:'accepted'});});
describe('school-wide branding',()=>{
 it('upgrades branded drafts with both learning links and giving, without duplicating the compact footer',()=>{
  const draft={templateType:'school_roi_signing',text:'Hello\nPart of the SchoolCareBridge network',html:'<p>Hello</p><table data-schoolcarebridge="compact"><tr><td>Old footer</td></tr></table>'};
  const first=compactSchoolCareBridgeEmail(draft),again=compactSchoolCareBridgeEmail({...first,templateType:draft.templateType});
  expect(again).toEqual(first);expect(first.html.match(/data-schoolcarebridge/g)).toHaveLength(1);
  expect(first.html).toContain('Learn about SchoolCareBridge');expect(first.html).toContain('Learn about MH4Kidz');expect(first.html).toContain('https://mh4kidz.org/about');expect(first.html).toContain('https://mh4kidz.org/donate');expect(first.text).toContain('Learn about MH4Kidz:');
 });
 it.each(['school_client_status_update','school_visit_reminder','school_staff_portal_access','school_staff_account_recovery','school_onboarding_invite','school_roi_signing','school_roi_signer_completion','school_portal_message','secure_message_notification_school_staff'])('brands %s and preserves a plain-text-only message in HTML',type=>{const result=compactSchoolCareBridgeEmail({templateType:type,text:'Open <your> portal'});expect(result.html).toContain('Open &lt;your&gt; portal');expect(result.html).toContain('data-schoolcarebridge');expect(result.text).toContain('SchoolCareBridge');});
 it('does not brand office intake receipts',async()=>{expect(await isSchoolCommunication({templateType:'intake_packet_completion',clientId:5})).toBe(false);expect(compactSchoolCareBridgeEmail({text:'Receipt',templateType:'intake_packet_completion'}).html).toBeUndefined();});
 it('brands school receipts using verified school context before a client exists',async()=>{m.execute.mockResolvedValue([[{id:8}]]);expect(await isSchoolCommunication({templateType:'intake_packet_completion',schoolOrganizationId:8})).toBe(true);});
});
describe('ROI immediate delivery',()=>{
 it('selects schools on the owning tenant with support replies despite old sender mappings',async()=>{await sendSchoolRoiEmail({agencyId:2,templateType:'school_roi_signing',to:'parent@example.test',senderIdentityId:1,replyToOverride:'wrong@test'});expect(m.send).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:12,replyToOverride:'support@itsco.health',usedFallbackSender:false}));});
 it('refuses a sender from another tenant',async()=>{m.identities.mockResolvedValue([{id:12,agency_id:3,from_email:'schools@itsco.health'}]);await expect(sendSchoolRoiEmail({agencyId:2})).rejects.toThrow('schools@');expect(m.send).not.toHaveBeenCalled();});
 it.each(['school_roi_signing','school_roi_signer_completion','school_roi_release','smart_school_roi'])('retires the approval hold for branded %s',async templateType=>{expect(await emailRequiresAdminApproval({agencyId:2,templateType})).toBe(false);expect(await emailRequiresAdminApproval({agencyId:2,templateType,usedFallbackSender:true})).toBe(true);});
 it.each([{blocked:true},{skipped:true},{pendingApproval:true},{id:"x",redirected:true},{id:"x",queued:true},{}])('never claims %j was sent',result=>{expect(schoolRoiDelivery(result).sent).toBe(false);});
});
describe('guardian access readiness',()=>{
 it.each([null,{access_enabled:0},{access_enabled:1,permissions_json:{canViewDocs:false}},{access_enabled:1,permissions_json:{noView:true}}])('denies revoked or restricted document access %j',link=>{expect(guardianCanReadIntakeDocuments(link)).toBe(false);});
 it('allows an active document-sharing relationship',()=>expect(guardianCanReadIntakeDocuments({access_enabled:1,permissions_json:'{"canViewDocs":true}'})).toBe(true));
 it('expires test account access, not only the sign-in token',()=>{const user={role:'client_guardian',is_demo:1,is_active:1,status_expires_at:new Date(10000)};expect(guardianTestAccessAllowed(user,9999)).toBe(true);expect(guardianTestAccessAllowed(user,10000)).toBe(false);expect(guardianTestAccessAllowed({...user,is_demo:0},9999)).toBe(false);});
 it('does not add a database lookup for real guardians',async()=>{const next=vi.fn();await requireUnexpiredGuardianTestAccess({user:{email:'real@example.test'}},{},next);expect(next).toHaveBeenCalled();expect(m.execute).not.toHaveBeenCalled();});
});
