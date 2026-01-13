import EmailTemplate from '../models/EmailTemplate.model.js';
import Agency from '../models/Agency.model.js';
import PlatformBranding from '../models/PlatformBranding.model.js';
import config from '../config/config.js';

// Get frontend URL from environment or config
const getFrontendUrl = () => {
  return process.env.FRONTEND_URL || config.cors?.origin || 'http://localhost:5173';
};

class EmailTemplateService {
  /**
   * Get all available template parameters with descriptions
   */
  static getAvailableParameters() {
    return [
      {
        name: 'FIRST_NAME',
        description: 'User\'s first name',
        category: 'user',
        example: 'John'
      },
      {
        name: 'LAST_NAME',
        description: 'User\'s last name',
        category: 'user',
        example: 'Doe'
      },
      {
        name: 'USERNAME',
        description: 'User\'s email/username',
        category: 'user',
        example: 'john.doe@example.com'
      },
      {
        name: 'TEMP_PASSWORD',
        description: 'Generated temporary password',
        category: 'user',
        example: 'Xk9mP2qR7vN4wL8t'
      },
      {
        name: 'AGENCY_NAME',
        description: 'Name of the agency',
        category: 'agency',
        example: 'IT Solutions Co'
      },
      {
        name: 'TERMINOLOGY_SETTINGS',
        description: 'Agency-specific terminology (e.g., "People Operations", "Human Resources")',
        category: 'agency',
        example: 'People Operations'
      },
      {
        name: 'PEOPLE_OPS_EMAIL',
        description: 'Onboarding team/People Ops email address',
        category: 'agency',
        example: 'onboarding@agency.com'
      },
      {
        name: 'PORTAL_URL',
        description: 'Portal subdomain URL',
        category: 'links',
        example: 'itsco.app.plottwistco.com'
      },
      {
        name: 'PORTAL_LOGIN_LINK',
        description: 'Full URL to portal login page',
        category: 'links',
        example: 'https://itsco.app.plottwistco.com/login'
      },
      {
        name: 'RESET_TOKEN_LINK',
        description: 'Passwordless login link (auto-login and redirect to password change)',
        category: 'links',
        example: 'https://itsco.app.plottwistco.com/passwordless-login/abc123token'
      },
      {
        name: 'DOCUMENT_DEADLINE',
        description: 'Document completion deadline (if applicable)',
        category: 'deadlines',
        example: '2024-01-15'
      },
      {
        name: 'TRAINING_DEADLINE',
        description: 'Training completion deadline (if applicable)',
        category: 'deadlines',
        example: '2024-01-20'
      },
      {
        name: 'SENDER_NAME',
        description: 'Name of the person/system generating the email',
        category: 'system',
        example: 'Admin User'
      }
    ];
  }

  /**
   * Get template for an agency (agency-specific or platform default)
   */
  static async getTemplateForAgency(agencyId, templateType) {
    return await EmailTemplate.findByTypeAndAgency(templateType, agencyId);
  }

  /**
   * Build portal URL from agency portal_url
   */
  static buildPortalUrl(agency) {
    const baseUrl = getFrontendUrl();
    
    if (!agency || !agency.portal_url) {
      return baseUrl;
    }
    
    // Construct portal URL based on portal_url subdomain
    const url = new URL(baseUrl);
    
    // If portal_url is set, use subdomain format
    // For example: portal_url="itsco" -> "itsco.localhost:5173" or "itsco.app.plottwistco.com"
    if (url.hostname === 'localhost' || url.hostname.includes('localhost')) {
      // Development: use subdomain.localhost
      return `${url.protocol}//${agency.portal_url}.${url.hostname}${url.port ? ':' + url.port : ''}`;
    } else {
      // Production: use subdomain.domain format
      const parts = url.hostname.split('.');
      if (parts.length >= 2) {
        const domain = parts.slice(-2).join('.');
        return `${url.protocol}//${agency.portal_url}.${domain}${url.port ? ':' + url.port : ''}`;
      }
      return baseUrl;
    }
  }

