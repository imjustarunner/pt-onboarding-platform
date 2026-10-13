import pool from '../config/database.js';
import ProviderPublicProfile from '../models/ProviderPublicProfile.model.js';
import { buildPublicFormBrandingForAgencyId, requestBaseUrl } from './publicFormBranding.service.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';

// Only call after resolving and authorizing an active office. Reuse the provider's
// public biography, never account details, internal notes, or clinical records.
export async function virtualOfficePresentation(room, req) {
  const [branding, profile, [people]] = await Promise.all([
    buildPublicFormBrandingForAgencyId(room.agencyId, {
      baseUrl: process.env.BACKEND_PUBLIC_URL || process.env.BACKEND_URL || requestBaseUrl(req)
    }),
    ProviderPublicProfile.getForProvider({ providerUserId: room.userId, agencyId: room.agencyId }),
    pool.execute('SELECT first_name,last_name,profile_photo_path,credential,title FROM users WHERE id=? LIMIT 1', [room.userId])
  ]);
  const person = people[0] || {};
  const name = room.displayName || [person.first_name, person.last_name].filter(Boolean).join(' ') || 'Your provider';
  return {
    slug: room.slug, displayName: name, agencyId: room.agencyId, branding,
    provider: {
      name, photoUrl: publicUploadsUrlFromStoredPath(person.profile_photo_path),
      credential: person.credential || '', title: person.title || '',
      bio: profile?.publicBlurb || '',
      languages: Array.isArray(profile?.details?.languages) ? profile.details.languages : []
    }
  };
}
