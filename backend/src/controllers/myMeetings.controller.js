import * as meetings from '../services/myMeetings.service.js';
const handle = fn => async (req,res,next) => {
  try { res.set('Cache-Control','no-store'); res.json(await fn(req)); } catch (error) { next(error); }
};
export const listMyMeetings = handle(req => {
  for (const value of [req.query.from,req.query.to]) if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Object.assign(new Error('Use YYYY-MM-DD dates'),{status:400});
  return meetings.listMyMeetings({ agencyId:Number(req.query.agencyId),userId:req.user.id,
    offset:Math.max(0,Math.min(100000,Math.floor(Number(req.query.offset)||0))),category:String(req.query.category||''),
    from:String(req.query.from||''),to:String(req.query.to||''),search:String(req.query.search||'').slice(0,200) });
});
export const getMyMeeting = handle(req => meetings.myMeetingDetail(req.params.type,req.params.id,req.user.id));
export const saveMyMeetingNote = handle(req => meetings.saveMyMeetingNote(req.params.type,req.params.id,req.user.id,req.body.noteText));
export const retryMyMeetingSummary = handle(req => meetings.retryMyMeetingSummary(req.params.type,req.params.id,req.user.id));
