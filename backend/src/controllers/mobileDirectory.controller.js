import {loadMobileDirectoryProfile} from '../services/mobile/directoryProfile.service.js';
export async function getMobileDirectoryPerson(req,res,next){
 res.set('Cache-Control','no-store');try{res.json(await loadMobileDirectoryProfile(req));}
 catch(error){if(error.status)return res.status(error.status).json({error:{message:error.message}});next(error);}
}
