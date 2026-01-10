import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../services/api';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || null);
  const storedUser = localStorage.getItem('user');
  const user = ref(storedUser ? JSON.parse(storedUser) : null);

  const isAuthenticated = computed(() => {
    const hasToken = !!token.value;
    const hasUser = !!user.value;
    // Debug logging
    if (hasToken && !hasUser) {
      console.warn('Auth: Token exists but no user object found');
    }
    if (hasUser && !user.value.role) {
      console.warn('Auth: User object exists but no role property:', user.value);
    }
    return hasToken && hasUser;
  });

  const setAuth = (newToken, newUser, sessionId = null) => {
    token.value = newToken;
    user.value = newUser;
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    if (sessionId) {
      localStorage.setItem('sessionId', sessionId);
    }
    api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
  };

  const clearAuth = () => {
    token.value = null;
    user.value = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete api.defaults.headers.common['Authorization'];
  };

  const login = async (email, password) => {
    try {
      console.log('Attempting login for:', email);
      let response;
      
      // Try regular login first
      try {
        response = await api.post('/auth/login', { email, password });
      } catch (regularLoginError) {
        // If regular login fails, try approved employee login
        if (regularLoginError.response?.status === 401) {
          console.log('Regular login failed, trying approved employee login...');
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
      
      setAuth(response.data.token, response.data.user, response.data.sessionId);
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
        error: errorMessage
      };
    }
  };

  const passwordlessLogin = async (email) => {
    try {
      const response = await api.post('/auth/passwordless-login', { email });
      setAuth(response.data.token, response.data.user, response.data.sessionId);
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
        // Update user data but keep the same token
        user.value = response.data;
        localStorage.setItem('user', JSON.stringify(response.data));
        console.log('User data refreshed. New role:', response.data.role);
      }
    } catch (err) {
      console.error('Failed to refresh user data:', err);
      // If refresh fails, force logout to get fresh token
      await logout('token_refresh_failed');
    }
  };

  const logout = async (reason = 'user_logout') => {
    try {
      // Get session ID from localStorage if available
      const sessionId = localStorage.getItem('sessionId');
      
      // Log logout event to backend (don't wait for response)
      if (sessionId || token.value) {
        api.post('/auth/logout', {
          sessionId,
          reason
        }).catch(err => {
          console.error('Failed to log logout event:', err);
        });
      }
    } catch (err) {
      console.error('Error during logout:', err);
    } finally {
      // Always clear auth even if logging fails
      localStorage.removeItem('sessionId');
      clearAuth();
    }
  };

  // Initialize API header if token exists
  if (token.value) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token.value}`;
  }

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