  /**
   * Build portal login link
   */
  static buildPortalLoginLink(agency) {
    const portalUrl = this.buildPortalUrl(agency);
    return `${portalUrl}/login`;
  }

  /**
   * Build passwordless login/reset token link
   */
  static buildResetTokenLink(agency, token) {
    const portalUrl = this.buildPortalUrl(agency);
    return `${portalUrl}/passwordless-login/${token}`;
  }

  /**
   * Get terminology settings for an agency
   */
  static getTerminologySettings(agency) {
    if (!agency) return 'People Operations';
    
    // Check if agency has terminology_settings
    if (agency.terminology_settings) {
      try {
        const settings = typeof agency.terminology_settings === 'string' 
          ? JSON.parse(agency.terminology_settings) 
          : agency.terminology_settings;
        
        // Return the people ops term or default
        return settings.people_ops_term || 'People Operations';
      } catch (e) {
        return 'People Operations';
      }
    }
    
    return 'People Operations';
  }

  /**
   * Collect all parameters for template rendering
   */
  static async collectParameters(user, agency, options = {}) {
    const {
      tempPassword,
      passwordlessToken,
      documentDeadline,
      trainingDeadline,
      senderName
    } = options;

    const parameters = {};

    // User parameters
    if (user) {
      parameters.FIRST_NAME = user.first_name || '';
      parameters.LAST_NAME = user.last_name || '';
      parameters.USERNAME = user.email || '';
    }

    // Temporary password
    if (tempPassword) {
      parameters.TEMP_PASSWORD = tempPassword;
    }

    // Agency parameters
    if (agency) {
      parameters.AGENCY_NAME = agency.name || '';
      parameters.TERMINOLOGY_SETTINGS = this.getTerminologySettings(agency);
      parameters.PEOPLE_OPS_EMAIL = agency.onboarding_team_email || '';
      
      // Portal URLs
      parameters.PORTAL_URL = this.buildPortalUrl(agency);
      parameters.PORTAL_LOGIN_LINK = this.buildPortalLoginLink(agency);
    }

    // Reset token link
    if (passwordlessToken && agency) {
      parameters.RESET_TOKEN_LINK = this.buildResetTokenLink(agency, passwordlessToken);
    }

    // Deadlines
    if (documentDeadline) {
      parameters.DOCUMENT_DEADLINE = this.formatDate(documentDeadline);
    }
    if (trainingDeadline) {
      parameters.TRAINING_DEADLINE = this.formatDate(trainingDeadline);
    }

    // Sender name
    if (senderName) {
      parameters.SENDER_NAME = senderName;
    }

    return parameters;
  }

  /**
   * Render template by replacing all variables
   */
  static renderTemplate(template, parameters) {
    if (!template || !template.body) {
      throw new Error('Template body is required');
    }

    let rendered = template.body;
    let renderedSubject = template.subject || '';

    // Replace all parameters in body and subject
    Object.keys(parameters).forEach(key => {
      const value = parameters[key] || '';
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      rendered = rendered.replace(regex, value);
      renderedSubject = renderedSubject.replace(regex, value);
    });

    return {
      subject: renderedSubject,
      body: rendered
    };
  }

  /**
   * Format date as readable string
   */
  static formatDate(date) {
    if (!date) return '';
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Generate email for user creation
   */
  static async generateUserWelcomeEmail(user, agencyId, options = {}) {
    const {
      tempPassword,
      passwordlessToken,
      senderName,
      generatedByUserId
    } = options;

    // Get agency
    const agency = await Agency.findById(agencyId);
    if (!agency) {
      throw new Error('Agency not found');
    }

    // Get template (agency-specific or platform default)
    const template = await this.getTemplateForAgency(agencyId, 'user_welcome');
    if (!template) {
      throw new Error('User welcome template not found. Please create a template in Communications settings.');
    }

    // Collect all parameters
    const parameters = await this.collectParameters(user, agency, {
      tempPassword,
      passwordlessToken,
      senderName
    });

    // Render template
    const rendered = this.renderTemplate(template, parameters);

    return {
      template,
      rendered,
      parameters,
      agency
    };
  }
}

export default EmailTemplateService;
