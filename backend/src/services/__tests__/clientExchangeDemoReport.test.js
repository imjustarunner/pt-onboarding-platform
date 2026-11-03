import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),send:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
import {buildDemoExchangeReport,sendDemoExchangeReport} from '../clientExchangeDemoReport.service.js';
const input={listing:{id:44,agencyId:2},agency:{id:2,name:'ITSCO',slug:'itsco',support_team_email:'support@itsco.health'},identities:[{id:7,identity_key:'client_exchange',from_email:'notifications@itsco.health'}],providers:[
 {userId:9,name:'Matching Provider',matched:true,canNotify:true,checks:[{status:'pass',reason:'Accepts the requested insurance'}]},
 {userId:10,name:'Other Provider',matched:false,checks:[{status:'fail',reason:'Does not accept the insurance'}]}]};
beforeEach(()=>{vi.resetAllMocks();m.execute.mockResolvedValue([[]]);m.send.mockResolvedValue({id:'accepted',communicationId:4});});
it("sends one clearly labeled hypothetical report only to the agency Support mailbox",async()=>{
 await expect(sendDemoExchangeReport(input)).resolves.toMatchObject({status:'sent'});
 expect(m.send).toHaveBeenCalledWith(expect.objectContaining({to:'support@itsco.health',templateType:'client_exchange_demo_audit'}));
 const payload=m.send.mock.calls[0][0];
 expect(payload.cc).toBeUndefined();expect(payload.bcc).toBeUndefined();
 expect(payload.text).toContain('Matching Provider');expect(payload.text).toContain('Other Provider');
 expect(payload.text).toContain('Does not accept the insurance');expect(payload.subject).toContain('DEMO ONLY');
});
it.each(['sent','queued','sending','unknown','redirected'])('does not repeat an already %s report',async status=>{
 m.execute.mockResolvedValue([[{status}]]);await sendDemoExchangeReport(input);expect(m.send).not.toHaveBeenCalled();
});
it('escapes provider data and avoids exposing client identity or implying historical mail was unsent',()=>{
 const report=buildDemoExchangeReport({...input,listing:{...input.listing,fullName:'Private Demo Name',email:'private@example.com'},link:'https://app.test/exchange'});
 expect(report.text).not.toContain('Private Demo Name');expect(report.html).not.toContain('private@example.com');
 expect(report.text).toContain('suppressed for this evaluation');
 const escaped=buildDemoExchangeReport({...input,providers:[{userId:1,name:'<script>',checks:[]}],link:'https://app.test/exchange'});
 expect(escaped.html).not.toContain('<script>');
});

it('holds the demo report when the agency has no Support mailbox instead of mailing providers',async()=>{
 await expect(sendDemoExchangeReport({...input,agency:{id:2}})).rejects.toMatchObject({code:'DEMO_EXCHANGE_SUPPORT_MISSING'});
 expect(m.send).not.toHaveBeenCalled();
});
