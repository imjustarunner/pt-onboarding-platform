import jwt from 'jsonwebtoken';
import {createHmac,randomUUID} from 'node:crypto';
import config from '../config/config.js';
const audience='itsco-hiring-rehearsal';
function key(){
 const secret=config.jwt.secret;
 if(!secret || secret==='your-super-secret-jwt-key-change-in-production')throw Object.assign(new Error('Private rehearsal links are not configured.'),{status:503});
 return createHmac('sha256',secret).update(audience).digest('hex');
}
export function createRehearsalAccess(agencyId,creatorId){return jwt.sign({agencyId,creatorId,scope:'read-rehearsal'},key(),{algorithm:'HS256',audience,issuer:'plotline',expiresIn:'24h',jwtid:randomUUID()});}
export function verifyRehearsalAccess(token){
 try{const data=jwt.verify(token,key(),{algorithms:['HS256'],audience,issuer:'plotline'});
 if(data.scope!=='read-rehearsal'||!Number.isSafeInteger(data.agencyId)||data.agencyId<1)throw Error('Invalid scope');
 return data;
 }catch{throw Object.assign(new Error('This private test link has expired or is invalid. Open the admin rehearsal to create a new link.'),{status:401});}
}
export function requireRehearsalAccess(req,res,next){
 try{req.rehearsalAccess=verifyRehearsalAccess(String(req.headers.authorization||'').replace(/^Bearer /,''));res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'});next();}catch(e){next(e);}
}
