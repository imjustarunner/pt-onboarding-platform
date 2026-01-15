# Communication Logging Integration Guide

## Overview

The system is now set up to log all communications (emails and SMS) to the `user_communications` table. This includes tracking delivery status, external message IDs, and metadata from API providers.

## Database Schema

The `user_communications` table includes the following fields for API integration:

- `channel` - ENUM('email', 'sms') - Communication channel type
- `recipient_address` - VARCHAR(255) - Email address or phone number
- `delivery_status` - ENUM('pending', 'sent', 'delivered', 'failed', 'bounced', 'undelivered') - Current delivery status
- `external_message_id` - VARCHAR(255) - Message ID from email/SMS provider (for webhook tracking)
- `sent_at` - TIMESTAMP - When message was actually sent via API
- `delivered_at` - TIMESTAMP - When delivery was confirmed
- `error_message` - TEXT - Error message if delivery failed
- `metadata` - JSON - Additional metadata from API (webhook data, provider-specific info)

## Current Implementation

### 1. Email Generation Logging

Emails are automatically logged when generated in:
- `POST /api/auth/register` - Logs pending welcome emails
- `POST /api/users/:id/move-to-active` - Logs welcome active emails

**Status:** ✅ Implemented - Emails are logged with `delivery_status = 'pending'` when generated.

### 2. Communication Logging Service

A new service `CommunicationLoggingService` provides helper methods:

- `logGeneratedCommunication()` - Log when communication is generated
- `markAsSent()` - Update status when sent via API
- `markAsDelivered()` - Update status when delivery confirmed (webhook)
- `markAsFailed()` - Update status when delivery fails
- `findByExternalMessageId()` - Find communication by provider message ID

## Integration Steps for Email API

When you integrate an email API (e.g., SendGrid, AWS SES, Gmail API), follow these steps:

### Step 1: Send Email and Log

```javascript
import CommunicationLoggingService from '../services/communicationLogging.service.js';

// After generating email content
const communication = await CommunicationLoggingService.logGeneratedCommunication({
  userId: user.id,
  agencyId: agency.id,
  templateType: 'user_welcome',
  templateId: template.id,
  subject: emailSubject,
  body: emailBody,
  generatedByUserId: req.user.id,
  channel: 'email',
  recipientAddress: user.email
});

// Send via email API
const emailResponse = await emailApi.send({
  to: user.email,
  subject: emailSubject,
  body: emailBody
});

// Update status to 'sent' with external message ID
await CommunicationLoggingService.markAsSent(
  communication.id,
  emailResponse.messageId, // From email provider
  { provider: 'sendgrid', response: emailResponse } // Metadata
);
```

### Step 2: Set Up Webhook Handler

Create a webhook endpoint to receive delivery status updates:

```javascript
// POST /api/communications/webhooks/email
export const emailWebhook = async (req, res, next) => {
  try {
    const { messageId, status, error } = req.body; // Adjust based on your provider
    
    if (status === 'delivered') {
      await CommunicationLoggingService.markAsDelivered(messageId, req.body);
    } else if (status === 'bounced' || status === 'failed') {
      await CommunicationLoggingService.markAsFailed(
        messageId,
        error || 'Delivery failed',
        status === 'bounced' ? 'bounced' : 'failed',
        req.body
      );
    }
    
    res.json({ received: true });
  } catch (error) {
    next(error);
  }
};
```

## Integration Steps for SMS API

When you integrate an SMS API (e.g., Twilio), follow these steps:

### Step 1: Send SMS and Log

```javascript
import CommunicationLoggingService from '../services/communicationLogging.service.js';

// After generating SMS content
const communication = await CommunicationLoggingService.logGeneratedCommunication({
  userId: user.id,
  agencyId: agency.id,
  templateType: 'password_reset',
  templateId: null,
  subject: null, // SMS doesn't have subjects
  body: smsBody,
  generatedByUserId: req.user.id,
  channel: 'sms',
  recipientAddress: user.personal_phone || user.phone_number
});

// Send via SMS API
const smsResponse = await twilioClient.messages.create({
  to: user.personal_phone,
  from: systemPhoneNumber,
  body: smsBody
});

// Update status to 'sent' with external message ID
await CommunicationLoggingService.markAsSent(
  communication.id,
  smsResponse.sid, // Twilio message SID
  { provider: 'twilio', response: smsResponse } // Metadata
);
```

### Step 2: Set Up SMS Webhook Handler

```javascript
// POST /api/communications/webhooks/sms
export const smsWebhook = async (req, res, next) => {
  try {
    const { MessageSid, MessageStatus, ErrorMessage } = req.body; // Twilio format
    
    if (MessageStatus === 'delivered') {
      await CommunicationLoggingService.markAsDelivered(MessageSid, req.body);
    } else if (MessageStatus === 'failed' || MessageStatus === 'undelivered') {
      await CommunicationLoggingService.markAsFailed(
        MessageSid,
        ErrorMessage || 'SMS delivery failed',
        'undelivered',
        req.body
      );
    }
    
    res.json({ received: true });
  } catch (error) {
    next(error);
  }
};
```

## Viewing Communications

All logged communications are visible in:
- User Profile → Communications Tab
- Filterable by agency and template type
- Shows delivery status, timestamps, and metadata

## Migration

Run the migration to add the new fields:

```bash
# Migration file: 107_add_communication_api_fields.sql
# This adds: channel, recipient_address, delivery_status, external_message_id, 
#            sent_at, delivered_at, error_message, metadata
```

## Notes

- Communications are logged with `delivery_status = 'pending'` when generated
- Status is updated to `'sent'` when API confirms sending
- Status is updated to `'delivered'` when webhook confirms delivery
- Status is updated to `'failed'`/`'bounced'`/`'undelivered'` on failure
- The `external_message_id` is used to link webhook events to logged communications
- Metadata field stores provider-specific information (JSON format)
