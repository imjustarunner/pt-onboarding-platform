import UserPreferences from '../models/UserPreferences.model.js';
import User from '../models/User.model.js';

const ALL_NOTIFICATION_CATEGORY_KEYS = [
  'messaging_new_inbound_client_text',
  'messaging_support_safety_net_alerts',
  'messaging_replies_to_my_messages',
  'messaging_client_notes',
  'client_assignments',
  'school_portal_client_updates',
  'school_portal_client_update_org_swaps',
  'school_portal_client_comments',
  'school_portal_client_messages',
  'scheduling_room_booking_approved_denied',
  'scheduling_schedule_changes',
  'scheduling_room_release_requests',
  'compliance_credential_expiration_reminders',
  'compliance_access_restriction_warnings',
  'compliance_payroll_document_availability',
  'surveys_client_checked_in',
  'surveys_survey_completed',
  'system_emergency_broadcasts',
  'system_org_announcements',
  'program_reminders'
];

const buildDefaultCategories = () => {
  const base = {};
  for (const key of ALL_NOTIFICATION_CATEGORY_KEYS) {
    base[key] = false;
  }
  // Required categories
  base.system_emergency_broadcasts = true;
  return base;
};

const buildDefaultPreferences = (userRole) => {
  // Defaults per OVERHAUL_PLAN.md (minimal, role-aware)
  // - In-app is always enabled (cannot be disabled)
  // - Employees/providers default to SMS ON; support staff SMS optional
  const employeeLikeRoles = new Set([
    'staff',
    'provider',
    'school_staff',
    // 'clinician', // legacy (removed)
    'facilitator',
    'intern',
    'supervisor',
    'clinical_practice_assistant'
  ]);

  const smsDefault = employeeLikeRoles.has(userRole);

  const base = {
    email_enabled: true,
    sms_enabled: smsDefault,
    sms_forwarding_enabled: true,
    in_app_enabled: true,
    quiet_hours_enabled: false,
    quiet_hours_allowed_days: null,
    quiet_hours_start_time: null,
    quiet_hours_end_time: null,
    auto_reply_enabled: false,
    auto_reply_message: null,
    emergency_override: false,
    notification_categories: buildDefaultCategories(),
    daily_digest_enabled: false,
    daily_digest_time: '07:00',
    work_modality: null,
    scheduling_preferences: null,
    schedule_color_overrides: {
      request: '#F2C94C',
      school: '#2D9CDB',
      supervision: '#9B51E0',
      office_assigned: '#27AE60',
      office_temporary: '#9B51E0',
      office_booked: '#EB5757',
      google_busy: '#111827',
      ehr_busy: '#F2994A'
    },
    show_read_receipts: false,
    allow_staff_step_in: true,
    staff_step_in_after_minutes: 15,
    show_full_name_on_schedules: true,
    show_initials_only_on_boards: true,
    allow_name_in_pdfs: true,
    reduced_motion: false,
    high_contrast_mode: false,
    larger_text: false,
    default_landing_page: 'dashboard',
    helper_enabled: true,
    tutorial_progress: null,
    school_portal_notifications_progress: null,

    // Dashboard preferences
    dashboard_notification_org_types: ['agency']
  };
  if (String(userRole || '').toLowerCase() === 'provider') {
    base.notification_categories.client_assignments = true;
  }
  return base;
};

/**
 * Get user preferences
 * GET /api/users/:userId/preferences
 */
export const getUserPreferences = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user.id;
    const requestingRole = req.user.role;

    // Users can view their own preferences, admins/staff/superadmin can view any user's preferences
    if (parseInt(userId) !== requestingUserId) {
      if (!['super_admin', 'admin', 'staff', 'support'].includes(requestingRole)) {
        return res.status(403).json({
          error: { message: 'You do not have permission to view this user\'s preferences' }
        });
      }
    }

    const preferences = await UserPreferences.findByUserId(parseInt(userId));
    const targetUser = await User.findById(parseInt(userId));
    const agencies = await User.getAgencies(parseInt(userId));
    const agencyId = agencies?.[0]?.id || null;
    const AgencyNotificationPreferences = (await import('../models/AgencyNotificationPreferences.model.js')).default;
    const agencyPrefs = agencyId ? await AgencyNotificationPreferences.getByAgencyId(agencyId) : null;
    const agencyDefaults = agencyPrefs?.defaults || null;
    const agencyUserEditable = agencyPrefs ? agencyPrefs.userEditable !== false : false;
    const agencyEnforceDefaults = agencyPrefs ? agencyPrefs.enforceDefaults === true : true;
    
    if (!preferences) {
      const role = targetUser?.role || 'staff';
      const base = buildDefaultPreferences(role);
      const merged = {
        ...base,
        notification_categories: {
          ...(base.notification_categories || buildDefaultCategories()),
          ...(agencyDefaults || {})
        }
      };
      return res.json({
        ...merged,
        agencyNotificationSettings: {
          defaults: agencyDefaults || null,
          userEditable: agencyUserEditable,
          enforceDefaults: agencyEnforceDefaults
        }
      });
    }

    const defaultCategories = buildDefaultCategories();
    const mergedCategories = {
      ...defaultCategories,
      ...(preferences.notification_categories || {}),
      ...(agencyEnforceDefaults ? (agencyDefaults || {}) : {})
    };
    if (targetUser?.role === 'support') {
      mergedCategories.messaging_support_safety_net_alerts = true;
    }

    res.json({
      ...preferences,
      notification_categories: mergedCategories,
      agencyNotificationSettings: {
        defaults: agencyDefaults || null,
        userEditable: agencyUserEditable,
        enforceDefaults: agencyEnforceDefaults
      }
    });
  } catch (error) {
    console.error('Error fetching user preferences:', error);
    next(error);
  }
};

