export const SCHOOL_CONTACT_SUBJECTS = {
  initial_email: 'Introduction & Next Steps for Counseling Services',
  second_contact: 'Following Up About Counseling Services',
  final_contact: 'Final Follow-Up About Counseling Services'
};
const LEGACY_INTRO = `{{parent_name}},

My name is {{provider_name}}, and I was recently assigned to your child at {{school_name}}. I will see them on {{service_day}}.

The next steps are for me to work with you to identify a time to touch base, schedule an intake, and establish the goals and direction of therapy. Please send me some days and times you may be available to meet virtually before I begin working with your child.

If you have any questions, please do not hesitate to reach out by hitting "reply".`;
export const DEFAULT_SCHOOL_CONTACT_TEMPLATE = `Hello {{parent_name}},

My name is {{provider_name}}, and I'm excited to introduce myself as your child's assigned counselor at {{school_name}}. I'm looking forward to working with your child, with {{service_day}} being our anticipated day for counseling sessions.

Before beginning services, I'd like to connect with you to learn more about your child, discuss any questions or concerns you may have, and establish some initial goals and expectations for therapy.

Please reply with a few days and times that work best for you so we can schedule a brief virtual intake meeting. Our goal is to complete this meeting before your child's first session whenever possible.

If you have any questions in the meantime, please don't hesitate to reach out by simply replying to this email.

I look forward to connecting with you!

Best regards,
{{provider_name}}`;
export const DEFAULT_SECOND_CONTACT_TEMPLATE = `Hello {{parent_name}},

I hope you're doing well!

I wanted to follow up on my previous email introducing myself as your child's assigned counselor at {{school_name}}. I'm looking forward to working with your child on {{service_day}} and would appreciate the opportunity to connect with you for a brief virtual meeting before we begin services.

This conversation will allow me to learn more about your child's needs, answer any questions you may have, and better understand your goals and expectations for counseling.

If you're available, please reply with a few days and times that would work best for you. I'll do my best to accommodate your schedule. I understand that schedules can be busy, and I appreciate your time. If connecting before our first session isn't possible, we'll continue exploring appropriate ways to gather the information needed to support your child.

Thank you, and I look forward to connecting with you!

Best regards,
{{provider_name}}`;
export const DEFAULT_FINAL_CONTACT_TEMPLATE = `Hello {{parent_name}},

I'm following up one final time to arrange a brief intake meeting before counseling services at {{school_name}}, where {{service_day}} is the anticipated counseling day. I'd like to learn more about your child's needs and your goals for counseling.

Please reply with a few days and times when we could meet virtually. If you're unable to meet, please let me know how we can best connect. We will continue exploring appropriate ways to gather information and support your child while respecting the required consents and permissions.

Thank you for your time.

Best regards,
{{provider_name}}`;
export const DEFAULT_CONTACT_SMS_TEMPLATE = `Hi {{parent_name}}! This is {{provider_name}} with {{agency_name}}. I emailed about counseling at {{school_name}}. Could you reply with a few times for a brief virtual intake meeting? Thank you!`;

export const preferredSchoolContactTemplate = value => !value || String(value).trim() === LEGACY_INTRO ? DEFAULT_SCHOOL_CONTACT_TEMPLATE : value;

export function schoolContactAttemptCount(steps = []) {
  return steps.filter(s => ['initial_email','second_contact','final_contact'].includes(s.step_key) && s.status === 'sent').length;
}
