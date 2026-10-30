import staffTools from '../services/appointmentStaffTools.service.js';
import openInPersonLearningWorkspace from '../services/inPersonLearningWorkspace.service.js';
export const openAppointmentLearningWorkspace = async (req,res,next) => {
  try { res.set('Cache-Control','no-store');res.json(await openInPersonLearningWorkspace(req.user,Number(req.params.id))); } catch(error) { next(error); }
};
export const getAppointmentStaffTools = async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store'); res.json(await staffTools.get(req.user, Number(req.params.id))); } catch (error) { next(error); }
};
export const saveAppointmentStaffAlert = async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store'); res.json({ alert: await staffTools.save(req.user, Number(req.params.id), req.body) }); } catch (error) { next(error); }
};
export const listAppointmentStaffAlerts = async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store'); res.json({ alerts: await staffTools.list(req.user, req.query) }); } catch (error) { next(error); }
};
