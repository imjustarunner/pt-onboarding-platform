import exportClinicalRecord from '../services/clinicalRecordExport.service.js';
const handle = kind => async (req, res, next) => {
  try {
    const result = await exportClinicalRecord(req, { agencyId: req.query.agencyId || req.medicalBillingAgencyId, noteId: kind === 'note' ? req.params.noteId : null, draftId: kind === 'draft' ? req.params.draftId : null, clientId: kind === 'record' ? req.params.clientId : null, includeDrafts: req.query.includeDrafts === 'true', from: req.query.from || '', to: req.query.to || '' });
    res.set('Cache-Control', 'no-store');
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(Buffer.from(result.bytes));
  } catch (error) { next(error); }
};
export const downloadClinicalNotePdf = handle('note');
export const downloadClinicalRecordPdf = handle('record');
export const downloadClinicalDraftPdf = handle('draft');
