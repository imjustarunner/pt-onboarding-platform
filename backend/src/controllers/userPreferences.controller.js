import UserPreferences from '../models/UserPreferences.model.js';
import User from '../models/User.model.js';

const buildDefaultPreferences = (userRole) => {
  // Defaults per OVERHAUL_PLAN.md (minimal, role-aware)
  // - In-app is always enabled (cannot be disabled)
  // - Employees/providers default to SMS ON; support staff SMS optional
  const employeeLikeRoles = new Set([
    'staff',
    'provider',
    'school_staff',
    'clinician', // legacy
    'facilitator',
    'intern',
    'supervisor',
    'clinical_practice_assistant'
  ]);

  const smsDefault = employeeLikeRoles.has(userRole);

  return {
    email_enabled: true,
    sms_enabled: smsDefault,
    in_app_enabled: true,
    quiet_hours_enabled: false,
    quiet_hours_allowed_days: null,
    quiet_hours_start_time: null,
    quiet_hours_end_time: null,
    auto_reply_enabled: false,
    auto_reply_message: null,
    emergency_override: false,
    notification_categories: null,
    work_modality: null,
    scheduling_preferences: null,
    show_read_receipts: false,
    allow_staff_step_in: true,
    staff_step_in_after_minutes: 15,
    show_full_name_on_schedules: true,
    show_initials_only_on_boards: true,
    allow_name_in_pdfs: true,
    reduced_motion: false,
    high_contrast_mode: false,
    larger_text: false,
    default_landing_page: 'dashboard'
  };
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
    
    if (!preferences) {
      // Return role-aware defaults if none exist
      const user = await User.findById(parseInt(userId));
      const role = user?.role || 'staff';
      return res.json(buildDefaultPreferences(role));
    }

    res.json(preferences);
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
