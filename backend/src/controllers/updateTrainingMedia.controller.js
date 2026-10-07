import multer from 'multer';
import {assertAgencyAdmin} from '../services/providerUpdate.service.js';
import StorageService from '../services/storage.service.js';
export const trainingMediaUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024},fileFilter(req,file,cb){if(['image/png','image/jpeg','image/webp','video/mp4','video/webm'].includes(file.mimetype))cb(null,true);else cb(Object.assign(new Error('Choose a PNG, JPG, WebP, MP4 or WebM file.'),{status:400}));}});
export function verifiedTrainingKind(file){
 const b=file?.buffer;if(!b?.length)return null;
 const ascii=(start,end)=>b.subarray(start,end).toString('ascii');
 if(file.mimetype==='image/png'&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image';
 if(file.mimetype==='image/jpeg'&&b[0]===255&&b[1]===216&&b[2]===255)return 'image';
 if(file.mimetype==='image/webp'&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')return 'image';
 if(file.mimetype==='video/mp4'&&ascii(4,8)==='ftyp')return 'video';
 if(file.mimetype==='video/webm'&&b.subarray(0,4).equals(Buffer.from([26,69,223,163])))return 'video';
 return null;
}
export async function uploadTrainingMedia(req,res,next){try{
 const aid=await assertAgencyAdmin(req.user,req.body?.agencyId);const kind=verifiedTrainingKind(req.file);
 if(!kind)return res.status(400).json({error:{message:'This file does not match a supported image or video format.'}});
 const stored=await StorageService.saveTrainingMedia({agencyId:aid,fileBuffer:req.file.buffer,filename:req.file.originalname,contentType:req.file.mimetype,mediaKind:kind});
 const url=await StorageService.getSignedUrl(stored.key,60);res.set('Cache-Control','no-store');res.status(201).json({key:stored.key,url,kind,name:req.file.originalname});
}catch(e){next(e);}}
