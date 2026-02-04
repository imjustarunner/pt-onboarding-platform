import pool from '../config/database.js';
import User from '../models/User.model.js';
import Notification from '../models/Notification.model.js';
import UserChecklistAssignment from '../models/UserChecklistAssignment.model.js';
import Task from '../models/Task.model.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import GoogleWorkspaceDirectoryService from './googleWorkspaceDirectory.service.js';
import EmailService from './email.service.js';
import TwilioService from './twilio.service.js';
import TwilioNumber from '../models/TwilioNumber.model.js';
import TwilioNumberAssignment from '../models/TwilioNumberAssignment.model.js';

const parseJsonObject = (raw, fallback = {}) => {
  if (!raw) return fallback;
  if (typeof raw === 'object') return raw || fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const normalizeNamePart = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const resolveWorkspaceFormat = (raw) => {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return null;
  if (['first', 'first_name', 'firstname'].includes(v)) return 'first';
  if (['first_initial_last', 'firstinitiallast', 'flast'].includes(v)) return 'first_initial_last';
  if (['last_first_initial', 'lastfirstinitial', 'lastf'].includes(v)) return 'last_first_initial';
  return null;
};

const resolveWorkspaceDomain = (raw) => {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return null;
  return v.startsWith('@') ? v.slice(1) : v;
};

async function ensureUniqueWorkEmail({ user, format, domain }) {
  const first = normalizeNamePart(user?.first_name);
  const last = normalizeNamePart(user?.last_name);
  if (!first || !last) {
    throw new Error('First name and last name are required to generate a work email');
  }

  let baseLocal = '';
  if (format === 'first') baseLocal = first;
  if (format === 'first_initial_last') baseLocal = `${first[0]}${last}`;
  if (format === 'last_first_initial') baseLocal = `${last}${first[0]}`;
  if (!baseLocal) {
    throw new Error('Invalid work email format');
  }

  for (let i = 0; i < 500; i += 1) {
    const local = i === 0 ? baseLocal : `${baseLocal}${i}`;
    const candidate = `${local}@${domain}`;
    const existing = await User.findByEmail(candidate);
    if (!existing || Number(existing.id) === Number(user.id)) {
      return candidate;
    }
  }
  throw new Error('Unable to generate a unique work email');
}

async function provisionWorkspaceAccount({ user, agency }) {
  const featureFlags = parseJsonObject(agency?.feature_flags, {});
  const workspaceEnabled = featureFlags.workspaceProvisioningEnabled !== false;
  if (!workspaceEnabled) {
    return { skipped: true, reason: 'disabled' };
  }

  const domain = resolveWorkspaceDomain(featureFlags.workspaceEmailDomain);
  const format = resolveWorkspaceFormat(featureFlags.workspaceEmailFormat);

  if (!domain || !format) {
    throw new Error('Workspace account provisioning is not configured for this organization.');
  }

  const personalEmail = normalizeEmail(user.personal_email || user.email);
  if (!personalEmail) {
    throw new Error('Personal email is required to provision a workspace account.');
  }

  const workEmail = user.work_email
    ? normalizeEmail(user.work_email)
    : await ensureUniqueWorkEmail({ user, format, domain });

  if (!user.work_email) {
    await User.setWorkEmail(user.id, workEmail);
  }

  if (!user.personal_email || normalizeEmail(user.personal_email) !== personalEmail) {
    await pool.execute('UPDATE users SET personal_email = ? WHERE id = ?', [personalEmail, user.id]);
  }

  if (!GoogleWorkspaceDirectoryService.isConfigured()) {
    throw new Error('Google Workspace provisioning is not configured.');
  }

  const tempPassword = await User.generateTemporaryPassword();
  try {
    const existing = await GoogleWorkspaceDirectoryService.getUser({ primaryEmail: workEmail });
    if (existing) {
      throw new Error('Workspace account already exists for this email.');
    }
    await GoogleWorkspaceDirectoryService.createUser({
      primaryEmail: workEmail,
      givenName: user.first_name,
      familyName: user.last_name,
      password: tempPassword,
      recoveryEmail: personalEmail
    });
  } catch (e) {
    const status = e?.code || e?.response?.status || null;
    if (status === 409) {
      throw new Error('Workspace account already exists for this email.');
    }
    throw e;
  }

  try {
    await EmailService.sendEmail({
      to: personalEmail,
      subject: 'Your Workspace account is ready',
      text: `Hello ${user.first_name || ''} ${user.last_name || ''},\n\n` +
        `Your new workspace account has been created.\n\n` +
        `Work email: ${workEmail}\n` +
        `Temporary password: ${tempPassword}\n\n` +
        `Please sign in and change your password as soon as possible.\n\n` +
        `If you have any questions, contact your administrator.`,
      source: 'auto',
      agencyId: agency?.id || null
    });
  } catch (emailError) {
    console.warn('Workspace credentials email failed to send:', emailError?.message || emailError);
  }

  return { workEmail, tempPasswordSent: true };
}

const normalizeAreaCodeFromPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1, 4);
  if (digits.length === 10) return digits.slice(0, 3);
  return null;
};

