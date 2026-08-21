/**
 * Link-preview metadata for crawlers (iMessage, Slack, Facebook, etc.).
 * Those clients read the HTML response — they do not run Vue — so title/OG/image
 * must be present in index.html when it is served.
 */

const TENANTS = {
  'app.itsco.health': {
    name: 'ITSCO',
    image: '/assets/careers/heroes/itsco-framed.png',
    description: 'Counseling, support, and care with ITSCO.'
  },
  'app.nextleveluplcc.com': {
    name: 'Next Level Up',
    image: '/assets/careers/heroes/nlu-framed.png',
    description: 'Learning, support, and programs with Next Level Up.'
  },
  'app.mh4kidz.com': {
    name: 'MH4Kidz',
    image: '/branding/plottwisthq-platform-bg.png',
    description: 'Care, scheduling, and support.'
  },
  'app.plottwistco.com': {
    name: 'Plot Twist Co',
    image: '/branding/plottwisthq-platform-bg.png',
    description: 'Care, scheduling, and support.'
  },
  'app.mentalrange.org': {
    name: 'Mental Range',
    image: '/branding/plottwisthq-platform-bg.png',
    description: 'Care, scheduling, and support.'
  },
  'app.rockymountainmentors.org': {
    name: 'Rocky Mountain Mentors',
    image: '/branding/plottwisthq-platform-bg.png',
    description: 'Mentoring, programs, and support.'
  },
  'app.rmmentors.com': {
    name: 'Rocky Mountain Mentors',
    image: '/branding/plottwisthq-platform-bg.png',
    description: 'Mentoring, programs, and support.'
  },
  'app.risereviveco.com': {
    name: 'Rise Revive Co',
    image: '/branding/plottwisthq-platform-bg.png',
    description: 'Care, scheduling, and support.'
  },
  'app.theinnerstrengthinstitute.com': {
    name: 'The Inner Strength Institute',
    image: '/branding/plottwisthq-platform-bg.png',
    description: 'Care, scheduling, and support.'
  },
  'plottwisthq.com': {
    name: 'PlotTwist HQ',
    image: '/branding/plottwisthq-platform-bg.png',
    description: 'People operations, care, and programs.'
  },
  'www.plottwisthq.com': {
    name: 'PlotTwist HQ',
    image: '/branding/plottwisthq-platform-bg.png',
    description: 'People operations, care, and programs.'
  }
};

const DEFAULT_IMAGE = '/branding/plottwisthq-platform-bg.png';
const DEFAULT_DESC = 'Care, scheduling, billing, and support.';

/** When host is plottwisthq.com, resolve tenant from path slug (/join/nlu/…, /careers/nlu). */
const PATH_TENANTS = {
  itsco: { name: 'ITSCO', description: 'Counseling, support, and care with ITSCO.' },
  nlu: { name: 'Next Level Up', description: 'Learning, support, and programs with Next Level Up.' },
  nextlevelup: { name: 'Next Level Up', description: 'Learning, support, and programs with Next Level Up.' },
  nextleveluplcc: { name: 'Next Level Up', description: 'Learning, support, and programs with Next Level Up.' },
  newlife: { name: 'Next Level Up', description: 'Learning, support, and programs with Next Level Up.' },
  mh4kidz: { name: 'MH4Kidz', description: 'Care, scheduling, and support.' },
  innerstrength: { name: 'The Inner Strength Institute', description: 'Care, scheduling, and support.' },
  theinnerstrengthinstitute: { name: 'The Inner Strength Institute', description: 'Care, scheduling, and support.' },
  riserevive: { name: 'Rise Revive Co', description: 'Care, scheduling, and support.' },
  risereviveco: { name: 'Rise Revive Co', description: 'Care, scheduling, and support.' },
  plottwistco: { name: 'Plot Twist Co', description: 'Care, scheduling, and support.' }
};

export const DEFAULT_OG_IMAGE_PLACEHOLDER = 'https://plottwisthq.com/api/public/share-preview/image';

