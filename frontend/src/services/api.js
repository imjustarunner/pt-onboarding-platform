import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: true // Enable sending cookies and Authorization headers in CORS requests
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Token is now in HttpOnly cookie, so we don't need to set Authorization header
    // Cookies are sent automatically with withCredentials: true
    
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
  (response) => response,
  (error) => {
    // Don't redirect on 401 if we're already on the login page or setup pages
    // Also don't redirect immediately after login (give cookie time to be available)
    const isLoginPage = window.location.pathname.includes('/login');
    const isPasswordlessLogin = window.location.pathname.includes('/passwordless-login');
    const isInitialSetup = window.location.pathname.includes('/initial-setup');
    const justLoggedIn = sessionStorage.getItem('justLoggedIn') === 'true';
    
    if (error.response?.status === 401 && !isLoginPage && !isPasswordlessLogin && !isInitialSetup) {
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
      
      // Determine appropriate login URL based on user's agency
      const { getLoginUrl } = await import('../utils/loginRedirect');
      const loginUrl = getLoginUrl(user);
      
      // Keep sessionId for activity logging
      window.location.href = loginUrl;
    }
    return Promise.reject(error);
  }
);

export default api;

