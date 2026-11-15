import { appointmentSeriesCancellations as service } from '../services/appointmentSeriesCancellation.service.js';
const handle=work=>async(req,res,next)=>{try{res.set('Cache-Control','no-store');res.json(await work(req));}catch(error){if(error.status)return res.status(error.status).json({error:{message:error.message}});next(error);}};
export const appointmentCancellationOptions=handle(req=>service.options(req.user,Number(req.params.id)));
export const listAppointmentSeriesCancellations=handle(req=>service.list(req.user));
export const appointmentSeriesCancellationStatus=handle(req=>service.status(req.user,Number(req.params.id),req.params.operationId));
export const retryAppointmentSeriesCancellation=handle(req=>service.retry(req.user,Number(req.params.id),req.params.operationId));
