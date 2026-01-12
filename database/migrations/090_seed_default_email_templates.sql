-- Migration: Seed default email templates as platform templates
-- File: 090_seed_default_email_templates.sql
-- Description:
-- Inserts default lifecycle email templates for the platform.
-- Platform templates are identified by: agency_id IS NULL AND platform_branding_id IS NOT NULL.

SET @platform_branding_id = (SELECT id FROM platform_branding ORDER BY id DESC LIMIT 1);

-- Safety check (optional): if platform branding isn't present, fail fast by inserting nothing.
-- (MySQL doesn't support THROW easily; so we rely on @platform_branding_id being non-null.)

/*
Idempotency strategy (since unique constraints were removed in migration 088):
- Delete existing platform templates by type (only for the types we are inserting below),
  then insert fresh rows.
*/

DELETE FROM email_templates
WHERE agency_id IS NULL
  AND platform_branding_id = @platform_branding_id
  AND type IN (
    'pending_welcome',
    'onboarding_portal_welcome',
    'password_expired_pre_activation',
    'admin_initiated_password_reset',

    'pre_hire_admin_review_access',
    'pre_hire_role_ack_request',
    'pre_hire_authorization_request',
    'pre_hire_hold_status',
    'pre_hire_not_moving_forward',
    'pre_hire_review_waiting',

    'conditional_offer_warm',
    'conditional_offer_formal',

    'onboarding_opening_soon',
    'onboarding_incomplete_nudge',
    'onboarding_complete_confirmation',

    'internal_pre_hire_access_issued',
    'internal_pre_hire_materials_submitted',
    'internal_background_check_initiated',
    'internal_pre_hire_review_complete'
  );

INSERT INTO email_templates
  (name, type, subject, body, agency_id, platform_branding_id, created_by_user_id)
VALUES

-- =========================================================
-- PENDING SETUP (NEW USER CREATION - PENDING_SETUP STATUS)
-- =========================================================
(
  'Pending Welcome: Initial Account Setup',
  'pending_welcome',
  'Welcome to {{AGENCY_NAME}} — Complete Your Account Setup',
  'Hello {{FIRST_NAME}},\n\nWelcome to {{AGENCY_NAME}}! We''re excited to have you join our team.\n\nTo get started, please complete your account setup by creating your password using the secure link below:\n\n{{PORTAL_LOGIN_LINK}}\n\nThis link will allow you to:\n- Set your password\n- Access your pre-hire portal\n- Begin completing required pre-hire materials\n\n**Important:** This link will expire in 7 days. Please complete your account setup as soon as possible.\n\nIf you have any questions or need assistance, please contact {{TERMINOLOGY_SETTINGS}} at {{PEOPLE_OPS_EMAIL}}.\n\nWe look forward to working with you!\n\nBest regards,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),

-- =========================================================
-- ONBOARDING (WELCOME + DEADLINES + CREDENTIALS)
-- =========================================================
(
  'Onboarding Welcome: Portal Access + Deadlines',
  'onboarding_portal_welcome',
  'Welcome to {{AGENCY_NAME}} — Your Onboarding Portal Access',
  'Hello {{FIRST_NAME}},\n\nWelcome to {{AGENCY_NAME}}! We’re glad to have you joining our team.\n\nThis email provides access to your **Onboarding & Training Portal**, which will guide you through the required steps for onboarding, training, and initial documentation.\n\n### Portal Access\n\nYou may access the portal using **either** of the options below:\n\n**Option 1: Secure Login Link**\n{{PORTAL_LOGIN_LINK}}\n\n**Option 2: Manual Login**\n- **Portal URL:** {{PORTAL_URL}}\n- **Username:** {{USERNAME}}\n\n> For security purposes, you will be prompted to create a new password upon first login.\n\n### What This Portal Includes\n\nThe onboarding portal is your central location for onboarding-related items only. You can expect to find:\n\n- **Your onboarding checklist**\n  Assigned tasks, required forms, and completion tracking\n- **Training materials**\n  Training focuses, modules, videos, and required acknowledgments\n- **Required documents**\n  Policies, guides, and materials you are expected to review\n- **Status visibility**\n  Clear indicators of what is complete, pending, or upcoming\n\nThis portal is used **specifically for onboarding and training** and is separate from other internal systems you may use later.\n\n### Important Deadlines\n\nPlease note the following required completion deadlines:\n\n- **Onboarding documents due by:** {{DOCUMENT_DEADLINE}}\n- **Required trainings due by:** {{TRAINING_DEADLINE}}\n\nSome items must be completed **before** you can begin certain work activities. Missing deadlines may delay your start or access.\n\n### Questions or Support\n\nIf you have any questions, run into access issues, or are unsure how to complete a task, please reach out to:\n\n**{{TERMINOLOGY_SETTINGS}}**\n📧 {{PEOPLE_OPS_EMAIL}}\n\nWe ask that onboarding-related questions go through {{TERMINOLOGY_SETTINGS}} rather than individual staff, as this helps us respond more efficiently and consistently.\n\nWe’re looking forward to working with you and supporting your onboarding process.\n\nWelcome to {{AGENCY_NAME}},\n**{{SENDER_NAME}}**\n**{{TERMINOLOGY_SETTINGS}}**\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),

-- =========================================================
-- CREDENTIAL / ACCESS SUPPORT
-- =========================================================
(
  'Password Expired: Pre-Login Reissue',
  'password_expired_pre_activation',
  'New Portal Login Credentials',
  'Hello {{FIRST_NAME}},\n\nYour previous temporary portal password has expired, so we’ve issued new access details.\n\n**Primary option (recommended):**\nClick here to access the portal and set your password:\n{{RESET_TOKEN_LINK}}\n\n**Alternate option:**\n- **Portal URL:** {{PORTAL_URL}}\n- **Username:** {{USERNAME}}\n\nPlease set a new password once logged in.\n\nIf you have questions or need assistance, contact {{TERMINOLOGY_SETTINGS}} at {{PEOPLE_OPS_EMAIL}}.\n\nBest,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Admin-Initiated Password Reset',
  'admin_initiated_password_reset',
  'Updated Portal Access',
  'Hello {{FIRST_NAME}},\n\nPer your request, we’ve reset your onboarding portal access.\n\n**Primary option (recommended):**\nClick here to access and reset your password:\n{{RESET_TOKEN_LINK}}\n\n**Alternate option:**\n- **Portal URL:** {{PORTAL_URL}}\n- **Username:** {{USERNAME}}\n\nYou’ll be prompted to set a new password after logging in.\n\nIf you need help, feel free to reply to this message.\n\n—\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),

-- =========================================================
-- PRE-HIRE (NO OFFER YET)
-- =========================================================
(
  'Pre-Hire: Admin Review Access (No Offer)',
  'pre_hire_admin_review_access',
  'Next Steps — Pre-Hire Review with {{AGENCY_NAME}}',
  'Hello {{FIRST_NAME}},\n\nThank you for your continued interest in {{AGENCY_NAME}}.\n\nAs part of our pre-hire review process, we are requesting completion of a brief set of administrative items. These materials are used solely to support internal review and do not constitute an offer of employment.\n\nPlease access your **Pre-Hire Portal** using the secure link below:\n\n{{PORTAL_LOGIN_LINK}}\n\nWithin the portal, you will be asked to:\n- Acknowledge the job description\n- Complete required releases and reference information\n- Submit information necessary for a background check\n\nOnce submitted, our team will review the materials and follow up with you as appropriate.\n\nIf you have questions or encounter issues accessing the portal, please contact {{TERMINOLOGY_SETTINGS}} at {{PEOPLE_OPS_EMAIL}}.\n\nBest regards,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Pre-Hire: Job Description Acknowledgement Only',
  'pre_hire_role_ack_request',
  'Role Acknowledgement Request — {{AGENCY_NAME}}',
  'Hello {{FIRST_NAME}},\n\nAs part of our review process, we ask all candidates to formally acknowledge the role description before moving forward.\n\nPlease use the secure link below to review and acknowledge the job description associated with this position:\n\n{{PORTAL_LOGIN_LINK}}\n\nThis step helps ensure role clarity and alignment before any further consideration. Completion of this item does not represent an offer of employment.\n\nIf you have questions, feel free to reach out to {{TERMINOLOGY_SETTINGS}}.\n\nThank you,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Pre-Hire: Authorization Request (Background + References)',
  'pre_hire_authorization_request',
  'Authorization Request — Background Check & References',
  'Hello {{FIRST_NAME}},\n\nAs part of our internal screening process, we are requesting authorization to conduct a background check and contact references.\n\nPlease access the secure portal below to complete the required authorization forms:\n\n{{PORTAL_LOGIN_LINK}}\n\nThese materials are used solely for evaluation purposes and do not indicate an offer or guarantee of employment. We will notify you if additional information is needed.\n\nIf you experience any issues or have questions, contact {{TERMINOLOGY_SETTINGS}} at {{PEOPLE_OPS_EMAIL}}.\n\nSincerely,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Pre-Hire: Hold Status (Candidate-Facing)',
  'pre_hire_hold_status',
  'Update on Your Status with {{AGENCY_NAME}}',
  'Hello {{FIRST_NAME}},\n\nWe wanted to provide a brief update regarding your status with {{AGENCY_NAME}}.\n\nAt this time, your application has been placed on hold while we complete internal review and coordination. This does not require any action from you right now.\n\nWe appreciate your patience and will reach out if additional information is needed or once we are ready to proceed.\n\nThank you for your interest in {{AGENCY_NAME}}.\n\nKind regards,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Pre-Hire: Not Moving Forward (Candidate-Facing)',
  'pre_hire_not_moving_forward',
  'Update Regarding Your Application with {{AGENCY_NAME}}',
  'Hello {{FIRST_NAME}},\n\nThank you for your time and for completing the requested pre-hire materials.\n\nAt this time, we will not be moving forward to the next stage of the process. This decision is based on internal considerations and does not reflect a single factor or submission.\n\nWe appreciate your interest in {{AGENCY_NAME}} and wish you the best in your future endeavors.\n\nKind regards,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Pre-Hire: Waiting for Review (PREHIRE_REVIEW Status)',
  'pre_hire_review_waiting',
  'Pre-Hire Materials Submitted — Awaiting Review',
  'Hello {{FIRST_NAME}},\n\nThank you for completing all required pre-hire materials with {{AGENCY_NAME}}.\n\nYour submission has been received and is now being reviewed by our team. This review process typically takes a few business days.\n\n**What happens next:**\n- Our team will review your submitted materials\n- We will contact your references\n- A background check will be initiated if applicable\n- You will be notified once the review is complete\n\n**Your access:**\nYour portal access has been temporarily locked during this review period. You will receive an email notification once your account is activated and you can proceed to the next steps.\n\nIf you have any questions or need to provide additional information, please contact {{TERMINOLOGY_SETTINGS}} at {{PEOPLE_OPS_EMAIL}}.\n\nThank you for your patience during this process.\n\nBest regards,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),

-- =========================================================
-- CONDITIONAL OFFER (OPTIONAL PATH)
-- =========================================================
(
  'Conditional Offer (Warm Variant)',
  'conditional_offer_warm',
  'Next Steps with {{AGENCY_NAME}}',
  'Hello {{FIRST_NAME}},\n\nWe truly enjoyed getting to know you throughout the interview process and appreciate the time and thought you brought to our conversations. Based on our discussions, we believe you would be a great addition to the {{AGENCY_NAME}} team.\n\nTo move forward, we’ve provided access to your **Pre-Hire Portal** using the secure link below:\n\n{{PORTAL_LOGIN_LINK}}\n\nWithin the portal, you’ll find your **Conditional Employment Agreement** and a brief **pre-hire checklist**. This offer is contingent upon the successful completion of required references and a background check.\n\nOnce you’ve completed the checklist and submitted it for review:\n- Our team will contact your references\n- We will initiate the background check\n- We’ll follow up with you if anything further is needed\n\nAfter this review is complete, you will be provided with a **final, fully signed copy of your employment agreement**, which will be available through our {{TERMINOLOGY_SETTINGS}} website and your workspace.\n\nWe’re excited about the possibility of working together and look forward to the next steps.\n\nWarm regards,\n{{SENDER_NAME}}\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Conditional Offer (Formal Variant)',
  'conditional_offer_formal',
  'Conditional Employment Offer – {{AGENCY_NAME}}',
  'Hello {{FIRST_NAME}},\n\nThank you again for your interest in {{AGENCY_NAME}} and for participating in our interview process. We appreciate the opportunity to learn more about your background and experience.\n\nWe are pleased to extend a **conditional offer of employment**, pending completion of required references and a background check.\n\nPlease access your **Pre-Hire Portal** using the secure link below to review your Conditional Employment Agreement and complete the pre-hire requirements:\n\n{{PORTAL_LOGIN_LINK}}\n\nOnce your pre-hire checklist is submitted:\n- References will be contacted\n- A background check will be initiated\n- You will be notified of any additional steps\n\nUpon successful completion, a final signed employment agreement will be issued and made available through your workspace and the {{TERMINOLOGY_SETTINGS}} site.\n\nWe appreciate your time and look forward to moving ahead.\n\nSincerely,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),

-- =========================================================
-- ONBOARDING (LIGHTWEIGHT LIFECYCLE EMAILS)
-- =========================================================
(
  'Onboarding Heads-Up: Opening Soon',
  'onboarding_opening_soon',
  'Your Onboarding Will Begin Soon',
  'Hello {{FIRST_NAME}},\n\nWe wanted to give you a quick heads-up that your onboarding access will be opening shortly.\n\nOnce activated, you’ll receive an email with:\n- Your onboarding portal access\n- Required training and documents\n- Key deadlines and next steps\n\nWe recommend keeping an eye on your inbox so you can get started promptly.\n\nLooking forward to working with you,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Onboarding Reminder: Incomplete Items',
  'onboarding_incomplete_nudge',
  'Quick Check-In',
  'Hello {{FIRST_NAME}},\n\nWe’re checking in regarding your {{AGENCY_NAME}} portal access. It looks like there are still a few items waiting for completion.\n\nYou can return to your portal anytime using the link below:\n{{PORTAL_LOGIN_LINK}}\n\nIf you have questions or ran into any issues, {{TERMINOLOGY_SETTINGS}} is happy to help.\n\nBest,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Onboarding Completion Confirmation',
  'onboarding_complete_confirmation',
  'Onboarding Complete — Welcome Aboard',
  'Hello {{FIRST_NAME}},\n\nCongratulations — you’ve completed your onboarding requirements with {{AGENCY_NAME}}.\n\nYour account is now fully active, and you’ll have continued access to relevant training materials and documents through your workspace and the {{TERMINOLOGY_SETTINGS}} site.\n\nWe’re glad to have you on board and look forward to working together.\n\nWelcome again,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),

-- =========================================================
-- INTERNAL-ONLY ADMIN NOTIFICATIONS
-- =========================================================
(
  'Internal: Pre-Hire Access Issued',
  'internal_pre_hire_access_issued',
  'Pre-Hire Portal Access Issued — {{FIRST_NAME}}',
  'Pre-hire portal access has been issued for the following individual:\n\n- Name: {{FIRST_NAME}} {{LAST_NAME}}\n- Agency: {{AGENCY_NAME}}\n- Status: Pre-Hire (Administrative Review)\n- Items Requested: Job description acknowledgement, references, releases, background check authorization\n\nThe candidate has been provided a secure token link and may begin completing pre-hire materials.\n\nNo offer of employment has been extended at this stage.\n\n—\nSystem Notification\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Internal: Pre-Hire Materials Submitted',
  'internal_pre_hire_materials_submitted',
  'Pre-Hire Materials Submitted — {{FIRST_NAME}}',
  'Pre-hire materials have been submitted and are ready for review.\n\n- Name: {{FIRST_NAME}} {{LAST_NAME}}\n- Agency: {{AGENCY_NAME}}\n- Submitted Items: {{SUBMITTED_ITEMS}}\n- Next Steps: Reference checks and background check initiation\n\nPlease review and proceed with the appropriate next steps. Follow-up with the candidate only if additional information is required.\n\n—\nSystem Notification\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Internal: Background Check Initiated',
  'internal_background_check_initiated',
  'Background Check Initiated — {{FIRST_NAME}}',
  'A background check has been initiated for the following individual:\n\n- Name: {{FIRST_NAME}} {{LAST_NAME}}\n- Agency: {{AGENCY_NAME}}\n- Initiated By: {{INITIATED_BY}}\n- Date: {{DATE_INITIATED}}\n\nThis notification is for tracking purposes only. No action is required unless follow-up is needed.\n\n—\nSystem Notification\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Internal: Pre-Hire Review Complete',
  'internal_pre_hire_review_complete',
  'Pre-Hire Review Complete — {{FIRST_NAME}}',
  'The pre-hire review process has been completed for the following individual:\n\n- Name: {{FIRST_NAME}} {{LAST_NAME}}\n- Agency: {{AGENCY_NAME}}\n- Outcome: {{REVIEW_OUTCOME}}\n- Notes: {{INTERNAL_NOTES}}\n\nPlease proceed according to the determined next step (offer, onboarding, hold, or close).\n\n—\nSystem Notification\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
);

-- End migration
