/** Quick actions follow the page being viewed and the viewer's existing access. */
export function clientProfileActions({ hub = 'overview', sub = '', canEdit = false, canSchedule = false, canPortal = false, canInvite = false, canClinical = false, canBilling = false, canDocuments = false, canPortalDocuments = canDocuments, canRequestUpdates = false, canSecureMessage = false, canUpload = false, canProcessPaper = false } = {}) {
  const action = (id, label, icon, target = id) => ({ id, label, icon, target });
  const assignments = canEdit ? action('assignments', 'Assignments', 'users') : null;
  const edit = canEdit ? action('edit', 'Edit client', 'edit') : null;
  const portal = canPortal ? action('portal', 'Portal access', 'portal', 'guardians') : null;
  const invite = canInvite ? action('invite', 'Invite to portal', 'send') : null;
  const documents = canDocuments ? action('documents', 'Documents', 'file') : null;
  const renewal = canEdit ? action('renewal', 'Renew enrollment', 'calendar') : null;
  const message = action('communications', 'Communications', 'message');
  const secure = canSecureMessage ? action('secure-message', 'Send secure message', 'message') : message;
  const upload = canUpload ? action('upload', 'Upload document', 'file') : null;
  const processPaper = canProcessPaper ? action('process-paper', 'Process paper packet', 'file') : null;
  if (hub === 'overview') return [assignments, canSchedule ? action('schedule','Schedule','calendar') : null, edit, secure, canPortal ? action('portal', 'Portal', 'portal') : null, upload || documents, processPaper].filter(Boolean);
  if (hub === 'portal') return [portal, invite, canPortalDocuments ? action('documents', 'Documents & assessments', 'file') : null, canClinical ? action('assessments', 'Assessments', 'chart') : null].filter(Boolean);
  if (hub === 'account') {
    if (sub === 'guardians') return [invite, canPortal ? action('portal', 'Portal overview', 'portal') : null, message].filter(Boolean);
    if (sub === 'assignments') return [edit, action('lifecycle', 'Care timeline', 'calendar'), message].filter(Boolean);
    return [edit, assignments, portal, canRequestUpdates ? action('updates', 'Request updates', 'send') : null, processPaper || renewal].filter(Boolean);
  }
  if (hub === 'records') return [upload, processPaper, sub !== 'documents' ? documents : null, canClinical && sub !== 'notes' ? action('notes', 'Clinical notes', 'edit') : null, canBilling && sub !== 'billing' ? action('billing', 'Billing & claims', 'chart') : null, canPortal ? action('portal', 'Portal sharing', 'portal') : null].filter(Boolean);
  if (hub === 'messages') return [sub === 'messages' ? message : action('messages', 'Contact documentation', 'edit'), portal, documents].filter(Boolean);
  return [assignments, renewal, documents, message].filter(Boolean);
}
