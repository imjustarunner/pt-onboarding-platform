import EmailTemplate from '../models/EmailTemplate.model.js';
import EmailTemplateService from '../services/emailTemplate.service.js';
import PlatformBranding from '../models/PlatformBranding.model.js';
import User from '../models/User.model.js';

export const getTemplates = async (req, res, next) => {
  try {
    const { agencyId, platformOnly, templateType } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Determine which templates user can access
    let filters = {};

    if (platformOnly === 'true') {
      // Only platform templates
      filters.platformOnly = true;
    } else if (agencyId) {
      // Specific agency templates
      const parsedAgencyId = parseInt(agencyId);
      
      // Verify access (super_admin can see all, others only their agencies)
      if (userRole !== 'super_admin') {
        const userAgencies = await User.getAgencies(userId);
        const userAgencyIds = userAgencies.map(a => a.id);
        
        if (!userAgencyIds.includes(parsedAgencyId)) {
          return res.status(403).json({ error: { message: 'Access denied to this agency' } });
        }
      }
      
      filters.agencyId = parsedAgencyId;
    } else {
      // All templates user has access to
      if (userRole !== 'super_admin') {
        const userAgencies = await User.getAgencies(userId);
        const userAgencyIds = userAgencies.map(a => a.id);
        // For non-super-admins, we'll return templates for their agencies + platform defaults
        filters.agencyId = null; // This will be handled in the query
      }
    }

    if (templateType) {
      filters.templateType = templateType;
    }

    const templates = await EmailTemplate.findAll(filters);
    res.json(templates);
  } catch (error) {
    next(error);
  }
};

export const getTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const template = await EmailTemplate.findById(id);
    
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    // Verify access
    if (req.user.role !== 'super_admin' && template.agency_id) {
      const userAgencies = await User.getAgencies(req.user.id);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      if (!userAgencyIds.includes(template.agency_id)) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    res.json(template);
  } catch (error) {
    next(error);
  }
};

export const createTemplate = async (req, res, next) => {
  try {
    const { name, type, subject, body, agencyId, platformBrandingId } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Validate required fields
    if (!name || !type || !subject || !body) {
      return res.status(400).json({ error: { message: 'Name, type, subject, and body are required' } });
    }

    // Determine if this is a platform template
    // Check query parameter first, then body, then platformBrandingId
    const isPlatformTemplate = !agencyId && (
      req.query.platform === 'true' || 
      req.body.platform === 'true' || 
      platformBrandingId
    );

    // Access control
    if (isPlatformTemplate && userRole !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can create platform templates' } });
    }

    if (agencyId && userRole !== 'super_admin') {
      // Verify user has access to this agency
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      if (!userAgencyIds.includes(parseInt(agencyId))) {
        return res.status(403).json({ error: { message: 'Access denied to this agency' } });
      }
    }

    // Get platform branding ID if creating platform template
    let finalPlatformBrandingId = platformBrandingId;
    if (isPlatformTemplate && !finalPlatformBrandingId) {
      const platformBranding = await PlatformBranding.get();
      if (platformBranding && platformBranding.id) {
        finalPlatformBrandingId = platformBranding.id;
      }
    }

    const template = await EmailTemplate.create({
      name,
      type,
      subject,
      body,
      agencyId: agencyId ? parseInt(agencyId) : null,
      platformBrandingId: finalPlatformBrandingId,
      createdByUserId: userId
    });

    res.status(201).json(template);
  } catch (error) {
    // No longer checking for duplicate entries - multiple templates of same type are allowed
    next(error);
  }
};

export const updateTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, type, subject, body, agencyId, platformBrandingId } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    const template = await EmailTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    // Access control
    if (template.agency_id && userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      if (!userAgencyIds.includes(template.agency_id)) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    if (!template.agency_id && userRole !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can edit platform templates' } });
    }

    const updated = await EmailTemplate.update(id, {
      name,
      type,
      subject,
      body,
      agencyId: agencyId !== undefined ? (agencyId ? parseInt(agencyId) : null) : undefined,
      platformBrandingId
    });

    res.json(updated);
  } catch (error) {
    // No longer checking for duplicate entries - multiple templates of same type are allowed
    next(error);
  }
};

export const deleteTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const template = await EmailTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    // Access control
    if (!template.agency_id && userRole !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can delete platform templates' } });
    }

    if (template.agency_id && userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      if (!userAgencyIds.includes(template.agency_id)) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const deleted = await EmailTemplate.delete(id);
    if (!deleted) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const getAvailableParameters = async (req, res, next) => {
  try {
    const parameters = EmailTemplateService.getAvailableParameters();
    res.json(parameters);
  } catch (error) {
    next(error);
  }
};

export const previewTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { sampleData } = req.body;

    const template = await EmailTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    // Use sample data or default values
    const parameters = sampleData || {
      FIRST_NAME: 'John',
      LAST_NAME: 'Doe',
      USERNAME: 'john.doe@example.com',
      TEMP_PASSWORD: 'TempPass123!',
      AGENCY_NAME: 'Example Agency',
      TERMINOLOGY_SETTINGS: 'People Operations',
      PEOPLE_OPS_EMAIL: 'onboarding@example.com',
      PORTAL_URL: 'example.app.plottwistco.com',
      PORTAL_LOGIN_LINK: 'https://example.app.plottwistco.com/login',
      RESET_TOKEN_LINK: 'https://example.app.plottwistco.com/passwordless-login/sample-token',
      DOCUMENT_DEADLINE: 'January 15, 2024',
      TRAINING_DEADLINE: 'January 20, 2024',
      SENDER_NAME: 'Admin User'
    };

    const rendered = EmailTemplateService.renderTemplate(template, parameters);

    res.json({
      template,
      rendered,
      parameters
    });
  } catch (error) {
    next(error);
  }
};
