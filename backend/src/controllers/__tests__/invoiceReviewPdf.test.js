// All people, organizations and payment records in this fixture are synthetic.
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../../models/AgencyBillingInvoice.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn(async()=>[])}}));
vi.mock('../../utils/independentPracticeOwner.js',()=>({isIndependentPracticeOwner:vi.fn()}));
vi.mock('../../services/storage.service.js',()=>({default:{getSignedUrl:vi.fn()}}));
vi.mock('../../services/billingInvoice.service.js',()=>({default:{}}));
vi.mock('../../services/agencyBillingPayment.service.js',()=>({default:{}}));
vi.mock('../../services/quickbooksBillingSync.service.js',()=>({default:{}}));
vi.mock('../../services/businessLifecycle.service.js',()=>({createBusinessLifecycleService:vi.fn()}));
vi.mock('../../services/billingInvoicePdf.service.js',()=>({default:{generateInvoicePdf:vi.fn()}}));
import Invoice from '../../models/AgencyBillingInvoice.model.js';
import Agency from '../../models/Agency.model.js';
import { isIndependentPracticeOwner } from '../../utils/independentPracticeOwner.js';
import Storage from '../../services/storage.service.js';
import Pdf from '../../services/billingInvoicePdf.service.js';
import { downloadInvoicePdf } from '../billingInvoices.controller.js';
const proposal=()=>({id:17,agency_id:7001,status:'draft',payment_status:'unpaid',invoice_delivery_status:'not_sent',pdf_storage_path:null,
  line_items_json:{chargeLines:[{label:'Sample management service',amountCents:18000}],businessAgreement:{requiresSignatures:true,ready:false,signedOn:'',contractReference:'11111111-1111-4111-8111-111111111111'}}});
const request=(userId=4001)=>({user:{id:userId,role:'provider'},params:{invoiceId:'17'}});
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis(),set:vi.fn().mockReturnThis(),send:vi.fn().mockReturnThis(),redirect:vi.fn()});
beforeEach(()=>{
  vi.clearAllMocks();Invoice.findById.mockResolvedValue(proposal());
  isIndependentPracticeOwner.mockImplementation(async(uid,aid)=>Number(uid)===4001&&Number(aid)===7001);
  Agency.findById.mockResolvedValue({id:7001,name:'Sample Coach Practice'});
  Pdf.generateInvoicePdf.mockResolvedValue(Buffer.from('%PDF-1.7 synthetic review'));
});
it('streams an authorized owner’s explicit unsigned proposal as a private PDF without storing it',async()=>{
  const res=response(),next=vi.fn();await downloadInvoicePdf(request(),res,next);
  expect(next).not.toHaveBeenCalled();expect(Pdf.generateInvoicePdf).toHaveBeenCalledWith({agencyName:'Sample Coach Practice',invoice:proposal()});
  expect(res.set).toHaveBeenCalledWith({'Content-Type':'application/pdf','Content-Disposition':'inline; filename="invoice-17-review.pdf"','Cache-Control':'no-store'});
  expect(res.send).toHaveBeenCalledWith(Buffer.from('%PDF-1.7 synthetic review'));expect(Storage.getSignedUrl).not.toHaveBeenCalled();
});
it('rejects a provider from another company before reading its business name or generating a PDF',async()=>{
  const res=response();await downloadInvoicePdf(request(4999),res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);expect(Agency.findById).not.toHaveBeenCalled();expect(Pdf.generateInvoicePdf).not.toHaveBeenCalled();expect(res.send).not.toHaveBeenCalled();
});
it.each([
  {line_items_json:{}}, {status:'sent'}, {payment_status:'paid'}, {qbo_invoice_id:'synthetic-synced-invoice'},
  {auto_charge_attempted_at:'2026-01-05'}, {invoice_delivery_status:'sent'},
  {line_items_json:{businessAgreement:{requiresSignatures:true,ready:true,signedOn:'2026-01-05'}}}
])('keeps ordinary or previously processed missing PDFs unavailable (%j)',async patch=>{
  Invoice.findById.mockResolvedValue({...proposal(),...patch});const res=response();await downloadInvoicePdf(request(),res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(404);expect(Pdf.generateInvoicePdf).not.toHaveBeenCalled();expect(res.send).not.toHaveBeenCalled();
});
it('preserves the existing signed storage redirect when an invoice already has a PDF',async()=>{
  Invoice.findById.mockResolvedValue({...proposal(),pdf_storage_path:'uploads/synthetic-invoice.pdf'});Storage.getSignedUrl.mockResolvedValue('https://storage.example/synthetic-signed-file');
  const res=response();await downloadInvoicePdf(request(),res,vi.fn());
  expect(Storage.getSignedUrl).toHaveBeenCalledWith('uploads/synthetic-invoice.pdf',15);expect(res.redirect).toHaveBeenCalledWith(302,'https://storage.example/synthetic-signed-file');expect(Pdf.generateInvoicePdf).not.toHaveBeenCalled();
});