async function autoProvisionTwilioNumber({ user, agency }) {
  const featureFlags = parseJsonObject(agency?.feature_flags, {});
  const enabled = featureFlags.smsNumbersEnabled === true && featureFlags.smsAutoProvisionOnPrehire === true;
  if (!enabled) return { skipped: true };

  const existingAssignment = await TwilioNumberAssignment.findPrimaryForUser(user.id);
  if (existingAssignment?.number_id) return { skipped: true, reason: 'already_assigned' };

  const areaCode = normalizeAreaCodeFromPhone(user.personal_phone || user.phone_number || user.work_phone);
  let candidates = await TwilioService.searchAvailableLocalNumbers({ areaCode, country: 'US', limit: 5 });
  if (!Array.isArray(candidates) || candidates.length === 0) {
    candidates = await TwilioService.searchAvailableLocalNumbers({ country: 'US', limit: 5 });
  }
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('No available Twilio numbers found.');
  }

  const picked = candidates[0];
  const smsUrl = process.env.TWILIO_SMS_WEBHOOK_URL || null;
  const purchased = await TwilioService.purchaseNumber({
    phoneNumber: picked.phoneNumber,
    friendlyName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || null,
    smsUrl
  });

  const record = await TwilioNumber.create({
    agencyId: agency?.id || null,
    phoneNumber: purchased.phoneNumber || picked.phoneNumber,
    twilioSid: purchased.sid || null,
    friendlyName: purchased.friendlyName || null,
    capabilities: purchased.capabilities || null,
    status: 'active'
  });

  await TwilioNumberAssignment.assign({ numberId: record.id, userId: user.id, isPrimary: true });
  await User.update(user.id, { systemPhoneNumber: record.phone_number });
  return { number: record.phone_number };
}

class PendingCompletionService {
  /**
   * Check if all checklist items are completed for a pending user
   */
  static async checkAllChecklistItemsComplete(userId) {
    // Get unified checklist for user
    const checklist = await UserChecklistAssignment.getUnifiedChecklist(userId);
    
    // Check custom items
    const incompleteCustom = checklist.customItems.filter(item => !item.is_completed).length;
    
    // Check training tasks (should be none for pending users, but check anyway)
    const incompleteTraining = checklist.trainingItems.filter(item => !item.is_completed).length;
    
    // Check document tasks
    const incompleteDocuments = checklist.documentItems.filter(item => !item.is_completed).length;
    
    // Total incomplete items
    const totalIncomplete = incompleteCustom + incompleteTraining + incompleteDocuments;
    
    return {
      allComplete: totalIncomplete === 0,
      incompleteCount: totalIncomplete,
      details: {
        custom: incompleteCustom,
        training: incompleteTraining,
        documents: incompleteDocuments
      }
    };
  }

