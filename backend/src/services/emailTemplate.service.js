import EmailTemplate from '../models/EmailTemplate.model.js';
import Agency from '../models/Agency.model.js';
import PlatformBranding from '../models/PlatformBranding.model.js';
import config from '../config/config.js';
import {
  buildPublicAppUrl,
  buildPublicPortalBaseUrl,
  platformFrontendBase
} from '../utils/publicPortalUrl.js';

const getFrontendUrl = () => platformFrontendBase() || config.cors?.origin || 'http://localhost:5173';

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
        example: 'https://app.itsco.health'
      },
      {
        name: 'PORTAL_LOGIN_LINK',
        description: 'Full URL to portal login page',
        category: 'links',
        example: 'https://app.itsco.health/login'
      },
      {
        name: 'RESET_TOKEN_LINK',
        description: 'Passwordless login link (auto-login and redirect to password change)',
        category: 'links',
        example: 'https://app.itsco.health/reset-password/abc123token'
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
   * Attach parent-host fields so school orgs inherit ITSCO's dedicated app host.
   */
  static async withPublicHostContext(agency) {
    if (!agency) return agency;
    const type = String(agency.organization_type || agency.organizationType || 'agency').toLowerCase();
    if (type === 'agency' || agency.parent_portal_url || agency.parentPortalUrl) return agency;
    const parentId = Number(agency.affiliated_agency_id || agency.parent_agency_id || 0);
    if (!parentId) return agency;
    try {
      const parent = await Agency.findById(parentId);
      if (!parent) return agency;
      return {
        ...agency,
        parent_portal_url: parent.portal_url || parent.slug,
        parent_custom_domain: parent.custom_domain
      };
    } catch {
      return agency;
    }
  }

  /**
   * Public origin for an org. ITSCO uses https://app.itsco.health (no /itsco path).
   */
  static buildPortalUrl(agency) {
    const opts = { platformBaseUrl: getFrontendUrl() };
    if (!agency) return opts.platformBaseUrl;
    return buildPublicPortalBaseUrl(agency, opts);
  }

  /**
   * Build portal login link
   */
  static buildPortalLoginLink(agency) {
    return buildPublicAppUrl(agency, 'login', { platformBaseUrl: getFrontendUrl() });
  }

  /**
   * Build passwordless login/reset token link
   */
  static buildResetTokenLink(agency, token) {
    return buildPublicAppUrl(agency, `reset-password/${token}`, { platformBaseUrl: getFrontendUrl() });
  }

  /**
   * Get terminology label for an agency (optional title / team name for emails).
   * Prefers agency override; falls back to agency name when unset.
   */
  static getTerminologySettings(agency) {
    const agencyName = String(agency?.name || agency?.official_name || '').trim();
    if (!agency) return agencyName || 'our team';

    if (agency.terminology_settings) {
      try {
        const settings = typeof agency.terminology_settings === 'string'
          ? JSON.parse(agency.terminology_settings)
          : agency.terminology_settings;

        const term = String(settings.peopleOpsTerm || settings.people_ops_term || '').trim();
        if (term) return term;
      } catch (e) {
        /* ignore */
      }
    }

    return agencyName || 'our team';
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
      senderName,
      keepPortalLoginLink = false
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
    const agencyForUrls = agency ? await this.withPublicHostContext(agency) : null;
    if (agencyForUrls) {
      parameters.AGENCY_NAME = agencyForUrls.name || '';
      parameters.TERMINOLOGY_SETTINGS = this.getTerminologySettings(agencyForUrls);
      parameters.PEOPLE_OPS_EMAIL = agencyForUrls.onboarding_team_email || '';
      
      // Portal URLs (ITSCO → https://app.itsco.health/login)
      parameters.PORTAL_URL = this.buildPortalUrl(agencyForUrls);
      parameters.PORTAL_LOGIN_LINK = this.buildPortalLoginLink(agencyForUrls);
    }

    // Reset token link
    if (passwordlessToken && agencyForUrls) {
      parameters.RESET_TOKEN_LINK = this.buildResetTokenLink(agencyForUrls, passwordlessToken);
      if (!keepPortalLoginLink) {
        parameters.PORTAL_LOGIN_LINK = parameters.RESET_TOKEN_LINK;
      }
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
