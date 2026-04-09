import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../services/api';
import { storeUserAgencies } from '../utils/loginRedirect';

export const useAuthStore = defineStore('auth', () => {
  // Token is now stored in HttpOnly cookie, not localStorage
  const token = ref(null); // Keep for backward compatibility check, but not used
  const storedUser = localStorage.getItem('user');
  const user = ref(storedUser ? JSON.parse(storedUser) : null);

  const isAuthenticated = computed(() => {
    // Token is in HttpOnly cookie, so we check user object only
    const hasUser = !!user.value;
    if (hasUser && !user.value.role) {
      console.warn('Auth: User object exists but no role property:', user.value);
    }
    return hasUser;
  });

  const setAuth = (newToken, newUser, sessionId = null) => {
    // Store JWT for Capacitor/iOS (WKWebView can't reliably forward HttpOnly cookies cross-origin).
    // On web browsers the cookie is the primary auth mechanism; on native the header takes over.
    if (newToken) {
      try { localStorage.setItem('authToken', newToken); } catch { /* ignore */ }
    }
    token.value = newToken || null;
    const prevId = user.value?.id != null ? Number(user.value.id) : null;
    user.value = newUser;
    // Store user in localStorage (not sensitive, used for UI state)
    // Include username in stored user object
    if (newUser && !newUser.username) {
      newUser.username = newUser.email; // Fallback to email if username not provided
    }
    localStorage.setItem('user', JSON.stringify(newUser));
    if (sessionId) {
      localStorage.setItem('sessionId', sessionId);
    }

    const nextId = newUser?.id != null ? Number(newUser.id) : null;
    if (nextId != null && Number.isFinite(nextId) && (prevId == null || prevId !== nextId)) {
      try {
        // Dashboard My Schedule reads this once to snap stored week prefs to the current week.
        localStorage.setItem('pt.pendingScheduleWeekReset', '1');
      } catch {
        /* ignore */
      }
    }
  };

  const clearAuth = () => {
    token.value = null;
    user.value = null;
    localStorage.removeItem('user');
    try {
      localStorage.removeItem('authToken');
      localStorage.removeItem('pt.pendingScheduleWeekReset');
    } catch {
      /* ignore */
    }
    // Don't remove sessionId - it's used for activity logging
    // Cookie is cleared by backend on logout
  };

  // NOTE: `email` param name kept for backward compatibility with callers.
  // This method now treats the first argument as a generic login identifier (username or email).
  const login = async (email, password, organizationSlug = null) => {
    try {
      const identifier = String(email || '').trim();
      console.log('Attempting login for:', identifier);
      let response;
      const orgSlug = organizationSlug ? String(organizationSlug).trim().toLowerCase() : null;
      
      // Try regular login first
      try {
        response = await api.post('/auth/login', { username: identifier, password, organizationSlug: orgSlug || undefined });
      } catch (regularLoginError) {
        // If regular login fails, try approved employee login
        if (regularLoginError.response?.status === 403 && regularLoginError.response?.data?.error?.code === 'SSO_REQUIRED') {
          return {
            success: false,
            error: regularLoginError.response?.data?.error?.message || 'Google sign-in required.',
            code: 'SSO_REQUIRED'
          };
        }

        if (regularLoginError.response?.status === 401) {
          // Only fall back to approved employee login when the user truly does not exist in the users table.
          // IMPORTANT: If the user *does* exist but typed the wrong password, falling back can accidentally
          // log them in as an approved_employee and then most of the app 403s (no users-table id).
          const msg = String(regularLoginError.response?.data?.error?.message || '').toLowerCase();
          const looksLikeUserNotFound = msg.includes('user not found');
          const looksLikeEmail = identifier.includes('@');
          if (looksLikeUserNotFound && looksLikeEmail) {
            console.log('Regular login user not found, trying approved employee login...');
            try {
              response = await api.post('/auth/approved-employee-login', { email: identifier, password });
            } catch (approvedEmployeeError) {
              // Both failed, return the approved employee error (more specific)
              const errorMessage = approvedEmployeeError.response?.data?.error?.message || approvedEmployeeError.message || 'Login failed. Please check your credentials and try again.';
              return { 
                success: false, 
                error: errorMessage
              };
            }
          } else {
            // If it wasn't a "user not found" case, surface the regular login error (bad password, etc).
            const errorMessage = regularLoginError.response?.data?.error?.message || regularLoginError.message || 'Login failed. Please check your credentials and try again.';
            return {
              success: false,
              error: errorMessage
            };
          }
        } else {
          // Non-401 error from regular login, return it
          throw regularLoginError;
        }
      }
      
      console.log('Login response received:', { 
        hasToken: !!response.data.token, 
        hasUser: !!response.data.user,
        hasSessionId: !!response.data.sessionId,
        hasAgencies: !!response.data.agencies
      });
      
      if (!response.data.token || !response.data.user) {
        console.error('Invalid login response:', response.data);
        return { 
          success: false, 
          error: 'Invalid response from server. Please try again.' 
        };
      }
      
      // Store agencies if provided (for approved employees with multiple agencies)
      if (response.data.agencies && response.data.agencies.length > 0) {
        response.data.user.agencyIds = response.data.agencies;
      }
      
      // Pass token explicitly so it can be stored in localStorage for Capacitor/iOS
      setAuth(response.data.token || null, response.data.user, response.data.sessionId);
      
      // Mark that we just logged in to help with cookie timing issues
      sessionStorage.setItem('justLoggedIn', 'true');
      
      return { success: true, agencies: response.data.agencies };
    } catch (error) {
      // Log full error for debugging
      console.error('Login error:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      console.error('Error message:', error.message);
      
      // Preserve the full error message for status-related errors
      const errorMessage = error.response?.data?.error?.message || error.message || 'Login failed. Please check your credentials and try again.';
      return { 
        success: false, 
        error: errorMessage,
        code: error.response?.data?.error?.code || null
      };
    }
  };

  const passwordlessLogin = async (email) => {
    try {
      const response = await api.post('/auth/passwordless-login', { email });
      setAuth(response.data.token || null, response.data.user, response.data.sessionId);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Login failed',
        requiresVerification: error.response?.data?.error?.requiresVerification || false
      };
    }
  };

  const refreshUser = async () => {
    try {
      // Fetch current user data from backend to get updated role
      const response = await api.get('/users/me');
      if (response.data) {
        // Merge to avoid dropping client-side-only fields (e.g., approved employee agencyIds)
        const merged = { ...(user.value || {}), ...(response.data || {}) };
        user.value = merged;
        localStorage.setItem('user', JSON.stringify(merged));
        console.log('User data refreshed. New role:', merged.role);
      }
    } catch (err) {
      console.error('Failed to refresh user data:', err);
      // Only logout on authentication errors (401), not network/server errors
      // This prevents false logouts from temporary issues
      if (err.response?.status === 401) {
        await logout('token_refresh_failed');
      } else {
        // For other errors (network, 500, etc.), just log and continue
        // The user remains logged in and can retry later
        console.warn('User data refresh failed but user remains authenticated:', err.message);
      }
    }
  };

  const logout = async (reason = 'user_logout', options = {}) => {
    try {
      // Get session ID from localStorage if available
      const sessionId = localStorage.getItem('sessionId');
      
      // Get user info before clearing to determine login redirect
      const currentUser = user.value;
      
      // Always ask backend to clear auth cookie before redirect.
      // sessionId can be null; cookie invalidation still matters.
      try {
        await Promise.race([
          api.post('/auth/logout', { sessionId, reason }, { skipAuthRedirect: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('logout_timeout')), 3000))
        ]);
      } catch (err) {
        if (err?.message !== 'logout_timeout' && err?.response?.status !== 401) {
          console.error('Failed to log logout event:', err);
        }
      }

      // Mark presence offline (best-effort) so chat can move to notifications when away.
      api.post('/presence/offline', {}, { skipAuthRedirect: true }).catch(() => {});
      
      // Always clear auth even if logging fails
      localStorage.removeItem('sessionId');
      clearAuth();
      
      // Redirect to branded login when possible.
      // Prefer the current route slug so users stay in the same portal context on logout.
      let loginUrl = options.redirectTo || null;
      if (!loginUrl && String(currentUser?.role || '').toLowerCase() === 'super_admin') {
        loginUrl = '/login';
      }
      if (!loginUrl) {
        try {
          const { default: router } = await import('../router');
          const current = router.currentRoute?.value || null;
          const slug = typeof current?.params?.organizationSlug === 'string'
            ? String(current.params.organizationSlug).trim().toLowerCase()
            : '';
          const parentSlug = typeof current?.params?.parentOrgSlug === 'string'
            ? String(current.params.parentOrgSlug).trim().toLowerCase()
            : '';
          if (slug) {
            const { buildOrgLoginPath } = await import('../utils/orgLoginPath');
            const { getCurrentPortalSlugFromHostCache } = await import('../utils/loginRedirect');
            const { useBrandingStore } = await import('./branding');
            const brandingStore = useBrandingStore();
            const hostImplied =
              String(
                brandingStore.portalHostPortalUrl || getCurrentPortalSlugFromHostCache() || ''
              )
                .trim()
                .toLowerCase() || null;
            loginUrl = buildOrgLoginPath(slug, parentSlug || null, hostImplied);
          }
        } catch {
          // Ignore and fall back below.
        }
      }

      // Get agencies from localStorage before clearing (they're cleared in clearStoredAgencies)
      const { getLoginUrlForRedirect, clearStoredAgencies } = await import('../utils/loginRedirect');
      if (!loginUrl) {
        loginUrl = getLoginUrlForRedirect(currentUser);
      }
      clearStoredAgencies(); // Clear stored agencies on logout
      
      // Prefer SPA navigation; fallback to hard redirect if router is unavailable.
      try {
        if (options.useRouter === false) {
          window.location.href = loginUrl;
          return;
        }
        const { default: router } = await import('../router');
        await router.replace(loginUrl);
      } catch {
        window.location.href = loginUrl;
      }
    } catch (err) {
      console.error('Error during logout:', err);
      // Final fallback: still preserve branded portal login when possible.
      try {
        const { getLoginUrlForRedirect } = await import('../utils/loginRedirect');
        window.location.href = getLoginUrlForRedirect(user.value);
      } catch {
        window.location.href = '/login';
      }
    }
  };

  // Token is now in HttpOnly cookie, so no need to set Authorization header
  // Cookies are sent automatically with withCredentials: true in api.js

  return {
    token,
    user,
    isAuthenticated,
    setAuth,
    clearAuth,
    login,
    passwordlessLogin,
    logout,
    refreshUser
  };
});

