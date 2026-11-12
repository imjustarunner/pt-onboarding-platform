import {isIP} from 'node:net';
// Express resolves req.ip using the application's configured trusted proxy hop.
// A client-supplied leftmost X-Forwarded-For value is not signature evidence.
export function clinicalSignatureEvidence(req={}){
 const address=String(req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || '');
 return {ipAddress:isIP(address)?address:null,ipAddressSource:req.ip?'trusted_proxy_request':'connection',userAgent:String(req.headers?.['user-agent'] || '').slice(0,500) || null};
}
