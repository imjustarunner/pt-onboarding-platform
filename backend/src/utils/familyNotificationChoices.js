export const FAMILY_CHOICE_VERSION='2026-10-20.1';
export const FAMILY_NOTIFICATION_CATEGORIES=[
  {key:'appointments',label:'Appointment reminders',detail:'Office and online appointments'},
  {key:'schedule_changes',label:'Schedule changes',detail:'Cancellations, reschedules and appointment updates'},
  {key:'school_sessions',label:'In-school sessions',detail:'School session notices for this child'},
  {key:'messages',label:'Secure-message alerts',detail:'A notice to sign in and read a new message'},
  {key:'documents',label:'Forms and documents',detail:'Releases, treatment plans, signatures and completed copies'},
  {key:'enrollment',label:'Enrollment follow-ups',detail:'Reminders to finish an enrollment form'},
  {key:'billing',label:'Billing updates',detail:'Statements, balances and payment-authorization requests'},
  {key:'insurance',label:'Insurance-card requests',detail:'Required missing cards; Medicaid cards are not requested'}
];
export const FAMILY_CHANNEL_CHOICES=['email','sms','both','off'];
export const FAMILY_CHOICE_DISCLOSURE='These optional account updates apply only to the child, agency and recipient shown on this page. Email selections authorize these account-related emails. Text selections save your requested preferences; they do not activate texting or replace verified text-message permission. Texts remain off until the parent texting program, your phone number and your permission are ready. Frequency varies with your appointments and account activity. Message and data rates may apply. Reply STOP to stop texts or HELP for help. No marketing is included. Declining does not affect care or access to the portal. Sensitive details stay in the portal; ordinary email and SMS are not end-to-end encrypted. Requested sign-in, password recovery and essential security messages are separate.';
export function normalizeFamilyChoices(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!FAMILY_NOTIFICATION_CATEGORIES.some(c=>c.key===k))
    ||FAMILY_NOTIFICATION_CATEGORIES.some(c=>!FAMILY_CHANNEL_CHOICES.includes(input[c.key])))
    throw Object.assign(new Error('Choose Email, Text, Both or Off for every notification type.'),{status:400});
  return Object.fromEntries(FAMILY_NOTIFICATION_CATEGORIES.map(c=>[c.key,input[c.key]]));
}
export const choiceAllows=(choice,channel)=>choice==='both'||choice===(channel==='sms'?'sms':'email');
export function familyNotificationCategory(templateType) {
  const type=String(templateType||'').replace(/^trigger:/,'');
  if(['session_reminder','session_confirmation','auricwell_session_reminder'].includes(type))return 'appointments';
  if(['session_change','session_cancellation'].includes(type))return 'schedule_changes';
  if(type==='school_session_notice')return 'school_sessions';
  if(['secure_message_notification','learning_client_message'].includes(type))return 'messages';
  if(['guardian_plan_review','school_roi_signing','school_roi_signer_completion','smart_school_roi','intake_packet_completion','intake_summary_pdf_copy'].includes(type))return 'documents';
  if(type.startsWith('enrollment_unfinished_reminder')||['adaptive_full_intake_invite','client_renewal'].includes(type))return 'enrollment';
  if(['family_balance_due','family_payment_setup','family_collections','family_statement','family_billing_statement','family_payment_authorization'].includes(type))return 'billing';
  if(type==='insurance_card_followup')return 'insurance';
  return null;
}
