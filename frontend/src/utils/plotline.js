export const PLOTLINE_ORIGIN = 'https://plotlinepo.com';
// Public marketing lives here until the dedicated product domain is launched.
export const PLOTLINE_WEBSITE_PATH = '/plottline';
export const PLOTLINE_WEBSITE_URL = `https://plottwistco.com${PLOTLINE_WEBSITE_PATH}`;
export const PLOTLINE_MARKETING_PAGES = ['product', 'solutions', 'resources', 'about', 'pricing', 'start'];
export const PLOTLINE_PREFIX = '/plotline';
export const isPlotlineHost = (host = '') => ['plotlinepo.com', 'www.plotlinepo.com'].includes(String(host).toLowerCase().split(':')[0]);
export const isPlotlinePath = (path = '') => /^\/plott?line(?:[/?#]|$)/.test(path);

// Staff-only surfaces. Public applications identify their product from form data.
export function isPlotlineWorkspacePath(path = '') {
  return /^\/(?:[a-z0-9-]+\/)?(?:people-operations|onboarding|my-learning|tracks|tasks(?:\/.*)?|on-demand-training(?:\/.*)?|module\/[^/]+|training-focuses\/[^/]+|admin\/(?:hiring(?:\/.*)?|careers(?:\/.*)?|interview-hub(?:\/.*)?|pre-hire(?:\/.*)?|onboarding|modules(?:\/.*)?|agency-progress|documents(?:\/.*)?|contracts(?:\/.*)?|employee-relations(?:\/.*)?|employee-evaluations(?:\/.*)?))\/?$/.test(path);
}

// Reserve infrastructure and product paths before resolving a company slug.
export const PLOTLINE_RESERVED_SLUGS = new Set(['plottline', 'product', 'solutions', 'resources', 'about', 'start', 'app', 'api', 'assets', 'uploads', 'login', 'logout', 'admin', 'dashboard', 'careers', 'plotline', 'p', 'intake', 'i', 'join', 'public', 'support', 'privacy', 'terms', 'pricing', 'security', 'robots.txt', 'sitemap.xml', 'favicon.ico', 'manifest.webmanifest', 'account-info', 'account-security', 'admin', 'admin-dashboard', 'athlete-readiness', 'buildings', 'burden-purpose', 'careers', 'challenges', 'change-password', 'class-presentation-builder', 'client-exchange', 'college-readiness', 'communications', 'counseling', 'credentials', 'dashboard', 'demo-launch', 'digital-wellness', 'email-compose', 'family', 'family-functioning', 'guardian', 'join-design-preview', 'kiosk', 'library', 'life-balance', 'login', 'marriage-alignment', 'mens-life', 'messages', 'messaging', 'michael', 'my-learning', 'my-meetings', 'my-schedule', 'my-virtual-office', 'mydashboard', 'note-aid', 'notifications', 'office', 'on-demand-training', 'onboarding', 'operations-dashboard', 'parenting-confidence', 'passwordless-login', 'pending-completion', 'people-operations', 'personal-fulfillment', 'plans', 'platformhipaa', 'plotline', 'preferences', 'privacy-review', 'privacypolicy', 'provider-mobile', 'provider-plus-dashboard', 'publicproof', 'quick-view', 'qv', 'relationship-health', 'reward-regulation', 'savage-blueprint', 'schedule', 'school-operations', 'school-referral', 'schoolcarebridge', 'schools', 'session-ended', 'settings', 'student-success', 'support', 'tasks', 'teen-wellbeing', 'terms', 'tickets', 'tools-aids', 'tracks', 'values-alignment', 'verify-club-manager-email', 'workforce-operations']);
export function isPlotlineCompanySlug(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || '')) && !PLOTLINE_RESERVED_SLUGS.has(value);
}
export function plotlineCareersUrl(slug) {
  return isPlotlineCompanySlug(slug) ? `${PLOTLINE_ORIGIN}/${slug}` : '';
}

/** A URL adapter, never an authorization decision. Existing routes retain their guards. */
export const plotlinePaths = {
  internal(value) {
    const path = String(value);
    if (PLOTLINE_MARKETING_PAGES.some(page => new RegExp(`^/${page}(?:[/?#]|$)`).test(path))) return `/plotline${path}`;
    if (/^\/(?:[?#]|$)/.test(path)) return `/plotline${path.slice(1)}`;
    if (/^\/(?:app|login)\/?(?:[?#]|$)/.test(path)) return path.replace(/^\/(?:app|login)\/?/, '/plotline/app');
    const staff = path.match(/^\/app\/([a-z0-9-]+)(\/[^?#]*)?([?#].*)?$/);
    if (staff && isPlotlineCompanySlug(staff[1])) return `/${staff[1]}${staff[2] && staff[2] !== '/' ? staff[2] : '/people-operations'}${staff[3] || ''}`;
    const careers = path.match(/^\/([a-z0-9-]+)(\/jobs\/[^/?#]+)?\/?([?#].*)?$/);
    if (careers && isPlotlineCompanySlug(careers[1])) return `/careers/${careers[1]}${careers[2] || ''}${careers[3] || ''}`;
    return path;
  },
  clean(value) {
    const path = String(value);
    if (/^\/plott?line\/(product|solutions|resources|about|pricing|start)(?:[/?#]|$)/.test(path)) return path.replace(/^\/plott?line/, '');
    if (/^\/plotline\/app(?=[/?#]|$)/.test(path)) return path.replace(/^\/plotline/, '');
    if (/^\/plott?line(?=[?#]|\/?$)/.test(path)) return path.replace(/^\/plott?line\/?/, '/');
    const careers = path.match(/^\/careers\/([a-z0-9-]+)(\/jobs\/[^/?#]+)?([?#].*)?$/);
    if (careers && isPlotlineCompanySlug(careers[1])) return `/${careers[1]}${careers[2] || ''}${careers[3] || ''}`;
    const staff = path.match(/^\/([a-z0-9-]+)\/(people-operations|admin(?:\/[^?#]*)?|dashboard|change-password|onboarding|my-learning|tracks|on-demand-training(?:\/[^?#]*)?|module\/[^/?#]+|tasks(?:\/[^?#]*)?)([?#].*)?$/);
    if (staff && isPlotlineCompanySlug(staff[1])) return `/app/${staff[1]}${staff[2] === 'people-operations' ? '' : `/${staff[2]}`}${staff[3] || ''}`;
    return path;
  }
};
