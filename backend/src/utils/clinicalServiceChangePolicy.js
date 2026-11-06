/** Shared fail-closed boundary while the two clinical data planes synchronize. */
export function assertNoPendingClinicalServiceChange(session) {
  let metadata = session?.metadata_json;
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { metadata = {}; }
  }
  if (metadata?.serviceCodeChangePending) {
    throw Object.assign(new Error('The encounter service change is still synchronizing. Confirm the same service change again before generating or signing a note.'), {
      status: 409, code: 'CLINICAL_SERVICE_CHANGE_PENDING'
    });
  }
  return session;
}
