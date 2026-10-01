import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),save:vi.fn(),pdf:vi.fn(),encrypt:vi.fn(),member:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../documentSigning.service.js',()=>({default:{convertHTMLToPDF:m.pdf}}));
vi.mock('../storage.service.js',()=>({default:{saveAdminDoc:m.save}}));
vi.mock('../meetingJoinPolicy.service.js',()=>({hasActiveMeetingMembership:m.member}));
vi.mock('../../controllers/supervisionSessions.controller.js',()=>({finalizeSupervisionSession:vi.fn()}));
import {hashDob} from '../../models/SessionRecordingConsent.model.js';
import {documentHash,validateAgreementSignature,renderRecordingAgreement} from '../recordingAgreementDocument.service.js';
import {ensureSupervisionAgreement,assertOnboardingSupervisionAgreements} from '../supervisionAgreement.service.js';
import {validateManualSupervision} from '../../controllers/supervisionManual.controller.js';
beforeEach(()=>vi.clearAllMocks());
describe('agreement signature evidence',()=>{
 it('accepts MySQL DATE objects when matching a client’s existing waiver',()=>{expect(hashDob(new Date('2000-01-02T00:00:00Z'))).toBe(hashDob('2000-01-02'));});
 it('requires explicit acceptance for a typed signature',()=>{expect(()=>validateAgreementSignature({typedName:'Rachel'})).toThrow(/agree/);expect(validateAgreementSignature({accepted:true,typedName:'Rachel'},{userId:8})).toMatchObject({typedName:'Rachel',userId:8,accepted:true});});
 it('rejects script/image markup even alongside a typed name',()=>{expect(()=>validateAgreementSignature({accepted:true,typedName:'Rachel',signatureData:'data:image/svg+xml,<svg onload=alert(1)>'})).toThrow();});
 it('binds document changes to a different hash and safely escapes branding and names',()=>{const doc={title:'Agreement',agencyName:'<script>alert(1)</script>',text:'User terms',parties:[{role:'Supervisor',name:'<img onerror=alert(1)>'}]};expect(documentHash(doc)).not.toBe(documentHash({...doc,text:'Changed'}));const html=renderRecordingAgreement(doc);expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');expect(html).toContain(documentHash(doc));});
 it.each(['PENDING_SETUP','PREHIRE_OPEN','PREHIRE_REVIEW'])('does not assign signatures in %s',async status=>{m.execute.mockImplementation(async sql=>sql.includes('SELECT sa.')?[[{id:1,agency_id:2,supervisor_type:'clinical',supervisee_status:status,supervisee_role:'provider'}]]:[[{}]]);expect(await ensureSupervisionAgreement(1)).toBeNull();expect(m.execute.mock.calls.some(([q])=>q.includes('INSERT'))).toBe(false);});
 it('blocks onboarding completion when an assigned agreement lacks either signature',async()=>{m.execute.mockResolvedValue([[{id:1}]]);await expect(assertOnboardingSupervisionAgreements(8,2)).rejects.toMatchObject({status:409});});
});
describe('manual supervision validation',()=>{
 const input=()=>({reason:'The supervision took place in person.',modality:'IN_PERSON',sessionType:'individual',startAt:'2026-01-01T15:00:00Z',endAt:'2026-01-01T16:00:00Z',requestKey:'test-request-123'});
 it('requires a reason even for in-person supervision',()=>{expect(()=>validateManualSupervision({...input(),reason:''})).toThrow(/Explain/);});
 it('rejects reversed, excessive, and future hours',()=>{expect(()=>validateManualSupervision({...input(),endAt:'2026-01-01T14:00:00Z'})).toThrow(/valid/);expect(()=>validateManualSupervision({...input(),endAt:'2026-01-02T16:00:00Z'})).toThrow(/eight/);expect(()=>validateManualSupervision({...input(),startAt:'2099-01-01T15:00:00Z',endAt:'2099-01-01T16:00:00Z'})).toThrow(/already/);});
 it('accepts an explained historical log without requiring it to have been recorded',()=>{expect(validateManualSupervision(input())).toMatchObject({modality:'IN_PERSON',sessionType:'individual'});});
});