  /**
   * Get the timestamp of the last completed checklist item
   */
  static async getLastCompletionTime(userId) {
    // Get the most recent completion time from checklist items
    const [customRows] = await pool.execute(
      `SELECT MAX(completed_at) as last_completed 
       FROM user_custom_checklist_assignments 
       WHERE user_id = ? AND is_completed = TRUE`,
      [userId]
    );
    
    // Get the most recent completion time from tasks
    const [taskRows] = await pool.execute(
      `SELECT MAX(completed_at) as last_completed 
       FROM tasks 
       WHERE assigned_to_user_id = ? AND status = 'completed'`,
      [userId]
    );
    
    const customLast = customRows[0]?.last_completed ? new Date(customRows[0].last_completed) : null;
    const taskLast = taskRows[0]?.last_completed ? new Date(taskRows[0].last_completed) : null;
    
    // Return the most recent completion time
    if (!customLast && !taskLast) return null;
    if (!customLast) return taskLast;
    if (!taskLast) return customLast;
    return customLast > taskLast ? customLast : taskLast;
  }

  /**
   * Process pending completion (manual or auto)
   */
  static async processPendingCompletion(userId, isAutoComplete = false) {
    const user = await User.findById(userId);
    
    if (!user || user.status !== 'PREHIRE_OPEN') {
      throw new Error('User is not in PREHIRE_OPEN status');
    }
    
    // Verify all items are complete
    const completionCheck = await this.checkAllChecklistItemsComplete(userId);
    if (!completionCheck.allComplete) {
      throw new Error('Not all checklist items are completed');
    }
    
    const now = new Date();

    // Provision workspace account + optional SMS number before locking access
    const userAgencies = await User.getAgencies(userId);
    const agencyId = userAgencies?.[0]?.id || null;
    if (!agencyId) {
      throw new Error('User is not assigned to an organization.');
    }
    const Agency = (await import('../models/Agency.model.js')).default;
    const agency = await Agency.findById(agencyId);
    if (!agency) {
      throw new Error('Organization not found for this user.');
    }

    const workspaceProvisioning = await provisionWorkspaceAccount({ user, agency });
    let twilioProvisioning = null;
    try {
      twilioProvisioning = await autoProvisionTwilioNumber({ user, agency });
    } catch (twilioError) {
      console.warn('Twilio auto-provisioning failed:', twilioError?.message || twilioError);
    }
    
    // Update user status and lock access
    // Do NOT generate temporary password or new passwordless token
    // Status changes to PREHIRE_REVIEW, admin will promote to ONBOARDING
    await User.updateStatus(userId, 'PREHIRE_REVIEW', userId);
    await pool.execute(
      `UPDATE users 
       SET pending_completed_at = ?,
           pending_access_locked = TRUE,
           passwordless_token = NULL,
           passwordless_token_expires_at = NULL
       WHERE id = ?`,
      [now, userId]
    );
    
    // Notify admins/support
    await this.notifyPendingCompletion(userId, isAutoComplete);
    
    return {
      success: true,
      status: 'PREHIRE_REVIEW',
      completedAt: now,
      isAutoComplete,
      workspaceProvisioning,
      twilioProvisioning
    };
  }

