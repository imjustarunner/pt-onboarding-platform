import User from '../models/User.model.js';
import UserAccount from '../models/UserAccount.model.js';
import OnboardingChecklist from '../models/OnboardingChecklist.model.js';
import UserChecklistAssignment from '../models/UserChecklistAssignment.model.js';
import UserInfoValue from '../models/UserInfoValue.model.js';
import OnboardingDataService from '../services/onboardingData.service.js';
import CompletionPackageService from '../services/completionPackage.service.js';
import NotificationService from '../services/notification.service.js';
import ActivityLogService from '../services/activityLog.service.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUserCapabilities } from '../utils/capabilities.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getCurrentUser = async (req, res, next) => {
  try {
    // Approved employee tokens do not have a users-table record.
    if (!req.user?.id && req.user?.role === 'approved_employee') {
      const synthetic = { role: 'approved_employee', status: 'ACTIVE_EMPLOYEE', type: req.user.type || 'approved_employee' };
      return res.json({
        email: req.user.email,
        role: 'approved_employee',
        type: req.user.type || 'approved_employee',
        capabilities: getUserCapabilities(synthetic)
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });

    const payrollAgencyIds = user?.id ? await User.listPayrollAgencyIds(user.id) : [];
    const baseCaps = getUserCapabilities(user);
    const canManagePayroll =
      user.role === 'admin' ||
      user.role === 'super_admin' ||
      (user.role === 'staff' && payrollAgencyIds.length > 0);

    // 6-month password expiry (best-effort; defaults to created_at if password_changed_at missing)
    const calcPasswordExpiry = (u) => {
      const changedAt = u?.password_changed_at ? new Date(u.password_changed_at) : (u?.created_at ? new Date(u.created_at) : null);
      if (!changedAt || Number.isNaN(changedAt.getTime())) return { requiresPasswordChange: false, passwordExpiresAt: null, passwordExpired: false };
      const expiresAt = new Date(changedAt.getTime());
      expiresAt.setMonth(expiresAt.getMonth() + 6);
      const expired = expiresAt.getTime() <= Date.now();
      return {
        requiresPasswordChange: expired,
        passwordExpiresAt: expiresAt.toISOString(),
        passwordExpired: expired
      };
    };
    const pw = calcPasswordExpiry(user);

    // Return user in same format as login response + capabilities
    res.json({
      id: user.id,
      email: user.email,
      role: user.role, // Always get role from database, not token
      status: user.status,
      firstName: user.first_name,
      lastName: user.last_name,
      preferredName: user.preferred_name || null,
      username: user.username || user.personal_email || user.email,
      profilePhotoUrl: publicUploadsUrlFromStoredPath(user.profile_photo_path),
      requiresPasswordChange: pw.requiresPasswordChange,
      passwordExpiresAt: pw.passwordExpiresAt,
      passwordExpired: pw.passwordExpired,
      // Provider global availability (best-effort; defaults true for older DBs)
      provider_accepting_new_clients:
        user.provider_accepting_new_clients === undefined || user.provider_accepting_new_clients === null
          ? true
          : Boolean(user.provider_accepting_new_clients),
      medcancelEnabled: ['low', 'high'].includes(String(user.medcancel_rate_schedule || '').toLowerCase()),
      medcancelRateSchedule: user.medcancel_rate_schedule || null,
      companyCardEnabled: Boolean(user.company_card_enabled),
      payrollAgencyIds,
      capabilities: {
        ...baseCaps,
        canManagePayroll,
        canViewMyPayroll: true
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getAllUsers = async (req, res, next) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    
    // For non-super_admin users, filter by their agencies
    let users;
    if (req.user.role === 'super_admin') {
      // Super admins see all users
      users = await User.findAll(includeArchived);
    } else if (User.isSupervisor(req.user) || req.user.role === 'supervisor') {
      // Supervisors can ONLY view their assigned supervisees
      // Check using isSupervisor helper (requires full user object) or fallback to role check
      const requestingUser = await User.findById(req.user.id);
      if (!requestingUser || !User.isSupervisor(requestingUser)) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
      
      const SupervisorAssignment = (await import('../models/SupervisorAssignment.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const agencyIds = userAgencies.map(a => a.id);
      
      if (agencyIds.length === 0) {
        users = [];
      } else {
        // Get all supervisee IDs across all agencies
        const allSuperviseeIds = [];
        for (const agencyId of agencyIds) {
          const superviseeIds = await SupervisorAssignment.getSuperviseeIds(req.user.id, agencyId);
          allSuperviseeIds.push(...superviseeIds);
        }

        if (allSuperviseeIds.length === 0) {
          users = [];
        } else {
          const pool = (await import('../config/database.js')).default;
          const placeholders = allSuperviseeIds.map(() => '?').join(',');
          // Check if has_supervisor_privileges column exists
          let hasSupervisorPrivilegesField = '';
          try {
            const [columns] = await pool.execute(
              "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'has_supervisor_privileges'"
            );
            if (columns.length > 0) {
              hasSupervisorPrivilegesField = ', u.has_supervisor_privileges';
            }
          } catch (err) {
            // Column doesn't exist yet, skip it
          }
          
          let query = `
            SELECT DISTINCT 
              u.id, 
              u.email, 
              u.role, 
              u.status, 
              u.completed_at, 
              u.terminated_at, 
              u.status_expires_at, 
              u.is_active, 
              u.first_name, 
              u.last_name, 
              u.created_at${hasSupervisorPrivilegesField},
              GROUP_CONCAT(DISTINCT a.name ORDER BY a.name SEPARATOR ', ') as agencies,
              GROUP_CONCAT(DISTINCT a.id ORDER BY a.id SEPARATOR ',') as agency_ids
            FROM users u
            INNER JOIN user_agencies ua ON u.id = ua.user_id
            LEFT JOIN agencies a ON ua.agency_id = a.id
            WHERE u.id IN (${placeholders})
          `;
          
          if (!includeArchived) {
            query += ' AND (u.is_archived = FALSE OR u.is_archived IS NULL)';
          }
          
          let groupByFields = 'u.id, u.email, u.role, u.status, u.completed_at, u.terminated_at, u.status_expires_at, u.is_active, u.first_name, u.last_name, u.created_at';
          if (hasSupervisorPrivilegesField) {
            groupByFields += ', u.has_supervisor_privileges';
          }
          query += ` GROUP BY ${groupByFields}`;
          query += ' ORDER BY u.created_at DESC';
          
          const [rows] = await pool.execute(query, allSuperviseeIds);
          users = rows;
        }
      }
    } else if (req.user.role === 'clinical_practice_assistant') {
      // CPAs can view all users in their agencies (same as old supervisor behavior)
      const userAgencies = await User.getAgencies(req.user.id);
      const agencyIds = userAgencies.map(a => a.id);
      
      if (agencyIds.length === 0) {
        users = [];
      } else {
        const pool = (await import('../config/database.js')).default;
        // Check if has_supervisor_privileges column exists
        let hasSupervisorPrivilegesField = '';
        try {
          const [columns] = await pool.execute(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'has_supervisor_privileges'"
          );
          if (columns.length > 0) {
            hasSupervisorPrivilegesField = ', u.has_supervisor_privileges';
          }
        } catch (err) {
          // Column doesn't exist yet, skip it
        }
        
        let query = `
          SELECT DISTINCT 
            u.id, 
            u.email, 
            u.role, 
            u.status, 
            u.completed_at, 
            u.terminated_at, 
            u.status_expires_at, 
            u.is_active, 
            u.first_name, 
            u.last_name, 
            u.created_at${hasSupervisorPrivilegesField},
            GROUP_CONCAT(DISTINCT a.name ORDER BY a.name SEPARATOR ', ') as agencies,
            GROUP_CONCAT(DISTINCT a.id ORDER BY a.id SEPARATOR ',') as agency_ids
          FROM users u
          INNER JOIN user_agencies ua ON u.id = ua.user_id
          LEFT JOIN agencies a ON ua.agency_id = a.id
          WHERE ua.agency_id IN (${agencyIds.map(() => '?').join(',')})
          AND u.role IN ('staff', 'provider', 'school_staff', 'clinician', 'facilitator', 'intern')
        `;
        
        if (!includeArchived) {
          query += ' AND (u.is_archived = FALSE OR u.is_archived IS NULL)';
        }
        
        let groupByFields = 'u.id, u.email, u.role, u.status, u.completed_at, u.terminated_at, u.status_expires_at, u.is_active, u.first_name, u.last_name, u.created_at';
        if (hasSupervisorPrivilegesField) {
          groupByFields += ', u.has_supervisor_privileges';
        }
        query += ` GROUP BY ${groupByFields}`;
        query += ' ORDER BY u.created_at DESC';
        
        const [rows] = await pool.execute(query, agencyIds);
        users = rows;
      }
    } else {
      // Admin and support users only see users from their agencies
      const userAgencies = await User.getAgencies(req.user.id);
      const agencyIds = userAgencies.map(a => a.id);
      
      if (agencyIds.length === 0) {
        // User has no agencies, return empty array
        users = [];
      } else {
        // Get users from user's agencies
        const pool = (await import('../config/database.js')).default;
        
        // Check if has_supervisor_privileges column exists
        let hasSupervisorPrivilegesField = '';
        let hasProviderAccessField = '';
        let hasStaffAccessField = '';
        try {
          const [columns] = await pool.execute(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('has_supervisor_privileges','has_provider_access','has_staff_access')"
          );
          const existingColumns = columns.map(c => c.COLUMN_NAME);
          if (existingColumns.includes('has_supervisor_privileges')) {
            hasSupervisorPrivilegesField = ', u.has_supervisor_privileges';
          }
          if (existingColumns.includes('has_provider_access')) {
            hasProviderAccessField = ', u.has_provider_access';
          }
          if (existingColumns.includes('has_staff_access')) {
            hasStaffAccessField = ', u.has_staff_access';
          }
        } catch (err) {
          // Column doesn't exist yet, skip it
        }
        
        let query = `
          SELECT DISTINCT 
            u.id, 
            u.email, 
            u.role, 
            u.status, 
            u.completed_at, 
            u.terminated_at, 
            u.status_expires_at, 
            u.is_active, 
            u.first_name, 
            u.last_name, 
            u.created_at${hasSupervisorPrivilegesField}${hasProviderAccessField}${hasStaffAccessField},
            GROUP_CONCAT(DISTINCT a.name ORDER BY a.name SEPARATOR ', ') as agencies,
            GROUP_CONCAT(DISTINCT a.id ORDER BY a.id SEPARATOR ',') as agency_ids
          FROM users u
          INNER JOIN user_agencies ua ON u.id = ua.user_id
          LEFT JOIN agencies a ON ua.agency_id = a.id
          WHERE ua.agency_id IN (${agencyIds.map(() => '?').join(',')})
        `;
        
        if (!includeArchived) {
          query += ' AND (u.is_archived = FALSE OR u.is_archived IS NULL)';
        }
        
        let groupByFields = 'u.id, u.email, u.role, u.status, u.completed_at, u.terminated_at, u.status_expires_at, u.is_active, u.first_name, u.last_name, u.created_at';
        if (hasSupervisorPrivilegesField) {
          groupByFields += ', u.has_supervisor_privileges';
        }
        if (hasProviderAccessField) {
          groupByFields += ', u.has_provider_access';
        }
        if (hasStaffAccessField) {
          groupByFields += ', u.has_staff_access';
        }
        query += ` GROUP BY ${groupByFields}`;
        query += ' ORDER BY u.created_at DESC';
        
        const [rows] = await pool.execute(query, agencyIds);
        users = rows;
      }
    }

    // Attach provider credential for client-side sorting/search (best-effort).
    // Note: Some environments store the useful “credential” text in other provider_* fields
    // (e.g. the license type/number). We expose a single `provider_credential` field to the UI.
    try {
      if (Array.isArray(users) && users.length > 0) {
        const pool = (await import('../config/database.js')).default;
        const ids = users.map((u) => parseInt(u.id, 10)).filter(Boolean);
        if (ids.length > 0) {
          const placeholders = ids.map(() => '?').join(',');
          const [rows] = await pool.execute(
            `SELECT uiv.user_id,
                    MAX(CASE WHEN uifd.field_key = 'provider_credential' THEN uiv.value END) AS credential,
                    MAX(CASE WHEN uifd.field_key = 'provider_credential_license_type_number' THEN uiv.value END) AS license_type_number
             FROM user_info_values uiv
             JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
             WHERE uifd.field_key IN ('provider_credential', 'provider_credential_license_type_number')
               AND uiv.user_id IN (${placeholders})
             GROUP BY uiv.user_id`,
            ids
          );
          const byUserId = new Map(
            (rows || []).map((r) => [
              Number(r.user_id),
              (r.credential || r.license_type_number || null)
            ])
          );
          users = users.map((u) => ({
            ...u,
            provider_credential: byUserId.get(Number(u.id)) || null
          }));
        }
      }
    } catch {
      // Ignore if schema doesn't exist yet.
    }

    // Attach provider accepting-new-clients flag (best-effort).
    try {
      if (Array.isArray(users) && users.length > 0) {
        const pool = (await import('../config/database.js')).default;
        const ids = users.map((u) => parseInt(u.id, 10)).filter(Boolean);
        if (ids.length > 0) {
          const placeholders = ids.map(() => '?').join(',');
          const [rows] = await pool.execute(
            `SELECT id, provider_accepting_new_clients
             FROM users
             WHERE id IN (${placeholders})`,
            ids
          );
          const byId = new Map((rows || []).map((r) => [Number(r.id), r.provider_accepting_new_clients]));
          users = users.map((u) => ({
            ...u,
            provider_accepting_new_clients:
              byId.has(Number(u.id)) ? Boolean(byId.get(Number(u.id))) : true
          }));
        }
      }
    } catch {
      // Ignore if column doesn't exist yet.
      users = (users || []).map((u) => ({ ...u, provider_accepting_new_clients: true }));
    }

    // Attach provider school availability summary (best-effort):
    // provider_has_open_school_slots = any active assignment with slots_available > 0
    // AND effective accepting_new_clients for that school (override/global) is true.
    try {
      if (Array.isArray(users) && users.length > 0) {
        const pool = (await import('../config/database.js')).default;
        const ids = users.map((u) => parseInt(u.id, 10)).filter(Boolean);
        if (ids.length > 0) {
          const placeholders = ids.map(() => '?').join(',');
          const [rows] = await pool.execute(
            `SELECT psa.provider_user_id,
                    MAX(
                      CASE
                        WHEN psa.is_active = TRUE
                         AND psa.slots_available > 0
                         AND COALESCE(psa.accepting_new_clients_override, u.provider_accepting_new_clients, TRUE) = TRUE
                        THEN 1 ELSE 0
                      END
                    ) AS has_open
             FROM provider_school_assignments psa
             JOIN users u ON u.id = psa.provider_user_id
             WHERE psa.provider_user_id IN (${placeholders})
             GROUP BY psa.provider_user_id`,
            ids
          );
          const byId = new Map((rows || []).map((r) => [Number(r.provider_user_id), Number(r.has_open || 0)]));
          users = users.map((u) => ({
            ...u,
            provider_has_open_school_slots: Boolean(byId.get(Number(u.id)) || 0)
          }));
        }
      }
    } catch {
      // Ignore if table/columns don't exist yet.
      users = (users || []).map((u) => ({ ...u, provider_has_open_school_slots: false }));
    }

    res.json(users);
  } catch (error) {
    next(error);
  }
};

/**
 * Gemini-ready AI user search endpoint.
 *
 * Today: lightweight heuristic keyword extraction + SQL LIKE search across *all* user_info_values.value
 * for the users the requester can access.
 *
 * Later: swap keyword extraction with Gemini → structured filters, keep this endpoint stable.
 */
export const aiQueryUsers = async (req, res, next) => {
  try {
    const raw = String(req.query.query || '').trim();
    const includeArchived = req.query.includeArchived === 'true';
    const limitRaw = parseInt(String(req.query.limit || '100'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;

    if (!raw) {
      return res.json({ results: [], emailsSemicolon: '', meta: { keywords: [], total: 0 } });
    }

    const extractKeywords = (text) => {
      const s = String(text || '').trim();
      if (!s) return [];

      // Prefer a quoted phrase if present.
      const quoted = s.match(/["“”']([^"“”']{2,80})["“”']/);
      if (quoted?.[1]) return [quoted[1].trim().toLowerCase()];

      // Prefer “interested in X” phrase.
      const interested = s.match(/\binterested\s+in\s+([a-z0-9][a-z0-9\s\-]{1,60})/i);
      if (interested?.[1]) {
        const phrase = interested[1].trim().replace(/\s+/g, ' ');
        // If they typed multiple words, keep the whole phrase as one keyword.
        return [phrase.toLowerCase()];
      }

      // Fallback: tokens with stopword filtering.
      const stop = new Set([
        'list', 'show', 'give', 'find', 'all', 'any', 'the', 'a', 'an', 'of', 'for', 'to', 'from',
        'with', 'without', 'and', 'or', 'but', 'who', 'that', 'which', 'where', 'when',
        'is', 'are', 'was', 'were', 'be', 'been', 'being', 'mentioned', 'say', 'said',
        'they', 'them', 'their', 'people', 'person', 'users', 'user', 'in', 'on', 'at', 'as'
      ]);
      const tokens = s
        .toLowerCase()
        .replace(/[^a-z0-9\s\-]/g, ' ')
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3 && !stop.has(t));

      const uniq = [];
      for (const t of tokens) {
        if (!uniq.includes(t)) uniq.push(t);
        if (uniq.length >= 3) break;
      }
      return uniq;
    };

    const keywords = extractKeywords(raw);
    const terms = keywords.length > 0 ? keywords : [raw.toLowerCase()];

    const pool = (await import('../config/database.js')).default;

    // Scope: same as /users for backoffice admins.
    // - super_admin: all users
    // - admin/support: users in the requester's agencies
    const isSuperAdmin = req.user.role === 'super_admin';
    const joinAgency = isSuperAdmin ? '' : 'INNER JOIN user_agencies ua ON ua.user_id = u.id';
    const whereParts = [];
    const params = [];

    if (!includeArchived) {
      whereParts.push('(u.is_archived = FALSE OR u.is_archived IS NULL)');
    }

    if (!isSuperAdmin) {
      const userAgencies = await User.getAgencies(req.user.id);
      const agencyIds = (userAgencies || []).map((a) => a.id).filter(Boolean);
      if (agencyIds.length === 0) {
        return res.json({ results: [], emailsSemicolon: '', meta: { keywords: terms, total: 0 } });
      }
      whereParts.push(`ua.agency_id IN (${agencyIds.map(() => '?').join(',')})`);
      params.push(...agencyIds);
    }

    // Search all user_info_values (across all user info fields).
    const termClauses = terms.map(
      () =>
        `(LOWER(COALESCE(uiv.value, '')) LIKE ? OR LOWER(COALESCE(uifd.field_label, '')) LIKE ? OR LOWER(COALESCE(uifd.field_key, '')) LIKE ?)`
    );
    const existsClause = `
      EXISTS (
        SELECT 1
        FROM user_info_values uiv
        JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
        WHERE uiv.user_id = u.id
          AND (${termClauses.join(' OR ')})
      )
    `;
    whereParts.push(existsClause);
    for (const t of terms) {
      const like = `%${String(t).toLowerCase()}%`;
      params.push(like, like, like);
    }

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT DISTINCT u.id, u.email, u.first_name, u.last_name
       FROM users u
       ${joinAgency}
       ${whereSql}
       ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC
       LIMIT ?`,
      [...params, limit]
    );

    const results = (rows || []).map((r) => ({
      id: r.id,
      email: r.email,
      first_name: r.first_name,
      last_name: r.last_name
    }));

    const emailsSemicolon = results
      .map((u) => {
        const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || String(u.email || '').trim();
        const email = String(u.email || '').trim();
        if (!email) return '';
        return `${name} <${email}>`;
      })
      .filter(Boolean)
      .join('; ');

    res.json({
      results,
      emailsSemicolon,
      meta: { keywords: terms, total: results.length, limit }
    });
  } catch (error) {
    next(error);
  }
};

export const archiveUser = async (req, res, next) => {
  try {
    // Support users cannot archive users
    if (req.user.role === 'support') {
      return res.status(403).json({ error: { message: 'Support users cannot archive users' } });
    }
    
    const { id } = req.params;
    
    // Get user's agency ID (use first agency for admins, null for super_admin)
    let archivedByAgencyId = null;
    if (req.user.role !== 'super_admin' && req.user.id) {
      const userAgencies = await User.getAgencies(req.user.id);
      if (userAgencies.length > 0) {
        archivedByAgencyId = userAgencies[0].id;
      }
    }
    
    // Archive user - this will immediately set status to ARCHIVED
    const archived = await User.archive(parseInt(id), req.user.id, archivedByAgencyId);
    
    if (!archived) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    const user = await User.findById(parseInt(id));
    
    res.json({ 
      message: 'User archived successfully. Access revoked immediately.',
      user
    });
  } catch (error) {
    next(error);
  }
};

export const archiveUserOld = async (req, res, next) => {
  try {
    // Support users cannot archive users
    if (req.user.role === 'support') {
      return res.status(403).json({ error: { message: 'Support users cannot archive users' } });
    }
    
    const { id } = req.params;
    
    // Get user's agency ID (use first agency for admins, null for super_admin)
    let archivedByAgencyId = null;
    if (req.user.role !== 'super_admin' && req.user.id) {
      const userAgencies = await User.getAgencies(req.user.id);
      if (userAgencies.length > 0) {
        archivedByAgencyId = userAgencies[0].id;
      }
    }
    
    const archived = await User.archive(parseInt(id), req.user.id, archivedByAgencyId);
    
    if (!archived) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    res.json({ message: 'User archived successfully' });
  } catch (error) {
    next(error);
  }
};

export const restoreUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Get user's agency IDs for permission check
    let userAgencyIds = [];
    if (req.user.role !== 'super_admin' && req.user.id) {
      const userAgencies = await User.getAgencies(req.user.id);
      userAgencyIds = userAgencies.map(a => a.id);
    }
    
    const restored = await User.restore(parseInt(id), userAgencyIds);
    
    if (!restored) {
      return res.status(404).json({ error: { message: 'User not found, not archived, or you do not have permission to restore it' } });
    }

    res.json({ message: 'User restored successfully' });
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    // Support users cannot delete users
    if (req.user.role === 'support') {
      return res.status(403).json({ error: { message: 'Support users cannot delete users' } });
    }
    
    const { id } = req.params;
    
    // Get user's agency IDs for permission check
    let userAgencyIds = [];
    if (req.user.role !== 'super_admin' && req.user.id) {
      const userAgencies = await User.getAgencies(req.user.id);
      userAgencyIds = userAgencies.map(a => a.id);
    }
    
    const deleted = await User.delete(parseInt(id), userAgencyIds);
    
    if (!deleted) {
      return res.status(404).json({ error: { message: 'User not found, not archived, or you do not have permission to delete it' } });
    }

    res.json({ message: 'User permanently deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const getArchivedUsers = async (req, res, next) => {
  try {
    // Get selected agency ID from query params (if user selected a specific agency)
    const selectedAgencyId = req.query.archivedByAgencyId ? parseInt(req.query.archivedByAgencyId) : null;
    
    // Get user's agency IDs for filtering
    let userAgencyIds = [];
    if (req.user.role !== 'super_admin' && req.user.id) {
      const userAgencies = await User.getAgencies(req.user.id);
      userAgencyIds = userAgencies.map(a => a.id);
      
      // If a specific agency is selected, verify user has access to it
      if (selectedAgencyId && !userAgencyIds.includes(selectedAgencyId)) {
        return res.status(403).json({ error: { message: 'You do not have access to this agency' } });
      }
    }
    
    // If a specific agency is selected, filter by that agency only
    // Otherwise, filter by all user's agencies (or all for super_admin)
    const filterAgencyIds = selectedAgencyId ? [selectedAgencyId] : (req.user.role === 'super_admin' ? null : userAgencyIds);
    
    const users = await User.findAllArchived({ 
      agencyIds: filterAgencyIds,
      userRole: req.user.role
    });
    
    // Fetch archived_by_user_name for each user
    const pool = (await import('../config/database.js')).default;
    const usersWithNames = await Promise.all(users.map(async (user) => {
      if (user.archived_by_user_id) {
        try {
          const [archivers] = await pool.execute(
            'SELECT first_name, last_name FROM users WHERE id = ?',
            [user.archived_by_user_id]
          );
          if (archivers.length > 0) {
            user.archived_by_user_name = `${archivers[0].first_name} ${archivers[0].last_name}`;
          }
        } catch (err) {
          console.error('Error fetching archived_by_user_name:', err);
        }
      }
      return user;
    }));
    
    res.json(usersWithNames);
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Allow any authenticated user to view their own profile.
    if (parseInt(id) === req.user.id) {
      const self = await User.findById(id);
      if (!self) return res.status(404).json({ error: { message: 'User not found' } });
      return res.json({ ...self, profile_photo_url: publicUploadsUrlFromStoredPath(self.profile_photo_path) });
    }
    
    // Users can see their own profile
    if (parseInt(id) === req.user.id) {
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ error: { message: 'User not found' } });
      }
      return res.json({ ...user, profile_photo_url: publicUploadsUrlFromStoredPath(user.profile_photo_path) });
    }
    
    // Supervisors can ONLY view their assigned supervisees
    // Check if requesting user is a supervisor using boolean as source of truth
    const requestingUser = await User.findById(req.user.id);
    if (requestingUser && User.isSupervisor(requestingUser)) {
      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json({ error: { message: 'User not found' } });
      }
      
      // Check if supervisor has access to this user (is assigned)
      const supervisorAgencies = await User.getAgencies(req.user.id);
      let hasAccess = false;
      
      for (const agency of supervisorAgencies) {
        const access = await User.supervisorHasAccess(req.user.id, id, agency.id);
        if (access) {
          hasAccess = true;
          break;
        }
      }
      
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You can only view users assigned to you as supervisees' } });
      }
      
      return res.json({ ...targetUser, profile_photo_url: publicUploadsUrlFromStoredPath(targetUser.profile_photo_path) });
    }

    // CPAs can view all users in their agencies
    if (req.user.role === 'clinical_practice_assistant') {
      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json({ error: { message: 'User not found' } });
      }
      
      // Check if target user is staff/provider/facilitator/intern
      if (!['staff', 'provider', 'school_staff', 'clinician', 'facilitator', 'intern'].includes(targetUser.role)) {
        return res.status(403).json({ error: { message: 'Clinical Practice Assistants can only view staff, provider, school staff, facilitator, and intern users' } });
      }
      
      // Check if CPA and target user share an agency
      const cpaAgencies = await User.getAgencies(req.user.id);
      const targetUserAgencies = await User.getAgencies(id);
      const cpaAgencyIds = cpaAgencies.map(a => a.id);
      const targetUserAgencyIds = targetUserAgencies.map(a => a.id);
      const sharedAgencies = cpaAgencyIds.filter(id => targetUserAgencyIds.includes(id));
      
      if (sharedAgencies.length === 0) {
        return res.status(403).json({ error: { message: 'You can only view users from your assigned agencies' } });
      }
      
      return res.json({ ...targetUser, profile_photo_url: publicUploadsUrlFromStoredPath(targetUser.profile_photo_path) });
    }
    
    // Admin, super_admin, and support can view any user
    if (req.user.role === 'admin' || req.user.role === 'super_admin' || req.user.role === 'support') {
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ error: { message: 'User not found' } });
      }
      return res.json({ ...user, profile_photo_url: publicUploadsUrlFromStoredPath(user.profile_photo_path) });
    }
    
    return res.status(403).json({ error: { message: 'Access denied' } });
  } catch (error) {
    next(error);
  }
};

export const getUserLoginEmailAliases = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Admin, super_admin, and support only (route is also protected with requireAdmin)
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const agencies = await User.getAgencies(id);
    if (!Array.isArray(agencies) || agencies.length < 2) {
      return res.json({ loginEmailAliases: [] });
    }

    const UserLoginEmail = (await import('../models/UserLoginEmail.model.js')).default;
    const rows = await UserLoginEmail.listForUser(parseInt(id));
    res.json({
      loginEmailAliases: (rows || []).map((r) => r.email),
      loginEmailAliasesDetailed: (rows || []).map((r) => ({
        id: r.id,
        agency_id: r.agency_id,
        email: r.email
      }))
    });
  } catch (error) {
    next(error);
  }
};

export const addUserLoginEmailAlias = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id, 10);
    const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId, 10) : null;
    const email = String(req.body?.email || '').trim().toLowerCase();

    if (!userId || !agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: { message: 'email must be a valid email address' } });
    }

    // Admin/super_admin/support only
    const role = String(req.user?.role || '').toLowerCase();
    if (!['admin', 'super_admin', 'support'].includes(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const membership = await User.getAgencyMembership(userId, agencyId);
    if (!membership) {
      return res.status(400).json({ error: { message: 'User is not assigned to this organization' } });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) return res.status(404).json({ error: { message: 'User not found' } });

    // Don’t allow alias to equal primary identifiers.
    const primary = new Set([
      String(targetUser.email || '').toLowerCase(),
      String(targetUser.work_email || '').toLowerCase(),
      String(targetUser.username || '').toLowerCase()
    ].filter(Boolean));
    if (primary.has(email)) {
      return res.status(400).json({ error: { message: 'Alias matches an existing login identifier for this user' } });
    }

    // Ensure alias isn't used by another user (including via aliases)
    const existing = await User.findByEmail(email);
    if (existing && Number(existing.id) !== Number(userId)) {
      return res.status(409).json({ error: { message: `Login email already in use: ${email}` } });
    }

    const dbName = process.env.DB_NAME || 'onboarding_stage';
    const [tables] = await pool.execute(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_login_emails' LIMIT 1",
      [dbName]
    );
    if (!tables || tables.length === 0) {
      return res.status(400).json({ error: { message: 'Login email aliases are not enabled (missing user_login_emails table).' } });
    }

    try {
      await pool.execute(
        `INSERT INTO user_login_emails (user_id, agency_id, email)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), agency_id = VALUES(agency_id)`,
        [userId, agencyId, email]
      );
    } catch (e) {
      // Unique constraint violation on email is surfaced as 409
      const msg = String(e?.message || '');
      if (msg.includes('Duplicate') || e?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: { message: `Login email already in use: ${email}` } });
      }
      throw e;
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      email,
      loginEmail,
      preferredName,
      personalEmail,
      firstName,
      lastName,
      role: roleRaw,
      hasSupervisorPrivileges,
      hasProviderAccess,
      hasStaffAccess,
      providerAcceptingNewClients,
      personalPhone,
      workPhone,
      workPhoneExtension,
      homeStreetAddress,
      homeCity,
      homeState,
      homePostalCode,
      medcancelEnabled,
      medcancelRateSchedule,
      companyCardEnabled,
      billingAcknowledged
    } = req.body;
    const loginEmailAliases = req.body?.loginEmailAliases;

    // Normalize legacy / label-only roles into the current model.
    // Provider is the catch-all; credential/classification should be stored separately.
    const normalizeRole = (r) => {
      const v = String(r || '').trim().toLowerCase();
      if (!v) return null;
      if (v === 'clinician' || v === 'intern' || v === 'facilitator') return 'provider';
      if (v === 'supervisor') return 'provider'; // supervisor is represented by has_supervisor_privileges
      return v;
    };

    const role = roleRaw !== undefined ? normalizeRole(roleRaw) : undefined;
    const forceSupervisorPrivileges = String(roleRaw || '').trim().toLowerCase() === 'supervisor';
    
    console.log('updateUser called with:', { id, role, hasSupervisorPrivileges, body: req.body });

    // Only admins/super_admins/support can change roles
    if (role && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Only admins, super admins, or support can change roles' } });
    }

    // Validate role if provided
    if (role) {
      // Note: we still accept legacy inputs (clinician/intern/facilitator/supervisor) via roleRaw,
      // but they are normalized above.
      const validRoles = ['super_admin', 'admin', 'support', 'clinical_practice_assistant', 'staff', 'provider', 'school_staff', 'client_guardian'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: { message: `Invalid role. Must be one of: ${validRoles.join(', ')}` } });
      }
      
      // Application-layer protection for superadmin account
      // This replaces database triggers which require SUPER privilege in Cloud SQL
      const targetUser = await User.findById(id);
      if (targetUser) {
        // Protect superadmin@plottwistco.com from role changes
        if (targetUser.email === 'superadmin@plottwistco.com' && role !== undefined && role !== 'super_admin') {
          return res.status(403).json({ 
            error: { message: 'Cannot change role of superadmin@plottwistco.com - this account must remain super_admin' } 
          });
        }
        
        // Additional protection: Prevent removing super_admin role from any user who currently has it
        if (role !== undefined && targetUser.role === 'super_admin' && role !== 'super_admin') {
          return res.status(403).json({ 
            error: { message: 'Cannot remove super_admin role from a user who currently has it' } 
          });
        }
      }
      
      // Enforce role assignment permissions
      // Super admin can only be assigned by super admin
      if (role === 'super_admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ 
          error: { message: 'Only super admins can assign the super admin role' } 
        });
      }
      
      // Admin can only be assigned by super admin or admin
      if (role === 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: { message: 'Only super admins and admins can assign the admin role' } 
        });
      }
      
      // Support can only be assigned by super admin or admin
      if (role === 'support' && req.user.role !== 'super_admin' && req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: { message: 'Only super admins and admins can assign the support role' } 
        });
      }

      // Billing hard gate: adding an admin beyond included requires acknowledgement
      if (role === 'admin') {
        const { getAdminAddBillingImpact } = await import('../services/adminBillingGate.service.js');
        const targetUser = await User.findById(id);
        if (targetUser && targetUser.role !== 'admin') {
          const agencies = await User.getAgencies(id);
          const impacts = [];
          for (const agency of agencies) {
            const impact = await getAdminAddBillingImpact(agency.id, { deltaAdmins: 1 });
            if (impact) {
              impacts.push({ agencyId: agency.id, agencyName: agency.name, ...impact });
            }
          }
          if (impacts.length > 0 && billingAcknowledged !== true) {
            return res.status(409).json({
              error: { message: 'Billing acknowledgement required to add an admin beyond included limits.' },
              billingImpact: {
                code: 'ADMIN_OVERAGE',
                impacts
              }
            });
          }
        }
      }
    }

    // Supervisors and CPAs can only view, not edit
    // Check if requesting user is a supervisor using boolean as source of truth
    const requestingUser = await User.findById(req.user.id);
    const isSupervisor = requestingUser && User.isSupervisor(requestingUser);
    if (isSupervisor || req.user.role === 'clinical_practice_assistant') {
      return res.status(403).json({ error: { message: 'Supervisors and Clinical Practice Assistants have view-only access' } });
    }
    
    // Users can only update their own profile unless they're admin/super_admin/support
    if (parseInt(id) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'You can only update your own profile' } });
    }

    // Build update object
    const updateData = { firstName, lastName, role };

    // Login email updates (does NOT change password).
    const nextLoginEmailRaw = (loginEmail !== undefined ? loginEmail : email);
    if (nextLoginEmailRaw !== undefined) {
      // Only admins/super_admins/support can change login email (even for self) to avoid accidental lockouts.
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
        return res.status(403).json({ error: { message: 'Only admins, super admins, or support can change login email' } });
      }

      const nextLoginEmail = String(nextLoginEmailRaw || '').trim().toLowerCase();
      if (!nextLoginEmail || !nextLoginEmail.includes('@')) {
        return res.status(400).json({ error: { message: 'email must be a valid email address' } });
      }

      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json({ error: { message: 'User not found' } });
      }
      if (String(targetUser.email || '').toLowerCase() === 'superadmin@plottwistco.com' && nextLoginEmail !== 'superadmin@plottwistco.com') {
        return res.status(403).json({ error: { message: 'Cannot change login email of superadmin@plottwistco.com' } });
      }

      // Prevent collisions across email/work_email/username (findByEmail checks all of these).
      const existing = await User.findByEmail(nextLoginEmail);
      if (existing && Number(existing.id) !== Number(id)) {
        return res.status(409).json({ error: { message: 'That login email is already in use' } });
      }

      updateData.email = nextLoginEmail;
    }

    // Personal email (contact email; not used for login)
    if (personalEmail !== undefined) {
      const v = String(personalEmail || '').trim();
      if (v && !v.includes('@')) {
        return res.status(400).json({ error: { message: 'personalEmail must be a valid email address' } });
      }
      updateData.personalEmail = v ? v.toLowerCase() : null;
    }

    // Preferred name (display-only; not used for payroll)
    if (preferredName !== undefined) {
      const v = String(preferredName || '').trim();
      updateData.preferredName = v || null;
    }

    // Additional login emails (aliases) for multi-agency users.
    // Only admins/super_admins/support can manage these to avoid accidental lockouts.
    if (loginEmailAliases !== undefined) {
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
        return res.status(403).json({ error: { message: 'Only admins, super admins, or support can change login email aliases' } });
      }

      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json({ error: { message: 'User not found' } });
      }

      const agencies = await User.getAgencies(id);
      if (!Array.isArray(agencies) || agencies.length < 2) {
        return res.status(400).json({ error: { message: 'Login email aliases are only available for users with 2+ organizations' } });
      }

      const UserLoginEmail = (await import('../models/UserLoginEmail.model.js')).default;
      const items = (Array.isArray(loginEmailAliases) ? loginEmailAliases : [])
        .map((e) => ({ email: e }));

      // Collision check: ensure none of these aliases belong to another user (or another identifier).
      for (const it of items) {
        const alias = String(it?.email || '').trim().toLowerCase();
        if (!alias) continue;
        if (!alias.includes('@')) {
          return res.status(400).json({ error: { message: `Invalid login email alias: ${alias}` } });
        }

        // Skip if it matches the user's existing login identifiers.
        if (
          String(targetUser.email || '').toLowerCase() === alias ||
          String(targetUser.work_email || '').toLowerCase() === alias ||
          String(targetUser.username || '').toLowerCase() === alias
        ) {
          continue;
        }

        // If another user already matches this email/username/etc (including via aliases), block it.
        const existing = await User.findByEmail(alias);
        if (existing && Number(existing.id) !== Number(id)) {
          return res.status(409).json({ error: { message: `Login email alias already in use: ${alias}` } });
        }
      }

      await UserLoginEmail.replaceForUser(parseInt(id), items);
    }
    
    // Auto-set has_supervisor_privileges when role changes to/from supervisor
    // This is handled in User.update() method, but we can also set it here for clarity
    if (role !== undefined) {
      const targetUser = await User.findById(id);
      if (targetUser) {
        const wasSupervisor = targetUser.role === 'supervisor';
        const willBeSupervisor = role === 'supervisor';
        
        // If role is changing to supervisor, auto-set boolean to true
        // If role is changing away from supervisor, auto-set boolean to false
        // User.update() will handle this automatically, but we ensure it here too
        if (wasSupervisor !== willBeSupervisor) {
          updateData.hasSupervisorPrivileges = willBeSupervisor;
        }
      }
    }
    
    // Handle supervisor privileges for non-supervisor roles (providers/admins/superadmins/CPAs)
    // This allows them to have supervisor privileges while keeping their primary role.
    if (hasSupervisorPrivileges !== undefined || forceSupervisorPrivileges) {
      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json({ error: { message: 'User not found' } });
      }
      
      console.log('Processing supervisor privileges toggle:', {
        hasSupervisorPrivileges,
        currentRole: targetUser.role,
        newRole: role,
        targetUserId: id,
        requestingUserId: req.user.id
      });
      
      // Don't allow manual toggle if role is being set to 'supervisor' (legacy; it's automatic)
      const finalRole = role !== undefined ? role : targetUser.role;
      if (finalRole === 'supervisor') {
        // Supervisor role automatically gets privileges, skip manual toggle
        // But we still need to ensure it's set
        console.log('Role is supervisor, auto-setting privileges to true');
        updateData.hasSupervisorPrivileges = true;
      } else {
        // Only allow toggle for eligible roles
        const eligibleRoles = ['provider', 'admin', 'super_admin', 'clinical_practice_assistant'];
        const currentRole = targetUser.role;
        const newRole = role !== undefined ? role : currentRole;
        
        if (!eligibleRoles.includes(currentRole) && !eligibleRoles.includes(newRole)) {
          console.log('User role not eligible for supervisor privileges:', { currentRole, newRole });
          return res.status(400).json({ 
            error: { message: 'Supervisor privileges can only be enabled for providers, admins, super admins, or clinical practice assistants' } 
          });
        }
        
        // Users can toggle their own privileges if they have eligible role, or admins/superadmins can toggle for others
        if (parseInt(id) !== req.user.id) {
          if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
            console.log('User does not have permission to toggle privileges for others');
            return res.status(403).json({ error: { message: 'Only admins and super admins can toggle supervisor privileges for other users' } });
          }
        } else {
          // User is toggling their own privileges - must have eligible role
          const userRole = role || targetUser.role;
          if (!eligibleRoles.includes(userRole)) {
            console.log('User cannot toggle their own privileges - not eligible role:', userRole);
            return res.status(403).json({ error: { message: 'You can only toggle supervisor privileges if you are a provider, admin, super admin, or clinical practice assistant' } });
          }
        }
        
        // Ensure boolean value is properly converted
        const boolValue = forceSupervisorPrivileges ? true : Boolean(hasSupervisorPrivileges);
        console.log('Setting supervisor privileges to:', boolValue);
        updateData.hasSupervisorPrivileges = boolValue;
      }
    } else {
      console.log('hasSupervisorPrivileges is undefined, skipping toggle processing');
    }
    
    // Handle permission attributes for cross-role capabilities
    if (hasProviderAccess !== undefined) {
      const targetUser = await User.findById(id);
      if (targetUser) {
        // Allow provider access for staff/support/admin (admin can be "provider-selectable" when needed)
        if (
          targetUser.role === 'staff' ||
          targetUser.role === 'support' ||
          targetUser.role === 'admin' ||
          (role && (role === 'staff' || role === 'support' || role === 'admin'))
        ) {
          updateData.hasProviderAccess = Boolean(hasProviderAccess);
        }
      }
    }
    
    if (hasStaffAccess !== undefined) {
      const targetUser = await User.findById(id);
      if (targetUser) {
        // Only allow staff access for provider/clinician roles
        if (targetUser.role === 'provider' || targetUser.role === 'clinician' || (role && (role === 'provider' || role === 'clinician'))) {
          updateData.hasStaffAccess = Boolean(hasStaffAccess);
        }
      }
    }

    // Provider Open/Closed (accepting new clients) - allow self and admins/support.
    if (providerAcceptingNewClients !== undefined) {
      const targetUser = await User.findById(id);
      if (!targetUser) return res.status(404).json({ error: { message: 'User not found' } });
      const targetRole = String(role || targetUser.role || '').toLowerCase();
      const providerLike = targetRole === 'provider' || targetRole === 'clinician' || Boolean(targetUser.has_provider_access);
      if (providerLike) {
        updateData.providerAcceptingNewClients = Boolean(providerAcceptingNewClients);
      }
    }
    
    // Handle phone number updates
    if (personalPhone !== undefined) updateData.personalPhone = personalPhone;
    if (workPhone !== undefined) updateData.workPhone = workPhone;
    if (workPhoneExtension !== undefined) updateData.workPhoneExtension = workPhoneExtension;

    // Home address (used for mileage calculations)
    if (homeStreetAddress !== undefined) updateData.homeStreetAddress = homeStreetAddress;
    if (homeCity !== undefined) updateData.homeCity = homeCity;
    if (homeState !== undefined) updateData.homeState = homeState;
    if (homePostalCode !== undefined) updateData.homePostalCode = homePostalCode;

    // Med Cancel flags (contract feature)
    if (medcancelEnabled !== undefined) updateData.medcancelEnabled = Boolean(medcancelEnabled);
    if (medcancelRateSchedule !== undefined) updateData.medcancelRateSchedule = medcancelRateSchedule;

    // Company Card (contract feature)
    if (companyCardEnabled !== undefined) updateData.companyCardEnabled = Boolean(companyCardEnabled);

    console.log('Calling User.update with updateData:', updateData);
    const user = await User.update(id, updateData);
    console.log('User.update returned user:', user ? {
      id: user.id,
      role: user.role,
      medcancel_rate_schedule: user.medcancel_rate_schedule,
      medcancel_enabled: user.medcancel_enabled
    } : 'null');
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    res.json(user);
  } catch (error) {
    // Handle MySQL enum errors more gracefully
    if (error.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD' || error.message?.includes('enum')) {
      console.error('Role enum error:', error.message);
      return res.status(400).json({ error: { message: `Invalid role value. Valid roles are: super_admin, admin, support, supervisor, clinical_practice_assistant, staff, clinician, facilitator, intern` } });
    }
    console.error('Error updating user:', error);
    next(error);
  }
};

export const toggleSupervisorPrivileges = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: { message: 'enabled must be a boolean value' } });
    }
    
    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // Only allow toggle for eligible roles
    const eligibleRoles = ['admin', 'super_admin', 'clinical_practice_assistant'];
    if (!eligibleRoles.includes(targetUser.role)) {
      return res.status(400).json({ 
        error: { message: 'Supervisor privileges can only be enabled for admins, super admins, or clinical practice assistants' } 
      });
    }
    
    // Users can toggle their own privileges if they have eligible role, or admins/superadmins can toggle for others
    if (parseInt(id) !== req.user.id) {
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: { message: 'Only admins and super admins can toggle supervisor privileges for other users' } });
      }
    } else {
      // User is toggling their own privileges - must have eligible role
      if (!eligibleRoles.includes(req.user.role)) {
        return res.status(403).json({ error: { message: 'You can only toggle supervisor privileges if you are an admin, super admin, or clinical practice assistant' } });
      }
    }
    
    const user = await User.update(id, { hasSupervisorPrivileges: enabled });
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    res.json({ 
      message: `Supervisor privileges ${enabled ? 'enabled' : 'disabled'} successfully`,
      user 
    });
  } catch (error) {
    console.error('Error toggling supervisor privileges:', error);
    next(error);
  }
};

export const getUserAgencies = async (req, res, next) => {
  try {
    // Handle approved employees (they don't have a user ID)
    if (req.user.type === 'approved_employee') {
      // Get agency IDs from the token
      const agencyIds = req.user.agencyIds || (req.user.agencyId ? [req.user.agencyId] : []);
      
      if (agencyIds.length === 0) {
        return res.json([]);
      }
      
      // Fetch agency details for each ID
      const Agency = (await import('../models/Agency.model.js')).default;
      const agencies = [];
      for (const agencyId of agencyIds) {
        try {
          const agency = await Agency.findById(agencyId);
          if (agency) {
            agencies.push(agency);
          }
        } catch (err) {
          console.error(`Failed to fetch agency ${agencyId}:`, err);
        }
      }
      
      return res.json(agencies);
    }
    
    // Regular users
    // If route is /me/agencies, use req.user.id, otherwise use :id param
    const userId = req.params.id || req.user.id;
    
    // Users can see their own agencies, or admins/super_admins/support can see any
    // CPAs and supervisors can see agencies for users they supervise
    if (parseInt(userId) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      // Check if CPA or supervisor has access to this user
      if (req.user.role === 'clinical_practice_assistant' || req.user.role === 'supervisor') {
        const targetUser = await User.findById(userId);
        if (!targetUser) {
          return res.status(404).json({ error: { message: 'User not found' } });
        }
        
        // CPAs can view agencies for all users in their agencies
        if (req.user.role === 'clinical_practice_assistant') {
          const cpaAgencies = await User.getAgencies(req.user.id);
          const targetUserAgencies = await User.getAgencies(userId);
          const cpaAgencyIds = cpaAgencies.map(a => a.id);
          const targetUserAgencyIds = targetUserAgencies.map(a => a.id);
          const sharedAgencies = cpaAgencyIds.filter(id => targetUserAgencyIds.includes(id));
          
          if (sharedAgencies.length === 0) {
            return res.status(403).json({ error: { message: 'Access denied' } });
          }
        } else if (req.user.role === 'supervisor') {
          // Supervisors can only view agencies for their assigned supervisees
          const hasAccess = await User.supervisorHasAccess(req.user.id, userId);
          if (!hasAccess) {
            return res.status(403).json({ error: { message: 'Access denied' } });
          }
        }
      } else {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }
    
    const agencies = await User.getAgencies(userId);
    res.json(agencies);
  } catch (error) {
    next(error);
  }
};

export const setUserAgencySupervisionPrelicensed = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id, 10);
    const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId, 10) : null;
    const isPrelicensed = req.body?.isPrelicensed === true || req.body?.isPrelicensed === 1 || req.body?.isPrelicensed === '1';
    const startDate = req.body?.startDate ? String(req.body.startDate).slice(0, 10) : null;
    const startIndividualHours = Number(req.body?.startIndividualHours || 0);
    const startGroupHours = Number(req.body?.startGroupHours || 0);

    if (!userId || !agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    if (!Number.isFinite(startIndividualHours) || startIndividualHours < 0) {
      return res.status(400).json({ error: { message: 'startIndividualHours must be a non-negative number' } });
    }
    if (!Number.isFinite(startGroupHours) || startGroupHours < 0) {
      return res.status(400).json({ error: { message: 'startGroupHours must be a non-negative number' } });
    }
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return res.status(400).json({ error: { message: 'startDate must be YYYY-MM-DD' } });
    }

    const membership = await User.getAgencyMembership(userId, agencyId);
    if (!membership) {
      return res.status(400).json({ error: { message: 'User is not assigned to this organization' } });
    }

    const updated = await User.setAgencySupervisionPrelicensedSettings(userId, agencyId, {
      isPrelicensed,
      startDate,
      startIndividualHours,
      startGroupHours
    });
    // Best-effort: recompute supervision account so profile reflects baseline changes quickly.
    let supervisionAccount = null;
    try {
      const { recomputeSupervisionAccountForUser } = await import('../services/supervision.service.js');
      supervisionAccount = await recomputeSupervisionAccountForUser({ agencyId, userId });
    } catch {
      supervisionAccount = null;
    }
    return res.json({ ok: true, membership: updated, supervisionAccount });
  } catch (error) {
    next(error);
  }
};


export const assignUserToAgency = async (req, res, next) => {
  try {
    const { userId, agencyId } = req.body;
    
    // Only admins/super_admins can assign users
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    await User.assignToAgency(userId, agencyId);
    res.json({ message: 'User assigned to agency successfully' });
  } catch (error) {
    next(error);
  }
};


export const removeUserFromAgency = async (req, res, next) => {
  try {
    const { userId, agencyId } = req.body;
    
    // Only admins/super_admins can remove users
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    await User.removeFromAgency(userId, agencyId);
    res.json({ message: 'User removed from agency successfully' });
  } catch (error) {
    next(error);
  }
};

export const setUserAgencyPayrollAccess = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { agencyId, enabled } = req.body || {};

    // Only admins/super_admins can grant payroll access.
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    const userId = parseInt(id);
    const agencyIdNum = agencyId ? parseInt(agencyId) : null;
    if (!userId || !agencyIdNum) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: { message: 'enabled must be a boolean' } });
    }

    const membership = await User.getAgencyMembership(userId, agencyIdNum);
    if (!membership) {
      return res.status(400).json({ error: { message: 'User is not assigned to this agency' } });
    }

    const updated = await User.setAgencyPayrollAccess(userId, agencyIdNum, enabled);
    res.json({
      userId,
      agencyId: agencyIdNum,
      hasPayrollAccess: !!(updated?.has_payroll_access === 1 || updated?.has_payroll_access === true || updated?.has_payroll_access === '1')
    });
  } catch (error) {
    next(error);
  }
};

export const setUserAgencyH0032Mode = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { agencyId, mode } = req.body || {};

    // Only admins/super_admins can edit agency membership flags.
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    const userId = parseInt(id);
    const agencyIdNum = agencyId ? parseInt(agencyId) : null;
    if (!userId || !agencyIdNum) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    const rawMode = String(mode || '').trim().toLowerCase();
    if (!rawMode || !['cat1_hour', 'cat2_flat'].includes(rawMode)) {
      return res.status(400).json({ error: { message: 'mode must be one of: cat1_hour, cat2_flat' } });
    }

    const membership = await User.getAgencyMembership(userId, agencyIdNum);
    if (!membership) {
      return res.status(400).json({ error: { message: 'User is not assigned to this agency' } });
    }

    // cat1_hour => requires manual minutes (shows in H0032 processing queue)
    // cat2_flat => auto 30 minutes per line (does NOT show in queue)
    const requiresManualMinutes = rawMode === 'cat1_hour';
    const updated = await User.setAgencyH0032RequiresManualMinutes(userId, agencyIdNum, requiresManualMinutes);

    res.json({
      userId,
      agencyId: agencyIdNum,
      mode: requiresManualMinutes ? 'cat1_hour' : 'cat2_flat',
      h0032RequiresManualMinutes: !!(updated?.h0032_requires_manual_minutes === 1 || updated?.h0032_requires_manual_minutes === true || updated?.h0032_requires_manual_minutes === '1')
    });
  } catch (error) {
    next(error);
  }
};

export const generateInvitationToken = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Only admins/super_admins can generate tokens
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    const token = await User.generateInvitationToken(id);
    res.json({ token });
  } catch (error) {
    next(error);
  }
};

export const generateTemporaryPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { expiresInDays } = req.body;
    
    // Only admins/super_admins can generate temporary passwords
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    const tempPassword = await User.generateTemporaryPassword();
    const result = await User.setTemporaryPassword(id, tempPassword, expiresInDays || 30);
    
    res.json({ 
      temporaryPassword: tempPassword,
      expiresAt: result.expiresAt
    });
  } catch (error) {
    next(error);
  }
};

export const resetPasswordlessToken = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { expiresInDays, expiresInHours, expiresAt } = req.body;
    const userId = parseInt(id);
    
    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // Check permissions:
    // - Users can reset their own token if they're pending
    // - Admins/super_admins/support can reset any user's token
    const canReset = 
      (userId === req.user.id && user.status === 'pending') ||
      req.user.role === 'admin' ||
      req.user.role === 'super_admin' ||
      req.user.role === 'support';
    
    if (!canReset) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    // Only allow resetting tokens for pending or ready_for_review users
    if (user.status !== 'pending' && user.status !== 'ready_for_review') {
      return res.status(400).json({ 
        error: { message: 'Passwordless token can only be reset for pending or ready_for_review users' } 
      });
    }
    
    // Calculate expiration
    let finalExpiresInHours;
    if (expiresAt) {
      // If specific expiration date provided, calculate hours from now
      const targetDate = new Date(expiresAt);
      const now = new Date();
      finalExpiresInHours = Math.max(1, Math.round((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60)));
    } else if (expiresInHours) {
      // If hours provided, use that
      finalExpiresInHours = parseInt(expiresInHours);
    } else if (expiresInDays) {
      // If days provided, convert to hours
      finalExpiresInHours = parseInt(expiresInDays) * 24;
    } else {
      // Default: 7 days for pending users, 48 hours for ready_for_review
      finalExpiresInHours = user.status === 'pending' ? 7 * 24 : 48;
    }
    
    // Ensure minimum 1 hour expiration
    if (finalExpiresInHours < 1) {
      finalExpiresInHours = 1;
    }
    
    const tokenResult = await User.generatePasswordlessToken(userId, finalExpiresInHours, 'setup');
    
    // Get frontend URL for the link
    const config = (await import('../config/config.js')).default;
    const frontendBase = (config.frontendUrl || '').replace(/\/$/, '');
    const userAgencies = await User.getAgencies(user.id);
    const portalSlug = userAgencies?.[0]?.portal_url || userAgencies?.[0]?.slug || null;
    const passwordlessTokenLink = portalSlug
      ? `${frontendBase}/${portalSlug}/passwordless-login/${tokenResult.token}`
      : `${frontendBase}/passwordless-login/${tokenResult.token}`;
    
    res.json({
      token: tokenResult.token,
      tokenLink: passwordlessTokenLink,
      expiresAt: tokenResult.expiresAt,
      expiresInHours: finalExpiresInHours,
      message: 'Passwordless token reset successfully'
    });
  } catch (error) {
    next(error);
  }
};

export const sendResetPasswordLink = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { expiresInHours } = req.body;
    const userId = parseInt(id);
    
    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // Check permissions: Only admins/super_admins/support can send reset links
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    // Calculate expiration (default 48 hours)
    const finalExpiresInHours = expiresInHours ? parseInt(expiresInHours) : 48;
    
    // Ensure minimum 1 hour expiration
    if (finalExpiresInHours < 1) {
      return res.status(400).json({ error: { message: 'Expiration must be at least 1 hour' } });
    }
    
    // Generate password reset token (single-use, forces password change)
    const tokenResult = await User.generatePasswordlessToken(userId, finalExpiresInHours, 'reset');
    
    // Get frontend URL for the link
    const config = (await import('../config/config.js')).default;
    const frontendBase = (config.frontendUrl || '').replace(/\/$/, '');
    const userAgencies = await User.getAgencies(userId);
    const portalSlug = userAgencies?.[0]?.portal_url || userAgencies?.[0]?.slug || null;
    const resetLink = portalSlug
      ? `${frontendBase}/${portalSlug}/reset-password/${tokenResult.token}`
      : `${frontendBase}/reset-password/${tokenResult.token}`;
    
    res.json({
      token: tokenResult.token,
      tokenLink: resetLink,
      expiresAt: tokenResult.expiresAt,
      expiresInHours: finalExpiresInHours,
      message: 'Reset password link generated successfully'
    });
  } catch (error) {
    next(error);
  }
};

export const sendResetPasswordLinkSms = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);
    const { tokenLink } = req.body || {};

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    // Check permissions: Only admins/super_admins/support can send reset links via SMS
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const phoneRaw = user.personal_phone || user.work_phone || user.phone_number || null;
    const to = User.normalizePhone(phoneRaw);
    if (!to) {
      return res.status(400).json({ error: { message: 'User does not have a valid phone number on file' } });
    }

    const from = process.env.TWILIO_AUTH_FROM || process.env.TWILIO_DEFAULT_FROM;
    if (!from) {
      return res.status(400).json({ error: { message: 'Missing TWILIO_AUTH_FROM (or TWILIO_DEFAULT_FROM) env var' } });
    }

    // If the UI already generated a link, send that exact link; otherwise generate a fresh one (48h)
    let linkToSend = tokenLink;
    if (!linkToSend) {
      const tokenResult = await User.generatePasswordlessToken(userId, 48, 'reset');
      const config = (await import('../config/config.js')).default;
      const frontendBase = (config.frontendUrl || '').replace(/\/$/, '');
      const userAgencies = await User.getAgencies(userId);
      const portalSlug = userAgencies?.[0]?.portal_url || userAgencies?.[0]?.slug || null;
      linkToSend = portalSlug
        ? `${frontendBase}/${portalSlug}/reset-password/${tokenResult.token}`
        : `${frontendBase}/reset-password/${tokenResult.token}`;
    }

    const TwilioService = (await import('../services/twilio.service.js')).default;
    const body = `Reset your password using this link (expires in 48 hours): ${linkToSend}`;

    const msg = await TwilioService.sendSms({ to, from, body });

    res.json({
      message: 'Reset password link sent via SMS',
      to,
      sid: msg.sid
    });
  } catch (error) {
    next(error);
  }
};

export const getUserCredentials = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Only admins/super_admins can view credentials
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    res.json({
      username: user.email, // Username is typically the email
      hasTemporaryPassword: !!user.temporary_password_hash,
      temporaryPasswordExpiresAt: user.temporary_password_expires_at,
      invitationToken: user.invitation_token,
      invitationTokenExpiresAt: user.invitation_token_expires_at
    });
  } catch (error) {
    next(error);
  }
};

export const getAccountInfo = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Users can view their own account info, admins can view any
    if (parseInt(id) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // Block pending users from accessing account info (they should use dashboard only)
    if (user.status === 'pending' && parseInt(id) === req.user.id) {
      return res.status(403).json({ 
        error: { message: 'Account information is not available during the pre-hire process. Please use the dashboard to view your checklist items.' } 
      });
    }
    
    // Get user accounts (platform and agency level)
    let accounts = [];
    try {
      accounts = await UserAccount.findByUserId(id);
    } catch (accountError) {
      console.error('Error fetching user accounts:', accountError);
      // Continue with empty accounts array
    }
    
    // Get unified checklist for total progress count
    let totalProgress = 0;
    try {
      const unifiedChecklist = await UserChecklistAssignment.getUnifiedChecklist(parseInt(id));
      totalProgress = unifiedChecklist?.counts?.total || 0;
    } catch (checklistError) {
      console.error('Error fetching unified checklist:', checklistError);
      // Continue with 0 progress
    }
    
    // Get personal email from user info values (if exists)
    let personalEmail = null;
    try {
      const userInfoValues = await UserInfoValue.findByUserId(parseInt(id));
      const personalEmailField = userInfoValues.find(v => 
        v.field_key === 'personal_email' || 
        v.field_key === 'personalEmail' ||
        v.field_label?.toLowerCase().includes('personal email')
      );
      personalEmail = personalEmailField?.value || null;
    } catch (infoError) {
      console.error('Error fetching user info values:', infoError);
      // Continue with null personal email
    }
    
    // Get total onboarding time from training focuses
    let trainingData = [];
    let totalTimeSeconds = 0;
    let totalTimeMinutes = 0;
    let totalTimeHours = 0;
    let totalTimeMinutesRemainder = 0;
    
    try {
      trainingData = await OnboardingDataService.getUserTrainingData(parseInt(id));
      totalTimeSeconds = trainingData.reduce((sum, track) => sum + (track.totalTimeSeconds || 0), 0);
      totalTimeMinutes = Math.round(totalTimeSeconds / 60);
      totalTimeHours = Math.floor(totalTimeMinutes / 60);
      totalTimeMinutesRemainder = totalTimeMinutes % 60;
    } catch (trainingError) {
      console.error('Error fetching training data for account info:', trainingError);
      // Continue with default values if training data fails
    }
    
    // Get supervisor information
    let supervisors = [];
    try {
      const SupervisorAssignment = (await import('../models/SupervisorAssignment.model.js')).default;
      const supervisorAssignments = await SupervisorAssignment.findBySupervisee(parseInt(id));
      
      // Format supervisor info with contact details
      supervisors = supervisorAssignments.map(assignment => ({
        id: assignment.supervisor_id,
        firstName: assignment.supervisor_first_name,
        lastName: assignment.supervisor_last_name,
        email: assignment.supervisor_email,
        workPhone: null,
        workPhoneExtension: null,
        agencyName: assignment.agency_name
      }));
      
      // Fetch supervisor details to get phone numbers
      for (let supervisor of supervisors) {
        const supervisorUser = await User.findById(supervisor.id);
        if (supervisorUser) {
          supervisor.workPhone = supervisorUser.work_phone || null;
          supervisor.workPhoneExtension = supervisorUser.work_phone_extension || null;
        }
      }
    } catch (supervisorError) {
      console.error('Error fetching supervisor information:', supervisorError);
      // Continue with empty supervisors array
    }
    
    const accountInfo = {
      loginEmail: user.email || user.work_email || 'Not provided',
      preferredName: user.preferred_name || null,
      personalEmail: personalEmail || user.personal_email || null,
      phoneNumber: user.phone_number || null, // Keep for backward compatibility
      personalPhone: user.personal_phone || null,
      workPhone: user.work_phone || null,
      workPhoneExtension: user.work_phone_extension || null,
      homeStreetAddress: user.home_street_address || null,
      homeCity: user.home_city || null,
      homeState: user.home_state || null,
      homePostalCode: user.home_postal_code || null,
      totalProgress: totalProgress,
      totalOnboardingTime: {
        seconds: totalTimeSeconds,
        minutes: totalTimeMinutes,
        hours: totalTimeHours,
        minutesRemainder: totalTimeMinutesRemainder,
        formatted: totalTimeHours > 0 
          ? `${totalTimeHours}h ${totalTimeMinutesRemainder}m`
          : `${totalTimeMinutes}m`
      },
      accounts: accounts,
      status: user.status,
      supervisors: supervisors,
      hasSupervisorPrivileges: (user.role === 'admin' || user.role === 'super_admin' || user.role === 'clinical_practice_assistant') 
        ? (user.has_supervisor_privileges || false) 
        : undefined // Only include for eligible roles
    };
    
    // For pending users, include passwordless login link
    if (user.status === 'pending' && user.passwordless_token) {
      const config = (await import('../config/config.js')).default;
      const frontendBase = (config.frontendUrl || '').replace(/\/$/, '');
      let portalSlug = null;
      try {
        const userAgencies = await User.getAgencies(user.id);
        portalSlug = userAgencies?.[0]?.portal_url || userAgencies?.[0]?.slug || null;
      } catch (e) {
        portalSlug = null;
      }
      accountInfo.passwordlessLoginLink = portalSlug
        ? `${frontendBase}/${portalSlug}/passwordless-login/${user.passwordless_token}`
        : `${frontendBase}/passwordless-login/${user.passwordless_token}`;
      accountInfo.passwordlessToken = user.passwordless_token;
      accountInfo.passwordlessTokenExpiresAt = user.passwordless_token_expires_at;
      accountInfo.requiresLastNameVerification = !user.pending_identity_verified;
      
      // Calculate time until expiration
      if (user.passwordless_token_expires_at) {
        const expiresAt = new Date(user.passwordless_token_expires_at);
        const now = new Date();
        const hoursUntilExpiry = Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));
        accountInfo.passwordlessTokenExpiresInHours = hoursUntilExpiry;
        accountInfo.passwordlessTokenIsExpired = hoursUntilExpiry <= 0;
      }
    }
    
    res.json(accountInfo);
  } catch (error) {
    next(error);
  }
};

export const downloadCompletionPackage = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Users can download their own package, admins can download any
    if (parseInt(id) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // Generate completion package
    const zipPath = await CompletionPackageService.generateCompletionPackage(parseInt(id));
    
    // Read zip file
    const zipBuffer = await fs.readFile(zipPath);
    
    // Clean up zip file
    await fs.unlink(zipPath).catch(() => {});
    
    // Send zip file
    const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
    const filename = `completion-package-${userName.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.zip`;
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', zipBuffer.length);
    res.send(zipBuffer);
  } catch (error) {
    console.error('downloadCompletionPackage: Error:', error);
    next(error);
  }
};

export const getOnboardingChecklist = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Users can view their own checklist, admins can view any
    if (parseInt(id) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    const checklist = await OnboardingChecklist.getUserChecklist(id);
    const completionPercentage = await OnboardingChecklist.getCompletionPercentage(id);
    
    res.json({
      items: checklist,
      completionPercentage
    });
  } catch (error) {
    next(error);
  }
};

export const markChecklistItemComplete = async (req, res, next) => {
  try {
    const { id, itemId } = req.params;
    
    // Users can only mark their own items complete
    if (parseInt(id) !== req.user.id) {
      return res.status(403).json({ error: { message: 'You can only update your own checklist' } });
    }
    
    const item = await OnboardingChecklist.markItemComplete(id, itemId);
    if (!item) {
      return res.status(404).json({ error: { message: 'Checklist item not found' } });
    }
    
    const completionPercentage = await OnboardingChecklist.getCompletionPercentage(id);
    
    res.json({
      item,
      completionPercentage
    });
  } catch (error) {
    next(error);
  }
};

export const markUserComplete = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Only admins/super_admins/support can mark users as complete
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    // Verify user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    // Allow admins to convert a PENDING_SETUP user directly to ACTIVE_EMPLOYEE (current employee).
    // Note: This does NOT set/changing passwords. Use reset-password link flow for that.
    if (user.status === 'PENDING_SETUP') {
      const pool = (await import('../config/database.js')).default;
      await pool.execute('UPDATE users SET is_active = TRUE WHERE id = ?', [parseInt(id)]);
      try {
        await User.generatePasswordlessToken(parseInt(id), 48);
      } catch {
        // If token flow isn't available in older DBs, skip
      }

      const updatedUser = await User.updateStatus(parseInt(id), 'ACTIVE_EMPLOYEE', req.user.id);
      return res.json({
        message: 'User marked as active employee',
        user: updatedUser
      });
    }
    
    // Admins can mark PREHIRE_OPEN, PREHIRE_REVIEW, ONBOARDING, or ACTIVE_EMPLOYEE users as ACTIVE_EMPLOYEE
    // If in earlier statuses, we'll move them through the flow automatically
    if (user.status === 'PREHIRE_OPEN' || user.status === 'PREHIRE_REVIEW') {
      // For PREHIRE_OPEN users, first move to PREHIRE_REVIEW, then to ONBOARDING, then to ACTIVE_EMPLOYEE
      // For PREHIRE_REVIEW users, move to ONBOARDING, then to ACTIVE_EMPLOYEE
      
      // If PREHIRE_OPEN, we need to complete the pre-hire process first
      if (user.status === 'PREHIRE_OPEN') {
        // Check if all items are complete
        const PendingCompletionService = (await import('../services/pendingCompletion.service.js')).default;
        const completionCheck = await PendingCompletionService.checkAllChecklistItemsComplete(parseInt(id));
        if (!completionCheck.allComplete) {
          return res.status(400).json({ 
            error: { 
              message: 'Cannot mark as completed: Not all pre-hire checklist items are completed.',
              incompleteCount: completionCheck.incompleteCount
            } 
          });
        }
        
        // Mark pre-hire as complete (sets to PREHIRE_REVIEW)
        await PendingCompletionService.processPendingCompletion(parseInt(id), false);
      }
      
      // Now move PREHIRE_REVIEW to ONBOARDING (requires onboarding package assignment)
      // For admin-initiated completion, we'll skip to ACTIVE_EMPLOYEE if work email is set
      const workEmail = user.work_email || user.email;
      if (!workEmail) {
        return res.status(400).json({ 
          error: { 
            message: 'Work email is required. Please set the work email first.',
            requiresWorkEmail: true
          } 
        });
      }
      
      // Set work email if not already set
      if (!user.work_email) {
        await User.setWorkEmail(parseInt(id), workEmail);
        const pool = (await import('../config/database.js')).default;
        await pool.execute('UPDATE users SET email = ? WHERE id = ?', [workEmail, parseInt(id)]);
      }
      
      // Move through ONBOARDING to ACTIVE_EMPLOYEE
      // First set to ONBOARDING if in PREHIRE_REVIEW
      if (user.status === 'PREHIRE_REVIEW') {
        await User.updateStatus(parseInt(id), 'ONBOARDING', req.user.id);
      }
    }
    
    // Now mark as ACTIVE_EMPLOYEE (user should be in ONBOARDING or ACTIVE_EMPLOYEE at this point)
    const currentUser = await User.findById(id);
    if (currentUser.status !== 'ONBOARDING' && currentUser.status !== 'ACTIVE_EMPLOYEE') {
      return res.status(400).json({ 
        error: { 
          message: `User is in ${currentUser.status} status. Cannot mark as active employee. User must be in ONBOARDING status.`,
          currentStatus: currentUser.status
        } 
      });
    }
    
    const updatedUser = await User.updateStatus(id, 'ACTIVE_EMPLOYEE', req.user.id);
    if (!updatedUser) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // Create onboarding completed notification for each agency the user belongs to
    try {
      const userAgencies = await User.getAgencies(id);
      for (const agency of userAgencies) {
        await NotificationService.createOnboardingCompletedNotification(id, agency.id);
      }
    } catch (notificationError) {
      // Log error but don't fail the request
      console.error('Error creating onboarding completed notification:', notificationError);
    }
    
    res.json({
      message: 'User marked as active employee',
      user: updatedUser
    });
  } catch (error) {
    next(error);
  }
};

export const promoteToOnboarding = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Only admins/super_admins can promote users
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    // Verify user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // Validate user is in PREHIRE_REVIEW status
    if (user.status !== 'PREHIRE_REVIEW') {
      return res.status(400).json({ 
        error: { 
          message: `User is in ${user.status} status. Can only promote users from PREHIRE_REVIEW status.`,
          currentStatus: user.status
        } 
      });
    }
    
    // Update status to ONBOARDING
    const updatedUser = await User.updateStatus(id, 'ONBOARDING', req.user.id);
    if (!updatedUser) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // Note: Package assignment should be done separately via package assignment endpoint
    // The status change will be triggered when an onboarding package is assigned
    
    res.json({
      message: 'User promoted to onboarding status',
      user: updatedUser
    });
  } catch (error) {
    next(error);
  }
};

export const createCurrentEmployee = async (req, res, next) => {
  try {
    // Only admins/super_admins can create current employees
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    const { firstName, lastName, workEmail, agencyId, role, billingAcknowledged } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !workEmail || !agencyId) {
      return res.status(400).json({ 
        error: { message: 'First name, last name, work email, and agency ID are required' } 
      });
    }

    // Check if user with this work email already exists
    const existingUser = await User.findByWorkEmail(workEmail.trim());
    if (existingUser) {
      return res.status(400).json({ 
        error: { message: 'A user with this work email already exists' } 
      });
    }

    // Check if email exists in users table
    const existingEmail = await User.findByEmail(workEmail.trim());
    if (existingEmail) {
      return res.status(400).json({ 
        error: { message: 'A user with this email already exists' } 
      });
    }

    const pool = (await import('../config/database.js')).default;
    const bcrypt = (await import('bcrypt')).default;

    // Create user directly in ACTIVE_EMPLOYEE status (skips PENDING_SETUP, PREHIRE_OPEN, PREHIRE_REVIEW, ONBOARDING)
    const normalizeRole = (r) => {
      const v = String(r || '').trim().toLowerCase();
      if (!v) return 'provider';
      if (v === 'clinician' || v === 'intern' || v === 'facilitator') return 'provider';
      if (v === 'supervisor') return 'provider';
      return v;
    };
    const finalRole = normalizeRole(role || 'provider');

    // Billing hard gate: adding an admin beyond included requires acknowledgement
    if (finalRole === 'admin') {
      const { getAdminAddBillingImpact } = await import('../services/adminBillingGate.service.js');
      const impact = await getAdminAddBillingImpact(parseInt(agencyId, 10), { deltaAdmins: 1 });
      if (impact && billingAcknowledged !== true) {
        return res.status(409).json({
          error: { message: 'Billing acknowledgement required.' },
          billingImpact: { code: 'ADMIN_OVERAGE', impacts: [{ agencyId: parseInt(agencyId, 10), ...impact }] }
        });
      }
    }
    
    // Create user with work email as username and email
    const user = await User.create({
      email: workEmail.trim(),
      passwordHash: null, // Will be set via passwordless token
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      personalEmail: null, // Current employees don't need personal email
      role: finalRole,
      status: 'ACTIVE_EMPLOYEE' // Skip all earlier statuses
    });

    // Set work email
    await User.setWorkEmail(user.id, workEmail.trim());
    await pool.execute('UPDATE users SET email = ?, username = ? WHERE id = ?', [workEmail.trim(), workEmail.trim(), user.id]);

    // Assign to agency
    await User.assignToAgency(user.id, parseInt(agencyId));

    // Generate passwordless token for password setup (48 hours expiration)
    const passwordlessTokenResult = await User.generatePasswordlessToken(user.id, 48);
    const frontendBase = ((await import('../config/config.js')).default.frontendUrl || '').replace(/\/$/, '');
    const userAgencies = await User.getAgencies(userId);
    const portalSlug = userAgencies?.[0]?.portal_url || userAgencies?.[0]?.slug || null;
    const passwordlessTokenLink = portalSlug
      ? `${frontendBase}/${portalSlug}/passwordless-login/${passwordlessTokenResult.token}`
      : `${frontendBase}/passwordless-login/${passwordlessTokenResult.token}`;

    // Get agency info for response
    const Agency = (await import('../models/Agency.model.js')).default;
    const agency = await Agency.findById(parseInt(agencyId));

    res.status(201).json({
      message: 'Current employee created successfully',
      user: {
        id: user.id,
        email: workEmail.trim(),
        username: workEmail.trim(),
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        status: user.status
      },
      passwordlessToken: passwordlessTokenResult.token,
      passwordlessTokenLink: passwordlessTokenLink,
      agencyName: agency?.name || 'Unknown'
    });
  } catch (error) {
    next(error);
  }
};

export const markUserTerminated = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Only admins/super_admins can mark users as terminated
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    // Set status to TERMINATED_PENDING with termination_date
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    
    const pool = (await import('../config/database.js')).default;
    await pool.execute(
      `UPDATE users 
       SET status = 'TERMINATED_PENDING',
           terminated_at = ?,
           termination_date = ?,
           status_expires_at = ?
       WHERE id = ?`,
      [now, now, expiresAt, id]
    );
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    res.json({
      message: 'User marked as terminated. Access will expire in 7 days.',
      user,
      expiresAt: user.status_expires_at,
      terminationDate: user.termination_date
    });
  } catch (error) {
    next(error);
  }
};

export const markUserActive = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { workEmail } = req.body; // Required corporate email/username when moving from ready_for_review to active
    
    // Only admins/super_admins/support can activate users
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    // Get current user status
    const currentUser = await User.findById(id);
    if (!currentUser) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // If user is pending or ready_for_review, we need to set up credentials
    if (currentUser.status === 'pending' || currentUser.status === 'ready_for_review') {
      // For pending users, check if all items are complete
      if (currentUser.status === 'pending') {
        const PendingCompletionService = (await import('../services/pendingCompletion.service.js')).default;
        const completionCheck = await PendingCompletionService.checkAllChecklistItemsComplete(parseInt(id));
        if (!completionCheck.allComplete) {
          return res.status(400).json({ 
            error: { 
              message: 'Cannot activate: Not all pre-hire checklist items are completed.',
              incompleteCount: completionCheck.incompleteCount,
              requiresCompletion: true
            } 
          });
        }
        
        // Mark pending as complete (sets to ready_for_review)
        await PendingCompletionService.processPendingCompletion(parseInt(id), false);
      }
      
      // Now handle ready_for_review -> active transition
      // Username (corporate email) is required - this changes from personal email to corporate email
      const newUsername = workEmail; // workEmail parameter is now the new corporate username
      if (!newUsername || !newUsername.trim()) {
        return res.status(400).json({ 
          error: { 
            message: 'Corporate email (username) is required to activate this user. Please provide a corporate email.',
            requiresUsername: true
          } 
        });
      }
      
      // Check if new username already exists
      const existingUserWithUsername = await User.findByUsername(newUsername.trim());
      if (existingUserWithUsername && existingUserWithUsername.id !== parseInt(id)) {
        return res.status(400).json({ error: { message: 'This username is already in use' } });
      }
      const existingUserWithEmail = await User.findByEmail(newUsername.trim());
      if (existingUserWithEmail && existingUserWithEmail.id !== parseInt(id)) {
        return res.status(400).json({ error: { message: 'This email is already in use' } });
      }
      
      // Update username to corporate email (preserves personal_email, preserves user ID)
      await User.updateUsername(parseInt(id), newUsername.trim());
      
      // Also set work_email for backward compatibility
      await User.setWorkEmail(parseInt(id), newUsername.trim());
      
      // Generate temporary password (48 hours expiration)
      const bcrypt = (await import('bcrypt')).default;
      const tempPassword = await User.generateTemporaryPassword();
      const tempPasswordHash = await bcrypt.hash(tempPassword, 10);
      
      // Set temporary password
      await User.setTemporaryPassword(parseInt(id), tempPassword, 48);
      
      // Set user password hash
      await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [tempPasswordHash, parseInt(id)]);
      
      // Generate new passwordless token (48 hours expiration for active users)
      await User.generatePasswordlessToken(parseInt(id), 48);
    }
    
    // Update status to active
    const user = await User.updateStatus(id, 'active', req.user.id);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // Remove user from approved_employee_emails when they become active again
    // They should use their regular user account, not the approved employee access
    const ApprovedEmployee = (await import('../models/ApprovedEmployee.model.js')).default;
    const pool = (await import('../config/database.js')).default;
    
    // Get all approved employee entries for this user's email
    const [employeeEntries] = await pool.execute(
      'SELECT id, password_hash FROM approved_employee_emails WHERE email = ?',
      [user.email]
    );
    
    // If user doesn't have a password_hash in users table, copy it from approved_employee_emails
    // This ensures they can login with the password they were using as an approved employee
    if (!user.password_hash && employeeEntries.length > 0) {
      const employeePasswordHash = employeeEntries[0].password_hash;
      if (employeePasswordHash) {
        await pool.execute(
          'UPDATE users SET password_hash = ? WHERE id = ?',
          [employeePasswordHash, id]
        );
      }
    }
    
    // Delete all approved employee entries for this user
    for (const entry of employeeEntries) {
      await ApprovedEmployee.delete(entry.id);
    }
    
    res.json({
      message: 'User account reactivated and removed from approved employee list',
      user: await User.findById(id)
    });
  } catch (error) {
    next(error);
  }
};

export const deactivateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Only admins/super_admins can deactivate users
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    const deactivated = await User.deactivate(parseInt(id));
    if (!deactivated) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    const user = await User.findById(parseInt(id));
    
    // If user is deactivated and not terminated/archived, ensure they're in approved employees list
    if (user && user.status !== 'terminated' && (!user.is_archived || user.is_archived === 0)) {
      const ApprovedEmployee = (await import('../models/ApprovedEmployee.model.js')).default;
      const Agency = (await import('../models/Agency.model.js')).default;
      const pool = (await import('../config/database.js')).default;
      
      // Get user's agencies
      const userAgencies = await User.getAgencies(parseInt(id));
      
      for (const agency of userAgencies) {
        // Check if email already exists in approved_employee_emails for this agency (including inactive ones)
        const [existingRows] = await pool.execute(
          'SELECT * FROM approved_employee_emails WHERE email = ? AND agency_id = ?',
          [user.email, agency.id]
        );
        
        if (existingRows.length === 0) {
          // Get agency to check for company default password
          const agencyData = await Agency.findById(agency.id);
          let passwordHash = null;

          if (agencyData && agencyData.company_default_password_hash) {
            passwordHash = agencyData.company_default_password_hash;
          } else {
            // Generate a temporary password hash if no company default
            const bcrypt = (await import('bcrypt')).default;
            const tempPassword = `temp_${user.id}_${Date.now()}`;
            passwordHash = await bcrypt.hash(tempPassword, 10);
          }

          // Add to approved_employee_emails
          await ApprovedEmployee.create({
            email: user.email,
            agencyId: agency.id,
            requiresVerification: false,
            passwordHash: passwordHash
          });
        } else {
          // Entry already exists - just ensure it's active
          const existing = existingRows[0];
          if (!existing.is_active) {
            await pool.execute(
              'UPDATE approved_employee_emails SET is_active = TRUE WHERE id = ?',
              [existing.id]
            );
          }
        }
      }
    }
    
    res.json({
      message: 'User deactivated successfully',
      user
    });
  } catch (error) {
    next(error);
  }
};

export const getOnboardingDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);
    
    console.log(`getOnboardingDocument: Generating document for user ${userId}`);
    
    // Users can download their own document, admins can download any
    if (userId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    console.log(`getOnboardingDocument: User found: ${user.first_name} ${user.last_name}`);
    
    try {
      const OnboardingPdfService = (await import('../services/onboardingPdf.service.js')).default;
      console.log('getOnboardingDocument: Starting PDF generation...');
      const pdfBytes = await OnboardingPdfService.generateOnboardingDocument(userId);
      
      // Verify pdfBytes is valid
      if (!pdfBytes) {
        throw new Error('PDF generation returned null or undefined');
      }
      
      if (!(pdfBytes instanceof Uint8Array) && !Buffer.isBuffer(pdfBytes)) {
        console.error('getOnboardingDocument: pdfBytes is not a valid type:', typeof pdfBytes, pdfBytes.constructor.name);
        throw new Error('PDF generation returned invalid data type');
      }
      
      console.log(`getOnboardingDocument: PDF generated successfully, size: ${pdfBytes.length} bytes`);
      console.log(`getOnboardingDocument: PDF bytes type: ${pdfBytes.constructor.name}`);
      
      const filename = `onboarding-document-${user.first_name}-${user.last_name}-${Date.now()}.pdf`;
      
      // Ensure we're sending binary data, not JSON
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBytes.length);
      
      // Send as Buffer if it's a Uint8Array
      if (pdfBytes instanceof Uint8Array && !Buffer.isBuffer(pdfBytes)) {
        res.send(Buffer.from(pdfBytes));
      } else {
        res.send(pdfBytes);
      }
    } catch (pdfError) {
      console.error('getOnboardingDocument: Error generating PDF:', pdfError);
      console.error('getOnboardingDocument: Error stack:', pdfError.stack);
      
      // Make sure we're sending JSON, not trying to send error as PDF
      if (!res.headersSent) {
        return res.status(500).json({ 
          error: { 
            message: 'Failed to generate onboarding document',
            details: pdfError.message 
          } 
        });
      }
    }
  } catch (error) {
    console.error('getOnboardingDocument: Unexpected error:', error);
    console.error('getOnboardingDocument: Error stack:', error.stack);
    next(error);
  }
};

export const markPendingComplete = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);
    const requestingUserId = req.user.id;
    
    // Verify user exists and is pending
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // Check if user is requesting their own completion or if requester is admin/support
    const isSelfRequest = userId === requestingUserId;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin' || req.user.role === 'support';
    
    if (!isSelfRequest && !isAdmin) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    if (user.status !== 'pending') {
      if (user.status === 'ready_for_review') {
        return res.status(400).json({ 
          error: { 
            message: 'You have already completed the pre-hire process. Your account is now ready for review by your administrator.',
            status: 'ready_for_review'
          } 
        });
      }
      return res.status(400).json({ error: { message: 'User is not in pending status' } });
    }
    
    // Check if access is already locked
    if (user.pending_access_locked) {
      return res.status(400).json({ 
        error: { 
          message: 'The pre-hire process has already been completed. Your account is ready for review.',
          status: 'ready_for_review'
        } 
      });
    }
    
    // Use service to process completion
    const PendingCompletionService = (await import('../services/pendingCompletion.service.js')).default;
    const result = await PendingCompletionService.processPendingCompletion(userId, false);
    
    res.json({
      message: 'Pre-hire process marked as complete',
      ...result
    });
  } catch (error) {
    console.error('Error in markPendingComplete:', error);
    if (error.message.includes('Not all checklist items')) {
      return res.status(400).json({ error: { message: error.message } });
    }
    if (error.message.includes('User is not in pending status')) {
      return res.status(400).json({ 
        error: { 
          message: 'You have already completed the pre-hire process. Your account is now ready for review by your administrator.',
          status: 'ready_for_review'
        } 
      });
    }
    next(error);
  }
};

export const checkPendingCompletionStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);
    
    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    if (user.status !== 'pending') {
      return res.json({
        isPending: false,
        allComplete: false,
        message: 'User is not in pending status'
      });
    }
    
    // Check completion status
    const PendingCompletionService = (await import('../services/pendingCompletion.service.js')).default;
    const completionCheck = await PendingCompletionService.checkAllChecklistItemsComplete(userId);
    
    // Get last completion time
    const lastCompletion = await PendingCompletionService.getLastCompletionTime(userId);
    let autoCompleteTime = null;
    if (lastCompletion) {
      autoCompleteTime = new Date(lastCompletion.getTime() + 24 * 60 * 60 * 1000);
    }
    
    res.json({
      isPending: true,
      allComplete: completionCheck.allComplete,
      incompleteCount: completionCheck.incompleteCount,
      details: completionCheck.details,
      lastCompletionTime: lastCompletion,
      autoCompleteTime: autoCompleteTime,
      accessLocked: user.pending_access_locked || false
    });
  } catch (error) {
    next(error);
  }
};

export const movePendingToActive = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { workEmail, personalEmail, templateId } = req.body;
    const userId = parseInt(id);
    
    // Only admins/super_admins/support can mark users as reviewed and activated
    // CPAs and supervisors have view-only access
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Only admins, super admins, or support can mark users as reviewed and activated' } });
    }
    
    if (!workEmail || !workEmail.trim()) {
      return res.status(400).json({ error: { message: 'Work email is required' } });
    }
    
    // Verify user exists and is in ready_for_review status
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    if (user.status !== 'ready_for_review') {
      return res.status(400).json({ error: { message: 'User is not in ready_for_review status' } });
    }
    
    // Check if work email already exists
    const existingUserWithWorkEmail = await User.findByWorkEmail(workEmail.trim());
    if (existingUserWithWorkEmail && existingUserWithWorkEmail.id !== userId) {
      return res.status(400).json({ error: { message: 'Work email is already in use' } });
    }
    // Also check primary email field
    const existingUserWithEmail = await User.findByEmail(workEmail.trim());
    if (existingUserWithEmail && existingUserWithEmail.id !== userId) {
      return res.status(400).json({ error: { message: 'This email is already in use' } });
    }
    
    // Set work email and update primary email
    await User.setWorkEmail(userId, workEmail.trim());
    const pool = (await import('../config/database.js')).default;
    await pool.execute(
      'UPDATE users SET email = ? WHERE id = ?',
      [workEmail.trim(), userId]
    );
    
    // Set personal email if provided
    if (personalEmail && personalEmail.trim()) {
      await pool.execute(
        'UPDATE users SET personal_email = ? WHERE id = ?',
        [personalEmail.trim(), userId]
      );
    }
    
    // Generate temporary password (48 hours expiration)
    const bcrypt = (await import('bcrypt')).default;
    const tempPassword = await User.generateTemporaryPassword();
    const tempPasswordHash = await bcrypt.hash(tempPassword, 10);
    
    // Set temporary password
    await User.setTemporaryPassword(userId, tempPassword, 48);
    
    // Update user password hash
    await pool.execute(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [tempPasswordHash, userId]
    );
    
    // Generate new passwordless token (48 hours expiration for active users)
    const passwordlessTokenResult = await User.generatePasswordlessToken(userId, 48);
    
    // Change status to active
    await User.updateStatus(userId, 'active', req.user.id);
    
    // Get updated user
    const updatedUser = await User.findById(userId);
    
    // Generate email with credentials (using email template service)
    const EmailTemplateService = (await import('../services/emailTemplate.service.js')).default;
    const config = (await import('../config/config.js')).default;
    
    // Get agency info for branding
    let agencyName = 'Your Agency';
    let peopleOpsEmail = 'support@example.com';
    const userAgencies = await User.getAgencies(userId);
    if (userAgencies.length > 0) {
      const Agency = (await import('../models/Agency.model.js')).default;
      const agency = await Agency.findById(userAgencies[0].id);
      if (agency) {
        agencyName = agency.name;
        peopleOpsEmail = agency.people_ops_email || peopleOpsEmail;
      }
    }
    
    let generatedEmail = null;
    let emailSubject = null;
    try {
      // Get the template - use selected template ID if provided, otherwise use default lookup
      let template = null;
      if (templateId) {
        const EmailTemplate = (await import('../models/EmailTemplate.model.js')).default;
        template = await EmailTemplate.findById(parseInt(templateId));
        // Verify template is a welcome type (accept both user_welcome and welcome_active)
        if (template && template.type !== 'welcome_active' && template.type !== 'user_welcome') {
          template = null; // Invalid template type, fall back to default
        }
      }
      
      // If no template selected or invalid, use default lookup
      // Try welcome_active first, then fall back to user_welcome
      if (!template) {
        template = await EmailTemplateService.getTemplateForAgency(
          userAgencies.length > 0 ? userAgencies[0].id : null,
          'welcome_active'
        );
        // If no welcome_active template, try user_welcome
        if (!template) {
          template = await EmailTemplateService.getTemplateForAgency(
            userAgencies.length > 0 ? userAgencies[0].id : null,
            'user_welcome'
          );
        }
      }
      
      if (template && template.body) {
        // Get base parameters
        const parameters = {
          FIRST_NAME: user.first_name,
          LAST_NAME: user.last_name,
          AGENCY_NAME: agencyName,
          PORTAL_LOGIN_LINK: passwordlessTokenLink,
          RESET_TOKEN_LINK: passwordlessTokenLink,
          PORTAL_URL: config.frontendUrl,
          USERNAME: workEmail.trim(),
          TEMP_PASSWORD: tempPassword,
          PEOPLE_OPS_EMAIL: peopleOpsEmail,
          SENDER_NAME: (await User.findById(req.user.id))?.first_name || 'Administrator'
        };
        
        // Add custom parameters from user info fields
        try {
          const UserInfoValue = (await import('../models/UserInfoValue.model.js')).default;
          const userInfoSummary = await UserInfoValue.getUserInfoSummary(userId, userAgencies.length > 0 ? userAgencies[0].id : null);
          
          // Add each user info field as a parameter (using field_key as parameter name)
          for (const field of userInfoSummary) {
            if (field.value && field.field_key) {
              // Convert field_key to UPPER_SNAKE_CASE for template parameter
              const paramName = field.field_key.toUpperCase().replace(/[^A-Z0-9]/g, '_');
              parameters[paramName] = field.value;
            }
          }
        } catch (userInfoError) {
          console.error('Error loading user info fields for template:', userInfoError);
          // Continue without custom user info fields
        }
        
        // Add custom parameters from agency fields
        try {
          if (userAgencies.length > 0) {
            const Agency = (await import('../models/Agency.model.js')).default;
            const agency = await Agency.findById(userAgencies[0].id);
            if (agency) {
              // Add all existing agency fields as parameters
              if (agency.name) {
                parameters.AGENCY_NAME = agency.name;
              }
              if (agency.onboarding_team_email) {
                parameters.PEOPLE_OPS_EMAIL = agency.onboarding_team_email;
              }
              if (agency.phone_number) {
                parameters.AGENCY_PHONE = agency.phone_number;
                if (agency.phone_extension) {
                  parameters.AGENCY_PHONE_EXTENSION = agency.phone_extension;
                  parameters.AGENCY_PHONE_FULL = `${agency.phone_number} ext. ${agency.phone_extension}`;
                } else {
                  parameters.AGENCY_PHONE_FULL = agency.phone_number;
                }
              }
              if (agency.portal_url) {
                parameters.AGENCY_PORTAL_URL = agency.portal_url;
              }
              if (agency.slug) {
                parameters.AGENCY_SLUG = agency.slug;
              }
              if (agency.logo_url) {
                parameters.AGENCY_LOGO_URL = agency.logo_url;
              }
              
              // Add custom agency parameters from a JSON field if it exists
              // Check if agencies table has a custom_parameters JSON column
              try {
                const pool = (await import('../config/database.js')).default;
                const [columns] = await pool.execute(
                  "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'custom_parameters'"
                );
                
                if (columns.length > 0) {
                  // Custom parameters column exists, load it
                  const [customRows] = await pool.execute(
                    'SELECT custom_parameters FROM agencies WHERE id = ?',
                    [userAgencies[0].id]
                  );
                  
                  if (customRows.length > 0 && customRows[0].custom_parameters) {
                    let customParams = {};
                    try {
                      customParams = typeof customRows[0].custom_parameters === 'string' 
                        ? JSON.parse(customRows[0].custom_parameters)
                        : customRows[0].custom_parameters;
                      
                      // Add each custom parameter (convert keys to UPPER_SNAKE_CASE)
                      for (const [key, value] of Object.entries(customParams)) {
                        if (value !== null && value !== undefined) {
                          const paramName = key.toUpperCase().replace(/[^A-Z0-9]/g, '_');
                          parameters[`AGENCY_${paramName}`] = String(value);
                        }
                      }
                    } catch (parseError) {
                      console.error('Error parsing custom_parameters JSON:', parseError);
                    }
                  }
                }
              } catch (customParamError) {
                // Column doesn't exist yet, that's okay - we'll create it in a migration
                console.log('Custom parameters column not found - will be available after migration');
              }
            }
          }
        } catch (agencyError) {
          console.error('Error loading agency fields for template:', agencyError);
          // Continue without custom agency fields
        }
        
        const rendered = EmailTemplateService.renderTemplate(template, parameters);
        generatedEmail = rendered.body;
        emailSubject = rendered.subject || template.subject || 'Your Account Credentials';
      } else {
        // Fallback if template doesn't exist
        const senderUser = await User.findById(req.user.id);
        const senderName = senderUser?.first_name || 'Administrator';
        generatedEmail = `Hello ${user.first_name} ${user.last_name},\n\nWelcome to ${agencyName}!\n\nYour account has been activated. Here are your login credentials:\n\nUsername: ${workEmail.trim()}\nTemporary Password: ${tempPassword}\n\nYou can log in using the link below, which will allow you to set your own password:\n${passwordlessTokenLink}\n\nThis link will expire in 48 hours.\n\nIf you have any questions, please contact ${peopleOpsEmail}.\n\nBest regards,\n${senderName}`;
        emailSubject = 'Your Account Credentials';
      }
    } catch (emailError) {
      console.error('Error generating email:', emailError);
      // Fallback email if template rendering fails
      const senderUser = await User.findById(req.user.id);
      const senderName = senderUser?.first_name || 'Administrator';
      generatedEmail = `Hello ${user.first_name} ${user.last_name},\n\nWelcome to ${agencyName}!\n\nYour account has been activated. Here are your login credentials:\n\nUsername: ${workEmail.trim()}\nTemporary Password: ${tempPassword}\n\nYou can log in using the link below, which will allow you to set your own password:\n${passwordlessTokenLink}\n\nThis link will expire in 48 hours.\n\nIf you have any questions, please contact ${peopleOpsEmail}.\n\nBest regards,\n${senderName}`;
      emailSubject = 'Your Account Credentials';
    }
    
    // Log the generated email to user_communications
    if (generatedEmail && userAgencies.length > 0) {
      try {
        const UserCommunication = (await import('../models/UserCommunication.model.js')).default;
        await UserCommunication.create({
          userId: userId,
          agencyId: userAgencies[0].id,
          templateType: 'welcome_active',
          templateId: templateId || null,
          subject: emailSubject,
          body: generatedEmail,
          generatedByUserId: req.user.id,
          channel: 'email',
          recipientAddress: workEmail.trim(),
          deliveryStatus: 'pending' // Will be updated when email API sends it
        });
      } catch (logError) {
        // Don't fail the request if logging fails
        console.error('Failed to log communication:', logError);
      }
    }

    res.json({
      message: 'User moved to active status',
      user: updatedUser,
      credentials: {
        workEmail: workEmail.trim(),
        temporaryPassword: tempPassword,
        passwordlessToken: passwordlessTokenResult.token,
        passwordlessTokenLink,
        generatedEmail: generatedEmail,
        emailSubject: emailSubject
      }
    });
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    // Support both /change-password (uses req.user.id) and /:id/change-password
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;
    const userId = id ? parseInt(id) : req.user.id;

    // Users can only change their own password (unless admin/super_admin/support)
    if (userId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'You can only change your own password' } });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: { message: 'New password must be at least 6 characters' } });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    // If user is changing their own password, verify current password
    if (userId === req.user.id) {
      if (!currentPassword) {
        return res.status(400).json({ error: { message: 'Current password is required' } });
      }

      const bcrypt = (await import('bcrypt')).default;
      const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
      
      if (!isValidPassword) {
        // Also check temporary password
        if (user.temporary_password_hash) {
          const isValidTempPassword = await bcrypt.compare(currentPassword, user.temporary_password_hash);
          if (!isValidTempPassword) {
            return res.status(401).json({ error: { message: 'Current password is incorrect' } });
          }
        } else {
          return res.status(401).json({ error: { message: 'Current password is incorrect' } });
        }
      }
    }

    // Check if this is the first password change
    const UserActivityLog = (await import('../models/UserActivityLog.model.js')).default;
    const pool = (await import('../config/database.js')).default;
    const [passwordChanges] = await pool.execute(
      `SELECT COUNT(*) as count FROM user_activity_log 
       WHERE user_id = ? AND action_type = 'password_change'`,
      [userId]
    );
    const isFirstPasswordChange = parseInt(passwordChanges[0]?.count || 0) === 0;

    // Change the password
    await User.changePassword(userId, newPassword);

    // If user is inactive, activate them when they set their password
    if (user.is_active === false || user.is_active === 0) {
      const pool = (await import('../config/database.js')).default;
      await pool.execute(
        'UPDATE users SET is_active = TRUE WHERE id = ?',
        [userId]
      );
    }

    // Log password change activity using centralized service
    ActivityLogService.logActivity({
      actionType: 'password_change',
      userId: userId,
      metadata: {
        isFirstPasswordChange
      }
    }, req);

    // Create notification for password change (if first time)
    if (isFirstPasswordChange) {
      const NotificationService = (await import('../services/notification.service.js')).default;
      setTimeout(() => {
        NotificationService.createPasswordChangeNotification(userId, agencyId).catch(err => {
          console.error('Failed to create password change notification:', err);
        });
      }, 0);
    }

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
};

export const getPendingCompletionSummary = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);
    
    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // Check permissions - user can download their own, admins can download any
    if (user.status !== 'pending' && user.status !== 'ready_for_review') {
      return res.status(400).json({ error: { message: 'User is not in pending or ready_for_review status' } });
    }
    
    if (userId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    // Generate completion summary
    const PendingCompletionService = (await import('../services/pendingCompletion.service.js')).default;
    const pdfBuffer = await PendingCompletionService.generateCompletionSummary(userId);
    
    // Set response headers for PDF download
    const filename = `completion-summary-${user.first_name}-${user.last_name}-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

export const wipePendingUserData = async (req, res, next) => {
  try {
    // Support users cannot wipe user data
    if (req.user.role === 'support') {
      return res.status(403).json({ error: { message: 'Support users cannot wipe user data' } });
    }
    
    const { id } = req.params;
    const userId = parseInt(id);
    
    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // Only allow wiping pending or ready_for_review users
    if (user.status !== 'pending' && user.status !== 'ready_for_review') {
      return res.status(400).json({ error: { message: 'Can only wipe data for users in pending or ready_for_review status' } });
    }
    
    // Get user's agency IDs for permission check
    let userAgencyIds = [];
    if (req.user.role !== 'super_admin' && req.user.id) {
      const userAgencies = await User.getAgencies(req.user.id);
      userAgencyIds = userAgencies.map(a => a.id);
      
      // Check if the pending user belongs to any of the admin's agencies
      const pendingUserAgencies = await User.getAgencies(userId);
      const pendingUserAgencyIds = pendingUserAgencies.map(a => a.id);
      const hasAccess = pendingUserAgencyIds.some(id => userAgencyIds.includes(id));
      
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You do not have permission to wipe this user\'s data' } });
      }
    }
    
    const pool = (await import('../config/database.js')).default;
    
    // Start transaction to delete training and document data only
    await pool.execute('START TRANSACTION');
    
    try {
      // TRAINING DATA
      // Delete user tracks (training track assignments)
      await pool.execute('DELETE FROM user_tracks WHERE user_id = ?', [userId]);
      
      // Delete module responses
      await pool.execute('DELETE FROM module_responses WHERE user_id = ?', [userId]);
      
      // Delete module response answers
      await pool.execute('DELETE FROM module_response_answers WHERE user_id = ?', [userId]);
      
      // Delete quiz attempts
      await pool.execute('DELETE FROM quiz_attempts WHERE user_id = ?', [userId]);
      
      // Delete quiz responses
      await pool.execute('DELETE FROM quiz_responses WHERE user_id = ?', [userId]);
      
      // Delete time logs
      await pool.execute('DELETE FROM time_logs WHERE user_id = ?', [userId]);
      
      // Delete acknowledgments (training acknowledgments)
      await pool.execute('DELETE FROM acknowledgments WHERE user_id = ?', [userId]);
      
      // Delete progress records
      await pool.execute('DELETE FROM progress WHERE user_id = ?', [userId]);
      
      // Delete task completions (training tasks)
      await pool.execute('DELETE FROM tasks WHERE user_id = ?', [userId]);
      
      // Delete signatures (training-related signatures)
      await pool.execute('DELETE FROM signatures WHERE user_id = ?', [userId]);
      
      // Delete checklist assignments (training checklist items)
      await pool.execute('DELETE FROM user_checklist_assignments WHERE user_id = ?', [userId]);
      
      // Delete onboarding checklist items (training checklist)
      await pool.execute('DELETE FROM onboarding_checklists WHERE user_id = ?', [userId]);
      
      // DOCUMENT DATA
      // Delete user-specific documents and their files
      const UserSpecificDocument = (await import('../models/UserSpecificDocument.model.js')).default;
      const userDocs = await UserSpecificDocument.findByUserId(userId);
      for (const doc of userDocs) {
        if (doc.file_path) {
          try {
            const fs = (await import('fs/promises')).default;
            const path = (await import('path')).default;
            const { fileURLToPath } = await import('url');
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const filePath = path.join(__dirname, '../../uploads', doc.file_path);
            await fs.unlink(filePath).catch(() => {}); // Ignore errors if file doesn't exist
          } catch (err) {
            console.warn('Could not delete user document file:', err);
          }
        }
      }
      await pool.execute('DELETE FROM user_specific_documents WHERE user_id = ?', [userId]);
      
      // Delete user documents (document task assignments)
      await pool.execute('DELETE FROM user_documents WHERE user_id = ?', [userId]);
      
      // Delete document acknowledgments
      await pool.execute('DELETE FROM document_acknowledgments WHERE user_id = ?', [userId]);
      
      // Delete document signings
      await pool.execute('DELETE FROM document_signings WHERE user_id = ?', [userId]);
      
      // Delete signed document files
      try {
        const fs = (await import('fs/promises')).default;
        const path = (await import('path')).default;
        const { fileURLToPath } = await import('url');
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const signedDir = path.join(__dirname, '../../uploads/signed');
        const files = await fs.readdir(signedDir).catch(() => []);
        for (const file of files) {
          if (file.includes(`user_${userId}_`) || file.includes(`_${userId}.`)) {
            try {
              await fs.unlink(path.join(signedDir, file)).catch(() => {});
            } catch (err) {
              console.warn('Could not delete signed document file:', err);
            }
          }
        }
      } catch (err) {
        console.warn('Could not access signed documents directory:', err);
      }
      
      // Commit transaction
      await pool.execute('COMMIT');
      
      res.json({ message: 'Training and document data wiped successfully. User record and other information preserved.' });
    } catch (error) {
      // Rollback on error
      await pool.execute('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error wiping pending user data:', error);
    next(error);
  }
};


