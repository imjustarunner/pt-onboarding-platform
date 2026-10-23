import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:mocks}));
import {exchangeDeliveryHistory,withExchangeLock,enrollExchangeAuditClient,terminalDelivery} from '../clientExchangeAudit.service.js';
import {buildExchangeAuditReport} from '../../utils/clientExchangeAuditReport.js';
beforeEach(()=>vi.clearAllMocks());
it('imports exact historical listing receipts without confusing listing 9 with 90',async()=>{
  mocks.execute.mockImplementation(async sql=>{
    if(sql.includes('FROM client_exchange_match_audits'))return [[]];
    if(sql.includes('FROM user_communications'))return [[{id:1,user_id:7,body:'?listingId=90&agencyId=2',delivery_status:'sent'},{id:2,user_id:8,body:'?listingId=9&amp;agencyId=2',delivery_status:'sent',metadata:{fromEmail:'notifications@itsco.health'}}]];
    if(sql.includes('FROM notification_sms_logs'))return [[{id:3,user_id:8,status:'sent',twilio_sid:'receipt'}]];
    return [[{id:4,user_id:8}]];
  });
  const history=await exchangeDeliveryHistory({id:9,agencyId:2});
  expect(history.has(7)).toBe(false);expect(history.get(8)).toMatchObject({notificationId:4,email:{status:'sent',communicationId:2},sms:{status:'sent',messageId:'receipt'}});
});
it('holds a cross-process lock while delivering and releases it on errors',async()=>{
  const connection={execute:vi.fn().mockResolvedValue([[{acquired:1}]]),release:vi.fn()};mocks.getConnection.mockResolvedValue(connection);
  await expect(withExchangeLock(9,()=>{throw Error('failed');})).rejects.toThrow('failed');
  expect(connection.execute).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)',['client-exchange:9']);expect(connection.release).toHaveBeenCalled();
  connection.execute.mockResolvedValue([[{acquired:0}]]);const work=vi.fn();expect(await withExchangeLock(9,work)).toEqual({busy:true});expect(work).not.toHaveBeenCalled();
});
it('caps the pilot at 50 distinct clients and preserves an existing enrollment',async()=>{
  const connection={execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};mocks.getConnection.mockResolvedValue(connection);
  connection.execute.mockImplementation(async sql=>sql.includes('SELECT ordinal')?[[]]:sql.includes('MAX(ordinal)')?[[{last_slot:50}]]:[[{}]]);
  expect(await enrollExchangeAuditClient({id:99,agencyId:2,clientId:400},{enabled:true,limit:50})).toBeNull();
  expect(connection.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
  connection.execute.mockImplementation(async sql=>sql.includes('SELECT ordinal')?[[{ordinal:2}]]:[[{}]]);
  expect(await enrollExchangeAuditClient({id:100,agencyId:2,clientId:400},{enabled:true})).toBe(2);
});
it('never automatically retries uncertain or queued sends',()=>{
  for(const status of ['sending','unknown','queued','sent','delivered','redirected'])expect(terminalDelivery({status})).toBe(true);
  expect(terminalDelivery({status:'failed'})).toBe(false);
});
it('renders support explanations without client names, initials, or clinical free text',()=>{
  const report=buildExchangeAuditReport({agencyName:'ITSCO',ordinal:1,link:'https://example.test/?listingId=9',listing:{id:9,clientInitials:'PRIVATE',fullName:'Private Client',presentingProblems:['Private clinical narrative']},audit:{views:{total:4,unique_viewers:2},providers:[{userId:7,name:'<img src=x>',email:'provider@example.com',matched:false,checks:[{status:'fail',reason:'Age does not overlap'},{status:'unknown',reason:'Schedule needs review'}],emailDelivery:{status:'skipped',reason:'Opted out'},smsDelivery:{status:'sent'},views:2}],viewers:[]}});
  expect(report.reportHtml).toContain('Age does not overlap');expect(Buffer.from(report.attachments[0].contentBase64,'base64').toString()).toContain('Opted out');expect(report.text).toContain('Earlier listing views were not tracked');
  expect(report.reportHtml).toContain('&lt;img');expect(report.reportHtml).not.toContain('<img');expect(report.html).not.toContain('<table');expect(JSON.stringify(report)).not.toMatch(/PRIVATE|Private Client|Private clinical narrative/);
});

it('keeps a large agency report below email logging limits and includes every provider in the attachment',()=>{
  const providers=Array.from({length:200},(_,i)=>({userId:i+1,name:`Provider ${i}`,email:`p${i}@example.com`,matched:false,checks:[{field:'format',status:'fail',reason:'No compatible visit format is open for new clients.'},{field:'schedule',status:'unknown',reason:'Schedule needs manual confirmation.'}],emailDelivery:{status:'skipped'},smsDelivery:{status:'skipped'},views:0}));
  const report=buildExchangeAuditReport({agencyName:'ITSCO',ordinal:1,link:'https://example.com',listing:{id:9},audit:{providers}});
  expect(Buffer.byteLength(report.html)).toBeLessThan(4000);
  expect(report.text).not.toContain('Provider 199');
  expect(report.reportHtml).toContain('Provider 199');
  expect(report.reportHtml.match(/No compatible visit format is open for new clients\./g)).toHaveLength(1);
  expect(Buffer.from(report.attachments[0].contentBase64,'base64').toString()).toContain('Provider 199');
});
