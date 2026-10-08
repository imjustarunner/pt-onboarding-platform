import {reviewRecipient,requireSection} from './providerUpdateReview.controller.js';
import {readUpdateCalendar,addUpdateVirtualOpening,closeUpdateVirtualOpening,openUpdateOfficeHours,saveUpdateAvailabilitySettings} from '../services/providerUpdateAvailability.service.js';

export async function updateAvailability(req,res,next) {
  try {
    const recipient=await reviewRecipient(req);
    if(req.method==='GET'){try{requireSection(recipient,'office_schedule');}catch{try{requireSection(recipient,'public_availability');}catch{requireSection(recipient,'public_profile_review');}}}
    else requireSection(recipient,req.params.action==='settings'?'public_availability':'office_schedule');
    const ids={agencyId:Number(recipient.agency_id),providerId:Number(recipient.provider_user_id)};
    res.setHeader('Cache-Control','no-store');
    if(req.method==='GET')return res.json(await readUpdateCalendar(ids,{weekStart:req.query.weekStart,previewOnly:!!recipient.previewOnly}));
    if(recipient.previewOnly)throw Object.assign(new Error('This preview is read-only.'),{status:403});
    const body=req.body||{};
    const actions={
      virtual:()=>addUpdateVirtualOpening(ids,{date:body.date,startTime:body.startTime,frequency:body.frequency}),
      close:()=>closeUpdateVirtualOpening(ids,{id:body.id,date:body.date,scope:body.scope}),
      office:()=>openUpdateOfficeHours(ids,{eventId:body.eventId,assignmentId:body.assignmentId,frequency:body.frequency,inPerson:body.inPerson,virtual:body.virtual}),
      settings:()=>saveUpdateAvailabilitySettings(ids,{acceptingNewClients:body.acceptingNewClients,inPerson:body.inPerson,virtual:body.virtual,inPersonStatus:body.inPersonStatus,virtualStatus:body.virtualStatus})
    };
    if(!Object.hasOwn(actions,req.params.action))throw Object.assign(new Error('Unknown availability action.'),{status:400});
    res.json(await actions[req.params.action]());
  } catch(e){next(e);}
}
