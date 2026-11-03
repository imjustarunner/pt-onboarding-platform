import { anonymousWebsiteVisitor, createWebsiteTracker, websiteSource } from '../../utils/publicWebsiteAnalytics';

// This catalog, rather than visible chart/button text, supplies every demo label.
// Never add client names, record IDs, search terms or editable text to these keys.
export const DEMO_ANALYTICS_ACTIONS = Object.freeze({
  'client-search': 'Search demo clients', 'client-scope': 'Filter demo clients',
  'client-quick-look-open': 'Open client quick look', 'client-quick-look-close': 'Close client quick look',
  'client-chart-open': 'Open client chart', 'client-chart-back': 'Return to clients',
  'chart-tab': 'Explore a chart tab', 'chart-note-open': 'Open chart documentation',
  'provider-search': 'Search demo providers', 'provider-profile-open': 'Open provider profile',
  'provider-tab': 'Explore a provider tab', 'show-all-staff': 'Show all staff',
  'provider-caseload-open': 'Explore provider caseload', 'provider-schedule-open': 'Explore provider schedule',
  'provider-documentation-open': 'Explore provider documentation', 'plotline-open': 'Explore Plotline',
  'note-draft-open': 'Open a note draft', 'note-open': 'Open a note', 'note-cosign-open': 'Open a co-sign note',
  'demo-note-open-draft': 'Open a note draft', 'demo-note-open-cosign': 'Open a co-sign note',
  'demo-note-simulate-sign-next': 'Simulate sign and open next',
  'note-sign-next': 'Simulate sign and open next', 'note-close': 'Close a note',
  'note-edit': 'Explore note editing', 'note-toggle-library': 'Toggle note library',
  'note-toggle-queue': 'Toggle My Work', 'demo-reset': 'Reset the demo',
  'schedule-view': 'Explore a calendar view', 'schedule-session-open': 'Open a demo session',
  'demo-control': 'Explore a demo control', 'demo-filter': 'Use a demo filter',
  'demo-search': 'Use demo search', 'demo-link': 'Explore a demo link',
  'nav-overview': 'Open demo overview', 'nav-appointments': 'Open demo schedule',
  'nav-clients': 'Open demo clients', 'nav-documentation': 'Open demo notes',
  'nav-billing': 'Open demo billing', 'nav-providers': 'Open demo providers', 'nav-reports': 'Open demo reports', 'nav-tasks':'Open demo tasks and to-do lists', 'workspace-back':'Return to demo overview'
});
export const DEMO_ANALYTICS_AREAS = Object.freeze({
  clients: 'Demo clients', 'client-quick-look': 'Client quick look', 'client-chart': 'Client chart',
  providers: 'Demo providers', 'provider-profile': 'Provider profile', plotline: 'Plotline',
  'my-work': 'My Work', 'note-editor': 'Note editor', 'note-library': 'Note drafts',
  documentation: 'Notes and documentation',
  'co-sign': 'Supervisor co-sign review', schedule: 'Practice schedule', billing: 'Demo billing',
  overview: 'Practice overview', reports: 'Demo reports', tasks:'Tasks and to-do lists'
});
const PAGES = new Set(['home', 'product', 'security', 'about', 'contact', 'partners']);
const DEMO_SECTIONS = new Set(['overview', 'appointments', 'clients', 'documentation', 'billing', 'providers', 'reports', 'tasks']);
const ENDPOINT = '/api/public/marketing-pages/auricwell/analytics/events';
const privacyRequested = browser => browser.navigator.globalPrivacyControl === true ||
  [browser.navigator.doNotTrack, browser.doNotTrack].includes('1');
