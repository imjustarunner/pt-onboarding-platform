/**
 * Communication Logging Service
 * 
 * This service handles logging of communications (email and SMS) to the user_communications table.
 * It's designed to work with external APIs (email providers, SMS providers like Twilio) and
 * tracks delivery status, message IDs, and metadata.
 * 
 * Usage:
 * 1. When generating a communication (before sending), log it with status 'pending'
 * 2. When sending via API, update status to 'sent' and store external_message_id
 * 3. When delivery is confirmed (via webhook), update status to 'delivered' and set delivered_at
 * 4. If delivery fails, update status to 'failed'/'bounced'/'undelivered' and store error_message
 */

import UserCommunication from '../models/UserCommunication.model.js';

class CommunicationLoggingService {
  /**
   * Log a communication when it's generated (before sending via API)
   * @param {Object} params
   * @param {number} params.userId - User who will receive the communication
   * @param {number} params.agencyId - Agency context
   * @param {string} params.templateType - Type of template (e.g., 'user_welcome', 'password_reset')
   * @param {number|null} params.templateId - Template ID if available
   * @param {string|null} params.subject - Email subject (null for SMS)
   * @param {string} params.body - Message body
   * @param {number} params.generatedByUserId - Admin/user who generated this
   * @param {string} params.channel - 'email' or 'sms'
   * @param {string|null} params.recipientAddress - Email address or phone number
   * @returns {Promise<Object>} Created communication record
   */
  static async logGeneratedCommunication(params) {
    const {
      userId,
      agencyId,
      templateType,
      templateId = null,
      subject = null,
      body,
      generatedByUserId,
      channel = 'email',
      recipientAddress = null
    } = params;

    return await UserCommunication.create({
      userId,
      agencyId,
      templateType,
      templateId,
      subject,
      body,
      generatedByUserId,
      channel,
      recipientAddress,
      deliveryStatus: 'pending'
    });
  }

  /**
   * Update communication status when sent via API
   * @param {number} communicationId - ID of the communication record
   * @param {string} externalMessageId - Message ID from email/SMS provider
   * @param {Object|null} metadata - Additional metadata from API response
   * @returns {Promise<Object>} Updated communication record
   */
  static async markAsSent(communicationId, externalMessageId, metadata = null) {
    return await UserCommunication.updateDeliveryStatus(
      communicationId,
      'sent',
      externalMessageId,
      null, // deliveredAt - not yet delivered
      null, // errorMessage
      metadata
    );
  }

  /**
   * Update communication status when delivery is confirmed (via webhook)
   * @param {string} externalMessageId - Message ID from provider
   * @param {Object|null} metadata - Additional metadata from webhook
   * @returns {Promise<Object|null>} Updated communication record or null if not found
   */
  static async markAsDelivered(externalMessageId, metadata = null) {
    const pool = (await import('../config/database.js')).default;
    const [rows] = await pool.execute(
      'SELECT id FROM user_communications WHERE external_message_id = ?',
      [externalMessageId]
    );

    if (rows.length === 0) {
      console.warn(`Communication with external_message_id ${externalMessageId} not found`);
      return null;
    }

    return await UserCommunication.updateDeliveryStatus(
      rows[0].id,
      'delivered',
      null, // externalMessageId - already set
      new Date(), // deliveredAt
      null, // errorMessage
      metadata
    );
  }

  /**
   * Update communication status when delivery fails
   * @param {string} externalMessageId - Message ID from provider
   * @param {string} errorMessage - Error message from provider
   * @param {string} failureType - 'failed', 'bounced', or 'undelivered'
   * @param {Object|null} metadata - Additional metadata from webhook
   * @returns {Promise<Object|null>} Updated communication record or null if not found
   */
  static async markAsFailed(externalMessageId, errorMessage, failureType = 'failed', metadata = null) {
    const pool = (await import('../config/database.js')).default;
    const [rows] = await pool.execute(
      'SELECT id FROM user_communications WHERE external_message_id = ?',
      [externalMessageId]
    );

    if (rows.length === 0) {
      console.warn(`Communication with external_message_id ${externalMessageId} not found`);
      return null;
    }

    return await UserCommunication.updateDeliveryStatus(
      rows[0].id,
      failureType, // 'failed', 'bounced', or 'undelivered'
      null, // externalMessageId - already set
      null, // deliveredAt
      errorMessage,
      metadata
    );
  }

  /**
   * Find communication by external message ID (for webhook handlers)
   * @param {string} externalMessageId - Message ID from provider
   * @returns {Promise<Object|null>} Communication record or null
   */
  static async findByExternalMessageId(externalMessageId) {
    const pool = (await import('../config/database.js')).default;
    const [rows] = await pool.execute(
      'SELECT * FROM user_communications WHERE external_message_id = ?',
      [externalMessageId]
    );
    return rows[0] || null;
  }
}

export default CommunicationLoggingService;
