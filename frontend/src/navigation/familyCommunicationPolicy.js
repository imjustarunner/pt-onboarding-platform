// Shared verbatim by the portal and server. This file must stay dependency-free.
export const FAMILY_COMMUNICATION_POLICY_VERSION = '2026-11-11';
export const FAMILY_COMMUNICATION_NOTICE = Object.freeze({
  title: 'Understand who can see this communication',
  statements: [
    'Secure portal messages and session comments are shared with all eligible family portal users for this client, including both parents or guardians when each has access. Review the recipient list before sending.',
    'Secure means encrypted in AuricWell. It does not mean private from the eligible recipients shown. A person added later will not receive access to earlier messages or comments.',
    'Use a private scheduled session for concerns you do not want shared here. Individual email remains available separately; ordinary email is not this encrypted portal conversation.',
    'Messages and comments do not replace a scheduled therapy session and are not therapy or therapeutic interventions.'
  ],
  acknowledgment: 'I understand who can see these communications and that they are not therapy or a substitute for a scheduled session.'
});