  /**
   * Notify agency admins and support when pending user completes
   */
  static async notifyPendingCompletion(userId, isAutoComplete = false) {
    const user = await User.findById(userId);
    if (!user) return;
    
    // Get user's agencies
    const userAgencies = await User.getAgencies(userId);
    if (userAgencies.length === 0) return;
    
    // Find all admin and support users for these agencies
    const adminSupportUsers = [];
    for (const agency of userAgencies) {
      const [admins] = await pool.execute(
        `SELECT DISTINCT u.id, u.email, u.first_name, u.last_name, u.role
         FROM users u
         INNER JOIN user_agencies ua ON u.id = ua.user_id
         WHERE ua.agency_id = ?
         AND u.role IN ('admin', 'support', 'super_admin')
         AND (u.is_active = TRUE OR u.is_active IS NULL)
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)`,
        [agency.id]
      );
      adminSupportUsers.push(...admins);
    }
    
    // Remove duplicates
    const uniqueAdmins = Array.from(new Map(adminSupportUsers.map(u => [u.id, u])).values());
    
    // Create notifications for each admin/support user
    for (const admin of uniqueAdmins) {
      await Notification.create({
        type: 'pending_completed',
        severity: 'info',
        title: `Pre-Hire Process Completed${isAutoComplete ? ' (Auto)' : ''}`,
        message: `${user.first_name} ${user.last_name} (${user.email}) has completed the pre-hire process and is ready for review.`,
        userId: user.id,
        agencyId: userAgencies[0].id, // Use first agency
        relatedEntityType: 'user',
        relatedEntityId: user.id
      });
    }
    
    // Mark as notified
    await pool.execute(
      'UPDATE users SET pending_completion_notified = TRUE WHERE id = ?',
      [userId]
    );
    
    // Send email notification to user about PREHIRE_REVIEW status
    try {
      const EmailTemplateService = (await import('./emailTemplate.service.js')).default;
      const config = (await import('../config/config.js')).default;
      const Agency = (await import('../models/Agency.model.js')).default;
      
      // Get agency info for email
      let agencyName = 'Your Agency';
      let peopleOpsEmail = 'support@example.com';
      if (userAgencies.length > 0) {
        const agency = await Agency.findById(userAgencies[0].id);
        if (agency) {
          agencyName = agency.name;
          peopleOpsEmail = agency.people_ops_email || peopleOpsEmail;
        }
      }
      
      // Try to get the pre_hire_review_waiting template
      const template = await EmailTemplateService.getTemplateForAgency(
        userAgencies.length > 0 ? userAgencies[0].id : null,
        'pre_hire_review_waiting'
      );
      
      if (template && template.body) {
        const parameters = {
          FIRST_NAME: user.first_name || '',
          LAST_NAME: user.last_name || '',
          AGENCY_NAME: agencyName,
          PEOPLE_OPS_EMAIL: peopleOpsEmail
        };
        
        const rendered = EmailTemplateService.renderTemplate(template, parameters);
        // Note: Email sending would be handled by your email service
        // This template is now available for use when sending notifications
        console.log(`[PendingCompletion] PREHIRE_REVIEW email template ready for user ${userId}`);
      }
    } catch (emailErr) {
      // Don't fail the notification if email template lookup fails
      console.warn('Could not get pre_hire_review_waiting email template:', emailErr.message);
    }
  }

  /**
   * Send notification to user before auto-completion (2 hours before)
   */
  static async sendAutoCompleteNotification(userId) {
    const user = await User.findById(userId);
    if (!user || user.status !== 'PREHIRE_OPEN') return;
    
    // Get last completion time
    const lastCompletion = await this.getLastCompletionTime(userId);
    if (!lastCompletion) return;
    
    // Calculate when auto-completion will happen (24 hours after last completion)
    const autoCompleteTime = new Date(lastCompletion.getTime() + 24 * 60 * 60 * 1000);
    const now = new Date();
    const hoursUntilAutoComplete = (autoCompleteTime - now) / (1000 * 60 * 60);
    
    // Send notification if within 2 hours of auto-completion
    if (hoursUntilAutoComplete <= 2 && hoursUntilAutoComplete > 0) {
      // Create user notification (if we have a notification system for users)
      // For now, we'll just log it - can be enhanced later
      console.log(`Auto-completion notification: User ${userId} will be auto-completed in ${hoursUntilAutoComplete.toFixed(1)} hours`);
    }
  }

