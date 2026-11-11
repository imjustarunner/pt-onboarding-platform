import {listMobileClients,mobileClientDirectoryContext} from '../services/mobile/clientDirectory.service.js';
import {maskMobileClientName} from '../services/narrivaAccess.service.js';
import {mobileClinicalAge} from '../services/mobileClinicalPrivacy.service.js';
import {mobileAgencyIcon} from '../services/mobile/agencyBrand.service.js';
import {runWithAgencyAccess} from '../utils/agencyAccessContext.js';
export async function getMobileClients(req,res,next){res.set('Cache-Control','no-store');try{res.json(await listMobileClients(req));}catch(error){if(error.status)return res.status(error.status).json({error:{message:error.message}});next(error);}}
export async function getMobileDirectoryClientSummary(req,res,next){
 res.set('Cache-Control','no-store');try{
  const context=await mobileClientDirectoryContext(req,req.params.clientId,req.query.agencyId),{client,actor,agency}=context;
  const metadata={agencyId:Number(agency.id),agencyName:agency.name,agencyLogoUrl:mobileAgencyIcon(agency),fullProfileUrl:context.fullProfileUrl};
  if(!context.clinical)return res.json({...metadata,client:{id:Number(client.id),maskedName:['school_staff','school_admin'].includes(actor.role)?String(client.initials||client.identifier_code||'Client'):maskMobileClientName(client),age:mobileClinicalAge(client)},contacts:[],basicOnly:true,secureMessaging:{available:false,reason:'Use the main profile for the account and communication options permitted to your role.'}});
  const {getMobileClientSummary}=await import('./mobileClinical.controller.js');const scoped=Object.assign(Object.create(req),{user:actor,query:{agencyId:Number(agency.id)},body:{},params:{clientId:String(client.id)},quickView:{...req.quickView,agencyId:Number(agency.id)},mobileClinical:undefined,headers:{...req.headers,'x-agency-id':String(agency.id)}});
  const json=res.json.bind(res);res.json=data=>json({...data,...metadata});
  return runWithAgencyAccess(Number(agency.id),()=>getMobileClientSummary(scoped,res,next),{userId:actor.id,access:actor.agencyAccess});
 }catch(error){if(error.status)return res.status(error.status).json({error:{message:error.message}});next(error);}
}
