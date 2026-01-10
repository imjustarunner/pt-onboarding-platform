import UserCommunication from '../models/UserCommunication.model.js';
import EmailTemplate from '../models/EmailTemplate.model.js';
import EmailTemplateService from '../services/emailTemplate.service.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';

export const getUserCommunications = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { agencyId, templateType, limit, offset } = req.query;
    const currentUserId = req.user.id;
    const userRole = req.user.role;

    // Verify access - user can view communications for users in their agencies
    if (userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(currentUserId);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      // Get target user's agencies
      const targetUserAgencies = await User.getAgencies(parseInt(userId));
      const targetUserAgencyIds = targetUserAgencies.map(a => a.id);
      
      // Check if there's any overlap
      const hasAccess = targetUserAgencyIds.some(id => userAgencyIds.includes(id));
      
      if (!hasAccess && userRole !== 'supervisor' && userRole !== 'clinical_practice_assistant' && userRole !== 'support') {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const communications = await UserCommunication.findByUser(parseInt(userId), {
      agencyId: agencyId ? parseInt(agencyId) : undefined,
      templateType,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    });

    res.json(communications);
  } catch (error) {
    next(error);
  }
};

export const getCommunication = async (req, res, next) => {
  try {
    const { userId, id } = req.params;
    const currentUserId = req.user.id;
    const userRole = req.user.role;

    const communication = await UserCommunication.findById(parseInt(id));
    
    if (!communication) {
      return res.status(404).json({ error: { message: 'Communication not found' } });
    }

    // Verify it belongs to the specified user
    if (communication.user_id !== parseInt(userId)) {
      return res.status(404).json({ error: { message: 'Communication not found' } });
    }

    // Verify access
    if (userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(currentUserId);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      if (!userAgencyIds.includes(communication.agency_id) && 
          userRole !== 'supervisor' && 
          userRole !== 'support') {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    res.json(communication);
  } catch (error) {
    next(error);
  }
};

export const regenerateEmail = async (req, res, next) => {
  try {
    const { userId, id } = req.params;
    const currentUserId = req.user.id;
    const userRole = req.user.role;

    const communication = await UserCommunication.findById(parseInt(id));
    
    if (!communication) {
      return res.status(404).json({ error: { message: 'Communication not found' } });
    }

    // Verify it belongs to the specified user
    if (communication.user_id !== parseInt(userId)) {
      return res.status(404).json({ error: { message: 'Communication not found' } });
    }

    // Verify access
    if (userRole !== 'super_admin' && userRole !== 'admin' && userRole !== 'support') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    // Check if template still exists
    if (!communication.template_id) {
      return res.status(400).json({ error: { message: 'Original template no longer exists' } });
    }

    const template = await EmailTemplate.findById(communication.template_id);
    if (!template) {
      return res.status(404).json({ error: { message: 'Template no longer exists' } });
    }

    // Get user and agency
    const user = await User.findById(communication.user_id);
    const agency = await Agency.findById(communication.agency_id);

    if (!user || !agency) {
      return res.status(404).json({ error: { message: 'User or agency not found' } });
    }

    // Get current user for sender name
    const sender = await User.findById(currentUserId);
    const senderName = sender ? `${sender.first_name} ${sender.last_name}` : 'System';

    // Regenerate email (note: we don't have the original temp password or token, so some params will be missing)
    const parameters = await EmailTemplateService.collectParameters(user, agency, {
      senderName
    });

    const rendered = EmailTemplateService.renderTemplate(template, parameters);

    res.json({
      rendered,
      parameters,
      note: 'Some parameters (like TEMP_PASSWORD and RESET_TOKEN_LINK) may be missing as they are not stored for security reasons.'
    });
  } catch (error) {
    next(error);
  }
};
