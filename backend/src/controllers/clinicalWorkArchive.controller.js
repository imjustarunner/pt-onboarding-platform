import { validationResult } from 'express-validator';
import archive from '../services/clinicalWorkArchive.service.js';

function validate(req) {
  if (req.auricwellPreview) throw Object.assign(new Error('Archiving is unavailable in preview mode.'), { status: 403 });
  if (!validationResult(req).isEmpty()) throw Object.assign(new Error('Choose a valid organization and record.'), { status: 400 });
}
export const previewClinicalWorkArchive = async (req, res, next) => {
  try { validate(req); res.json(await archive.preview(req.user, Number(req.body.agencyId), req.body.target)); } catch (error) { next(error); }
};
export const listClinicalWorkArchives = async (req, res, next) => {
  try { validate(req); res.json(await archive.list(req.user, Number(req.query.agencyId))); } catch (error) { next(error); }
};
export const createClinicalWorkArchive = async (req, res, next) => {
  try {
    validate(req);
    if (req.body.confirmation !== 'ARCHIVE TEST RECORDS') throw Object.assign(new Error('Confirm the reviewed test records before archiving.'), { status: 400 });
    res.json(await archive.archive(req.user, Number(req.body.agencyId), req.body.target, req.body.version, req.body.reason));
  } catch (error) { next(error); }
};
export const restoreClinicalWorkArchive = async (req, res, next) => {
  try { validate(req); res.json(await archive.restore(req.user, Number(req.body.agencyId), Number(req.params.archiveId), req.body.reason)); } catch (error) { next(error); }
};
