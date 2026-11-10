// Keep the family's answers while requiring new consent for a changed signer.
export function invalidateEnrollmentSignatures(submission = {}) {
  for (const key of ['smartSchoolRoi', 'smartDisclosure', 'packetInformedGroupConsent', 'packetPolicyServices', 'packetHipaaNotice']) {
    submission[key] = null;
  }
  submission.packetSections = {};
  for (const child of submission.guardianWaiverIntake?.clients || []) {
    for (const section of Object.values(child.sections || {})) {
      section.signatureData = '';
      section.signatureMeta = null;
    }
  }
  if (submission.insuranceInfo) {
    Object.assign(submission.insuranceInfo, {
      authorizationAgreed: false, authorizationSignature: '', authorizationSignatureData: '',
      authorizationSignedAt: null, authorizationSignatureMeta: null, authorizationSourceMethod: ''
    });
  }
  for (const key of ['communicationPreferences', 'communicationDraft']) {
    if (submission[key]) {
      submission[key].signatureAccepted = false;
      submission[key].signedAt = null;
    }
  }
}
