import {beforeEach, it, expect, vi} from 'vitest';
const mocks = vi.hoisted(() => ({execute:vi.fn(), audit:vi.fn(), render:vi.fn(), send:vi.fn()}));
vi.mock('../../config/database.js', () => ({default:{execute:mocks.execute}}));
vi.mock('../clientExchangeAudit.service.js', () => ({getExchangeAudit:mocks.audit,parseAuditJson:value=>value}));
vi.mock('../clientExchangeAuditPdf.service.js', () => ({renderExchangeAuditPdf:mocks.render}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({sendEmailFromIdentity:mocks.send}));
vi.mock('../../utils/publicPortalUrl.js', () => ({buildPublicAppUrl:()=> 'https://example.test/client-exchange'}));
import {sendExchangeAuditReport} from '../clientExchangeAuditReport.service.js';
import {buildExchangeAuditReport} from '../../utils/clientExchangeAuditReport.js';
const input = {listing:{id:9,clientId:50,agencyId:2},agency:{name:'Agency',feature_flags:{clientExchangeAudit:{enabled:true,copyEmail:'owner@example.test'}}},identities:[{identity_key:'support',from_email:'support@example.test'},{identity_key:'notifications',id:4}]};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.execute.mockImplementation(async sql=>sql.includes('SELECT ordinal')?[[{ordinal:1}]]:[[]]);
  mocks.audit.mockResolvedValue({providers:[],views:{total:0}});
  mocks.render.mockResolvedValue(Buffer.from('%PDF-1.7 test report'));
  mocks.send.mockResolvedValue({id:'receipt',communicationId:10});
});
it('sends a PDF first, keeps CSV available, and keeps the detailed report out of the email body', async()=>{
  await expect(sendExchangeAuditReport(input)).resolves.toEqual({status:'sent'});
  const payload=mocks.send.mock.calls[0][0];
  expect(payload).toMatchObject({to:'support@example.test',cc:['owner@example.test'],senderIdentityId:4,templateType:'client_exchange_audit'});
  expect(payload.attachments.map(a=>a.contentType)).toEqual(['application/pdf','text/csv; charset=utf-8']);
  expect(Buffer.from(payload.attachments[0].contentBase64,'base64').toString()).toBe('%PDF-1.7 test report');
  expect(payload.html).toContain('Open the attached PDF');
  expect(payload.html).not.toContain('<table');
  expect(payload.reportHtml).toBeUndefined();
  expect(mocks.render).toHaveBeenCalledWith(expect.stringContaining('Viewing activity'));
});
it('does not send an email or mark it sent if PDF generation fails', async()=>{
  mocks.render.mockRejectedValue(Error('Renderer unavailable'));
  await expect(sendExchangeAuditReport(input)).rejects.toThrow('Renderer unavailable');
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.execute.mock.calls.some(([sql])=>/INSERT|UPDATE/.test(sql))).toBe(false);
});
it('preserves daily deduplication without regenerating or resending reports', async()=>{
  mocks.execute.mockImplementation(async sql=>sql.includes('SELECT ordinal')?[[{ordinal:1}]]:sql.includes('SELECT status')?[[{status:'sent'}]]:[[]]);
  await expect(sendExchangeAuditReport(input)).resolves.toMatchObject({skipped:true,reason:'already_attempted'});
  expect(mocks.render).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
});
it('keeps distinct unknown fields and delivery reasons beside the correct providers', ()=>{
  const providers=[{userId:1,name:'One',matched:true,checks:[{status:'pass',reason:'Age fits'},{status:'unknown',reason:'Schedule needs review'}],emailDelivery:{status:'failed',reason:'Mailbox unavailable'},views:1},
    {userId:2,name:'Two',matched:true,checks:[{status:'pass',reason:'Age fits'},{status:'unknown',reason:'Insurance needs review'}],smsDelivery:{status:'skipped',reason:'Opted out'},views:3}];
  const report=buildExchangeAuditReport({audit:{providers,viewers:[{user_id:99,first_name:'Support',last_name:'Viewer',view_count:4,last_viewed_at:'2026-10-23T12:00:00Z'}]},listing:{id:9},agencyName:'Test',ordinal:1,link:'https://example.test'});
  expect(report.reportHtml).toContain('Schedule needs review');expect(report.reportHtml).toContain('Insurance needs review');
  expect(report.reportHtml).toContain('Mailbox unavailable');expect(report.reportHtml).toContain('Opted out');
  expect(report.reportHtml).toContain('Support Viewer');expect(report.reportHtml).toContain('2026-10-23 12:00:00 UTC');
  expect(report.text).toContain('1 provider has failed, pending or uncertain deliveries');
});
it('groups identical exclusions despite different unknowns, while retaining all unknowns in the CSV', ()=>{
  const report=buildExchangeAuditReport({agencyName:'Test',listing:{id:9},ordinal:1,link:'https://example.test',audit:{providers:[
    {userId:1,name:'One',matched:false,checks:[{status:'fail',reason:'Not accepting clients'},{status:'unknown',reason:'Unverified age coverage'}]},
    {userId:2,name:'Two',matched:false,checks:[{status:'fail',reason:'Not accepting clients'},{status:'unknown',reason:'Unverified insurance coverage'}]},
    {userId:3,name:'Three',matched:false,checks:[{status:'unknown',reason:'Matching evaluation incomplete'}]}
  ]}});
  expect(report.reportHtml.match(/Not accepting clients/g)).toHaveLength(1);
  expect(report.reportHtml).toContain('Matching evaluation incomplete');
  expect(report.reportHtml).toContain('Additional unverified fields for excluded providers are retained in the CSV');
  const csv=Buffer.from(report.attachments[0].contentBase64,'base64').toString();
  expect(csv).toContain('Unverified age coverage');expect(csv).toContain('Unverified insurance coverage');
});