  /**
   * Check and auto-complete pending users who have been complete for 24 hours
   */
  static async checkAndAutoCompletePendingUsers() {
    try {
      // Find all PREHIRE_OPEN users
      const [pendingUsers] = await pool.execute(
        `SELECT id, pending_completed_at, pending_auto_complete_at 
         FROM users 
         WHERE status = 'PREHIRE_OPEN' 
         AND pending_access_locked = FALSE`,
        []
      );
      
      const now = new Date();
      const autoCompleted = [];
      
      for (const user of pendingUsers) {
        try {
          // Check if all items are complete
          const completionCheck = await this.checkAllChecklistItemsComplete(user.id);
          if (!completionCheck.allComplete) {
            continue; // Not all items complete, skip
          }
          
          // Get last completion time
          const lastCompletion = await this.getLastCompletionTime(user.id);
          if (!lastCompletion) {
            continue; // No completion time found
          }
          
          // Calculate 24 hours from last completion
          const autoCompleteTime = new Date(lastCompletion.getTime() + 24 * 60 * 60 * 1000);
          
          // Update pending_auto_complete_at if not set
          if (!user.pending_auto_complete_at) {
            await pool.execute(
              'UPDATE users SET pending_auto_complete_at = ? WHERE id = ?',
              [autoCompleteTime, user.id]
            );
          }
          
          // Check if 24 hours have passed
          if (now >= autoCompleteTime) {
            // Auto-complete the user
            await this.processPendingCompletion(user.id, true);
            autoCompleted.push(user.id);
            
            // Send notification 2 hours before (if not already sent)
            await this.sendAutoCompleteNotification(user.id);
          } else {
            // Send notification if within 2 hours
            await this.sendAutoCompleteNotification(user.id);
          }
        } catch (error) {
          console.error(`Error processing auto-completion for user ${user.id}:`, error);
          // Continue with other users
        }
      }
      
      return {
        checked: pendingUsers.length,
        autoCompleted: autoCompleted.length,
        userIds: autoCompleted
      };
    } catch (error) {
      console.error('Error in checkAndAutoCompletePendingUsers:', error);
      throw error;
    }
  }

  /**
   * Generate completion summary PDF for pending/ready_for_review users
   */
  static async generateCompletionSummary(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get unified checklist for user
    const checklist = await UserChecklistAssignment.getUnifiedChecklist(userId);

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([612, 792]); // Letter size
    const { width, height } = page.getSize();

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = height - 72;
    const margin = 72;
    const lineHeight = 20;
    const sectionSpacing = 30;

    // Title
    page.drawText('Pre-Hire Completion Summary', {
      x: margin,
      y,
      size: 24,
      font: helveticaBold,
      color: rgb(0, 0, 0)
    });
    y -= 40;

    // User info
    const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'N/A';
    page.drawText(`User: ${userName}`, {
      x: margin,
      y,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0)
    });
    y -= lineHeight;

    if (user.email) {
      page.drawText(`Email: ${user.email}`, {
        x: margin,
        y,
        size: 12,
        font: helvetica,
        color: rgb(0, 0, 0)
      });
      y -= lineHeight;
    }

    if (user.personal_email) {
      page.drawText(`Personal Email: ${user.personal_email}`, {
        x: margin,
        y,
        size: 12,
        font: helvetica,
        color: rgb(0, 0, 0)
      });
      y -= lineHeight;
    }

