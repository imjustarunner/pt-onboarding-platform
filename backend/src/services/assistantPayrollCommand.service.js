/** Private in-process authority. Nothing in HTTP bodies, JWT claims or role names can create this scope. */
const authorities=new WeakMap();
export function scopedPayrollCommand(req){return authorities.get(req)||null;}
export async function invokeScopedPayrollCommand({account,kind,claimId,periodId,tierLevel,db},handler){
 if(!account||!db||!['school_mileage','individual_supervision'].includes(kind))throw Object.assign(new Error('Scoped payroll approval is unavailable.'),{status:403});
 const req={method:'PATCH',params:{id:String(claimId)},body:{action:'approve',targetPayrollPeriodId:periodId,...(kind==='school_mileage'?{tierLevel}:{})},user:{id:account.user_id,role:'assistant'},headers:{},query:{}};
 const authority={agencyId:Number(account.agency_id),kind,claimId:Number(claimId),db};authorities.set(req,authority);
 let status=200,result=null,failure=null;
 const res={status(code){status=code;return this;},json(value){result=value;return this;}};
 try{await handler(req,res,error=>{failure=error;});if(failure||status>=400||result?.claim?.status!=='approved')throw Object.assign(new Error('The existing payroll approval checks require human review.'),{status:409,code:'PAYROLL_EXISTING_CHECK_REQUIRES_REVIEW'});return result.claim;}
 finally{authorities.delete(req);}
}
