/**
 * Per-tenant SMS link-preview images, welcome photos, and questionnaire backgrounds.
 * Files live in frontend/public/assets/{SMSAssets,WelcomeImages}/
 */

const SMS_ROOT = '/assets/SMSAssets';
const WELCOME_ROOT = '/assets/WelcomeImages';
const NLU_WELCOME_DIR = 'NLU and InnerStrength';

export const TENANT_BRAND_ALIASES = {
  itsco: 'itsco',
  nlu: 'nlu',
  nextlevelup: 'nlu',
  nextleveluplcc: 'nlu',
  'next-level-up': 'nlu',
  newlife: 'nlu',
  'new-life-uplift': 'nlu',
  innerstrength: 'innerstrength',
  theinnerstrengthinstitute: 'innerstrength',
  'the-inner-strength-institute': 'innerstrength',
  mh4kidz: 'mh4kidz',
  plottwistco: 'plottwistco',
  plottwist: 'plottwistco',
  plottwisthq: 'plottwistco',
  riserevive: 'riserevive',
  risereviveco: 'riserevive'
};

export const HOST_TO_TENANT = {
  'app.itsco.health': 'itsco',
  'app.nextleveluplcc.com': 'nlu',
  'app.theinnerstrengthinstitute.com': 'innerstrength',
  'app.mh4kidz.com': 'mh4kidz',
  'app.plottwistco.com': 'plottwistco',
  'app.risereviveco.com': 'riserevive'
};

