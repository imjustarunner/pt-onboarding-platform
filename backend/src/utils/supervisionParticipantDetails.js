import { classifyHcbsCategory, isBachelorsCredentialText } from './credentialNormalization.js';
import { isStudentIntern } from './studentIntern.js';
export function supervisionParticipantDetails(user = {}) {
  const intern = isStudentIntern(user);
  const hcbs = classifyHcbsCategory({...user, role: intern ? 'intern' : user.role, isHourlyWorker: !!Number(user.is_hourly_worker)});
  return { credential: user.credential || null, educationLabel: isBachelorsCredentialText(user.credential) ? 'Bachelor’s level' : user.credential || 'Education not recorded',
    isIntern: intern, hcbsCategory: hcbs.category, hcbsCategoryLabel: hcbs.label || 'HCBS level not recorded' };
}
