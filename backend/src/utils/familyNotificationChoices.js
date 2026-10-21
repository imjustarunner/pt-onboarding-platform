export const FAMILY_CHOICE_VERSION='2026-10-21.1';
export const FAMILY_NOTIFICATION_CATEGORIES=[
  {key:'appointments',label:'Appointment reminders',detail:'All scheduled appointments for the services you are enrolled in'},
  {key:'schedule_changes',label:'Schedule changes',detail:'Cancellations, reschedules and appointment updates'},
  {key:'school_sessions',label:'In-school sessions',detail:'School session notices for this child'},
  {key:'messages',label:'Secure-message alerts',detail:'A notice to sign in and read a new message'},
  {key:'documents',label:'Forms and documents',detail:'Releases, treatment plans, signatures and completed copies'},
  {key:'enrollment',label:'Enrollment follow-ups',detail:'Reminders to finish an enrollment form'},
  {key:'billing',label:'Billing updates',detail:'Statements, balances and payment-authorization requests'},
  {key:'insurance',label:'Insurance-card requests',detail:'Email only; Medicaid cards are not requested',emailOnly:true}
];
// Keep the two legacy keys in storage so existing school opt-outs and unfinished
// enrollment preferences survive the simpler existing-family preferences page.
export const FAMILY_ACCOUNT_UPDATE_CATEGORIES=FAMILY_NOTIFICATION_CATEGORIES.filter(c=>!['school_sessions','enrollment'].includes(c.key));
export const FAMILY_CHANNEL_CHOICES=['email','sms','both','off'];
export const FAMILY_CHOICE_DISCLOSURE='These optional account updates apply only to the child, agency and recipient shown on this page. Email selections set which account-related updates you receive. Text selections save your requested preferences; they do not activate texting or replace verified text-message permission. Texts remain off until the parent texting program, your phone number and your permission are ready. Frequency varies with your appointments and account activity. Message and data rates may apply. Reply STOP to stop texts or HELP for help. START requests a restart where supported by the registered texting program; it does not add new permissions. No marketing is included. Declining does not affect care or access to the portal. Sensitive details stay in the portal; ordinary email and SMS are not end-to-end encrypted. Requested sign-in, password recovery and essential security messages are separate.';
export function normalizeFamilyChoices(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!FAMILY_NOTIFICATION_CATEGORIES.some(c=>c.key===k))
    ||FAMILY_NOTIFICATION_CATEGORIES.some(c=>!FAMILY_CHANNEL_CHOICES.includes(input[c.key])))
    throw Object.assign(new Error('Choose Email, Text, Both or Off for every notification type.'),{status:400});
  return Object.fromEntries(FAMILY_NOTIFICATION_CATEGORIES.map(c=>[c.key,input[c.key]]));
}
export function normalizeAccountUpdateChoices(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)
    ||Object.keys(input).some(key=>!FAMILY_ACCOUNT_UPDATE_CATEGORIES.some(c=>c.key===key))
    ||FAMILY_ACCOUNT_UPDATE_CATEGORIES.some(c=>!FAMILY_CHANNEL_CHOICES.includes(input[c.key])))
    throw Object.assign(new Error('Choose Email, Text, Both or Off for every notification type.'),{status:400});
  if(!['email','off'].includes(input.insurance))
    throw Object.assign(new Error('Insurance-card requests are available by email only.'),{status:400});
  return Object.fromEntries(FAMILY_ACCOUNT_UPDATE_CATEGORIES.map(c=>[c.key,input[c.key]]));
}
// Proposed defaults are displayed for review only. No preference or consent is
// saved until the recipient explicitly confirms the form.
export function defaultFamilyChoices({isSchool=false,emailPreference}={}) {
  const choices=Object.fromEntries(FAMILY_NOTIFICATION_CATEGORIES.map(c=>[c.key,'off']));
  for(const category of FAMILY_ACCOUNT_UPDATE_CATEGORIES)
    choices[category.key]=emailPreference==='no'||(emailPreference==='scheduling_only'&&!['appointments','schedule_changes'].includes(category.key))?'off':'email';
  choices.school_sessions=isSchool?choices.appointments:'off';
  return choices;
}
export function accountUpdateChoices(stored,{isSchool=false}={}) {
  return Object.fromEntries(FAMILY_ACCOUNT_UPDATE_CATEGORIES.map(category=>{
    let choice=stored[isSchool&&category.key==='appointments'?'school_sessions':category.key]||'off';
    if(category.emailOnly)choice=['both','email'].includes(choice)?'email':'off';
    return [category.key,choice];
  }));
}
export const choiceAllows=(choice,channel)=>choice==='both'||choice===(channel==='sms'?'sms':'email');
export function familyNotificationCategory(templateType) {
  const type=String(templateType||'').replace(/^trigger:/,'');
  if(['session_reminder','session_confirmation','auricwell_session_reminder'].includes(type))return 'appointments';
  if(['session_change','session_cancellation'].includes(type))return 'schedule_changes';
  if(type==='school_session_notice')return 'school_sessions';
  if(['secure_message_notification','learning_client_message'].includes(type))return 'messages';
  if(['guardian_plan_review','school_roi_signing','school_roi_signer_completion','smart_school_roi','intake_packet_completion','intake_summary_pdf_copy'].includes(type))return 'documents';
  if(type.startsWith('enrollment_unfinished_reminder')||['adaptive_full_intake_invite','client_renewal','family_notification_invitation','portal_migration_invite'].includes(type))return 'enrollment';
  if(['family_cost_estimate','family_benefits_update','family_balance_due','family_payment_setup','family_collections','family_statement','family_billing_statement','family_payment_authorization'].includes(type))return 'billing';
  if(type==='insurance_card_followup')return 'insurance';
  return null;
}
