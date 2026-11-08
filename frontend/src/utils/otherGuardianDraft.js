const fields = { hasLegalRights: 'has_legal_rights', firstName: 'first_name', lastName: 'last_name', email: 'email', phone: 'phone', relationship: 'relationship' };

export function snapshotOtherGuardian(value = {}) {
  return {
    ...Object.fromEntries(Object.keys(fields).map(key => [key, String(value[key] || '')])),
    courtDocumentsUploaded: value.courtDocumentsUploaded === true
  };
}

export function restoreOtherGuardian(snapshot = {}, savedGuardian = {}) {
  if (snapshot.otherGuardian) return snapshotOtherGuardian(snapshot.otherGuardian);
  const candidates = [snapshot.guardian, snapshot.intakeResponses?.guardian, savedGuardian];
  const saved = candidates.find(g => String(g?.other_guardian_has_legal_rights || '').trim()) || {};
  return snapshotOtherGuardian({
    ...Object.fromEntries(Object.entries(fields).map(([key, suffix]) => [key, saved[`other_guardian_${suffix}`]])),
    courtDocumentsUploaded: saved.other_guardian_court_docs === 'yes'
  });
}
