import Notification from '../models/Notification.model.js';
import User from '../models/User.model.js';
import Task from '../models/Task.model.js';
import pool from '../config/database.js';

function parseJsonMaybe(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

class NotificationService {
  /**
   * Check for expired statuses (completed/terminated > 7 days)
   */
  static async checkStatusExpirations(agencyId) {
    const notifications = [];
    
    // Find users with expired status (status_expires_at < NOW())
    const [expiredUsers] = await pool.execute(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.status, u.status_expires_at, ua.agency_id
       FROM users u
       INNER JOIN user_agencies ua ON u.id = ua.user_id
       WHERE ua.agency_id = ?
       AND u.status IN ('completed', 'terminated')
       AND u.status_expires_at IS NOT NULL
       AND u.status_expires_at < NOW()
       AND u.is_active = TRUE`,
      [agencyId]
    );

    for (const user of expiredUsers) {
      // Check if notification already exists
      const existing = await Notification.findByAgency(agencyId, {
        type: 'status_expired',
        isResolved: false
      });
      
      const alreadyNotified = existing.some(n => 
        n.user_id === user.id && n.related_entity_id === user.id
      );

      if (!alreadyNotified) {
        const statusLabel = user.status === 'completed' ? 'completed' : 'terminated';
        const expiresAt = new Date(user.status_expires_at);
        
        const notification = await Notification.create({
          type: 'status_expired',
          severity: 'urgent',
          title: `User Status Expired`,
          message: `User ${user.first_name} ${user.last_name}'s ${statusLabel} status has expired. Access expired on ${expiresAt.toLocaleDateString()}.`,
          userId: user.id,
          agencyId: user.agency_id,
          relatedEntityType: 'user',
          relatedEntityId: user.id,
          actorSource: 'System'
        });
        notifications.push(notification);
      }
    }

    return notifications;
  }

  /**
   * Check for expired temporary passwords
   */
  static async checkTempPasswordExpirations(agencyId) {
    const notifications = [];
    
    // Find users with expired temporary passwords
    const [expiredUsers] = await pool.execute(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.temporary_password_expires_at, ua.agency_id
       FROM users u
       INNER JOIN user_agencies ua ON u.id = ua.user_id
       WHERE ua.agency_id = ?
       AND u.temporary_password_hash IS NOT NULL
       AND u.temporary_password_expires_at IS NOT NULL
       AND u.temporary_password_expires_at < NOW()`,
      [agencyId]
    );

    for (const user of expiredUsers) {
      // Check if notification already exists
      const existing = await Notification.findByAgency(agencyId, {
        type: 'temp_password_expired',
        isResolved: false
      });
      
      const alreadyNotified = existing.some(n => 
        n.user_id === user.id && n.related_entity_id === user.id
      );

      if (!alreadyNotified) {
        const expiresAt = new Date(user.temporary_password_expires_at);
        
        const notification = await Notification.create({
          type: 'temp_password_expired',
          severity: 'warning',
          title: `Temporary Password Expired`,
          message: `User ${user.first_name} ${user.last_name}'s temporary password has expired on ${expiresAt.toLocaleDateString()}. Generate a new password.`,
          userId: user.id,
          agencyId: agencyId,
          relatedEntityType: 'user',
          relatedEntityId: user.id,
          actorSource: 'System'
        });
        notifications.push(notification);
      }
    }

    return notifications;
  }

  /**
   * Check for expired passwordless tokens
   */
  static async checkExpiredPasswordlessTokens(agencyId) {
    const notifications = [];
    
    // Find users with expired passwordless tokens
    const [expiredUsers] = await pool.execute(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.passwordless_token_expires_at, ua.agency_id
       FROM users u
       INNER JOIN user_agencies ua ON u.id = ua.user_id
       WHERE ua.agency_id = ?
       AND u.passwordless_token IS NOT NULL
       AND u.passwordless_token_expires_at IS NOT NULL
       AND u.passwordless_token_expires_at < NOW()`,
      [agencyId]
    );

    for (const user of expiredUsers) {
      // Check if notification already exists
      const existing = await Notification.findByAgency(agencyId, {
        type: 'passwordless_token_expired',
        isResolved: false
      });
      
      const alreadyNotified = existing.some(n => 
        n.user_id === user.id && n.related_entity_id === user.id
      );

      if (!alreadyNotified) {
        const expiresAt = new Date(user.passwordless_token_expires_at);
        
        const notification = await Notification.create({
          type: 'passwordless_token_expired',
          severity: 'warning',
          title: `Passwordless Login Token Expired`,
          message: `User ${user.first_name} ${user.last_name}'s passwordless login token has expired on ${expiresAt.toLocaleDateString()}. Generate a new token if needed.`,
          userId: user.id,
          agencyId: agencyId,
          relatedEntityType: 'user',
          relatedEntityId: user.id,
          actorSource: 'System'
        });
        notifications.push(notification);
      }
    }

    return notifications;
  }

  /**
   * Check for overdue tasks/documents
   */
  static async checkOverdueTasks(agencyId) {
    const notifications = [];
    
    // Find overdue tasks for users in this agency
    // Use DISTINCT to avoid duplicates when users belong to multiple agencies
    const [overdueTasks] = await pool.execute(
      `SELECT DISTINCT t.id, t.title, t.due_date, t.task_type, t.assigned_to_user_id,
              u.first_name, u.last_name, u.email, ua.agency_id
       FROM tasks t
       INNER JOIN users u ON t.assigned_to_user_id = u.id
       INNER JOIN user_agencies ua ON u.id = ua.user_id
       WHERE ua.agency_id = ?
       AND t.due_date IS NOT NULL
       AND t.due_date < NOW()
       AND t.status NOT IN ('completed', 'overridden')`,
      [agencyId]
    );

    // Track which tasks we've already checked to avoid duplicate checks
    const checkedTaskIds = new Set();

    for (const task of overdueTasks) {
      // Skip if we've already processed this task for this agency
      if (checkedTaskIds.has(task.id)) {
        continue;
      }
      checkedTaskIds.add(task.id);

      // Check if notification already exists for this task and agency
      const existing = await Notification.findByAgency(agencyId, {
        type: 'task_overdue',
        isResolved: false
      });
      
      const alreadyNotified = existing.some(n => 
        n.related_entity_type === 'task' && n.related_entity_id === task.id
      );

      if (!alreadyNotified) {
        const dueDate = new Date(task.due_date);
        
        const notification = await Notification.create({
          type: 'task_overdue',
          severity: 'warning',
          title: `Task Overdue`,
          message: `Task '${task.title}' for user ${task.first_name} ${task.last_name} is overdue. Due date: ${dueDate.toLocaleDateString()}.`,
          userId: task.assigned_to_user_id,
          agencyId: agencyId,
          relatedEntityType: 'task',
          relatedEntityId: task.id,
          actorSource: 'System'
        });
        notifications.push(notification);
      }
    }

    return notifications;
  }

  /**
   * Create notification when onboarding is marked as completed
   */
  static async createOnboardingCompletedNotification(userId, agencyId) {
    const user = await User.findById(userId);
    if (!user) {
      return null;
    }

    // Check if notification already exists
    const existing = await Notification.findByAgency(agencyId, {
      type: 'onboarding_completed',
      isResolved: false
    });
    
    const alreadyNotified = existing.some(n => 
      n.user_id === userId && n.related_entity_id === userId
    );

    if (alreadyNotified) {
      return null;
    }

    const completedAt = user.completed_at ? new Date(user.completed_at) : new Date();
    
    return await Notification.create({
      type: 'onboarding_completed',
      severity: 'info',
      title: `Onboarding Completed`,
      message: `User ${user.first_name} ${user.last_name} has completed onboarding on ${completedAt.toLocaleDateString()}.`,
      userId: userId,
      agencyId: agencyId,
      relatedEntityType: 'user',
      relatedEntityId: userId,
      actorSource: 'System'
    });
  }

  /**
   * Payroll claim notifications (provider-facing)
   */
  static async createMileageClaimApprovedNotification({ claim, agencyId, periodLabel }) {
    if (!claim?.id || !claim?.user_id) return null;
    const existing = await Notification.findByUser(claim.user_id, { type: 'mileage_claim_approved', isResolved: false });
    const alreadyNotified = (existing || []).some((n) => n.related_entity_type === 'payroll_mileage_claim' && Number(n.related_entity_id) === Number(claim.id));
    if (alreadyNotified) return null;

    const amount = Number(claim.applied_amount || 0);
    const driveDate = String(claim.drive_date || '').slice(0, 10);
    const msg = `Your mileage claim (${driveDate}) was approved${periodLabel ? ` for ${periodLabel}` : ''}. Amount: ${amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}.`;
    return Notification.create({
      type: 'mileage_claim_approved',
      severity: 'info',
      title: 'Mileage claim approved',
      message: msg,
      userId: claim.user_id,
      agencyId: agencyId || claim.agency_id,
      relatedEntityType: 'payroll_mileage_claim',
      relatedEntityId: claim.id,
      actorSource: 'Payroll'
    });
  }

  static async createMileageClaimRejectedNotification({ claim, agencyId, rejectionReason, actorName }) {
    if (!claim?.id || !claim?.user_id) return null;
    const existing = await Notification.findByUser(claim.user_id, { type: 'mileage_claim_rejected', isResolved: false });
    const alreadyNotified = (existing || []).some((n) => n.related_entity_type === 'payroll_mileage_claim' && Number(n.related_entity_id) === Number(claim.id));
    if (alreadyNotified) return null;

    const driveDate = String(claim.drive_date || '').slice(0, 10);
    const reason = String(rejectionReason || '').trim();
    const by = actorName ? ` by ${actorName}` : '';
    const msg = `Your mileage claim (${driveDate}) was rejected${by}. Reason: ${reason}`;
    return Notification.create({
      type: 'mileage_claim_rejected',
      severity: 'warning',
      title: 'Mileage claim rejected',
      message: msg,
      userId: claim.user_id,
      agencyId: agencyId || claim.agency_id,
      relatedEntityType: 'payroll_mileage_claim',
      relatedEntityId: claim.id,
      actorSource: 'Payroll'
    });
  }

  static async createMileageClaimReturnedNotification({ claim, agencyId, note, actorName }) {
    if (!claim?.id || !claim?.user_id) return null;
    const msg = `Mileage claim needs changes${actorName ? ` (by ${actorName})` : ''}: ${String(note || '').trim()}`;
    return await Notification.create({
      userId: claim.user_id,
      agencyId,
      type: 'mileage_claim_returned',
      message: msg,
      metadata: {
        claimId: claim.id,
        note: String(note || '').trim(),
        actorName: actorName || null
      },
      actorSource: 'Payroll'
    });
  }

  static async createMedcancelClaimApprovedNotification({ claim, agencyId, periodLabel }) {
    if (!claim?.id || !claim?.user_id) return null;
    const existing = await Notification.findByUser(claim.user_id, { type: 'medcancel_claim_approved', isResolved: false });
    const alreadyNotified = (existing || []).some((n) => n.related_entity_type === 'payroll_medcancel_claim' && Number(n.related_entity_id) === Number(claim.id));
    if (alreadyNotified) return null;

    const amount = Number(claim.applied_amount || 0);
    const claimDate = String(claim.claim_date || '').slice(0, 10);
    const msg = `Your Med Cancel claim (${claimDate}) was approved${periodLabel ? ` for ${periodLabel}` : ''}. Amount: ${amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}.`;
    return Notification.create({
      type: 'medcancel_claim_approved',
      severity: 'info',
      title: 'Med Cancel claim approved',
      message: msg,
      userId: claim.user_id,
      agencyId: agencyId || claim.agency_id,
      relatedEntityType: 'payroll_medcancel_claim',
      relatedEntityId: claim.id,
      actorSource: 'Payroll'
    });
  }

  static async createMedcancelClaimRejectedNotification({ claim, agencyId, rejectionReason, actorName }) {
    if (!claim?.id || !claim?.user_id) return null;
    const existing = await Notification.findByUser(claim.user_id, { type: 'medcancel_claim_rejected', isResolved: false });
    const alreadyNotified = (existing || []).some((n) => n.related_entity_type === 'payroll_medcancel_claim' && Number(n.related_entity_id) === Number(claim.id));
    if (alreadyNotified) return null;

    const claimDate = String(claim.claim_date || '').slice(0, 10);
    const reason = String(rejectionReason || '').trim();
    const by = actorName ? ` by ${actorName}` : '';
    const msg = `Your Med Cancel claim (${claimDate}) was rejected${by}. Reason: ${reason}`;
    return Notification.create({
      type: 'medcancel_claim_rejected',
      severity: 'warning',
      title: 'Med Cancel claim rejected',
      message: msg,
      userId: claim.user_id,
      agencyId: agencyId || claim.agency_id,
      relatedEntityType: 'payroll_medcancel_claim',
      relatedEntityId: claim.id,
      actorSource: 'Payroll'
    });
  }

  static async createMedcancelClaimReturnedNotification({ claim, agencyId, note, actorName }) {
    if (!claim?.id || !claim?.user_id) return null;
    const msg = `Med Cancel claim needs changes${actorName ? ` (by ${actorName})` : ''}: ${String(note || '').trim()}`;
    return await Notification.create({
      userId: claim.user_id,
      agencyId,
      type: 'medcancel_claim_returned',
      message: msg,
      metadata: {
        claimId: claim.id,
        note: String(note || '').trim(),
        actorName: actorName || null
      },
      actorSource: 'Payroll'
    });
  }

  // =========================
  // Supervision tracking
  // =========================

  static async createSupervisionIndividual50Notification({ agencyId, userId, tierLevel, recommended, totals }) {
    if (!agencyId || !userId) return null;
    const existing = await Notification.findByUser(userId, { type: 'supervision_individual_50_reached', isResolved: false });
    if ((existing || []).some((n) => n.related_entity_type === 'supervision_accounts' && Number(n.related_entity_id) === Number(userId))) {
      // Best-effort de-dupe
    }
    const cadence = Number(recommended?.cadenceWeeks || 2);
    const minutes = Number(recommended?.minutes || 30);
    const msg =
      `You have reached 50 individual supervision hours. Your supervision schedule is now set to the agency default: ` +
      `${minutes} minutes every ${cadence} weeks.` +
      ` Current totals: Individual ${Number(totals?.individual || 0).toFixed(2)} / 50, Group ${Number(totals?.group || 0).toFixed(2)} / 50.`;
    return Notification.create({
      type: 'supervision_individual_50_reached',
      severity: 'info',
      title: 'Supervision milestone reached (50 individual hours)',
      message: msg,
      userId,
      agencyId,
      relatedEntityType: 'supervision_accounts',
      relatedEntityId: userId,
      actorSource: 'Supervision'
    });
  }

  static async createSupervisionTotal100Notification({ agencyId, userId, tierLevel, totals }) {
    if (!agencyId || !userId) return null;
    const msg =
      `Congratulations — you have completed your required supervision hours (50 individual + 50 group). ` +
      `Totals: Individual ${Number(totals?.individual || 0).toFixed(2)}, Group ${Number(totals?.group || 0).toFixed(2)}.`;
    return Notification.create({
      type: 'supervision_total_100_reached',
      severity: 'info',
      title: 'Supervision requirements completed (100 hours)',
      message: msg,
      userId,
      agencyId,
      relatedEntityType: 'supervision_accounts',
      relatedEntityId: userId,
      actorSource: 'Supervision'
    });
  }

  static async createSupervisionSuperviseeCompletedNotification({ agencyId, supervisorUserId, superviseeUserId, totals }) {
    if (!agencyId || !supervisorUserId || !superviseeUserId) return null;
    const msg =
      `A supervisee has completed supervision requirements (100 hours). ` +
      `Totals: Individual ${Number(totals?.individual || 0).toFixed(2)}, Group ${Number(totals?.group || 0).toFixed(2)}.`;
    return Notification.create({
      type: 'supervision_supervisee_completed',
      severity: 'info',
      title: 'Supervisee completed supervision requirements',
      message: msg,
      userId: supervisorUserId,
      agencyId,
      relatedEntityType: 'supervision_accounts',
      relatedEntityId: superviseeUserId,
      actorSource: 'Supervision'
    });
  }

  /**
   * Generate all notifications for an agency
   */
  static async generateNotificationsForAgency(agencyId) {
    const allNotifications = [];
    
    // Check all notification types
    const statusNotifications = await this.checkStatusExpirations(agencyId);
    const tempPasswordNotifications = await this.checkTempPasswordExpirations(agencyId);
    const expiredTokenNotifications = await this.checkExpiredPasswordlessTokens(agencyId);
    const taskNotifications = await this.checkOverdueTasks(agencyId);
    
    allNotifications.push(...statusNotifications);
    allNotifications.push(...tempPasswordNotifications);
    allNotifications.push(...expiredTokenNotifications);
    allNotifications.push(...taskNotifications);
    
    return allNotifications;
  }

  /**
   * Sync notifications for all agencies (background job)
   */
  static async syncNotifications() {
    // Get all active agencies
    const [agencies] = await pool.execute(
      'SELECT id FROM agencies WHERE is_active = TRUE'
    );

    const results = {};
    for (const agency of agencies) {
      try {
        const notifications = await this.generateNotificationsForAgency(agency.id);
        results[agency.id] = notifications.length;
      } catch (error) {
        console.error(`Error syncing notifications for agency ${agency.id}:`, error);
        results[agency.id] = { error: error.message };
      }
    }

    return results;
  }

  /**
   * Get supervisor notifications (missing/overdue items for their users)
   * Handles both supervisors (assigned supervisees only) and CPAs (all users in agency)
   */
  static async getSupervisorNotifications(supervisorUserId, agencyId) {
    const notifications = [];
    
    // Get supervisor's role and agencies
    const supervisor = await User.findById(supervisorUserId);
    if (!supervisor) {
      return [];
    }

    const supervisorAgencies = await User.getAgencies(supervisorUserId);
    const agencyIds = supervisorAgencies.map(a => a.id);
    
    if (agencyId && !agencyIds.includes(parseInt(agencyId))) {
      return []; // Supervisor doesn't have access to this agency
    }

    const targetAgencyIds = agencyId ? [parseInt(agencyId)] : agencyIds;

    for (const targetAgencyId of targetAgencyIds) {
      let users = [];

      // Check if supervisor using boolean as source of truth
      const isSupervisor = User.isSupervisor(supervisor);
      
      if (isSupervisor) {
        // Supervisors: Only get assigned supervisees
        const SupervisorAssignment = (await import('../models/SupervisorAssignment.model.js')).default;
        const superviseeIds = await SupervisorAssignment.getSuperviseeIds(supervisorUserId, targetAgencyId);
        
        if (superviseeIds.length === 0) {
          continue; // No supervisees in this agency
        }

        const placeholders = superviseeIds.map(() => '?').join(',');
        const [userRows] = await pool.execute(
          `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email
           FROM users u
           WHERE u.id IN (${placeholders})
           AND (u.is_archived = FALSE OR u.is_archived IS NULL)`,
          superviseeIds
        );
        users = userRows;
      } else if (supervisor.role === 'clinical_practice_assistant') {
        // CPAs: Get all users in agency (staff/provider/school staff/facilitator/intern)
        const [userRows] = await pool.execute(
          `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email
           FROM users u
           INNER JOIN user_agencies ua ON u.id = ua.user_id
           WHERE ua.agency_id = ?
           AND u.role IN ('staff', 'provider', 'school_staff', 'facilitator', 'intern')
           AND (u.is_archived = FALSE OR u.is_archived IS NULL)`,
          [targetAgencyId]
        );
        users = userRows;
      } else {
        // Not a supervisor or CPA, return empty
        continue;
      }

      // Pull stored payroll-related alerts for these users (e.g. unpaid notes aging) so supervisors see them in the Team view.
      try {
        const userIds = (users || []).map((u) => Number(u.id)).filter(Boolean);
        if (userIds.length) {
          const placeholders = userIds.map(() => '?').join(',');
          const [stored] = await pool.execute(
            `SELECT n.*
             FROM notifications n
             WHERE n.agency_id = ?
               AND n.type IN ('payroll_unpaid_notes_2_periods_old')
               AND n.is_resolved = FALSE
               AND n.user_id IN (${placeholders})
             ORDER BY n.created_at DESC
             LIMIT 200`,
            [targetAgencyId, ...userIds]
          );

          for (const n of stored || []) {
            // Respect optional audience targeting (if present).
            const aud = parseJsonMaybe(n.audience_json);
            const allowSupervisor = aud && typeof aud === 'object' ? aud.supervisor !== false : true;
            const allowCpa = aud && typeof aud === 'object' ? aud.clinicalPracticeAssistant !== false : true;
            const allow =
              isSupervisor ? allowSupervisor : (supervisor.role === 'clinical_practice_assistant' ? allowCpa : true);
            if (!allow) continue;

            notifications.push({
              ...n,
              userId: n.user_id,
              agencyId: n.agency_id,
              relatedEntityType: n.related_entity_type,
              relatedEntityId: n.related_entity_id
            });
          }
        }
      } catch {
        // Best effort: do not block team notifications if stored lookup fails.
      }

      for (const user of users) {
        // Check for overdue tasks
        const [overdueTasks] = await pool.execute(
          `SELECT id, title, due_date
           FROM tasks
           WHERE assigned_to_user_id = ?
           AND due_date IS NOT NULL
           AND due_date < NOW()
           AND status NOT IN ('completed', 'overridden')`,
          [user.id]
        );

        for (const task of overdueTasks) {
          notifications.push({
            type: 'task_overdue',
            severity: 'warning',
            title: `Overdue Task`,
            message: `User ${user.first_name} ${user.last_name} has an overdue task: ${task.title}`,
            userId: user.id,
            agencyId: targetAgencyId,
            relatedEntityType: 'task',
            relatedEntityId: task.id,
            dueDate: task.due_date
          });
        }

        // Check for incomplete checklist items
        const [incompleteItems] = await pool.execute(
          `SELECT COUNT(*) as count
           FROM user_checklist_assignments uca
           WHERE uca.user_id = ?
           AND uca.is_completed = FALSE`,
          [user.id]
        );

        if (incompleteItems[0]?.count > 0) {
          notifications.push({
            type: 'checklist_incomplete',
            severity: 'info',
            title: `Incomplete Checklist`,
            message: `User ${user.first_name} ${user.last_name} has ${incompleteItems[0].count} incomplete checklist item(s)`,
            userId: user.id,
            agencyId: targetAgencyId,
            relatedEntityType: 'checklist',
            relatedEntityId: user.id
          });
        }
      }
    }

    return notifications;
  }

  /**
   * Create notification for first login (pending users)
   */
  static async createFirstLoginPendingNotification(userId, agencyId) {
    const user = await User.findById(userId);
    if (!user || user.status !== 'pending') {
      return null;
    }

    // Check if notification already exists
    const existing = await Notification.findByAgency(agencyId, {
      type: 'first_login_pending',
      isResolved: false
    });
    
    const alreadyNotified = existing.some(n => 
      n.user_id === userId && n.related_entity_id === userId
    );

    if (alreadyNotified) {
      return null;
    }

    return await Notification.create({
      type: 'first_login_pending',
      severity: 'info',
      title: `First Login - Pending User`,
      message: `Pending user ${user.first_name} ${user.last_name} (${user.email}) has logged in for the first time.`,
      userId: userId,
      agencyId: agencyId,
      relatedEntityType: 'user',
      relatedEntityId: userId,
      actorSource: 'System'
    });
  }

  /**
   * Create notification for first login (regular users)
   */
  static async createFirstLoginNotification(userId, agencyId) {
    const user = await User.findById(userId);
    if (!user || user.status === 'pending') {
      return null;
    }

    // Check if notification already exists
    const existing = await Notification.findByAgency(agencyId, {
      type: 'first_login',
      isResolved: false
    });
    
    const alreadyNotified = existing.some(n => 
      n.user_id === userId && n.related_entity_id === userId
    );

    if (alreadyNotified) {
      return null;
    }

    return await Notification.create({
      type: 'first_login',
      severity: 'info',
      title: `First Login`,
      message: `User ${user.first_name} ${user.last_name} (${user.email}) has logged in for the first time.`,
      userId: userId,
      agencyId: agencyId,
      relatedEntityType: 'user',
      relatedEntityId: userId,
      actorSource: 'System'
    });
  }

  /**
   * Create notification for password change
   */
  static async createPasswordChangeNotification(userId, agencyId) {
    const user = await User.findById(userId);
    if (!user) {
      return null;
    }

    // Check if notification already exists (only create one per user)
    const existing = await Notification.findByAgency(agencyId, {
      type: 'password_changed',
      isResolved: false
    });
    
    const alreadyNotified = existing.some(n => 
      n.user_id === userId && n.related_entity_id === userId
    );

    if (alreadyNotified) {
      return null;
    }

    return await Notification.create({
      type: 'password_changed',
      severity: 'info',
      title: `Password Changed`,
      message: `User ${user.first_name} ${user.last_name} (${user.email}) has changed their password for the first time.`,
      userId: userId,
      agencyId: agencyId,
      relatedEntityType: 'user',
      relatedEntityId: userId,
      actorSource: 'System'
    });
  }

  /**
   * Create notification when a user logs in. Visible to admin, staff, provider_plus, super_admin only.
   */
  static async createUserLoginNotification(userId, agencyId) {
    const user = await User.findById(userId);
    if (!user) return null;

    const displayName = `${String(user.first_name || '').trim()} ${String(user.last_name || '').trim()}`.trim() || user.email || `User ${userId}`;
    return Notification.create({
      type: 'user_login',
      severity: 'info',
      title: 'User logged in',
      message: `${displayName} (${user.email}) logged in.`,
      audienceJson: {
        admin: true,
        clinicalPracticeAssistant: true,
        provider: false,
        supervisor: false
      },
      userId,
      agencyId,
      relatedEntityType: 'user',
      relatedEntityId: userId,
      actorUserId: userId,
      actorSource: 'System'
    });
  }

  /**
   * Create notification when a user logs out. Visible to admin, staff, provider_plus, super_admin only.
   */
  static async createUserLogoutNotification(userId, agencyId) {
    const user = await User.findById(userId);
    if (!user) return null;

    const displayName = `${String(user.first_name || '').trim()} ${String(user.last_name || '').trim()}`.trim() || user.email || `User ${userId}`;
    return Notification.create({
      type: 'user_logout',
      severity: 'info',
      title: 'User logged out',
      message: `${displayName} (${user.email}) logged out.`,
      audienceJson: {
        admin: true,
        clinicalPracticeAssistant: true,
        provider: false,
        supervisor: false
      },
      userId,
      agencyId,
      relatedEntityType: 'user',
      relatedEntityId: userId,
      actorUserId: userId,
      actorSource: 'System'
    });
  }

  /**
   * Payroll/admin notification: provider updated home address (used for mileage auto-calculation).
   * This is agency-scoped so staff/admins see it in the agency notification queue.
   */
  static async createPayrollHomeAddressUpdatedNotification({ userId, agencyId, address }) {
    if (!userId || !agencyId) return null;
    const user = await User.findById(userId);
    if (!user) return null;

    const line = String(address || '').trim();
    const msg =
      `Home address updated for ${String(user.first_name || '').trim()} ${String(user.last_name || '').trim()}`.trim() +
      (line ? `: ${line}` : '.');

    return Notification.create({
      type: 'payroll_home_address_updated',
      severity: 'info',
      title: 'Home address updated (mileage)',
      message: msg,
      userId,
      agencyId,
      relatedEntityType: 'user',
      relatedEntityId: userId,
      actorSource: 'Payroll'
    });
  }
}

export default NotificationService;
