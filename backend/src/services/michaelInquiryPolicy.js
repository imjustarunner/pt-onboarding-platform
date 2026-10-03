const coachingInterests = new Set(['coaching','running-reset','running-plan','college-session','college-roadmap','recruiting-strategy']);
export function validateMichaelWebsiteInquiry(agency, payload) {
 if (String(agency?.slug || '').toLowerCase() !== 'michael') return;
 if (payload.inquirySource !== 'michael_website' && !coachingInterests.has(payload.interest)) return;
 if (payload.adultContact !== true || !['adult_self','parent_guardian','organization'].includes(payload.contactRole)) {
  throw Object.assign(new Error('An adult must submit this inquiry. For someone under 18, a parent or guardian should use their own contact information.'), {status:400});
 }
}
