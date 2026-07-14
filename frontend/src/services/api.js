import axios from 'axios';
import { begin as beginGlobalLoading, end as endGlobalLoading } from '../utils/pageLoader';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: true // Enable sending cookies and Authorization headers in CORS requests
});

// --- Global request-storm circuit breaker ---------------------------------
// Hard safety net: no matter what reactive/router bug causes a request loop,
// this caps identical (and total) request rates so a runaway loop can NEVER
// again exhaust the browser's socket pool (net::ERR_INSUFFICIENT_RESOURCES)
// and take the whole app down. When it trips it fails fast (no network call)
// for a short cooldown, and logs the offending URL so the underlying loop can
// be located and fixed. Thresholds are far above any legitimate usage.
const STORM_WINDOW_MS = 10000;      // sliding window
const STORM_PER_KEY_LIMIT = 40;     // identical method+url requests per window
const STORM_GLOBAL_LIMIT = 600;     // total requests per window (last resort)
const STORM_COOLDOWN_MS = 15000;    // pause offending scope after a trip
const _stormKeyHits = new Map();    // key -> ascending timestamps
let _stormGlobalHits = [];          // ascending timestamps
const _stormTrippedUntil = new Map(); // scope -> ts ('__global__' for global)
let _stormLastLogAt = 0;

const _stormKeyOf = (config) =>
  `${String(config?.method || 'get').toLowerCase()} ${String(config?.url || '')}`;

const _stormPrune = (arr, now) => {
  let i = 0;
  while (i < arr.length && now - arr[i] > STORM_WINDOW_MS) i++;
  return i > 0 ? arr.slice(i) : arr;
};

const _stormError = (scope) => {
  const err = new Error(`Request circuit breaker tripped for ${scope}`);
  err.code = 'ERR_CIRCUIT_BROKEN';
  err.__circuitBroken = true;
  return err;
};

// --- Global 429 backoff ----------------------------------------------------
// Cloud Run returns plain-text "Rate exceeded." at the edge when instances
// cannot scale fast enough. If every open tab keeps hammering (heartbeats,
// dashboard bursts, refresh loops), the service never recovers. When we see
// 429s, pause ALL outbound API calls for a short cooldown so capacity can
// come back online.
const RATE_LIMIT_COOLDOWN_MS = 20000;
const RATE_LIMIT_TRIP_THRESHOLD = 3; // 429s within the window before global pause
const RATE_LIMIT_WINDOW_MS = 10000;
let _rateLimitHits = [];
let _rateLimitedUntil = 0;
let _rateLimitLastLogAt = 0;

const _rateLimitError = () => {
  const err = new Error('API rate-limited (Cloud Run 429); cooling down');
  err.code = 'ERR_RATE_LIMITED';
  err.__rateLimited = true;
  err.response = { status: 429, data: { error: { message: 'Too many requests — cooling down' } } };
  return err;
};

/** True while the client is in a 429 cooldown (heartbeats / polls should skip). */
export function isApiRateLimited() {
  return Date.now() < _rateLimitedUntil;
}

function noteRateLimitResponse() {
  const now = Date.now();
  _rateLimitHits = _rateLimitHits.filter((t) => now - t <= RATE_LIMIT_WINDOW_MS);
  _rateLimitHits.push(now);
  if (_rateLimitHits.length < RATE_LIMIT_TRIP_THRESHOLD && now >= _rateLimitedUntil) {
    // Single 429: still apply a short pause so we don't immediately re-flood.
    _rateLimitedUntil = Math.max(_rateLimitedUntil, now + Math.min(5000, RATE_LIMIT_COOLDOWN_MS));
  }
  if (_rateLimitHits.length >= RATE_LIMIT_TRIP_THRESHOLD) {
    _rateLimitedUntil = now + RATE_LIMIT_COOLDOWN_MS;
    if (now - _rateLimitLastLogAt > 5000) {
      _rateLimitLastLogAt = now;
      console.warn(
        `[api] Cloud Run 429 Rate exceeded — pausing requests for ${RATE_LIMIT_COOLDOWN_MS / 1000}s so the service can recover.`
      );
    }
  }
}