function assetUrl(root, folder, file) {
  const parts = [root.replace(/^\//, ''), folder, file]
    .filter(Boolean)
    .map((part) => String(part).split('/').map(encodeURIComponent).join('/'));
  return `/${parts.join('/')}`;
}

function sms(folder, file) {
  return assetUrl(SMS_ROOT, folder, file);
}

function welcome(folder, file) {
  return assetUrl(WELCOME_ROOT, folder, file);
}

const ITSCO_SMS = {
  careers: sms('ITSCO', '01_Careers.png'),
  join: sms('ITSCO', '02_Join_Us.png'),
  school_referral: sms('ITSCO', '03_School_Referral.png'),
  support: sms('ITSCO', '04_Support.png'),
  events: sms('ITSCO', '05_Events.png'),
  providers: sms('ITSCO', '06_Providers.png'),
  terms: sms('ITSCO', '07_Terms.png'),
  privacy: sms('ITSCO', '08_Policy_and_Services.png'),
  login: sms('ITSCO', '09_Login.png')
};

const NLU_SMS = {
  careers: sms('NLU', '01_Careers.png'),
  join: sms('NLU', '02_Join_Us.png'),
  school_referral: sms('NLU', '03_School_Referral.png'),
  support: sms('NLU', '04_Support.png'),
  events: sms('NLU', '05_Events.png'),
  providers: sms('NLU', '06_Providers.png'),
  terms: sms('NLU', '07_Terms.png'),
  privacy: sms('NLU', '08_Policy_and_Services.png'),
  login: sms('NLU', '09_Login.png'),
  tutors: sms('NLU', '10_Tutors.png'),
  counseling: sms('NLU', '11_Counseling.png'),
  tutoring: sms('NLU', '12_Tutoring.png')
};

const INNER_SMS = {
  careers: sms('InnerStrength', '01_Careers.png'),
  join: sms('InnerStrength', '02_Join_Us.png'),
  school_referral: sms('InnerStrength', '03_School_Referral.png'),
  support: sms('InnerStrength', '04_Support.png'),
  events: sms('InnerStrength', '05_Events.png'),
  providers: sms('InnerStrength', '06_Providers.png'),
  terms: sms('InnerStrength', '07_Terms.png'),
  privacy: sms('InnerStrength', '08_Policy_and_Services.png'),
  login: sms('InnerStrength', '09_Login.png'),
  counseling: sms('InnerStrength', '10_Counseling.png'),
  coaching: sms('InnerStrength', '11_Coaching.png')
};

const MH4_SMS = {
  careers: sms('MH4Kidz', '01_Careers.png'),
  join: sms('MH4Kidz', '02_Join_Us.png'),
  school_referral: sms('MH4Kidz', '03_School_Referral.png'),
  support: sms('MH4Kidz', '04_Support.png'),
  events: sms('MH4Kidz', '05_Events.png'),
  providers: sms('MH4Kidz', '06_Providers.png'),
  terms: sms('MH4Kidz', '07_Terms.png'),
  privacy: sms('MH4Kidz', '08_Policy_and_Services.png'),
  login: sms('MH4Kidz', '09_Login.png'),
  tutors: sms('MH4Kidz', '10_Tutors.png'),
  counseling: sms('MH4Kidz', '11_Counseling.png'),
  tutoring: sms('MH4Kidz', '12_Tutoring.png'),
  coaching: sms('MH4Kidz', '13_Coaching.png')
};

const PTC_SMS = {
  careers: sms('PlotTwistCo', '01_Careers.png'),
  join: sms('PlotTwistCo', '02_Join_Us.png'),
  school_referral: sms('PlotTwistCo', '03_School_Referral.png'),
  support: sms('PlotTwistCo', '04_Support.png'),
  events: sms('PlotTwistCo', '05_Events.png'),
  providers: sms('PlotTwistCo', '06_Providers.png'),
  terms: sms('PlotTwistCo', '07_Terms.png'),
  privacy: sms('PlotTwistCo', '08_Policy_and_Services.png'),
  login: sms('PlotTwistCo', '09_Login.png')
};

const RISE_JOIN = sms('RiseRevive', 'JoinUsRiseRevive.png');
const RISE_COUNSELING = sms('RiseRevive', 'CounselingandCoachingRiseRevive.png');
const RISE_SMS = {
  careers: sms('RiseRevive', 'CareersRiseRevive.png'),
  join: RISE_JOIN,
  school_referral: sms('RiseRevive', 'SchoolReferralRiseREvive.png'),
  support: sms('RiseRevive', 'SupportRiseRevive.png'),
  events: sms('RiseRevive', 'EventsRiseRevive.png'),
  providers: sms('RiseRevive', 'ProvidersRiseRevive.png'),
  terms: sms('RiseRevive', 'TermsRiseRevive.png'),
  privacy: sms('RiseRevive', 'PolicyandServicesRiseRevive.png'),
  login: sms('RiseRevive', 'LoginRiserevive.png'),
  counseling: RISE_COUNSELING,
  coaching: RISE_COUNSELING
};

export const TENANT_SMS_IMAGES = {
  itsco: ITSCO_SMS,
  nlu: NLU_SMS,
  innerstrength: INNER_SMS,
  mh4kidz: MH4_SMS,
  plottwistco: PTC_SMS,
  riserevive: RISE_SMS
};

const itscoW = (file) => welcome('ITSCO', file);
const nluW = (file) => welcome(NLU_WELCOME_DIR, file);

export const TENANT_WELCOME_POOLS = {
  itsco: {
    default: [
      'Welcome, 01_35_26 PM.png',
      'Welcome, 01_35_29 PM.png',
      'Welcome, 01_35_30 PM.png',
      'Welcome, 01_35_31 PM.png',
      'Welcome, 01_35_43 PM.png'
    ].map(itscoW),
    fall: [
      'Welcome, 01_35_35 PMFall1.png',
      'Welcome, 01_35_36 PMFall2.png',
      'Welcome, 01_35_37 PMFall3.png',
      'Welcome, 01_35_39 PMFall4.png'
    ].map(itscoW),
    winter: [
      'Welcome, 01_35_33 PMWinter1.png',
      'Welcome, 01_35_34 PMWinter2.png',
      'Welcome, 01_35_32 PMWinter3.png'
    ].map(itscoW)
  },
  nlu: {
    default: [
      'NavyWelcome1.png',
      'Welcome, 01_35_49 PM.png',
      'Welcome, 01_35_51 PM.png',
      'Welcome, 01_35_56 PM.png'
    ].map(nluW),
    fall: [],
    winter: []
  }
};

TENANT_WELCOME_POOLS.innerstrength = TENANT_WELCOME_POOLS.nlu;

export const TENANT_BACKGROUND_POOLS = {
  itsco: {
    default: [
      'ITSCOBackground1.png',
      'ITSCObackground2.png',
      'ITscobackground3.png',
      'ITSCObackground4.png',
      'itscobackground5.png'
    ].map(itscoW),
    fall: [
      'itscobackgroundfall1.png',
      'ITSCObackroundfall2.png',
      'itscobackgroundfall3.png',
      'itscobackgroundfall4.png'
    ].map(itscoW),
    winter: [
      'Itscobackgroundwinter1.png',
      'itscobackgroundwinter2.png',
      'itscobackgroundwinter3.png'
    ].map(itscoW)
  },
  nlu: {
    default: [
      'NavyBackground.png',
      'NavyBackground2.png',
      'NavyBackground3.png',
      'NavyBackground4.png',
      'NavyBackground5.png',
      'NavyBackground_24_21 PM (7).png',
      'NavyBackground_24_22 PM (8).png',
      'NavyBackground_24_22 PM (9).png',
      'NavyBackground_24_22 PM (10).png'
    ].map(nluW),
    fall: [
      'NavyBackgroundFall.png',
      'NavyBackgroundFall2.png',
      'NavyBackgroundFall3.png',
      'NavyBackgroundFall4.png',
      'NavyBackground_24_20 PM (4)Fall1.png',
      'NavyBackground_24_21 PM (5)Fall2.png',
      'NavyBackground_24_21 PM (6)Fall3.png'
    ].map(nluW),
    winter: [
      'NavyBackgroundWinter.png',
      'NavyBackgroundWinter2.png',
      'NavyBackground1)Winter3.png',
      'NavyBackground_24_20 PM (3)Winter1.png',
      'NavyBackground_24_20 PM (2)Winter2.png'
    ].map(nluW)
  }
};

TENANT_BACKGROUND_POOLS.innerstrength = TENANT_BACKGROUND_POOLS.nlu;

export function normalizeTenantBrandKey(slugOrHost = '') {
  const raw = String(slugOrHost || '').trim().toLowerCase();
  if (!raw) return '';
  if (HOST_TO_TENANT[raw]) return HOST_TO_TENANT[raw];
  const slug = raw.replace(/[^a-z0-9-]/g, '');
  return TENANT_BRAND_ALIASES[slug] || '';
}

export function currentBrandSeason(date = new Date(), timeZone = 'America/Denver') {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, month: 'numeric', day: 'numeric' }).formatToParts(date);
    const month = Number(parts.find((p) => p.type === 'month')?.value || 0);
    if (month >= 9 && month <= 11) return 'fall';
    if (month === 12 || month === 1 || month === 2) return 'winter';
  } catch {
    const month = date.getMonth() + 1;
    if (month >= 9 && month <= 11) return 'fall';
    if (month === 12 || month === 1 || month === 2) return 'winter';
  }
  return 'default';
}

