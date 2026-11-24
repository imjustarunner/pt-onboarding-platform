import service from '../services/plotlineSupport.service.js';
const action=fn=>async(req,res,next)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  try{res.json(await fn(req));}catch(error){if(error.status)return res.status(error.status).json({error:{message:error.message}});next(error);}
};
export const getPlotlineSupport=action(req=>service.publicMeta(req.params.token));
export const getPlotlineSupportReadiness=action(()=>service.readiness());
export const postPlotlineSupport=action(req=>service.createTicket(req.params.token,req.body||{},req));
