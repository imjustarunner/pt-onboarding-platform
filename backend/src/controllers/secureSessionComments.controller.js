import { secureSessionComments } from '../services/secureSessionComments.service.js';

const run = (method, status = 200) => async (req, res) => {
  res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
  try {
    const scopedUser = { ...req.user,
      sessionCommentAgencyId: req.auricwellPreview?.agencyId || req.user.sessionCommentAgencyId,
      sessionCommentClientId: req.dependentPortalAccess?.client_id || req.user.sessionCommentClientId };
    // Only user-facing inputs cross this boundary. Internal metadata-only/audit
    // switches belong to the worker, and cannot be disabled by a GET body.
    const input = { user: scopedUser, req,
      appointmentId: req.params.appointmentId || req.params.id,
      commentId:req.params.commentId,
      clientId: req.body?.clientId || req.query?.clientId,
      body:req.body?.body,recipientUserIds:req.body?.recipientUserIds,requestId:req.body?.requestId,
      expectedVersion:req.body?.expectedVersion,commentIds:req.body?.commentIds,commentVersions:req.body?.commentVersions,
      timeZone:req.query?.timeZone || req.body?.timeZone,before:req.query?.before,action:req.body?.action,minutes:req.body?.minutes };
    if (method === 'badges') input.appointmentIds = String(req.query.appointmentIds || '').split(',').filter(Boolean);
    res.status(status).json(await secureSessionComments[method](input));
  } catch (error) {
    // SQL/decryption errors never expose bound values, ciphertext, a stack, or a
    // draft comment. No raw error object enters generic request error logging.
    const statusCode = [400, 403, 404, 409, 429].includes(error.status) ? error.status : 503;
    if (statusCode === 503) console.warn('[secure-session-comments]', { operation: method, code: 'operation_unavailable' });
    res.status(statusCode).json({ error: { code: statusCode === 503 ? 'SESSION_COMMENT_UNAVAILABLE' : error.code || 'SESSION_COMMENT_ACCESS',
      message: statusCode === 503 ? 'The secure comment operation could not be confirmed. Keep your text and reload the conversation before retrying; do not send a duplicate.' : error.message,
      ...(error.code==='FAMILY_SHARING_ACK_REQUIRED'?{agencyId:Number(error.agencyId),version:error.version}: {}),
      ...(error.code==='SESSION_COMMENT_EXISTS'?{commentId:Number(error.commentId)}:{}),
      ...(error.code==='SESSION_COMMENT_VERSION_CONFLICT'&&error.currentVersion?{currentVersion:Number(error.currentVersion)}:{}) } });
  }
};
export const thread = run('thread');
export const create = run('create', 201);
export const edit = run('edit');
export const read = run('read');
export const today = run('today');
export const attention = run('attention');
export const history = run('history');
export const badges = run('badges');
