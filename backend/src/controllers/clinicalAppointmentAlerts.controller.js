import alerts from '../services/clinicalAppointmentAlerts.service.js';
export async function getClinicalAppointmentAlerts(req,res,next){try{res.set('Cache-Control','no-store');res.json(await alerts.context(req.user,req.query));}catch(error){next(error);}}
export async function acknowledgeClinicalAppointmentAlert(req,res,next){try{res.set('Cache-Control','no-store');res.json(await alerts.acknowledge(req.user,Number(req.params.appointmentId),req.body.revision));}catch(error){next(error);}}
