import { runWithAgencyAccess } from '../utils/agencyAccessContext.js';
import * as reports from '../services/narrivaComplianceReports.service.js';
const handle=fn=>async(req,res,next)=>{res.set('Cache-Control','no-store');try{await runWithAgencyAccess(req.body?.agencyId||req.query?.agencyId,()=>fn(req,res));}catch(error){next(error);}};
export const getSettings=handle(async(req,res)=>res.json(await reports.getComplianceReportSettings(req.user,req.query.agencyId)));
export const patchSettings=handle(async(req,res)=>res.json(await reports.saveComplianceReportSettings(req)));
export const listRuns=handle(async(req,res)=>res.json({runs:await reports.listComplianceReports(req.user,req.query.agencyId)}));
export const createRun=handle(async(req,res)=>res.status(202).json({run:await reports.createComplianceReport(req)}));
export const readRun=handle(async(req,res)=>res.json({run:await reports.readComplianceReport(req)}));
export const retryRun=handle(async(req,res)=>res.status(202).json({run:await reports.retryComplianceReport(req)}));
export const exportRun=handle(async(req,res)=>{
 const run=await reports.readComplianceReport(req);
 res.set('Content-Disposition',`attachment; filename="narriva-compliance-${run.id}.json"`);
 res.json({run});
});
export const runJobs=handle(async(req,res)=>res.json(await reports.runDueComplianceReports({limit:req.body?.limit})));
