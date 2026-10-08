import { guardianReminderPreferences, listGuardianAppointments, requestGuardianAppointmentChange, appointmentRequests, requireAppointmentRequestProvider, declineGuardianAppointmentRequest } from '../services/guardianAppointments.service.js';
import { cancelGuardianAppointments } from '../services/guardianAppointments.service.js';
export const cancel = async (req,res,next) => { try {
  if (req.guardianPreviewMode) return res.status(403).json({ error: { message: 'Preview cannot cancel appointments' } });
  res.json(await cancelGuardianAppointments({ userId: req.user.id, clientId: Number(req.params.clientId), appointmentId: Number(req.params.appointmentId), scope: req.body?.scope, reason: req.body?.reason, confirmed: req.body?.confirmed }));
} catch (e) { next(e); } };
export const list = async (req,res,next) => {try { if(req.guardianPreviewMode)return res.json({appointments:[]});res.json({appointments:await listGuardianAppointments({userId:req.user.id,clientId:Number(req.params.clientId)})}); } catch(e){next(e);} };
export const requestChange = async (req,res,next) => {try {if(req.guardianPreviewMode)return res.status(403).json({error:{message:'Preview cannot request changes'}});res.status(201).json(await requestGuardianAppointmentChange({userId:req.user.id,clientId:Number(req.params.clientId),appointmentId:Number(req.params.appointmentId),type:req.body?.type,reason:req.body?.reason}));}catch(e){next(e);} };
export const providerList = async(req,res,next)=>{try{await requireAppointmentRequestProvider(Number(req.params.id),req.user.id);res.json({requests:await appointmentRequests(Number(req.params.id))});}catch(e){next(e);} };
export const providerDecline = async(req,res,next)=>{try{res.json(await declineGuardianAppointmentRequest({appointmentId:Number(req.params.id),requestId:Number(req.params.requestId),userId:req.user.id,reason:req.body?.reason}));}catch(e){next(e);} };

export const getPreferences = async (req, res, next) => {
  try { if (req.guardianPreviewMode) return res.status(403).json({ error: { message: 'Preview does not expose communication preferences' } });
    res.json(await guardianReminderPreferences({ userId: req.user.id, clientId: Number(req.params.clientId) })); } catch (e) { next(e); }
};
export const savePreferences = async (req, res, next) => {
  try { if (req.guardianPreviewMode) return res.status(403).json({ error: { message: 'Preview cannot change preferences' } });
    res.json(await guardianReminderPreferences({ userId: req.user.id, clientId: Number(req.params.clientId), input: req.body })); } catch (e) { next(e); }
};
