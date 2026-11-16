import { requireClientChartImportAccess } from '../services/clientChartImportAccess.service.js';
import { listChartHistory,uploadChartHistory,viewChartHistory,checkChartHistory } from '../services/clientChartHistory.service.js';
import { logAuditEvent } from '../services/auditEvent.service.js';
// Resolve scope before accepting any upload bytes.
export async function chartHistoryAccess(req,res,next){try{req.chartHistoryScope=await requireClientChartImportAccess(req.user,req.params.id,req.get?.('X-Agency-Id')||null);res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});next();}catch(error){next(error);}}
export async function listClientChartHistory(req,res,next){try{const scope=req.chartHistoryScope;const docs=await listChartHistory(scope);await logAuditEvent(req,{actionType:'client_chart_history_listed',agencyId:scope.agencyId,targetType:'client',targetId:scope.clientId});res.json({documents:docs});}catch(error){next(error);}}
export async function uploadClientChartHistory(req,res,next){try{res.status(201).json(await uploadChartHistory(req,req.chartHistoryScope,req.file));}catch(error){next(error);}}
export async function viewClientChartHistory(req,res,next){try{const{body}=await viewChartHistory(req,req.chartHistoryScope,req.params.documentId);res.set({'Content-Type':'application/pdf','Content-Disposition':'inline; filename="medical-history.pdf"','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}).send(body);}catch(error){next(error);}}
export async function checkClientChartHistory(req,res,next){try{res.json(await checkChartHistory(req,req.chartHistoryScope,req.params.documentId));}catch(error){next(error);}}