function signedIn(browser) {
  try {
    // Only presence is inspected. No account/token value enters the context or an event.
    return ['authToken', 'user', 'sessionId'].some(key => Boolean(browser.localStorage.getItem(key))) ||
      /(?:^|;\s*)authToken=/.test(browser.document.cookie || '');
  } catch { return false; }
}
function preview(browser) {
  const params = new URLSearchParams(browser.location.search);
  return params.has('marketingPreview') || params.has('preview');
}
export function readAuricwellAnalyticsContext(browser = window) {
  const authenticated = signedIn(browser);
  let storage;
  try { storage = browser.localStorage; } catch { storage = { getItem: () => null, setItem() {} }; }
  return {
    visitorId: privacyRequested(browser) || preview(browser) || authenticated ? null :
      anonymousWebsiteVisitor(storage, browser.crypto),
    signedIn: authenticated,
    source: websiteSource(browser.document.referrer, browser.location.origin)
  };
}
export function auricwellAnalyticsPath(mode, route, page = 'home') {
  if (mode !== 'demo') return PAGES.has(page) ? `/p/auricwell${page === 'home' ? '' : '/' + page}` : null;
  const section = String(route?.params?.section || 'overview');
  return DEMO_SECTIONS.has(section) ? `/p/auricwell/demo/${section}` : null;
}
export function demoAnalyticsMetadata(element, area = false) {
  if (area) {
    const key = element.getAttribute('data-analytics-area');
    return Object.hasOwn(DEMO_ANALYTICS_AREAS, key) ? { key: 'page/' + key, label: DEMO_ANALYTICS_AREAS[key] } : null;
  }
  let key = element.getAttribute('data-analytics-id');
  if (!Object.hasOwn(DEMO_ANALYTICS_ACTIONS, key)) {
    const href = element.getAttribute('href') || '';
    const section = href.match(/^#\/meadowbrook(?:\/([a-z]+))?$/)?.[1] || (href === '#/meadowbrook' ? 'overview' : '');
    if (DEMO_SECTIONS.has(section)) key = 'nav-' + section;
    else if (element.matches('input[type="search"]')) key = 'demo-search';
    else if (element.matches('select')) key = 'demo-filter';
    else if (element.matches('a')) key = 'demo-link';
    else key = 'demo-control';
  }
  return { key: 'page/action/' + key, label: DEMO_ANALYTICS_ACTIONS[key] };
}

/** The only network capability added to the public demo is this fixed anonymous ingestion URL. */
export function initializeAuricwellAnalytics({ mode = 'website', router, context,
  window: browser = window, document: doc = document } = {}) {
  const identity = context || readAuricwellAnalyticsContext(browser);
  const canTrack = () => Boolean(identity.visitorId) && !identity.signedIn && !privacyRequested(browser) &&
    !preview(browser) && (mode === 'demo' || !signedIn(browser));
  let tracker, stopped = false, queue = [], routeStop, inFlight = false, currentPath;
  const frameCurrentlyVisible = () => {
    if (browser.parent === browser) return true;
    try {
      const frame = browser.frameElement;
      if (!frame || browser.parent.document.hidden) return false;
      const rect = frame.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < browser.parent.innerHeight &&
        rect.right > 0 && rect.left < browser.parent.innerWidth;
    } catch { return false; }
  };
  let frameVisible = frameCurrentlyVisible(), parentViewport;
  const isFrameVisible = () => frameVisible;
  const frameVisibility = () => {
    const next = frameCurrentlyVisible();
    if (next !== frameVisible) { tracker?.flush(); frameVisible = next; }
  };
  const enqueue = event => {
    if (!canTrack() || stopped) return;
    queue.push({ event: { ...event, source: identity.source }, attempt: 0 });
    if (queue.length > 200) queue.shift();
  };
  async function flush(keepalive = false) {
    if (!canTrack()) { queue = []; return; }
    if (inFlight && !keepalive) return;
    const pending = queue.splice(0, queue.length);
    inFlight = true;
    try {
      for (let offset = 0; offset < pending.length; offset += 40) {
        const chunk = pending.slice(offset, offset + 40);
        try {
          const response = await browser.fetch(new URL(ENDPOINT, browser.location.origin).href, {
            method: 'POST', credentials: mode === 'demo' ? 'omit' : 'include', redirect: 'error', referrerPolicy: 'no-referrer',
            headers: { 'Content-Type': 'application/json' }, keepalive,
            body: JSON.stringify({ visitorId: identity.visitorId, events: chunk.map(item => item.event) })
          });
          if (response.status >= 500) throw new Error('Analytics temporarily unavailable');
        } catch {
          if (!keepalive && !stopped && canTrack()) queue.push(...chunk.filter(item => item.attempt < 2).map(item => ({ ...item, attempt: item.attempt + 1 })));
        }
      }
    } finally { inFlight = false; }
  }
  function restart() {
    const pagePath = auricwellAnalyticsPath(mode, router?.currentRoute?.value, doc.body.dataset.auricwellPage || 'home');
    if (pagePath === currentPath) { tracker?.refresh(); return; }
    tracker?.stop();currentPath=pagePath;
    if (!pagePath || !canTrack()) return;
    tracker = createWebsiteTracker({ document: doc, window: browser, pagePath, canTrack,
      emit: enqueue, rootSelector: mode === 'demo' ? '.aw-demo' : 'body[data-auricwell-page]',
      resolveMetadata: mode === 'demo' ? demoAnalyticsMetadata : undefined,
      isContentReady: root => Boolean(root.querySelector(mode === 'demo' ? 'h1,[data-analytics-area]' : 'h1')),
      trackDwell: true, isFrameVisible });
  }
  // IntersectionObserver may not be present in older browsers; the demo stays usable.
  if (!canTrack() || !browser.IntersectionObserver || !browser.MutationObserver) return { stop() {}, track() {}, refresh() {} };
  restart();
  if (browser.parent !== browser) {
    try {
      // Child viewport visibility alone does not describe an iframe below the fold.
      parentViewport = browser.parent;
      parentViewport.addEventListener('scroll', frameVisibility, { passive: true, capture: true });
      parentViewport.addEventListener('resize', frameVisibility);
      parentViewport.document.addEventListener('visibilitychange', frameVisibility);
    } catch { /* Cross-origin embeds are deliberately not timed. */ }
  }
  if (mode === 'demo' && router) routeStop = router.afterEach(restart);
  const timer = browser.setInterval(() => { void flush(); }, 3000);
  const onHide = () => { tracker?.flush(); void flush(true); };
  const onVisibility = () => { if (doc.hidden) onHide(); };
  browser.addEventListener('pagehide', onHide);
  doc.addEventListener('visibilitychange', onVisibility);
  return {
    track(actionId) {
      if (!Object.hasOwn(DEMO_ANALYTICS_ACTIONS, actionId)) return;
      const pagePath = auricwellAnalyticsPath(mode, router?.currentRoute?.value, doc.body.dataset.auricwellPage || 'home');
      if (!pagePath) return;
      enqueue({ pagePath, eventId: browser.crypto.randomUUID(), kind: 'click', targetKey: 'page/action/' + actionId,
        label: DEMO_ANALYTICS_ACTIONS[actionId], device: browser.innerWidth < 600 ? 'mobile' : browser.innerWidth < 1024 ? 'tablet' : 'desktop', language: 'en' });
    },
    refresh() { tracker?.refresh(); },
    stop() {
      tracker?.stop(); routeStop?.(); void flush(true); stopped = true;
      browser.clearInterval(timer); browser.removeEventListener('pagehide', onHide); doc.removeEventListener('visibilitychange', onVisibility);
      parentViewport?.removeEventListener('scroll', frameVisibility, true);parentViewport?.removeEventListener('resize', frameVisibility);parentViewport?.document.removeEventListener('visibilitychange', frameVisibility);
    }
  };
}
