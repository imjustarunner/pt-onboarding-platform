import { isInternRoleOrCredential } from './credentialNormalization.js';

// Clinical interns may have the platform role "provider" and a BA credential.
// Do not classify all bachelor's-level staff or prelicensed clinicians as interns.
export function isStudentIntern(user = {}) {
  return isInternRoleOrCredential(user)
    || ['intern', 'internship', 'practicum'].includes(String(user.employment_type || '').trim().toLowerCase())
    || /\b(intern|internship|practicum)\b/i.test(String(user.title || '')) && !/\b(mentor|supervisor|coordinator|director)\b/i.test(String(user.title || ''));
}