export function pickRotatedUrl(urls = [], date = new Date()) {
  const list = (Array.isArray(urls) ? urls : []).filter(Boolean);
  if (!list.length) return '';
  const day = Math.floor(date.getTime() / 86400000);
  return list[((day % list.length) + list.length) % list.length];
}

function poolForSeason(pools, season) {
  const seasonal = pools?.[season] || [];
  if (season !== 'default' && seasonal.length) return seasonal;
  return pools?.default || [];
}

export function pickTenantWelcomeUrl(slugOrHost, date = new Date()) {
  const key = normalizeTenantBrandKey(slugOrHost);
  const pools = TENANT_WELCOME_POOLS[key];
  if (!pools) return '';
  return pickRotatedUrl(poolForSeason(pools, currentBrandSeason(date)), date);
}

export function pickTenantBackgroundUrl(slugOrHost, date = new Date()) {
  const key = normalizeTenantBrandKey(slugOrHost);
  const pools = TENANT_BACKGROUND_POOLS[key];
  if (!pools) return '';
  return pickRotatedUrl(poolForSeason(pools, currentBrandSeason(date)), date);
}

export function tenantSmsImage(slugOrHost, pageKey) {
  const key = normalizeTenantBrandKey(slugOrHost);
  const page = String(pageKey || '').trim().toLowerCase();
  const images = TENANT_SMS_IMAGES[key] || {};
  if (images[page]) return images[page];
  if (page === 'counseling' && images.join) return images.join;
  return '';
}

const JOIN_SERVICE_RE = /(?:^|\/)join\/(?:[^/]+\/)?(counseling|tutoring|coaching|consulting)(?:\/|$)/;

export function pathToSharePageKey(pathname = '', serviceType = '') {
  const p = String(pathname || '/').split('?')[0].toLowerCase();
  const pathJoinService = p.match(JOIN_SERVICE_RE)?.[1]
    || (p.includes('join_tutoring') ? 'tutoring' : '')
    || (p.includes('join_counseling') ? 'counseling' : '');
  const joinService = pathJoinService
    || ((p.includes('/join') || p.includes('/intake'))
      ? String(serviceType || '').trim().toLowerCase()
      : '');
  if (p === '/support' || p.endsWith('/support')) return 'support';
  if (p.includes('/careers')) return 'careers';
  if (p.includes('/school-referral')) return 'school_referral';
  if (p.includes('/privacypolicy') || p.includes('/privacy') || p.includes('/policy-and-services')) return 'privacy';
  if (p === '/terms' || p.endsWith('/terms')) return 'terms';
  if (p.includes('/login')) return 'login';
  if (p.includes('/find-provider') || /\/providers(\/|$)/.test(p)) return 'providers';
  if (p.includes('/open-events') || p.endsWith('/events') || p.includes('/events')) return 'events';
  if (p.includes('/find-tutor') || p.includes('/tutors')) return 'tutors';
  if (p.includes('/find-coach')) return 'coaching';
  if (joinService === 'tutoring') return 'tutoring';
  if (joinService === 'coaching') return 'coaching';
  if (joinService === 'counseling' || joinService === 'consulting') return 'counseling';
  if (p.includes('/join') || p.includes('/office-intake') || p.includes('/intake')) return 'join';
  if (p.includes('/book')) return 'book';
  return 'home';
}
