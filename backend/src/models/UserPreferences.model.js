import db from '../config/database.js';

class UserPreferences {
  /**
   * Find preferences by user ID
   * @param {number} userId - User ID
   * @returns {Promise<Object|null>} User preferences or null if not found
   */
  static async findByUserId(userId) {
    try {
      const [rows] = await db.execute(
        'SELECT * FROM user_preferences WHERE user_id = ?',
        [userId]
      );
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      console.error('Error finding user preferences:', error);
      throw error;
    }
  }

  /**
   * Create or update user preferences
   * @param {number} userId - User ID
   * @param {Object} preferences - Preferences data
   * @returns {Promise<Object>} Created or updated preferences
   */
  static async update(userId, preferences) {
    try {
      // Check if preferences exist
      const existing = await this.findByUserId(userId);

      if (existing) {
        // Update existing preferences
        const fields = [];
        const values = [];

        // Build update query dynamically
        const allowedFields = [
          'email_enabled', 'sms_enabled', 'in_app_enabled',
          'quiet_hours_enabled', 'quiet_hours_allowed_days', 'quiet_hours_start_time', 'quiet_hours_end_time',
          'auto_reply_enabled', 'auto_reply_message',
          'emergency_override',
          'notification_categories',
          'dashboard_notification_org_types',
          'work_modality', 'scheduling_preferences',
          'show_read_receipts', 'allow_staff_step_in', 'staff_step_in_after_minutes',
          'show_full_name_on_schedules', 'show_initials_only_on_boards', 'allow_name_in_pdfs',
          'reduced_motion', 'high_contrast_mode', 'larger_text', 'default_landing_page'
        ];

        for (const field of allowedFields) {
          if (field in preferences) {
            fields.push(`${field} = ?`);
            // Handle JSON fields
            if (field === 'quiet_hours_allowed_days' || field === 'notification_categories' || field === 'scheduling_preferences' || field === 'dashboard_notification_org_types') {
              values.push(JSON.stringify(preferences[field]));
            } else {
              values.push(preferences[field]);
            }
          }
        }

        if (fields.length === 0) {
          return existing;
        }

        values.push(userId);

        const [result] = await db.execute(
          `UPDATE user_preferences SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
          values
        );

        return await this.findByUserId(userId);
      } else {
        // Create new preferences
        const fields = ['user_id'];
        const placeholders = ['?'];
        const values = [userId];

        const allowedFields = [
          'email_enabled', 'sms_enabled', 'in_app_enabled',
          'quiet_hours_enabled', 'quiet_hours_allowed_days', 'quiet_hours_start_time', 'quiet_hours_end_time',
          'auto_reply_enabled', 'auto_reply_message',
          'emergency_override',
          'notification_categories',
          'dashboard_notification_org_types',
          'work_modality', 'scheduling_preferences',
          'show_read_receipts', 'allow_staff_step_in', 'staff_step_in_after_minutes',
          'show_full_name_on_schedules', 'show_initials_only_on_boards', 'allow_name_in_pdfs',
          'reduced_motion', 'high_contrast_mode', 'larger_text', 'default_landing_page'
        ];

        for (const field of allowedFields) {
          if (field in preferences) {
            fields.push(field);
            placeholders.push('?');
            // Handle JSON fields
            if (field === 'quiet_hours_allowed_days' || field === 'notification_categories' || field === 'scheduling_preferences' || field === 'dashboard_notification_org_types') {
              values.push(JSON.stringify(preferences[field]));
            } else {
              values.push(preferences[field]);
            }
          }
        }

        await db.execute(
          `INSERT INTO user_preferences (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`,
          values
        );

        return await this.findByUserId(userId);
      }
    } catch (error) {
      console.error('Error updating user preferences:', error);
      throw error;
    }
  }
}

export default UserPreferences;