function checkRequestStorm(config) {
  const now = Date.now();
  const key = _stormKeyOf(config);

  // Global 429 cooldown — fail fast, do not touch the network.
  if (now < _rateLimitedUntil) throw _rateLimitError();

  // Honor active cooldowns first — fail fast with no network usage.
  if (now < (_stormTrippedUntil.get('__global__') || 0)) throw _stormError('__global__');
  if (now < (_stormTrippedUntil.get(key) || 0)) throw _stormError(key);

  const hits = _stormPrune(_stormKeyHits.get(key) || [], now);
  hits.push(now);
  _stormKeyHits.set(key, hits);

  _stormGlobalHits = _stormPrune(_stormGlobalHits, now);
  _stormGlobalHits.push(now);

  const keyTripped = hits.length > STORM_PER_KEY_LIMIT;
  const globalTripped = _stormGlobalHits.length > STORM_GLOBAL_LIMIT;
  if (keyTripped || globalTripped) {
    const scope = globalTripped ? '__global__' : key;
    _stormTrippedUntil.set(scope, now + STORM_COOLDOWN_MS);
    if (now - _stormLastLogAt > 2000) {
      _stormLastLogAt = now;
      console.error(
        `[request-storm] Circuit breaker tripped (${globalTripped ? 'GLOBAL' : 'per-endpoint'}): ${scope}. ` +
        `Pausing for ${STORM_COOLDOWN_MS / 1000}s to protect the app. A request loop is hitting this URL — ` +
        `fix the code path that keeps calling it.`
      );
    }
    throw _stormError(scope);
  }
}

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Circuit-breaker check must run before anything else (incl. global loading),
    // so a tripped request never begins a loading overlay or touches the network.
    checkRequestStorm(config);

    // Global loading overlay tracking (opt-out via config.skipGlobalLoading = true)
    try {
      if (!config?.skipGlobalLoading) {
        // Avoid double-begin for retries
        if (!config.__globalLoadingId) {
          config.__globalLoadingId = beginGlobalLoading('Loading…');
        }
      }
    } catch {
      // ignore
    }

    // Prefer window-scoped demo lab token (sessionStorage) so a launched demo
    // window does not share / overwrite the parent Platform cookie session.
    // Then fall back to localStorage JWT (Capacitor), then cookie-only auth.
    try {
      const demoToken = sessionStorage.getItem('__pt_demo_window_token__');
      const storedToken = demoToken || localStorage.getItem('authToken');
      if (storedToken) {
        config.headers['Authorization'] = `Bearer ${storedToken}`;
      }
    } catch {
      // ignore — cookie auth still works in web browsers
    }

    // Attach the active agency context so the backend can resolve the correct effectiveRole
    // (club context vs work context). Demo windows prefer sessionStorage agency.
    try {
      const demoAgencyRaw = sessionStorage.getItem('__pt_demo_window_agency__');
      const raw = demoAgencyRaw || localStorage.getItem('currentAgency');
      const currentAgency = raw ? JSON.parse(raw) : null;
      const id = Number.parseInt(String(currentAgency?.id ?? ''), 10);
      if (Number.isFinite(id) && id > 0) {
        config.headers['X-Agency-Id'] = String(id);
      }
    } catch {
      // Ignore — missing header is a safe no-op on the backend
    }

    // If data is FormData, remove Content-Type header to let browser set it with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    try {
      const id = response?.config?.__globalLoadingId;
      if (id) endGlobalLoading(id);
    } catch {
      // ignore
    }
    return response;
  },
  async (error) => {
    try {
      const id = error?.config?.__globalLoadingId;
      if (id) endGlobalLoading(id);
    } catch {
      // ignore
    }

    // Cloud Run / edge 429 — trip global cooldown so tabs stop the death spiral.
    if (error?.response?.status === 429 && !error?.__rateLimited) {
      noteRateLimitResponse();
    }

    // Don't redirect on 401 if we're already on the login page or setup pages
    // Also don't redirect immediately after login (give cookie time to be available)
    const path = window.location.pathname || '';
    const isLoginPage = path.includes('/login');
    const isPasswordlessLogin = window.location.pathname.includes('/passwordless-login');
    const isInitialSetup = window.location.pathname.includes('/initial-setup');
    const justLoggedIn = sessionStorage.getItem('justLoggedIn') === 'true';
    const skipAuthRedirect = !!error?.config?.skipAuthRedirect;
    // Inactivity timeout → Session Ended must win over a bare /login hard redirect
    let isSessionEndedFlow = path.includes('/session-ended');
    try {
      const { isSessionEndedRedirecting, isSessionEndedPath } = await import('../utils/sessionTimeoutBranding');
      isSessionEndedFlow = isSessionEndedFlow || isSessionEndedRedirecting() || isSessionEndedPath(path);
    } catch {
      /* ignore */
    }
    const reqUrl = String(error?.config?.url || '');
    const isPublicApi =
      reqUrl.includes('/public/') ||
      reqUrl.startsWith('/public/') ||
      reqUrl.includes('/members/directory/public') ||
      reqUrl.includes('/public-intake') ||
      reqUrl.startsWith('/public-intake');
    const publicPathPrefixes = ['/intake/', '/schools', '/kiosk', '/p/', '/pre-hire/'];
    const isBrandedKioskPath =
      /\/[^/]+\/kiosk\/?$/.test(path) || path.includes('/skill-builders/kiosk/');
    const isPublicPath =
      publicPathPrefixes.some((prefix) => path.startsWith(prefix)) ||
      path.includes('/clubs') ||
      isBrandedKioskPath;
    const isPrehirePortalApi = reqUrl.includes('/prehire-portal/');
    
    if (
      error.response?.status === 401 &&
      !isLoginPage &&
      !isPasswordlessLogin &&
      !isInitialSetup &&
      !isSessionEndedFlow &&
      !skipAuthRedirect &&
      !isPublicApi &&
      !isPublicPath &&
      !isPrehirePortalApi
    ) {
      // If we just logged in, this might be a cookie timing issue
      // Give it one retry before logging out
      if (justLoggedIn && !error.config._retry) {
        error.config._retry = true;
        // Clear the flag after a delay
        setTimeout(() => {
          sessionStorage.removeItem('justLoggedIn');
        }, 5000);
        // Retry the request after a short delay to allow cookie to be available
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(api.request(error.config));
          }, 500);
        });
      }
      
      // Token is in HttpOnly cookie, so we only clear user state
      // Get user info before clearing to determine login redirect
      const storedUser = localStorage.getItem('user');
      let user = null;
      try {
        user = storedUser ? JSON.parse(storedUser) : null;
      } catch (e) {
        // Ignore parse errors
      }
      
      localStorage.removeItem('user');
      sessionStorage.removeItem('justLoggedIn');
      
      // Prefer current path slug so branded portals stay branded (e.g. /nlu/dashboard → /nlu/login)
      const { getLoginUrlForRedirect } = await import('../utils/loginRedirect');
      const loginUrl = getLoginUrlForRedirect(user);
      
      // Keep sessionId for activity logging
      window.location.href = loginUrl;
    }
    return Promise.reject(error);
  }
);

export default api;

