import pool from '../config/database.js';
import UserCommunication from '../models/UserCommunication.model.js';
import EmailTemplate from '../models/EmailTemplate.model.js';
import EmailTemplateService from '../services/emailTemplate.service.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import EmailService from '../services/email.service.js';

const isAdminLike = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'support' || r === 'staff' || r === 'super_admin';
};

const ensureAgencyAccess = async (req, agencyId) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin') return { ok: true };
  const agencies = await User.getAgencies(req.user.id);
  const ok = (agencies || []).some((a) => Number(a?.id) === Number(agencyId));
  return ok ? { ok: true } : { ok: false, status: 403, message: 'Access denied' };
};

const isProviderOrSchoolStaff = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'provider' || r === 'school_staff';
};

export const getUserCommunications = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { agencyId, templateType, limit, offset } = req.query;
    const currentUserId = req.user.id;
    const userRole = req.user.role;
    const targetUserId = parseInt(userId, 10);

    // Providers and school staff may only view their own communications.
    if (isProviderOrSchoolStaff(userRole)) {
      if (targetUserId !== currentUserId) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    // Verify access - user can view communications for users in their agencies
    if (userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(currentUserId);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      // Get target user's agencies
      const targetUserAgencies = await User.getAgencies(targetUserId);
      const targetUserAgencyIds = targetUserAgencies.map(a => a.id);
      
      // Check if there's any overlap
      const hasAccess = targetUserAgencyIds.some(id => userAgencyIds.includes(id));
      
      if (!hasAccess && userRole !== 'supervisor' && userRole !== 'clinical_practice_assistant' && userRole !== 'support') {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const communications = await UserCommunication.findByUser(targetUserId, {
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

/**
 * Get total pending communications count across user's agencies (for nav badge).
 * GET /api/communications/pending-count
 */
export const getPendingCommunicationsCount = async (req, res, next) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const role = String(req.user?.role || '').toLowerCase();
    let agencyIds = [];
    if (role === 'super_admin') {
      const [rows] = await pool.execute(
        'SELECT id FROM agencies WHERE organization_type IN (\'agency\', \'school\') OR organization_type IS NULL'
      );
      agencyIds = (rows || []).map((r) => r.id);
    } else {
      const agencies = await User.getAgencies(req.user.id);
      agencyIds = (agencies || []).map((a) => a.id);
    }

    if (agencyIds.length === 0) {
      return res.json({ count: 0 });
    }

    const placeholders = agencyIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM user_communications uc
       WHERE uc.agency_id IN (${placeholders})
         AND uc.delivery_status IN ('pending', 'failed', 'bounced', 'undelivered')`,
      agencyIds
    );
    const count = Number(rows?.[0]?.cnt || 0);
    res.json({ count });
  } catch (error) {
    next(error);
  }
};

export const listPendingCommunications = async (req, res, next) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const agencyId = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const access = await ensureAgencyAccess(req, agencyId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const channel = req.query?.channel ? String(req.query.channel).trim().toLowerCase() : null;
    const status = req.query?.status ? String(req.query.status).trim().toLowerCase() : null;
    const limitRaw = req.query?.limit ? parseInt(String(req.query.limit), 10) : null;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;

    const statusList = status
      ? [status]
      : ['pending', 'failed', 'bounced', 'undelivered'];
    const statuses = statusList.filter(Boolean);
    const statusPlaceholders = statuses.map(() => '?').join(',');

    const where = ['uc.agency_id = ?', `uc.delivery_status IN (${statusPlaceholders})`];
    const params = [agencyId, ...statuses];
    if (channel) {
      where.push('uc.channel = ?');
      params.push(channel);
    }

    const [rows] = await pool.execute(
      `SELECT uc.*,
              u.email as user_email, u.first_name as user_first_name, u.last_name as user_last_name,
              a.name as agency_name,
              gb.first_name as generated_by_first_name, gb.last_name as generated_by_last_name
       FROM user_communications uc
       LEFT JOIN users u ON uc.user_id = u.id
       LEFT JOIN agencies a ON uc.agency_id = a.id
       LEFT JOIN users gb ON uc.generated_by_user_id = gb.id
       WHERE ${where.join(' AND ')}
       ORDER BY uc.generated_at DESC, uc.id DESC
       LIMIT ${limit}`,
      params
    );
    res.json(rows || []);
  } catch (error) {
    next(error);
  }
};

export const approveCommunication = async (req, res, next) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid communication id' } });

    const comm = await UserCommunication.findById(id);
    if (!comm) return res.status(404).json({ error: { message: 'Communication not found' } });

    const access = await ensureAgencyAccess(req, comm.agency_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    if (String(comm.channel || '').toLowerCase() !== 'email') {
      return res.status(409).json({ error: { message: 'Only email approvals are supported right now' } });
    }

    const subject = String(comm.subject || '').trim();
    const body = String(comm.body || '').trim();
    if (!comm.recipient_address || !body) {
      return res.status(400).json({ error: { message: 'Missing recipient or body' } });
    }

    const result = await EmailService.sendEmail({
      to: comm.recipient_address,
      subject: subject || 'Notification',
      text: body,
      html: null,
      source: 'manual',
      agencyId: comm.agency_id
    });

    if (result?.skipped) {
      return res.status(409).json({ error: { message: `Email send blocked: ${result.reason}` } });
    }

    const updated = await UserCommunication.updateDeliveryStatus(
      comm.id,
      'sent',
      result?.id || null,
      null,
      null,
      { approvedByUserId: req.user.id }
    );
    res.json(updated || null);
  } catch (error) {
    next(error);
  }
};

export const cancelCommunication = async (req, res, next) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid communication id' } });

    const comm = await UserCommunication.findById(id);
    if (!comm) return res.status(404).json({ error: { message: 'Communication not found' } });

    const access = await ensureAgencyAccess(req, comm.agency_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const updated = await UserCommunication.updateDeliveryStatus(
      comm.id,
      'cancelled',
      null,
      null,
      'cancelled',
      { cancelledByUserId: req.user.id }
    );
    res.json(updated || null);
  } catch (error) {
    next(error);
  }
};
