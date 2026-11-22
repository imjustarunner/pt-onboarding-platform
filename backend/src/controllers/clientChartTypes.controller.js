import { programParticipation } from '../services/programParticipation.service.js';
import { requireTypeAccess, readChartTypes, saveChartTypes } from '../services/clientChartTypes.service.js';

export async function getClientChartTypes(req,res,next) {
  try {
    const id = Number(req.params.id), agencyId = Number(req.query.agencyId);
    await requireTypeAccess(req.user,id,agencyId);
    res.set('Cache-Control','private, no-store').json(await readChartTypes(id,agencyId));
  } catch (error) { next(error); }
}
export async function putClientChartTypes(req,res,next) {
  try {
    res.set('Cache-Control','private, no-store').json(await saveChartTypes(req.user,Number(req.params.id),Number(req.query.agencyId),req.body));
  } catch (error) { next(error); }
}

export async function getClientPrograms(req,res,next) {
  try {
    const id=Number(req.params.id), agencyId=Number(req.query.agencyId);
    await requireTypeAccess(req.user,id,agencyId);
    res.set('Cache-Control','private, no-store').json(await programParticipation(id,agencyId));
  } catch (error) { next(error); }
}
