import fs from 'fs';
import path from 'path';
import pool from '../config/database.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';
import { buildIntroductionPdf } from './familyIntroductionPdf.js';
import { portalProfilePath } from './familyIntroduction.logic.js';

function readLogo(logoPath) {
  const rel = String(logoPath || '').trim().replace(/^\/+/, '');
  if (!rel || rel.includes('..')) return null;
  const roots = [process.cwd(), path.resolve(process.cwd(), 'backend'), path.resolve(process.cwd(), 'frontend/public')];
  for (const root of roots) {
    const file = path.resolve(root, rel);
    if (!file.startsWith(root)) continue;
    try {
      if (fs.existsSync(file) && fs.statSync(file).isFile() && fs.statSync(file).size < 2_000_000) return fs.readFileSync(file);
    } catch {
      // Try the next location.
    }
  }
  return null;
}

export function providerProfileUrl(agency, provider) {
  const name = [provider?.first_name, provider?.last_name].filter(Boolean).join(' ');
  if (!provider?.id) return '';
  if (agency?.slug === 'itsco') return portalProfilePath({ agencySlug: 'itsco', providerId: provider.id, providerName: name });
  return buildPublicAppUrl(agency, `provider/${provider.id}`);
}

export async function buildProviderIntroductionPdf({ agencyId, providerUserId, schoolId }) {
  const [[provider]] = await pool.execute(
    'SELECT id, first_name, last_name, provider_school_info_blurb FROM users WHERE id = ? LIMIT 1',
    [providerUserId]
  );
  const [[school]] = await pool.execute('SELECT id, name, logo_path FROM agencies WHERE id = ? LIMIT 1', [schoolId]);
  const [staff] = await pool.execute(
    `SELECT DISTINCT TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) AS name, u.last_name, u.first_name
     FROM user_agencies ua
     JOIN users u ON u.id = ua.user_id
     WHERE ua.agency_id = ? AND ua.is_active = 1 AND u.role = 'school_staff'
       AND u.is_active = 1 AND COALESCE(u.is_archived,0) = 0
     ORDER BY u.last_name, u.first_name LIMIT 40`,
    [schoolId]
  );
  const [[supervisor]] = await pool.execute(
    `SELECT TRIM(CONCAT(COALESCE(s.first_name,''), ' ', COALESCE(s.last_name,''))) AS name
     FROM supervisor_assignments a
     JOIN users s ON s.id = a.supervisor_id
     WHERE a.supervisee_id = ? AND a.agency_id = ?
     LIMIT 1`,
    [providerUserId, agencyId]
  );
  return buildIntroductionPdf({
    schoolName: school?.name || 'Your school',
    staffNames: (staff || []).map((row) => row.name).filter((name) => name && name.trim()),
    providerName: [provider?.first_name, provider?.last_name].filter(Boolean).join(' ') || 'Your provider',
    blurb: provider?.provider_school_info_blurb || '',
    supervisorName: supervisor?.name || '',
    logoBytes: readLogo(school?.logo_path)
  });
}

export function introductionPdfAttachment(pdf) {
  return { filename: 'School introduction.pdf', contentType: 'application/pdf', contentBase64: pdf.toString('base64') };
}
