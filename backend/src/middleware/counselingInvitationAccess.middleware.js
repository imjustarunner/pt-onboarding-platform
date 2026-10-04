import {authenticate} from './auth.middleware.js';
import {validateCounselingInvitation} from '../services/counselingInvitationAccess.service.js';
export async function authenticateCounselingSession(req,res,next) {
  const token=req.get('X-Counseling-Access');if(!token)return authenticate(req,res,next);
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  try {
    const match=/^\/sessions\/([\w-]+)(?:\/(.*))?$/.exec(req.path);
    const allowed={GET:/^(|video-token|notes|chat|workspace|visits|activity|recording-consent|recording-consent\/pdf|transcription)$/,POST:/^(join|leave|workspace|workspace\/download|notes|chat|activity\/respond|activity\/roll|activity\/pause|activity\/resume|activity\/exit|recording-consent\/sign|recording-consent\/withdraw|transcription\/control|transcription\/audio)$/,PATCH:/^activity$/};
    if(!match||!allowed[req.method]?.test(match[2]||''))return res.status(403).json({error:{message:'This invitation grants access only to this client session.'}});
    const access=await validateCounselingInvitation(token,match[1]);req.counselingInvitationAccess=access;
    req.user={id:access.userId,role:'client',name:access.displayName};next();
  }catch(e){if(e.status)return res.status(e.status).json({error:{message:e.message}});next(e);}
}
