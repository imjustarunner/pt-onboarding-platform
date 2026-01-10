import pool from '../config/database.js';
import User from '../models/User.model.js';
import Notification from '../models/Notification.model.js';
import UserChecklistAssignment from '../models/UserChecklistAssignment.model.js';
import Task from '../models/Task.model.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

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
    
    if (!user || user.status !== 'pending') {
      throw new Error('User is not in pending status');
    }
    
    // Verify all items are complete
    const completionCheck = await this.checkAllChecklistItemsComplete(userId);
    if (!completionCheck.allComplete) {
      throw new Error('Not all checklist items are completed');
    }
    
    const now = new Date();
    
    // Update user status and lock access
    // Do NOT generate temporary password or new passwordless token
    // Status changes to ready_for_review, admin will input work email and move to active
    await pool.execute(
      `UPDATE users 
       SET status = 'ready_for_review',
           pending_completed_at = ?,
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
      status: 'ready_for_review',
      completedAt: now,
      isAutoComplete
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
  }

  /**
   * Send notification to user before auto-completion (2 hours before)
   */
  static async sendAutoCompleteNotification(userId) {
    const user = await User.findById(userId);
    if (!user || user.status !== 'pending') return;
    
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
      // Find all pending users
      const [pendingUsers] = await pool.execute(
        `SELECT id, pending_completed_at, pending_auto_complete_at 
         FROM users 
         WHERE status = 'pending' 
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
