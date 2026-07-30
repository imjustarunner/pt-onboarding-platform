export const SECTION_META = [
  {
    key: 'reminders',
    title: 'Step-by-Step Reminders',
    shortTitle: 'Reminders',
    hint: 'Mark each reminder reviewed or complete',
    description: 'Back-to-school reminders and requests — mark each item as you go.',
    icon: 'list',
  },
  {
    key: 'school_events',
    title: 'School Events',
    shortTitle: 'Events',
    hint: 'Back-to-school events — view, add, and sign up',
    description: 'Check back-to-school dates, add missing events, and sign up to staff them.',
    icon: 'confetti',
  },
  {
    key: 'materials',
    title: 'Materials Request',
    shortTitle: 'Materials',
    hint: 'School cart, office key, shirt sizes, and more',
    description: 'Required school cart choice plus optional ITSCO materials requests.',
    icon: 'box',
  },
  {
    key: 'licenses',
    title: 'Licensure and Compliance',
    shortTitle: 'Licensure',
    hint: 'Confirm license, District 11 background check, and school badge',
    description:
      'Review your professional license and District 11 compliance items (federal background check expiration and school badge) for this school year.',
    icon: 'badge',
  },
  {
    key: 'provider_schedule',
    title: 'Provider Schedule',
    shortTitle: 'Schedule',
    hint: 'Review schools, days, and times',
    description: 'Confirm your school days and times, and request adjustments if needed.',
    icon: 'calendar',
  },
  {
    key: 'clients',
    title: 'Assigned Clients',
    shortTitle: 'Clients',
    hint: 'Clients without a service day',
    description: 'Review assigned clients who still need a day so they can be marked current.',
    icon: 'people',
  },
];

export function currentSchoolYear(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (m >= 7) return `${y}-${String(y + 1).slice(-2)}`;
  return `${y - 1}-${String(y).slice(-2)}`;
}

export function publicProviderYearUpdateUrl(token, orgSlug = '') {
  if (!token) return '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const slug = String(orgSlug || '').trim().replace(/^\/+|\/+$/g, '');
  const path = slug ? `/${slug}/provider-year-update/${token}` : `/provider-year-update/${token}`;
  return `${origin}${path}`;
}

export async function copyTextToClipboard(text) {
  const value = String(text || '');
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}
