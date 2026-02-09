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
    // Token is now in HttpOnly cookie (set by backend), so we don't store it
    // newToken can be null since it's in the cookie
    token.value = null; // Not used anymore, but keep for compatibility
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
    // Don't set Authorization header - cookies are sent automatically with withCredentials: true
  };

  const clearAuth = () => {
    token.value = null;
    user.value = null;
    localStorage.removeItem('user');
    // Don't remove sessionId - it's used for activity logging
    // Cookie is cleared by backend on logout
  };

  const login = async (email, password, organizationSlug = null) => {
    try {
      console.log('Attempting login for:', email);
      let response;
      const orgSlug = organizationSlug ? String(organizationSlug).trim().toLowerCase() : null;
      
      // Try regular login first
      try {
        response = await api.post('/auth/login', { email, password, organizationSlug: orgSlug || undefined });
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
          if (looksLikeUserNotFound) {
            console.log('Regular login user not found, trying approved employee login...');
            try {
              response = await api.post('/auth/approved-employee-login', { email, password });
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
      
      // Token is in HttpOnly cookie (set by backend), so pass null
      setAuth(null, response.data.user, response.data.sessionId);
      
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
      // Token is in HttpOnly cookie (set by backend), so pass null
      setAuth(null, response.data.user, response.data.sessionId);
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
      
      // Log logout event to backend (don't wait for response)
      if (sessionId || token.value) {
        api
          .post('/auth/logout', { sessionId, reason }, { skipAuthRedirect: true })
          .catch((err) => {
            if (err?.response?.status !== 401) {
              console.error('Failed to log logout event:', err);
            }
          });
      }

      // Mark presence offline (best-effort) so chat can move to notifications when away.
      api.post('/presence/offline', {}, { skipAuthRedirect: true }).catch(() => {});
      
      // Always clear auth even if logging fails
      localStorage.removeItem('sessionId');
      clearAuth();
      
      // Redirect to appropriate login page based on user's agency
      // Get agencies from localStorage before clearing (they're cleared in clearStoredAgencies)
      const { getLoginUrl, clearStoredAgencies } = await import('../utils/loginRedirect');
      const loginUrl = options.redirectTo || getLoginUrl(currentUser);
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
      // Fallback to default login
      window.location.href = '/login';
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

