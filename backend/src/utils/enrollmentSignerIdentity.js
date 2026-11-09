// Final enrollment receipts use the reviewed signer, never the first-page draft.
// Previously submitted evidence is immutable; this only validates a pending enrollment.
export function enrollmentSignerIdentity(submission, guardian, intakeData) {
  if (submission?.status === 'submitted' || !guardian?.email) return {};
  const email = String(guardian.email).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Enter a valid signer email.'), {status:400});
  for (const capture of [intakeData?.smartSchoolRoi, intakeData?.smartDisclosure, ...Object.values(intakeData?.packetSections || {})]) {
    if (capture?.signatureData && capture.signer?.email && String(capture.signer.email).trim().toLowerCase() !== email.toLowerCase()) {
      throw Object.assign(new Error('Your email changed after signing. Please review and sign the enrollment forms again.'), {status:400});
    }
  }
  return { signer_email: email, signer_name: [guardian.firstName,guardian.lastName].filter(Boolean).join(' ').trim() || submission.signer_name,
    signer_phone: String(guardian.phone || '').trim() || submission.signer_phone || null };
}