function normHost(host) {
  return String(host || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
}

function resolvePathTenantSlug(pathname = '') {
  const parts = String(pathname || '')
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .map((p) => p.toLowerCase());
  if (!parts.length) return '';
  const reserved = new Set([
    'login', 'admin', 'dashboard', 'api', 'assets', 'branding', 'join', 'office-intake',
    'careers', 'support', 'public', 'book', 'counseling', 'tutoring', 'coaching',
    'consulting', 'school-referral', 'district-schedule', 'find-tutor', 'find-counselor',
    'find-coach', 'find-provider', 'events', 'providers', 'terms', 'privacy', 'tutors', 'portal'
  ]);
  const [a, b] = parts;
  if (a === 'join' || a === 'office-intake' || a === 'careers' || a === 'support') {
    return b && !reserved.has(b) ? b : '';
  }
  if (reserved.has(a)) return '';
  return a;
}

function pageCopy(pathname) {
  const p = String(pathname || '/').split('?')[0].toLowerCase();
  if (p === '/support' || p.endsWith('/support')) {
    return {
      page: 'Support and contact',
      description: 'Call, text, or send a message. We are here to help.'
    };
  }
  if (/\/join\/[^/]+\/counseling|join_counseling|\/counseling/.test(p) && p.includes('join')) {
    return { page: 'Counseling', description: 'Start counseling intake or join a counseling program.' };
  }
  if (/\/join\/[^/]+\/tutoring|join_tutoring|\/tutoring/.test(p) && p.includes('join')) {
    return { page: 'Tutoring', description: 'Start tutoring intake or join a tutoring program.' };
  }
  if (p.includes('/join') || p.includes('/office-intake') || p.includes('/intake')) {
    return {
      page: 'Get started',
      description: 'Start intake or join a program.'
    };
  }
  if (p.includes('/district-schedule')) {
    return {
      page: 'District schedule',
      description: 'Schools, providers, and on-site days for your district.'
    };
  }
  if (p.includes('/bookclub') || p.includes('/book-club')) {
    return { page: 'Book Club', description: 'Join the ITSCO Book Club and see current reads.' };
  }
  if (p.includes('/careers')) {
    return { page: 'Careers', description: 'Explore open roles and how to apply.' };
  }
  if (p.includes('/login')) {
    return { page: 'Sign in', description: 'Sign in to your account.' };
  }
  if (p.includes('/book')) {
    return { page: 'Book a session', description: 'Request a time with our team.' };
  }
  return { page: '', description: '' };
}

function guessTenantName(host) {
  const parts = host.split('.').filter(Boolean);
  if (parts[0] === 'app' && parts[1] && parts[1] !== 'www') {
    return parts[1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return 'PlotTwist HQ';
}

export function buildShareMeta({ host, path, proto = 'https' } = {}) {
  const hostname = normHost(host);
  const pathSlug = resolvePathTenantSlug(path);
  const pathTenant = PATH_TENANTS[pathSlug] || null;
  const hostTenant = TENANTS[hostname] || null;
  const isPlatformHost = hostname === 'plottwisthq.com' || hostname === 'www.plottwisthq.com' || !hostname;
  const tenant = (isPlatformHost && pathTenant)
    ? pathTenant
    : (hostTenant || {
      name: guessTenantName(hostname),
      image: DEFAULT_IMAGE,
      description: DEFAULT_DESC
    });
  const page = pageCopy(path);
  const name = tenant.name;
  const title = page.page ? `${name} · ${page.page}` : name;
  const description = page.description || tenant.description || DEFAULT_DESC;
  const scheme = proto === 'http' ? 'http' : 'https';
  const origin = hostname ? `${scheme}://${hostname}` : '';
  const imagePath = `/api/public/share-preview/image?path=${encodeURIComponent(path || '/')}`;
  const image = origin ? `${origin}${imagePath}` : imagePath;
  const url = origin ? `${origin}${path || '/'}` : (path || '/');
  return { name, title, description, image, url, imagePath };
}

export function injectShareMetaIntoHtml(html, meta) {
  const safe = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
  let out = String(html || '');
  out = out.replace(/<title>Portal<\/title>/i, `<title>${safe(meta.title)}</title>`);
  out = out.replace(/content="Portal"/g, `content="${safe(meta.title)}"`);
  out = out.replace(
    /content="Care, scheduling, billing, and support\."/g,
    `content="${safe(meta.description)}"`
  );
  out = out.replaceAll(DEFAULT_OG_IMAGE_PLACEHOLDER, meta.image);
  const extra = [
    `<meta property="og:url" content="${safe(meta.url)}">`,
    `<meta property="og:site_name" content="${safe(meta.name)}">`
  ].join('');
  if (!out.includes('property="og:url"')) {
    out = out.replace('</title>', `</title>\n    ${extra}`);
  }
  return out;
}
