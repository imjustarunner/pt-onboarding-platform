export const PACKET_CAPTURES = Object.freeze({
  informed_group_consent: 'packetInformedGroupConsent',
  policy_services: 'packetPolicyServices',
  hipaa_notice: 'packetHipaaNotice'
});

export async function validateIntakePacketEditions(intakeData, loadContext) {
  for (const [sectionKey, flatKey] of Object.entries(PACKET_CAPTURES)) {
    const response = intakeData?.packetSections?.[sectionKey] || intakeData?.[flatKey];
    if (!response) continue;
    const context = await loadContext(sectionKey, response);
    if ((response.contentHash && response.contentHash !== context.contentHash)
      || (response.packetVersion && String(response.packetVersion) !== String(context.packetVersion))) {
      throw Object.assign(new Error(context.locale === 'es'
        ? `El acuerdo «${context.title}» ha cambiado. Vuelva a ese paso para revisarlo y firmarlo antes de enviar.`
        : `The agreement “${context.title}” has changed. Return to that step to review and sign it before submitting.`),
      { status: 409, code: 'INTAKE_AGREEMENT_CHANGED', sectionKey });
    }
  }
}