    page.drawText(`Generated: ${new Date().toLocaleString()}`, {
      x: margin,
      y,
      size: 10,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5)
    });
    y -= sectionSpacing;

    // Custom Checklist Items
    if (checklist.customItems && checklist.customItems.length > 0) {
      if (y < 100) {
        page = pdfDoc.addPage([612, 792]);
        y = height - 72;
      }

      page.drawText('Custom Checklist Items', {
        x: margin,
        y,
        size: 16,
        font: helveticaBold,
        color: rgb(0, 0, 0)
      });
      y -= lineHeight * 1.5;

      for (const item of checklist.customItems) {
        if (y < 100) {
          page = pdfDoc.addPage([612, 792]);
          y = height - 72;
        }

        const status = item.is_completed ? '✓ Completed' : '○ Pending';
        const statusColor = item.is_completed ? rgb(0, 0.6, 0) : rgb(0.8, 0.8, 0);
        
        page.drawText(`${status} - ${item.name || item.title || 'Untitled Item'}`, {
          x: margin,
          y,
          size: 11,
          font: helvetica,
          color: statusColor
        });
        y -= lineHeight;

        if (item.description) {
          const description = item.description.substring(0, 80) + (item.description.length > 80 ? '...' : '');
          page.drawText(`  ${description}`, {
            x: margin + 20,
            y,
            size: 10,
            font: helvetica,
            color: rgb(0.4, 0.4, 0.4)
          });
          y -= lineHeight;
        }

        if (item.completed_at) {
          page.drawText(`  Completed: ${new Date(item.completed_at).toLocaleString()}`, {
            x: margin + 20,
            y,
            size: 9,
            font: helvetica,
            color: rgb(0.5, 0.5, 0.5)
          });
          y -= lineHeight;
        }

        y -= 5; // Spacing between items
      }
      y -= sectionSpacing;
    }

    // Document Tasks
    if (checklist.documentItems && checklist.documentItems.length > 0) {
      if (y < 100) {
        page = pdfDoc.addPage([612, 792]);
        y = height - 72;
      }

      page.drawText('Document Tasks', {
        x: margin,
        y,
        size: 16,
        font: helveticaBold,
        color: rgb(0, 0, 0)
      });
      y -= lineHeight * 1.5;

      for (const item of checklist.documentItems) {
        if (y < 100) {
          page = pdfDoc.addPage([612, 792]);
          y = height - 72;
        }

        const status = item.is_completed ? '✓ Completed' : '○ Pending';
        const statusColor = item.is_completed ? rgb(0, 0.6, 0) : rgb(0.8, 0.8, 0);
        
        page.drawText(`${status} - ${item.name || item.title || 'Untitled Document'}`, {
          x: margin,
          y,
          size: 11,
          font: helvetica,
          color: statusColor
        });
        y -= lineHeight;

        if (item.due_date) {
          const dueDate = new Date(item.due_date);
          const isOverdue = !item.is_completed && dueDate < new Date();
          page.drawText(`  Due: ${dueDate.toLocaleDateString()}${isOverdue ? ' (OVERDUE)' : ''}`, {
            x: margin + 20,
            y,
            size: 10,
            font: helvetica,
            color: isOverdue ? rgb(0.8, 0, 0) : rgb(0.4, 0.4, 0.4)
          });
          y -= lineHeight;
        }

        if (item.completed_at) {
          page.drawText(`  Completed: ${new Date(item.completed_at).toLocaleString()}`, {
            x: margin + 20,
            y,
            size: 9,
            font: helvetica,
            color: rgb(0.5, 0.5, 0.5)
          });
          y -= lineHeight;
        }

        y -= 5; // Spacing between items
      }
      y -= sectionSpacing;
    }

    // Summary
    if (y < 100) {
      page = pdfDoc.addPage([612, 792]);
      y = height - 72;
    }

    const totalItems = (checklist.customItems?.length || 0) + (checklist.documentItems?.length || 0);
    const completedItems = (checklist.customItems?.filter(i => i.is_completed).length || 0) + 
                          (checklist.documentItems?.filter(i => i.is_completed).length || 0);
    const completionPercentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 100;

    page.drawText('Summary', {
      x: margin,
      y,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0)
    });
    y -= lineHeight * 1.5;

    page.drawText(`Total Items: ${totalItems}`, {
      x: margin,
      y,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0)
    });
    y -= lineHeight;

    page.drawText(`Completed: ${completedItems}`, {
      x: margin,
      y,
      size: 12,
      font: helvetica,
      color: rgb(0, 0.6, 0)
    });
    y -= lineHeight;

    page.drawText(`Completion: ${completionPercentage}%`, {
      x: margin,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0)
    });
    y -= lineHeight;

    if (user.pending_completed_at) {
      page.drawText(`Completed At: ${new Date(user.pending_completed_at).toLocaleString()}`, {
        x: margin,
        y,
        size: 10,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5)
      });
    }

    // Save and return PDF bytes
    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
  }
}

export default PendingCompletionService;
