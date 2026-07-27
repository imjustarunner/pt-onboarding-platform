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
    hint: 'School cart and other materials',
    description: 'Tell us if you need a school cart for back-to-school events.',
    icon: 'box',
  },
  {
    key: 'provider_schedule',
    title: 'Provider Schedule',
    shortTitle: 'Schedule',
    hint: 'Review schools, days, and clients',
    description: 'Confirm your school days and clients, and request additional school availability if needed.',
    icon: 'calendar',
  },
];

export function currentSchoolYear(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (m >= 7) return `${y}-${String(y + 1).slice(-2)}`;
  return `${y - 1}-${String(y).slice(-2)}`;
}

export function publicProviderYearUpdateUrl(token) {
  if (!token) return '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/provider-year-update/${token}`;
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
