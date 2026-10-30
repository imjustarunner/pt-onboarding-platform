import { manualMeetingOptions, previewManualMeeting, saveManualMeeting, resolveManualMeetingReview } from '../services/manualMeetingLog.service.js';
const handle = fn => async (req,res,next) => {
  try {
    res.set('Cache-Control','no-store');
    // A link scoped to one meeting is not authority to create other meetings or view a staff roster.
    if(req.teamMeetingInvitationAccess) return res.status(403).json({error:{message:'Sign in to your account to log a meeting.'}});
    res.json(await fn(req));
  } catch(error) { next(error); }
};
export const getManualMeetingOptions = handle(req=>manualMeetingOptions(Number(req.query.agencyId),Number(req.user.id)));
export const previewManualMeetingLog = handle(req=>previewManualMeeting(req.body,Number(req.user.id)));
export const createManualMeetingLog = handle(req=>saveManualMeeting(req.body,Number(req.user.id),Number(req.actorUser?.id || req.user.id)));

export const resolveManualMeetingLog = handle(req=>resolveManualMeetingReview({actor:req.user,eventId:Number(req.params.eventId),userId:Number(req.params.userId),action:req.body.action,note:req.body.note}));
