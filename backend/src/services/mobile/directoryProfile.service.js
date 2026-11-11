import {mobileSessions} from './session.service.js';
import {listMobileAgencies} from './agencyScope.service.js';
import ProviderPublicProfile from '../../models/ProviderPublicProfile.model.js';
import {getQuickDirectory} from '../../controllers/quickViewSurfaces.controller.js';
import {mapDirectoryPerson} from './directoryPerson.service.js';
import {mobileAgencyIcon} from './agencyBrand.service.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const id=value=>/^[1-9]\d*$/.test(String(value))&&Number.isSafeInteger(Number(value))?Number(value):null;
const focusLabels={specialties:'Specialties',ageGroups:'Age groups',populations:'Client focus',modalities:'Approaches'};
export function directoryProfileDetails(profile){
 const top=profile?.details?.clinicalFocus?.top || {};
 return {bio:String(profile?.publicBlurb||'').trim().slice(0,800),focus:Object.entries(focusLabels).map(([key,label])=>({label,values:Array.isArray(top[key])?[...new Set(top[key].filter(value=>typeof value==='string' && !(profile?.details?.clinicalFocus?.excluded?.[key] || []).includes(value)).map(value=>value.trim().slice(0,120)).filter(Boolean))].slice(0,3):[]})).filter(row=>row.values.length)};
}
/** A compact staff directory profile, never an employee/personnel file. */
export function createDirectoryProfile({access=(...args)=>mobileSessions.access(...args),agencies=listMobileAgencies,directory=getQuickDirectory,publicProfile=(personId,agencyId)=>ProviderPublicProfile.getForProvider({providerUserId:personId,agencyId})}={}){
 return async function directoryProfile(req){
  const qv=req.quickView,personId=id(req.params?.personId),agencyId=id(req.query?.agencyId||qv?.agencyId);
  if(!qv?.mobileDeviceSessionId)throw fail(403,'Sign into AuricWell with your account to view this profile.');
  if(!personId||!agencyId)throw fail(400,'Choose a valid person and agency.');
  const context=await access(qv.mobileDeviceSessionId,qv.userId,qv.agencyId,qv.credentialVersion??null);
  if(context.surface!=='staff')throw fail(403,'This staff profile is not available to this account.');
  const scoped=await agencies(context.user),agency=scoped.agencies.find(row=>Number(row.id)===agencyId);
  if(!agency||scoped.qaAgencyIds&&!scoped.qaAgencyIds.map(Number).includes(agencyId))throw fail(403,'This agency is not available to your account.');
  let person;
  if(Number(context.user.id)===personId){person=mapDirectoryPerson(context.user,'providers',agency);}
  else{
   const request=Object.assign(Object.create(req),{quickView:{...qv,agencyId},query:{...req.query,agencyId:String(agencyId)}});let body;
   await directory(request,{json(value){body=value;return this;}},error=>{throw error;});
   person=[...(body?.providers||[]),...(body?.schoolStaff||[])].find(row=>Number(row.id)===personId);
  }
  if(!person)throw fail(404,'This person is not in your affiliated directory.');
  const details=person.section==='school_staff'?{bio:'',focus:[]}:directoryProfileDetails(await publicProfile(personId,agencyId));
  return {person:{...person,agencyId,agencyName:agency.name,agencyLogoUrl:mobileAgencyIcon(agency),...details}};
 };
}
export const loadMobileDirectoryProfile=createDirectoryProfile();
