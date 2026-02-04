import EmailService from '../services/email.service.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import {
  getPlatformEmailSettings,
  setPlatformEmailSettings,
  listAgencyEmailSettings,
  normalizeEmailSendingMode
} from '../services/emailSettings.service.js';

export const getEmailSettings = async (req, res, next) => {
  try {
    const platform = await getPlatformEmailSettings();
    const configured = EmailService.isConfigured();

    const userRole = req.user?.role || 'staff';
    let agencies = [];
    if (userRole === 'super_admin') {
      agencies = await Agency.findAll(false, false);
    } else {
      agencies = await User.getAgencies(req.user.id);
    }

    const agencyIds = (agencies || []).map((a) => Number(a.id)).filter(Boolean);
    const agencySettings = await listAgencyEmailSettings(agencyIds);
    const byAgencyId = new Map(agencySettings.map((s) => [Number(s.agencyId), s]));

    const agenciesPayload = (agencies || []).map((a) => {
      const setting = byAgencyId.get(Number(a.id)) || { notificationsEnabled: true };
      const effectiveEnabled = platform.notificationsEnabled && setting.notificationsEnabled;
      return {
        agencyId: Number(a.id),
        name: a.name,
        notificationsEnabled: setting.notificationsEnabled !== false,
        effectiveNotificationsEnabled: effectiveEnabled
      };
    });

    res.json({
      platform: {
        sendingMode: platform.sendingMode,
        notificationsEnabled: platform.notificationsEnabled
      },
      configured,
      fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
      fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || null,
      impersonateUser: process.env.GMAIL_IMPERSONATE_USER || process.env.GOOGLE_WORKSPACE_IMPERSONATE_USER || null,
      agencies: agenciesPayload
    });
  } catch (error) {
    next(error);
  }
};

export const updateEmailSettings = async (req, res, next) => {
  try {
    const { platform, agencies } = req.body || {};
    const userRole = req.user?.role || 'staff';
    if (!['admin', 'super_admin'].includes(userRole)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    let updatedPlatform = null;
    if (platform && userRole === 'super_admin') {
      const normalized = normalizeEmailSendingMode(platform.sendingMode);
      if (!['all', 'manual_only'].includes(normalized)) {
        return res.status(400).json({ error: { message: 'sendingMode must be "all" or "manual_only"' } });
      }
      updatedPlatform = await setPlatformEmailSettings({
        sendingMode: normalized,
        notificationsEnabled: platform.notificationsEnabled !== false,
        actorUserId: req.user.id
      });
    }

    if (Array.isArray(agencies) && agencies.length) {
      const allowedAgencyIds = userRole === 'super_admin'
        ? agencies.map((a) => Number(a.agencyId))
        : (await User.getAgencies(req.user.id)).map((a) => Number(a.id));

      const allowed = new Set(allowedAgencyIds.filter(Boolean));
      const AgencyEmailSettings = (await import('../models/AgencyEmailSettings.model.js')).default;

      for (const a of agencies) {
        const agencyId = Number(a?.agencyId || 0);
        if (!agencyId || !allowed.has(agencyId)) continue;
        await AgencyEmailSettings.update({
          agencyId,
          notificationsEnabled: a.notificationsEnabled !== false,
          actorUserId: req.user.id
        });
      }
    }

    const platformSettings = updatedPlatform || await getPlatformEmailSettings();
    res.json({
      platform: {
        sendingMode: platformSettings.sendingMode,
        notificationsEnabled: platformSettings.notificationsEnabled
      }
    });
  } catch (error) {
    next(error);
  }
};
