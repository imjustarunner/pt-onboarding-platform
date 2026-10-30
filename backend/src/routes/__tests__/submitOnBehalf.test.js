import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
const m=vi.hoisted(()=>({execute:vi.fn(),audit:vi.fn(),calls:[],actor:{id:7,role:'admin'},employee:{id:485,role:'provider_plus',first_name:'Jacquelyne',last_name:'Fernandez'},allowed:true,eventAgency:true}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/AdminAuditLog.model.js',()=>({default:{logAction:m.audit}}));
vi.mock('../../controllers/payroll.controller.js',async()=>{
 const names=['getMyCompensation','getMyTimeCategories','listMyTimeClaims','listMyMileageClaims','listMyReimbursementClaims','listMyCompanyCardExpenses','listMyPtoRequests','getMyPtoBalances','listMyMedcancelClaims','getMyMedcancelPolicy','listMyAssignedSchoolsForPayroll','listMyAssignedOfficesForPayroll','getMyHomeAddress','getMyAgencyMileageRates','listMyAgencyHolidays','listMyExcessCompensationRules','listMyEventTime','listRecurringPayments','listMyPayroll','getMyCurrentTier','createMyTimeClaim','createMyMileageClaim','createMyReimbursementClaim','createMyCompanyCardExpense','createMyPtoRequest','createMyMedcancelClaim','updateMyHomeAddress'];
 const result=Object.fromEntries(names.map(name=>[name,(req,res)=>{m.calls.push({name,user:req.user,actor:req.actorUser,body:req.body,query:req.query});res.status(req.method==='POST'?201:200).json({userId:req.user.id,submittedByUserId:req.actorUser.id,role:req.user.role});}]));
 const {default:multer}=await import('multer');
 result.createMyReimbursementClaim=[multer().none(),result.createMyReimbursementClaim];
 return result;
});
vi.mock('../../controllers/indirectTime.controller.js',()=>({listMyIndirectServiceTypes:(req,res)=>res.json({userId:req.user.id,role:req.user.role})}));
vi.mock('../../controllers/ffsExcessTime.controller.js',()=>({getMyFfsExcessOptions:(req,res)=>res.json({userId:req.user.id})}));
vi.mock('../../controllers/payrollPaySystem.controller.js',()=>({getMyPaySystemRates:(req,res)=>res.json({userId:req.user.id}),estimatePaySystem:(req,res)=>res.json({}),estimatePaySystemScenario:(req,res)=>res.json({})}));
vi.mock('../../controllers/eventTravelReport.controller.js',()=>({getMyEventTravelOptions:(req,res)=>res.json({userId:req.user.id}),previewMyEventTravelReport:(req,res)=>res.json({userId:req.user.id}),submitMyEventTravelReport:(req,res)=>res.status(201).json({userId:req.user.id,submittedByUserId:req.actorUser.id})}));
vi.mock('../../controllers/availability.controller.js',()=>({getMyAvailabilityPending:(req,res)=>res.json({userId:req.user.id}),createMySchoolAvailabilityRequest:(req,res)=>res.json({userId:req.user.id}),unrequestAllMyAvailabilityRequests:(req,res)=>res.json({userId:req.user.id})}));
vi.mock('../../controllers/companyCar.controller.js',()=>Object.fromEntries(['listCompanyCars','listCompanyCarTrips','listCompanyCarStartLocations','listCompanyCarDestinationOptions','getLatestTripEndOdometer','calculateCompanyCarMileage','createCompanyCarTrip'].map(name=>[name,(req,res)=>res.json({userId:req.user.id,body:req.body,query:req.query})])));
vi.mock('../../controllers/budget.controller.js',()=>({createBudgetExpenses:(req,res)=>res.json({userId:req.user.id,agencyId:req.params.agencyId}),listBudgetExpenses:(req,res)=>res.json({userId:req.user.id})}));
vi.mock('../../controllers/manualMeetingLog.controller.js',()=>Object.fromEntries(['getManualMeetingOptions','previewManualMeetingLog','createManualMeetingLog'].map(name=>[name,(req,res)=>res.json({userId:req.user.id,submittedByUserId:req.actorUser.id})])));
import router from '../submitOnBehalf.routes.js';
let server,base;
beforeAll(async()=>{
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={...m.actor};next();});app.use('/submit-for',router);app.use((err,req,res,next)=>res.status(err.status || 500).json({error:err.message}));
 await new Promise(resolve=>{server=app.listen(0,'127.0.0.1',resolve);});base=`http://127.0.0.1:${server.address().port}/submit-for`;
});
afterAll(()=>new Promise(resolve=>server.close(resolve)));
beforeEach(()=>{m.calls=[];m.actor={id:7,role:'admin'};m.allowed=true;m.eventAgency=true;m.employee={id:485,role:'provider_plus',first_name:'Jacquelyne',last_name:'Fernandez'};m.audit.mockResolvedValue({});m.audit.mockClear();m.execute.mockImplementation(async(sql,args)=>{
 if(sql.startsWith('SELECT u.id FROM users'))return [m.allowed?[{id:7}]:[]];
 if(sql.includes('SELECT DISTINCT u.id'))return [m.employee?[m.employee]:[]];
 if(sql.includes('FROM company_events'))return [m.eventAgency?[{id:8}]:[]];
 throw new Error('Unexpected query');
});});
const call=(path,body,method='POST')=>fetch(base+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
it.each(['admin','super_admin'])('uses the employee role and identity and preserves the %s submitter',async(role)=>{
 m.actor.role=role;const r=await call('/485/time-claims?agencyId=2',{agencyId:2,userId:999,claimType:'indirect_time'});
 expect(r.status).toBe(201);expect(await r.json()).toEqual({userId:485,submittedByUserId:7,role:'provider_plus'});
 expect(m.calls[0].body.userId).toBe(485);expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({actorUserId:7,targetUserId:485,agencyId:2}));
});
it.each(['provider','provider_plus','support','assistant_admin','staff'])('rejects %s even with a crafted target URL',async role=>{m.actor.role=role;expect((await call('/485/time-claims?agencyId=2',{})).status).toBe(403);expect(m.calls).toHaveLength(0);});
it('rejects an admin without agency access before reading an employee',async()=>{m.allowed=false;expect((await fetch(base+'/employees?agencyId=2')).status).toBe(403);expect((await call('/485/time-claims?agencyId=2',{})).status).toBe(403);expect(m.calls).toHaveLength(0);});
it('rejects foreign or inactive employees',async()=>{m.employee=null;expect((await call('/485/time-claims?agencyId=2',{})).status).toBe(404);expect(m.calls).toHaveLength(0);});
it.each(['0','-1','oops','1.5'])('rejects malformed organization %s',async agency=>expect((await call('/485/time-claims?agencyId='+agency,{})).status).toBe(400));
it('rejects JSON organization changes',async()=>{expect((await call('/485/time-claims?agencyId=2',{agencyId:3})).status).toBe(403);expect(m.calls).toHaveLength(0);});
it('checks organization after receipt multipart parsing',async()=>{
 const form=new FormData();form.append('agencyId','3');
 expect((await fetch(base+'/485/reimbursement-claims?agencyId=2',{method:'POST',body:form})).status).toBe(403);expect(m.calls).toHaveLength(0);
});
it('passes multipart submissions to the same employee handlers with audit attribution',async()=>{
 const form=new FormData();form.append('agencyId','2');
 const r=await fetch(base+'/485/reimbursement-claims?agencyId=2',{method:'POST',body:form});expect(r.status).toBe(201);expect(await r.json()).toMatchObject({userId:485,submittedByUserId:7});
});
it('does not expose clock controls, approval, deletion, or arbitrary payroll routes',async()=>{
 for(const suffix of ['/indirect-time-session/clock-in','/periods/10/approve','/time-claims/1'])expect((await call('/485'+suffix+'?agencyId=2',{})).status).toBe(404);
});
it('limits event reports to the selected agency and preserves who submits',async()=>{
 const path='/485/company-events/8/travel-report?agencyId=2';m.eventAgency=false;expect((await call(path,{})).status).toBe(404);
 m.eventAgency=true;expect(await (await call(path,{})).json()).toMatchObject({userId:485,submittedByUserId:7});
});
it('uses the employee for options, history, rates, school requests, and meeting logs',async()=>{
 for(const suffix of ['/compensation','/indirect-service-types','/pay-system/my-rates','/time-claims','/company-events/travel-options','/availability/me/pending','/team-meetings/manual-log/options']) {
  expect(await (await fetch(base+'/485'+suffix+'?agencyId=2&userId=999')).json()).toMatchObject({userId:485});
 }
});
it('forces vehicle driver filters to the selected employee',async()=>{
 const r=await fetch(base+'/485/company-car/company-car-trips?agencyId=2&userId=999');expect(await r.json()).toMatchObject({query:{userId:485,driverId:485}});
});
