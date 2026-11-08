import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
// No narrative or identifying data is embedded in this receipt. It attests that
// the private generator completed for this author's exact source and service.
export function generationSourceHash(inputText,serviceCode,writerMode){return createHash('sha256').update(JSON.stringify([String(inputText || '').trim(),String(serviceCode || '').trim().toUpperCase(),writerMode])).digest('hex');}
const key=()=>{if(!process.env.JWT_SECRET)throw Object.assign(new Error('Note generation verification is unavailable. Your draft is preserved.'),{status:503});return createHmac('sha256',process.env.JWT_SECRET).update('narriva-generation-v1').digest();};
export function issueNarrivaGenerationReceipt({userId,agencyId,clientId,clinicalSessionId,officeEventId,inputText,serviceCode,writerMode}){
 const payload=Buffer.from(JSON.stringify({v:1,userId:Number(userId),agencyId:Number(agencyId),clientId:Number(clientId),clinicalSessionId:Number(clinicalSessionId)||0,officeEventId:Number(officeEventId)||0,sourceHash:generationSourceHash(inputText,serviceCode,writerMode),at:new Date().toISOString()})).toString('base64url');
 return payload+'.'+createHmac('sha256',key()).update(payload).digest('base64url');
}
export function verifyNarrivaGenerationReceipt(receipt,source){
 try{const [payload,signature,...extra]=String(receipt || '').split('.');if(extra.length||!payload||!signature)return false;const actual=Buffer.from(signature,'base64url'),expected=createHmac('sha256',key()).update(payload).digest();if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return false;const claim=JSON.parse(Buffer.from(payload,'base64url').toString());return claim.v===1 && ['userId','agencyId','clientId','clinicalSessionId','officeEventId'].every(field=>(Number(claim[field])||0)===(Number(source[field])||0)) && claim.sourceHash===generationSourceHash(source.inputText,source.serviceCode,source.writerMode);}catch{return false;}
}
