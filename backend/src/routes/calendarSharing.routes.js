import express from 'express';
import rateLimit from 'express-rate-limit';
import { familyError } from '../services/familyPolicy.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireFamilySession } from '../services/familyAuth.service.js';
import * as calendars from '../services/calendarPublication.service.js';
const router=express.Router();
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
router.use((req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('sec-fetch-site')==='cross-site')return res.sendStatus(403);next();});
router.get('/feed/:token.ics',rateLimit({windowMs:60000,max:120,standardHeaders:true,legacyHeaders:false}),wrap(async(req,res)=>res.type('text/calendar').send(await calendars.subscriptionFeed(req.params.token))));
function register(path,auth,session,household){
  const endpoint=(method,suffix,fn)=>router[method](path+suffix,auth,wrap(async(req,res)=>res.json(await fn(session(req),household(req),req) || {ok:true})));
  endpoint('get','',calendars.publicationStatus);
  endpoint('post','/subscription',calendars.issueSubscription);
  endpoint('delete','/subscription',calendars.revokeSubscription);
  endpoint('post','/google',calendars.createGooglePublication);
  endpoint('post','/sync',calendars.syncGooglePublication);
  endpoint('delete','/google',calendars.deleteGooglePublication);
  endpoint('put','/details',(s,id,r)=>calendars.setPublicationDetails(s,id,r.body.details===true));
  endpoint('post','/readers',(s,id,r)=>calendars.addPublicationReader(s,id,r.body.email));
  endpoint('delete','/readers',(s,id,r)=>calendars.removePublicationReader(s,id,r.body.email));
}
register('/work/:agencyId',authenticate,r=>({userId:r.user.id,agencyId:Number(r.params.agencyId)}),()=>null);
register('/family/:householdId',requireFamilySession,r=>r.family,r=>{const id=Number(r.params.householdId);if(!Number.isInteger(id)||id<1)throw familyError('Choose a valid household.');return id;});
export default router;
