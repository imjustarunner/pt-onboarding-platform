import {staffWorkPhone,normalizePhoneExtension} from '../../utils/staffWorkContact.js';
import {classifyPayAndHcbsCategories} from '../../utils/credentialNormalization.js';
import {publicUploadsUrlFromStoredPath} from '../../utils/uploads.js';
export function mapDirectoryPerson(r, section, agency={}) {
  const first = r.first_name || r.firstName || '';
  const last = r.last_name || r.lastName || '';
  const preferred = r.preferred_name || r.preferredName || '';
  const displayName = preferred || `${first} ${last}`.trim() || r.email || 'Teammate';
  const axes = classifyPayAndHcbsCategories({
    credential: r.credential,
    title: r.title,
    role: r.role,
    isHourlyWorker: r.is_hourly_worker
  });
  return {
    id: Number(r.id),
    displayName,
    firstName: first,
    lastName: last,
    role: r.role || null,
    email: r.work_email || r.email || null,
    workEmail: r.work_email || null,
    workPhone: staffWorkPhone(agency, r.work_phone),
    workPhoneExtension: normalizePhoneExtension(r.work_phone_extension),
    schoolId: Number(r.school_id) || null, schoolName: r.school_name || null,
    isSchoolAdmin: Number(r.is_school_admin)===1,
    profilePhotoUrl: publicUploadsUrlFromStoredPath(r.profile_photo_path) || null,
    hcbsCategory: axes.hcbsCategory,
    hcbsCategoryLabel: axes.hcbsCategoryLabel,
    credential: r.credential || null,
    section
  };
}

