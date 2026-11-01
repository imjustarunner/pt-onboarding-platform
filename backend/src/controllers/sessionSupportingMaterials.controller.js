import { materialRecipients, listMaterials, uploadMaterial, downloadMaterial, shareMaterial, scanMaterial, revokeMaterialShare } from '../services/sessionSupportingMaterials.service.js';
const handle = run => async (req, res, next) => { try { await run(req, res); } catch (error) { next(error); } };
export const list = handle(async (req, res) => res.json(await listMaterials(req, req.params.sessionId)));
export const recipients = handle(async (req, res) => res.json(await materialRecipients(req, req.params.sessionId)));
export const upload = handle(async (req, res) => res.status(201).json(await uploadMaterial(req, req.params.sessionId, req.file, req.body?.title)));
export const share = handle(async (req, res) => res.json(await shareMaterial(req, req.params.sessionId, req.params.documentId, req.body || {})));
export const scan = handle(async (req, res) => res.json(await scanMaterial(req, req.params.sessionId, req.params.documentId)));
export const revoke = handle(async (req, res) => res.json(await revokeMaterialShare(req, req.params.sessionId, req.params.documentId, req.params.recipientId)));
export const download = handle(async (req, res) => {
  const file = await downloadMaterial(req, req.params.sessionId, req.params.documentId);
  res.set({ 'Content-Type': file.type, 'Content-Disposition': `attachment; filename="${file.name.replace(/["\r\n]/g, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  res.send(file.body);
});
