function metadata(value) {
  if (typeof value === 'string') { try { return JSON.parse(value) || {}; } catch { return {}; } }
  return value || {};
}

export function documentSignerAccess(task, signedDoc, user) {
  const meta = metadata(task?.metadata);
  const assignedId = Number(task?.assigned_to_user_id || 0);
  const actorId = Number(user?.id || 0);
  const signerMatches = !assignedId || Number(signedDoc?.user_id) === assignedId;
  const superseded = Boolean(meta.signatureRequestSupersededAt);
  const signed = Boolean(signedDoc?.signed_pdf_path) && signerMatches && !superseded;
  const counterId = Number(meta.requiredCountersignerUserId || 0);
  const counter = metadata(signedDoc?.audit_trail).adminCountersign;
  return {
    assignedSignerUserId: assignedId || null,
    assignedSignerName: meta.assignedSignerName || null,
    actualSignerUserId: signedDoc?.user_id || null,
    signed,
    superseded,
    replacementTaskId: meta.replacementTaskId || null,
    signerMismatch: Boolean(signedDoc) && !signerMatches,
    countersigned: signed && Boolean(counter?.signedAt),
    canSign: !superseded && (!signedDoc || signerMatches) && !signedDoc?.signed_pdf_path && (!assignedId || actorId === assignedId),
    canCountersign: signed && !counter?.signedAt && actorId !== Number(signedDoc?.user_id)
      && ['super_admin', 'admin', 'support'].includes(user?.role)
      && (!counterId || actorId === counterId)
  };
}

export function requireCurrentSignatureRequest(task) {
  if (metadata(task?.metadata).signatureRequestSupersededAt) {
    throw Object.assign(new Error('This signature request was superseded. Do not use this copy; open the replacement request.'), { status: 409 });
  }
}

export function requireAssignedDocumentSigner(task, user, signedDoc = null) {
  requireCurrentSignatureRequest(task);
  const assignedId = Number(task?.assigned_to_user_id || 0);
  if (assignedId && assignedId !== Number(user?.id)) {
    throw Object.assign(new Error('This signing step belongs to the assigned signer. Wait for their signature before countersigning.'), { status: 403 });
  }
  if (signedDoc && Number(signedDoc.user_id) !== Number(user?.id)) {
    throw Object.assign(new Error('The signature record belongs to another signer. A replacement request is required.'), { status: 409 });
  }
}

export function requireValidPrimarySignature(task, signedDoc, user) {
  requireCurrentSignatureRequest(task);
  const state = documentSignerAccess(task, signedDoc, user);
  if (!state.signed) {
    throw Object.assign(new Error('The assigned signer has not signed this document. Their signature is required before countersigning.'), { status: 409 });
  }
  if (Number(signedDoc.user_id) === Number(user.id)) {
    throw Object.assign(new Error('The original signer cannot also supply the supervisor countersignature.'), { status: 403 });
  }
}
