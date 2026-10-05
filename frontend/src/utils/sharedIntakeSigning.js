export const SHARED_SIGNING_STEP_TYPES = new Set([
  'document', 'school_roi', 'smart_disclosure', 'disclosure',
  'packet_informed_group_consent', 'packet_policy_services', 'packet_hipaa_notice'
]);

export function sharedSigningChildren(clients = [], answers = []) {
  return clients.map((client, index) => {
    const response = answers[index] || {};
    return {
      fullName: String(client.fullName || [client.firstName || response.child_legal_first || response.client_first,
        client.middleName, client.lastName || response.child_legal_last || response.client_last].filter(Boolean).join(' ')).trim(),
      dateOfBirth: String(response.child_dob || response.client_dob || response.date_of_birth || client.dateOfBirth || client.date_of_birth || client.dob || '').slice(0, 10)
    };
  });
}

export function clinicalAnswersForStep(step, responses, sharedAnswers) {
  const index = step?.clientIndex;
  if (!Number.isInteger(index) || index < 0) return sharedAnswers;
  if (!responses.clients[index]) responses.clients[index] = {};
  return responses.clients[index];
}
