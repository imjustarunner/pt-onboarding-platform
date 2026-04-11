import User from '../models/User.model.js';
import config from '../config/config.js';

class MagicLinkService {
  /**
   * Generates a magic link for a user that auto-logs them in and redirects to a path.
   * @param {number} userId - The user ID to generate the link for.
   * @param {string} redirectPath - The frontend path to redirect to after login.
   * @param {number} expiresInMinutes - How long the link is valid for.
   * @returns {Promise<string>} The full magic link URL.
   */
  static async generateMagicLink(userId, redirectPath = '/admin/communications', expiresInMinutes = 60) {
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
    const { token } = await User.createPasswordlessToken(userId, expiresAt, 'magic_login');
    
    const baseUrl = config.frontendUrl || 'http://localhost:5173';
    // The frontend has a route /passwordless-login/:token
    const url = new URL(`/passwordless-login/${token}`, baseUrl);
    if (redirectPath) {
      url.searchParams.set('next', redirectPath);
    }
    
    return url.toString();
  }
}

export default MagicLinkService;
