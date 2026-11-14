import {beforeEach,describe,expect,it,vi} from 'vitest';
import {PDFDocument} from 'pdf-lib';
const mocks=vi.hoisted(()=>({execute:vi.fn(),db:vi.fn(),release:vi.fn(),receipt:vi.fn(),sender:vi.fn(),context:vi.fn(),send:vi.fn(),isTest:vi.fn(),state:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute,getConnection:async()=>({execute:mocks.db,release:mocks.release})}}));
vi.mock('../familyLedger/views.js',()=>({receiptFor:mocks.receipt,renderReceiptPdf:async receipt=>(await import('../familyLedger/receiptDocument.js')).brandedReceiptPdf(receipt)}));
vi.mock('../familyLedger/copayCredits.js',()=>({paymentCreditState:mocks.state}));
vi.mock('../familyLedger/senders.js',()=>({requireReadySender:mocks.sender}));
vi.mock('../clientPortalEmail.service.js',()=>({clientEmailContext:mocks.context,sendClientPortalEmail:mocks.send}));
vi.mock('../guardianTestAccess.service.js',()=>({isGuardianTestAccountId:mocks.isTest}));
import {buildReceiptEmail,receiptLinks,sendPendingReceiptEmails,COPAY_CANCELLATION_NOTICE} from '../familyLedger/receiptEmails.js';
import {brandedReceiptPdf} from '../familyLedger/receiptDocument.js';
const receipt={receiptNumber:'R-2-91',agencyName:'Synthetic Care & Support',payerName:'DEMO QA Payer',amountCents:2500,currency:'USD',receivedAt:'2026-11-03T17:00:00Z',responsibilityType:'Copay',method:'Visa ending in 4242',refundedCents:0,netPaidCents:2500};
const context={brand:{clinical:true,displayName:'AuricWell Portal'},url:path=>`https://auricwell.com/itsco/${path}`};
beforeEach(()=>{
 vi.clearAllMocks();mocks.isTest.mockResolvedValue(false);mocks.sender.mockResolvedValue({id:7});mocks.context.mockResolvedValue(context);mocks.receipt.mockResolvedValue({...receipt});mocks.state.mockResolvedValue({availableCents:2500,appliedCents:0});mocks.send.mockResolvedValue({id:'sent-91',communicationId:100});
 mocks.execute.mockImplementation(async sql=>sql.startsWith('SELECT d.')?[[{id:1,agency_id:2,payment_id:91,kind:'payment'}]]:[{affectedRows:1}]);
 mocks.db.mockImplementation(async(sql,args)=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.startsWith('SELECT status'))return [[{status:'pending'}]];
  if(sql.startsWith('SELECT p.*'))return [[{id:91,client_id:8,payer_user_id:5,status:'succeeded'}]];
  if(sql.startsWith('SELECT email'))return [[{email:'payer@example.com'}]];
  return [{affectedRows:1}];
 });
});
describe('branded payment receipt',()=>{
 it('labels a simulated payment in the subject and both mail bodies',()=>{
  const mail=buildReceiptEmail({receipt:{...receipt,simulated:true,responsibilityType:'Self-pay'},url:'https://example.com',refundUrl:'https://example.com/refund'});
  expect(mail.subject).toContain('qa simulation');expect(mail.text).toContain('no money moved');expect(mail.html).toContain('no money moved');expect(mail.text).not.toContain('next eligible session');
 });
 it('puts the same specific payment and refund action in HTML and plain text',()=>{
  const links=receiptLinks(context,{agencyId:2,paymentId:91});const mail=buildReceiptEmail({receipt,...links});
  expect(mail.text).toContain('$25.00');expect(mail.text).toContain(receipt.receiptNumber);expect(mail.text).toContain(links.refundUrl);
  expect(mail.html).toContain(`href="${links.refundUrl.replaceAll('&','&amp;')}"`);expect(mail.html).toContain('issue a refund at your request');
  expect(mail.text).toContain('next eligible session for the same client, payer and organization');expect(mail.text).toContain('pending refund request');expect(mail.text).not.toContain('DEMO QA Payer');
  expect(mail.html).not.toContain('onclick');expect(new URL(links.refundUrl).searchParams.get('action')).toBe('refund');
 });
 it('escapes tenant values and does not label non-copay payments with cancellation policy',()=>{
  const mail=buildReceiptEmail({receipt:{...receipt,agencyName:'<script>bad</script>',responsibilityType:'Self-pay'},url:'https://example.com',refundUrl:'https://example.com/refund'});
  expect(mail.html).not.toContain('<script>');expect(mail.html).not.toContain('session cancellation');
 });
 it('generates a real branded PDF with an embedded payment reference and multiple-page support',async()=>{
  const bytes=await brandedReceiptPdf({...receipt,portalBrand:'AuricWell',clientName:'DEMO QA Client',service:'Services',serviceDate:'2026-11-03'});
  expect(bytes.subarray(0,4).toString()).toBe('%PDF');const pdf=await PDFDocument.load(bytes);expect(pdf.getTitle()).toBe('Payment receipt R-2-91');expect(pdf.getAuthor()).toBe(receipt.agencyName);expect(pdf.getPageCount()).toBeGreaterThan(0);
  const long=await brandedReceiptPdf({...receipt,payerName:'Synthetic name '.repeat(500)});expect((await PDFDocument.load(long)).getPageCount()).toBeGreaterThan(1);
 });
 it('attaches the actual PDF bytes and sends only to the original payer through the tenant billing sender',async()=>{
  expect(await sendPendingReceiptEmails()).toEqual([{agencyId:2,paymentId:91,status:'sent'}]);
  expect(mocks.sender).toHaveBeenCalledWith(2,'billing');const mail=mocks.send.mock.calls[0][0];expect(mail).toMatchObject({billing:true,to:'payer@example.com',userId:5,templateType:'family_payment_receipt'});expect(mail.cc).toBeUndefined();expect(mail.bcc).toBeUndefined();
  expect(mail.attachments).toHaveLength(1);expect(Buffer.from(mail.attachments[0].contentBase64,'base64').subarray(0,4).toString()).toBe('%PDF');expect(mail.html).toContain('$25.00');
 });
 it('never resends when another worker owns the delivery event',async()=>{mocks.db.mockResolvedValue([[{acquired:0}]]);await sendPendingReceiptEmails();expect(mocks.send).not.toHaveBeenCalled();});
 it('holds delivery if the practice sender is not ready and never substitutes another tenant',async()=>{mocks.sender.mockRejectedValue(new Error('not ready'));await sendPendingReceiptEmails();expect(mocks.send).not.toHaveBeenCalled();expect(mocks.db).toHaveBeenCalledWith('UPDATE family_receipt_deliveries SET status=? WHERE id=?',['held',1]);});
 it('keeps ambiguous email acceptance for review instead of retrying automatically',async()=>{mocks.send.mockRejectedValue(new Error('connection interrupted'));await sendPendingReceiptEmails();expect(mocks.db).toHaveBeenCalledWith('UPDATE family_receipt_deliveries SET status=? WHERE id=?',['unknown',1]);});
 it('respects queued approval and notification preferences without claiming delivery',async()=>{mocks.send.mockResolvedValue({queued:true,communicationId:100});expect(await sendPendingReceiptEmails()).toEqual([{agencyId:2,paymentId:91,status:'held'}]);});
 it('does not send synthetic fixture receipts through scheduled delivery',async()=>{mocks.isTest.mockResolvedValue(true);await sendPendingReceiptEmails();expect(mocks.send).not.toHaveBeenCalled();});
});
