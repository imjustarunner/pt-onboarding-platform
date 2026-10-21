import multer from 'multer';
import {submitGuardianPortalHelp} from '../services/guardianPortalHelp.service.js';

export const guardianHelpUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:3,fields:5},
 fileFilter:(_req,file,cb)=>['image/png','image/jpeg','image/webp'].includes(file.mimetype)?cb(null,true):cb(Object.assign(new Error('Choose a PNG, JPG or WebP screenshot.'),{status:400}))});
export async function submitHelp(req,res,next){
 try{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});const result=await submitGuardianPortalHelp({user:req.user,preview:req.guardianPreviewMode,agencyId:req.body.agencyId,clientId:req.body.clientId,question:req.body.question,requestId:req.body.requestId,files:req.files});res.status(result.alreadySubmitted?200:201).json(result);}catch(e){next(e);}
}
