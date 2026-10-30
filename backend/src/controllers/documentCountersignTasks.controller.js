import {listDocumentCountersignTasks} from '../services/documentCountersignTasks.service.js';

export async function getMyCountersignatures(req,res,next) {
  try {
    const items=await listDocumentCountersignTasks(req.user,req.query.agencyId || null);
    res.set('Cache-Control','no-store');
    res.json({items});
  } catch(error) { next(error); }
}
