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

You can learn a little more about me here: {{profile_link}}

If you have any questions in the meantime, please don't hesitate to reach out by simply replying to this email.

I look forward to connecting with you!

Best regards,
{{provider_name}}`;
export const PROFILE_LINK_TOKEN = '{{profile_link}}';
export const DEFAULT_SECOND_CONTACT_TEMPLATE = `Hello {{parent_name}},

I hope you're doing well!

I wanted to follow up on my previous email introducing myself as your child's assigned counselor at {{school_name}}. I'm looking forward to working with your child on {{service_day}} and would appreciate the opportunity to connect with you for a brief virtual meeting before we begin services.

This conversation will allow me to learn more about your child's needs, answer any questions you may have, and better understand your goals and expectations for counseling.

If you're available, please reply with a few days and times that would work best for you. I'll do my best to accommodate your schedule. I understand that schedules can be busy, and I appreciate your time. If connecting before our first session isn't possible, we'll continue exploring appropriate ways to gather the information needed to support your child.

Thank you, and I look forward to connecting with you!

Best regards,
{{provider_name}}`;
export const DEFAULT_FINAL_CONTACT_TEMPLATE = `Hello {{parent_name}},

I hope you're doing well!

I wanted to reach out one final time regarding the opportunity to connect before beginning counseling services with your child at {{school_name}}, with {{service_day}} being our anticipated counseling day.

While I would welcome the opportunity to speak with you directly, I also understand that coordinating schedules can sometimes be difficult.

If we're unable to arrange an introductory meeting, I'll do my best to gather the necessary information through other appropriate means so we can continue preparing to support your child.

This may include:
• Reviewing the enrollment information: Using the information you've already provided to better understand your child's background, needs, and any identified concerns or goals.
• Coordinating with school staff: When an appropriate Release of Information (ROI) is on file and permits communication, connecting with relevant school staff to gather additional information that may help support your child's counseling experience.
• Connecting directly with your child: As clinically appropriate, discussing their experiences, needs, concerns, and goals during the initial counseling process to help complete the clinical intake and assessment.

If additional information, consent, or documentation is required before services can begin or continue, I'll work with our support team to identify the appropriate next steps.

You're always welcome to connect with me. Your perspective is valuable, and I would be happy to arrange a conversation whenever your schedule allows.

Thank you for the opportunity to support your child. I look forward to working together to make their counseling experience meaningful and beneficial.

Best regards,
{{provider_name}}`;
export const DEFAULT_CONTACT_SMS_TEMPLATE = `Hi {{parent_name}}! This is {{provider_name}} with {{agency_name}}. I wanted to follow up on an email I recently sent about scheduling a brief introductory meeting. When you have a moment, please reply to my email with a convenient day and time. Thank you! I look forward to connecting with you.`;

export const preferredSchoolContactTemplate = value => !value || String(value).trim() === LEGACY_INTRO ? DEFAULT_SCHOOL_CONTACT_TEMPLATE : value;

export function schoolContactAttemptCount(steps = []) {
  return steps.filter(s => ['initial_email','second_contact','final_contact'].includes(s.step_key) && s.status === 'sent').length;
}
