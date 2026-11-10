import {grantVerifiedBillingScope} from '../utils/verifiedBillingScope.js';

const authorizations=new WeakMap();
export const assistantBillingAuthorization=req=>authorizations.get(req)?.receipt||null;
export async function assertAssistantBillingCommand(req){const scope=authorizations.get(req);if(scope)await scope.validate();}

// Only the checked batch executor calls this function. HTTP input cannot create this authority.
export async function invokeAssistantBillingSubmission({account,claimId,reviewHash,mode,authorization,validate},handler){
  if(account?.subrole!=='billing'||typeof validate!=='function'||!authorization?.ruleNumber||Number(authorization.performedByUserId)!==Number(account.user_id))throw new Error('A verified billing authorization is required');
  const req={user:{id:Number(account.user_id),role:'assistant'},params:{claimId:String(claimId)},body:{agencyId:Number(account.agency_id),approved:true,reviewHash,accountMode:mode}};
  grantVerifiedBillingScope(req.user,account.agency_id);
  authorizations.set(req,{receipt:Object.freeze({...authorization}),validate});
  let status=200,body=null,error=null;
  const res={status(value){status=value;return this;},json(value){body=value;return this;}};
  try{await handler(req,res,value=>{error=value;});if(error)throw error;if(status>=400||body?.error)throw Object.assign(new Error(body?.error?.message||'Submission was held'),{status});return body;}
  finally{authorizations.delete(req);}
}
