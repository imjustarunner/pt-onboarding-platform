import express from 'express';
import {mobileToolAccess} from '../services/mobile/toolAccess.service.js';
import {runWithAgencyAccess} from '../utils/agencyAccessContext.js';
import * as exchange from '../controllers/clientExchange.controller.js';
import {getExchangeListingScope} from '../services/clientExchange.service.js';
const router=express.Router();
function scoped(handler,{listing=false,write=false}={}){return async(req,res,next)=>{
 try{
  const requested=req.query.agencyId;if(!requested)throw Object.assign(new Error('Choose an agency.'),{status:400});
  const {agency,actor}=await mobileToolAccess(req,'exchange',requested);
  if(listing){if(!/^[1-9]\d*$/.test(req.params.id))throw Object.assign(new Error('Choose a valid listing.'),{status:400});const source=await getExchangeListingScope(Number(req.params.id));if(!source||Number(source.agencyId)!==Number(agency.id))throw Object.assign(new Error('This listing is unavailable in this agency.'),{status:404});}
  req.user=actor;req.mobileExchangePersonalFit=true;req.query={agencyId:String(agency.id),status:req.query.status||undefined};req.body=write?{message:String(req.body?.message||'').slice(0,2000),acknowledgedWarnings:Array.isArray(req.body?.acknowledgedWarnings)?req.body.acknowledgedWarnings.filter(x=>typeof x==='string').slice(0,30):[]}:{};
  res.set('Cache-Control','no-store');return runWithAgencyAccess(agency.id,()=>handler(req,res,next),{userId:actor.id,access:actor.agencyAccess});
 }catch(error){next(error);}
};}
router.get('/listings',scoped(exchange.listListings));
router.get('/my-requests',scoped(exchange.listMyRequests));
router.get('/listings/:id',scoped(exchange.getListing,{listing:true}));
router.post('/listings/:id/requests',scoped(exchange.createRequest,{listing:true,write:true}));
export default router;
