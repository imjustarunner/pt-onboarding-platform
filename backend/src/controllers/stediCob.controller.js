import { stediBillingScope } from './stediDiscovery.controller.js';
import { auditBilling } from '../services/familyBillingPolicy.service.js';
import { cobWorkspace, cobPayers, startCob, reviewCob } from '../services/stediCob.service.js';

export async function getCobWorkspace(req,res,next) {try{
  const scope=await stediBillingScope(req),data=await cobWorkspace(scope);
  await auditBilling({...scope,userId:req.user.id,action:'stedi_cob_viewed'});
  res.set('Cache-Control','no-store').json(data);
}catch(e){next(e);}}
export async function getCobPayers(req,res,next) {try{
  const scope=await stediBillingScope(req);
  res.set('Cache-Control','no-store').json(await cobPayers({...scope,slot:req.query.slot}));
}catch(e){next(e);}}
export async function createCob(req,res,next) {try{
  const scope=await stediBillingScope(req);
  res.set('Cache-Control','no-store').json(await startCob({...req.body,...scope}));
}catch(e){next(e);}}
export async function reconcileCob(req,res,next) {try{
  const scope=await stediBillingScope(req);
  res.set('Cache-Control','no-store').json(await reviewCob({...req.body,...scope}));
}catch(e){next(e);}}
