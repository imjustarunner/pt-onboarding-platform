import express from 'express';
import pool from '../config/database.js';
import {authenticate,requireActiveStatus} from '../middleware/auth.middleware.js';
import {sharedLoginLimiter} from '../middleware/loginProtection.middleware.js';
import {assertSchoolPortalAccess} from '../controllers/schoolPortalIntakeLinks.controller.js';
import {fail,integer,object,hash} from '../services/schoolCareBridgeCommercialPolicy.js';
import {contractDocuments} from '../services/schoolCareBridgeContractTemplates.js';
import * as commerce from '../services/schoolCareBridgeCommerce.service.js';
import * as programs from '../services/schoolCareBridgePrograms.service.js';
import StripePaymentsService from '../services/stripePayments.service.js';
const router=express.Router(),wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
router.get('/programs',sharedLoginLimiter({identify:true}),wrap(async(_req,res)=>res.json({programs:await programs.publicCatalog()})));
router.use('/operations',authenticate,requireActiveStatus,(_q,r,n)=>{r.set('Cache-Control','no-store');n();});
router.get('/operations/workspace',wrap(async(req,res)=>{
 const canManage=await commerce.isOperator(req.user),a=await commerce.operator();
 const [bookings]=await pool.execute(`SELECT b.*,p.title,p.presenter_name,s.name AS school_name FROM schoolcarebridge_bookings b JOIN schoolcarebridge_programs p ON p.id=b.program_id JOIN agencies s ON s.id=b.school_agency_id WHERE b.operator_agency_id=? ${canManage?'':'AND b.requester_user_id=?'} ORDER BY b.id DESC LIMIT 300`,canManage?[a.id]:[a.id,req.user.id]);
 const [invoices]=await pool.execute(`SELECT i.* FROM schoolcarebridge_invoices i LEFT JOIN schoolcarebridge_bookings b ON b.id=i.booking_id WHERE i.operator_agency_id=? ${canManage?'':"AND i.kind='booking' AND b.requester_user_id=?"} ORDER BY i.id DESC LIMIT 300`,canManage?[a.id]:[a.id,req.user.id]);
 const result={canManage,operator:a,bookings:bookings.map(b=>({...b,quote:object(b.quote_json),completion:object(b.completion_json)})),invoices:invoices.map(commerce.publicInvoice)};
 if(canManage){
  const [rows]=await pool.execute('SELECT * FROM schoolcarebridge_programs WHERE operator_agency_id=? ORDER BY title',[a.id]);result.programs=rows.map(p=>({...programs.publicProgram(p),presenterUserId:p.presenter_user_id,financeProgramId:p.finance_program_id,registrationClassId:p.registration_class_id,registrationEventId:p.registration_event_id,published:!!p.published,revision:p.revision}));
  const t=await commerce.terms();result.commercial={...t,terms_json:undefined,documents:contractDocuments(t.terms,t.revision).map(({key,title})=>({key,title})),reviewHash:hash(contractDocuments(t.terms,t.revision).map(d=>d.html))};
  const [[f]]=await pool.execute('SELECT enabled FROM finance_organizations WHERE agency_id=?',[a.id]);result.financeEnabled=!!f?.enabled;
  if(result.financeEnabled){
   [result.financePrograms]=await pool.execute("SELECT id,name FROM finance_programs WHERE agency_id=? AND status='active'",[a.id]);
   [result.allocations]=await pool.execute('SELECT a.id,a.name,b.program_id,b.grant_id,b.fund_id FROM finance_allocations a JOIN finance_budgets b ON b.id=a.budget_id AND b.agency_id=a.agency_id WHERE a.agency_id=?',[a.id]);
   [result.contractEvidence]=await pool.execute("SELECT id,name,created_at FROM finance_documents WHERE agency_id=? AND kind='contract' AND mime='application/pdf' ORDER BY id DESC",[a.id]);
  }
  [result.presenters]=await pool.execute('SELECT DISTINCT u.id,u.first_name,u.last_name FROM users u JOIN user_agencies ua ON ua.user_id=u.id LEFT JOIN schoolcarebridge_partners p ON p.agency_id=ua.agency_id AND p.is_active=1 WHERE u.is_active=1 AND ua.is_active=1 AND (ua.agency_id=? OR p.agency_id IS NOT NULL) ORDER BY u.last_name,u.first_name',[a.id]);
  [result.registrationClasses]=await pool.execute('SELECT DISTINCT c.id,c.class_name FROM learning_program_classes c LEFT JOIN organization_affiliations oa ON oa.organization_id=c.organization_id AND oa.is_active=1 LEFT JOIN schoolcarebridge_partners p ON p.agency_id=oa.agency_id AND p.is_active=1 WHERE c.is_active=1 AND c.registration_eligible=1 AND (c.organization_id=? OR oa.agency_id=? OR p.agency_id IS NOT NULL) ORDER BY c.class_name',[a.id,a.id]);
  [result.registrationEvents]=await pool.execute('SELECT c.id,c.title FROM company_events c LEFT JOIN schoolcarebridge_partners p ON p.agency_id=c.agency_id AND p.is_active=1 WHERE c.registration_eligible=1 AND c.ends_at>=NOW() AND (c.agency_id=? OR p.agency_id IS NOT NULL) ORDER BY c.title',[a.id]);
 }
 res.json(result);
}));
router.put('/operations/terms',wrap(async(req,res)=>res.json(await commerce.saveTerms(req.user,req.body))));
router.post('/operations/terms/activate',wrap(async(req,res)=>res.json(await commerce.activateTerms(req.user,req.body))));
router.get('/operations/contracts/:key',wrap(async(req,res)=>{await commerce.requireOperator(req.user);const t=await commerce.terms(),d=contractDocuments(t.terms,t.revision).find(d=>d.key===req.params.key);if(!d)throw fail(404,'Contract not found.');res.set({'Content-Type':'text/html; charset=utf-8','Content-Disposition':`attachment; filename="schoolcarebridge-${d.key}-r${t.revision}.html"`,'X-Content-Type-Options':'nosniff'}).send(d.html);}));
router.post('/operations/programs',wrap(async(req,res)=>res.status(201).json(await programs.saveProgram(req.user,null,req.body))));
router.put('/operations/programs/:id',wrap(async(req,res)=>res.json(await programs.saveProgram(req.user,integer(req.params.id,1),req.body))));
router.post('/operations/bookings',wrap(async(req,res)=>{if(!['school_staff','admin','super_admin'].includes(req.user.role))throw fail(403,'A school staff member or agency administrator must request the booking.');await assertSchoolPortalAccess(req,integer(req.body.schoolId,1));res.status(201).json(await programs.createBooking(req.user,req.body));}));
router.post('/operations/bookings/:id/accept',wrap(async(req,res)=>{const b=await programs.bookingAccess(req.user,integer(req.params.id,1));await assertSchoolPortalAccess(req,b.school_agency_id);res.json(await programs.acceptQuote(req.user,b.id,req.body));}));
for(const [action,handler] of Object.entries({quote:programs.quoteBooking,expenses:programs.prepareBookingExpenses,confirm:programs.confirmBooking,complete:programs.completeBooking,cancel:programs.cancelBooking}))router.post(`/operations/bookings/:id/${action}`,wrap(async(req,res)=>res.json(await handler(req.user,integer(req.params.id,1),req.body))));
router.post('/operations/usage/capture',wrap(async(req,res)=>{if(req.user.role!=='super_admin')throw fail(403,'Platform administrator required.');res.json(await commerce.captureUsage(req.user));}));
router.get('/operations/usage/:month',wrap(async(req,res)=>{await commerce.requireOperator(req.user);res.json(await commerce.usagePreview(req.params.month));}));
router.post('/operations/usage/:month/invoice',wrap(async(req,res)=>res.json(await commerce.issueUsageInvoice(req.user,req.params.month))));
router.get('/operations/invoices/:id/print',wrap(async(req,res)=>{const i=await commerce.invoiceAccess(req.user,integer(req.params.id,1)),t=await commerce.terms();res.set({'Content-Type':'text/html; charset=utf-8','Content-Disposition':`attachment; filename="schoolcarebridge-invoice-${i.id}.html"`}).send(commerce.invoiceHtml(i,t.terms));}));
router.post('/operations/invoices/:id/payment',wrap(async(req,res)=>res.json(await commerce.startPayment(req.user,integer(req.params.id,1)))));
router.post('/operations/invoices/:id/refresh',wrap(async(req,res)=>res.json(await commerce.refreshPayment(req.user,integer(req.params.id,1)))));
router.post('/operations/invoices/:id/refund',wrap(async(req,res)=>res.json(await commerce.refundInvoice(req.user,integer(req.params.id,1),req.body))));
router.post('/operations/invoices/:id/void',wrap(async(req,res)=>{await commerce.requireOperator(req.user);const id=integer(req.params.id,1);await commerce.invoiceAccess(req.user,id,{platformManage:true});if(!String(req.body.reason||'').trim())throw fail(400,'Enter the reason for voiding this invoice.');await commerce.transaction(async c=>{const [[i]]=await c.execute('SELECT * FROM schoolcarebridge_invoices WHERE id=? FOR UPDATE',[id]);if(i.status!=='open')throw fail(409,'Only an unpaid invoice can be voided.');if(i.stripe_payment_intent_id){const pi=await StripePaymentsService.cancelPaymentIntent(i.stripe_payment_intent_id,i.stripe_account_id);if(pi.status!=='canceled')throw fail(409,'The payment needs reconciliation before voiding.');}await c.execute("UPDATE schoolcarebridge_invoices SET status='void' WHERE id=?",[id]);await commerce.audit(c,req.user,'invoice_voided','invoice',id,{reason:String(req.body.reason).slice(0,2000)});});res.json({id,status:'void'});}));
export default router;