/**
 * Update user preferences
 * PUT /api/users/:userId/preferences
 */
export const updateUserPreferences = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user.id;
    const requestingRole = req.user.role;
    const updates = req.body;

    // Users can edit their own preferences (within boundaries), admins/staff/superadmin can edit any user's preferences
    const isOwnPreferences = parseInt(userId) === requestingUserId;
    const isAdmin = ['super_admin', 'admin', 'staff', 'support'].includes(requestingRole);

    if (!isOwnPreferences && !isAdmin) {
      return res.status(403).json({
        error: { message: 'You do not have permission to edit this user\'s preferences' }
      });
    }

    // Validate user exists
    const user = await User.findById(parseInt(userId));
    if (!user) {
      return res.status(404).json({
        error: { message: 'User not found' }
      });
    }

    if ('daily_digest_time' in updates) {
      const raw = updates.daily_digest_time;
      if (raw === null || raw === '' || raw === undefined) {
        updates.daily_digest_time = null;
      } else {
        const v = String(raw || '').trim();
        if (!/^\d{2}:\d{2}$/.test(v)) {
          return res.status(400).json({ error: { message: 'daily_digest_time must be HH:MM' } });
        }
        updates.daily_digest_time = v;
      }
    }
    if ('daily_digest_enabled' in updates) {
      updates.daily_digest_enabled = updates.daily_digest_enabled === true || updates.daily_digest_enabled === 1 || updates.daily_digest_enabled === '1';
    }

    // For non-admin users editing their own preferences, enforce boundaries
    if (isOwnPreferences && !isAdmin) {
      // Users cannot edit admin-controlled fields
      const adminControlledFields = ['work_modality', 'scheduling_preferences'];
      for (const field of adminControlledFields) {
        if (field in updates) {
          delete updates[field];
        }
      }
    }

    // Ensure in_app_enabled is always true (safety requirement)
    if ('in_app_enabled' in updates && updates.in_app_enabled === false) {
      updates.in_app_enabled = true;
    }

    const agencies = await User.getAgencies(parseInt(userId));
    const agencyId = agencies?.[0]?.id || null;
    const AgencyNotificationPreferences = (await import('../models/AgencyNotificationPreferences.model.js')).default;
    const agencyPrefs = agencyId ? await AgencyNotificationPreferences.getByAgencyId(agencyId) : null;
    const agencyDefaults = agencyPrefs?.defaults || null;
    const agencyUserEditable = agencyPrefs?.userEditable !== false;
    const agencyEnforceDefaults = agencyPrefs?.enforceDefaults === true;

    // Enforce safety-required notification category settings (if client sends them)
    // Note: the UI labels these as “Required – cannot be disabled”.
    if (updates.notification_categories && typeof updates.notification_categories === 'object') {
      // Emergency broadcasts bypass preferences; keep the “category” required if present.
      if (updates.notification_categories.system_emergency_broadcasts === false) {
        updates.notification_categories.system_emergency_broadcasts = true;
      }

      // Support Safety Net alerts cannot be fully disabled for support staff.
      if (user.role === 'support' && updates.notification_categories.messaging_support_safety_net_alerts === false) {
        updates.notification_categories.messaging_support_safety_net_alerts = true;
      }
    }

    if (!agencyUserEditable && !isAdmin) {
      delete updates.email_enabled;
      delete updates.sms_enabled;
      delete updates.sms_forwarding_enabled;
      delete updates.quiet_hours_enabled;
      delete updates.quiet_hours_allowed_days;
      delete updates.quiet_hours_start_time;
      delete updates.quiet_hours_end_time;
      delete updates.emergency_override;
      delete updates.auto_reply_enabled;
      delete updates.auto_reply_message;
    }

    if (updates.notification_categories && typeof updates.notification_categories === 'object') {
      if (!agencyUserEditable && !isAdmin) {
        delete updates.notification_categories;
      } else if (agencyEnforceDefaults) {
        updates.notification_categories = {
          ...buildDefaultCategories(),
          ...(agencyDefaults || {})
        };
      }
    } else if (agencyEnforceDefaults) {
      updates.notification_categories = {
        ...buildDefaultCategories(),
        ...(agencyDefaults || {})
      };
    }

    const preferences = await UserPreferences.update(parseInt(userId), updates);

    res.json({
      message: 'Preferences updated successfully',
      preferences
    });
  } catch (error) {
    console.error('Error updating user preferences:', error);
    next(error);
  }
};
