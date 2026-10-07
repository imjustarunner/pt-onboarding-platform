import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
export const providerUpdateCredentialLimit=rateLimit({windowMs:15*60*1000,limit:5,standardHeaders:true,legacyHeaders:false,keyGenerator:req=>crypto.createHash('sha256').update(String(req.params.token||req.user?.id||req.ip)).digest('hex'),message:{error:{message:'Too many setup attempts. Wait 15 minutes and try again.'}}});
