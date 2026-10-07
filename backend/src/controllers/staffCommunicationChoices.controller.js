import User from '../models/User.model.js';
import {getStaffCommunicationChoices,saveStaffCommunicationChoices} from '../services/staffCommunicationChoices.service.js';
import VonageService from '../services/vonage.service.js';
export async function listMyCommunicationChoices(req,res,next) {
  try {
    res.set('Cache-Control','no-store');
    if(req.query.agencyId)return res.json(await getStaffCommunicationChoices({userId:req.user.id,agencyId:Number(req.query.agencyId)}));
    const agencies=await User.getAgencies(req.user.id);
    res.json({agencies:agencies.map(a=>({id:a.id,name:a.name}))});
  }catch(e){next(e);}
}
export async function saveMyCommunicationChoices(req,res,next) {
  try {res.set('Cache-Control','no-store');res.json(await saveStaffCommunicationChoices({userId:req.user.id,agencyId:Number(req.body?.agencyId),input:req.body,sendConfirmation:m=>VonageService.sendSms(m)}));}catch(e){next(e);}
}
