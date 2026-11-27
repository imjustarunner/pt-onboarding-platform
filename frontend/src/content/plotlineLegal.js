export const PLOTLINE_LEGAL_ORIGIN = 'https://plotlinepo.com';
export const PLOTLINE_LEGAL_UPDATED = 'November 26, 2026';
const section = (id, title, paragraphs) => ({ id, title, paragraphs });

export const plotlineInterviewOptInScript = [
  'Recruiter introduction',
  'Hello, this is [recruiter name], scheduling your interview with [hiring organization] through Plotline People Operations. Would you like to hear about optional text reminders for your interview?',
  'If the candidate agrees to hear the details, continue.',
  'Confirm the mobile number',
  'What US mobile number would you like us to use? Is this your number, and can it receive text messages?',
  'The candidate provides and confirms their mobile number.',
  'Read the consent request',
  'May Plotline People Operations text this mobile number about your interview, including reminders? Message and data rates may apply. Message frequency varies. Text HELP for help. Text STOP to opt-out. Terms are at https://plotlinepo.com/terms. Privacy details are at https://plotlinepo.com/privacy. Texts are optional, and you can receive interview details by email. Do you agree?',
  'If the candidate explicitly agrees',
  'Thank you. We will send a text confirming your opt-in, followed by interview reminders when applicable. The default reminders are seven days, 24 hours, one hour, and five minutes before the interview. Your interview information and join link are also available by email.',
  'The recruiter records the confirmed mobile number, affirmative response, script, timestamp, and recruiter account against the interview. Text delivery requires an active, approved campaign and a saved affirmative opt-in. An opt-in confirmation precedes reminders.',
  'If the candidate declines or gives an unclear response',
  'We can send your interview information by email. What email address would you like us to use?',
  'The recruiter leaves text reminders disabled. A phone number alone, silence, or an unclear answer does not establish consent.'
];

export const plotlineLegalPages = {
  privacy: {
    title: 'Plotline Privacy Policy',
    description: 'How Plotline by Plot Twist Co handles website, applicant, employee, and interview messaging information.',
    intro: 'Plotline is the people operations product of Plot Twist Co. This policy explains how information is handled when you visit our website, use Plotline, apply to a participating organization, or receive interview communications.',
    sections: [
      section('scope', 'Who handles your information', [
        'Plot Twist Co operates Plotline and handles website inquiries, account administration, service support, and security. A participating employer or hiring organization determines the purposes of its recruiting, employment, onboarding, and workforce records. Plotline processes those records on the organization’s behalf under applicable agreements and authorized instructions.',
        'The organization’s own privacy notices and employment policies also apply to its activities. Contact that organization about its hiring decisions, employment records, or requests concerning those records. You may contact us for assistance identifying the appropriate organization or addressing a platform privacy concern.'
      ]),
      section('collection', 'Information we collect', [
        'Information you or your organization provide may include your name, email address, phone number, account details, job interests, application answers, resume, cover letter, qualifications, interview scheduling and responses, onboarding documents, acknowledgments, training progress, evaluations, and messages.',
        'An organization may provide professional references, interview notes and ratings, publicly available professional information, and other records relevant to its authorized people operations. Information received from connected services depends on the integrations and permissions you or the organization enable.',
        'We receive technical and usage information needed to operate the service, such as IP address, browser and device information, requested pages, access times, security logs, and error reports. Account sessions and saved preferences may use cookies or browser storage. Connected calendar, video, messaging, and payment services receive information necessary for the features in use.'
      ]),
      section('purposes', 'How information is used', [
        'We use information to operate and support Plotline, respond to inquiries, manage accounts and authorized access, process applications and onboarding, coordinate interviews and calendars, deliver requested communications, support learning and evaluations, maintain records, troubleshoot issues, detect misuse, and meet legal obligations.',
        'Where enabled, automated or AI-assisted features may organize information, summarize candidate materials, or help staff prepare interview questions and documents. Their use depends on the organization’s configuration and instructions. Organizations remain responsible for reviewing outputs and making their hiring and employment decisions. Authorized service providers may process the content needed for those features.',
        'Enrolling in interview reminders authorizes the described interview messages. Additional messaging purposes require their applicable consent.'
      ]),
      section('sharing', 'Who can access information', [
        'Authorized users at the organization may access records according to their roles and assignments. Interview materials can be shared with assigned interviewers and authorized hiring staff. Service providers supporting hosting, storage, email, calendars, video, SMS, payments, or enabled AI features may process information needed to provide their services under applicable agreements.',
        'Your participation in one organization does not authorize unrelated organizations to access its applicant or employment records. Shared workflows and integrations must have an authorized purpose and appropriate permissions.',
        'We may disclose information when required by law, to respond to lawful requests, or as reasonably necessary to protect people, investigate misuse, and secure the service. A business reorganization or transfer may involve records subject to confidentiality protections and required notice.',
        'We do not sell personal information or share it with third parties for their independent advertising or marketing.'
      ]),
      section('sms-privacy', 'Mobile numbers and hiring text consent', [
        'Plotline People Operations offers optional hiring texts for the organization identified in your application. We record your mobile number, organization, signed choice, disclosure version and timestamp, electronic signature, and staff review and confirmation outcome. Where the separate interview-only verbal program is offered, we record the confirmed number, affirmative response, script, timestamp, and staff member who recorded it. We also process message content and available sending, delivery, and opt-out records to operate and document the program.',
        'Mobile information will not be shared with third parties or affiliates for marketing or promotional purposes. Text messaging originator opt-in data and consent will not be shared with third parties or affiliates for their own use. Limited disclosures to messaging service providers and carriers are permitted solely to operate the texting program, process opt-outs, prevent misuse, and meet legal requirements.',
        'Reply STOP to opt out of this program. Reply HELP for help, or email Support@plottwistco.com. Opting out of texts leaves interview email and other available scheduling channels accessible. Consent is specific to this program and is optional. See the linked SMS terms for frequency, charges, and additional details.'
      ]),
      section('retention', 'Retention and security', [
        'We retain information as needed for the purposes described here, the organization’s instructions, applicable employment and other recordkeeping obligations, security, dispute resolution, and enforcement of agreements. Retention depends on the type of record and relevant obligations. Consent and opt-out evidence may be retained to honor preferences and document compliance.',
        'We use access controls and technical and organizational safeguards designed to protect information. No system or transmission can be guaranteed completely secure. SMS can appear on a shared device or lock screen. Keep personal interview links and account credentials private and use the designated document channel for sensitive files.',
        'Deletion requests may be subject to legal retention requirements, security needs, and backup schedules. We do not promise immediate removal of every copy.'
      ]),
      section('choices', 'Your choices and privacy requests', [
        'Contact HQ@plottwistco.com to request access, correction, deletion, or information about how your data is handled. Include the organization and enough context to locate the record. We may verify your identity and authority. Please avoid emailing sensitive identity documents unless we arrange an appropriate channel.',
        'Rights and response requirements depend on your location, the type of information, and our role. Applicant and employment records can be subject to different rules from consumer website information. When the organization controls the record, we coordinate with it or direct you to its privacy contact. Where a right to appeal a privacy response applies, reply to our response with your appeal.',
        'You can adjust available account and communication preferences, decline optional texts, and manage cookies or browser storage using your browser. Blocking essential storage may affect sign-in or saved preferences. External websites and connected services have their own privacy notices.'
      ]),
      section('age', 'Younger applicants', [
        'Plotline’s public website is intended for organizations and people participating in lawful recruiting and workforce activities. Recruiting involving younger applicants must follow applicable age and authorization requirements. Contact us if you believe a child’s information was collected without the required authorization.'
      ]),
      section('updates', 'Policy updates and contact', [
        'We publish changes with an updated effective date and provide additional notice or obtain consent where required. A policy update does not expand an existing text opt-in.',
        'For privacy inquiries, contact Plot Twist Co at HQ@plottwistco.com. For service or interview text support, email Support@plottwistco.com or call 833-756-8894. Include “Plotline” and the hiring organization when asking about an interview.'
      ])
    ]
  },
  terms: {
    title: 'Plotline Terms & Conditions',
    description: 'Terms for the Plotline website and people operations platform, including optional hiring texts and interview reminders.',
    intro: 'These terms apply to the Plotline website and use of Plotline services provided by Plot Twist Co, including the Plotline People Operations hiring text program.',
    sections: [
      section('scope', 'Using Plotline', [
        'Use Plotline lawfully and within the access granted to you. Provide accurate information, protect your credentials and personal invitation links, and report suspected unauthorized access to Support@plottwistco.com.',
        'You may act for an organization or another person only with appropriate authority. Organizations are responsible for their users, permissions, records, notices, and lawful instructions. Do not impersonate anyone, bypass access controls, introduce harmful software, interfere with the service, or unlawfully collect or disclose information.',
        'A separate signed organizational agreement or order governs purchased services where applicable. Those agreements control any conflicting subscription or service terms. Browsing this website, applying for a job, or agreeing to interview texts does not by itself start a paid subscription.'
      ]),
      section('recruiting', 'Applications and organization decisions', [
        'Plotline provides tools for careers pages, applications, interviews, onboarding, learning, and people records. Participating organizations are responsible for their hiring, employment, compensation, evaluation, and workplace decisions and for complying with applicable law.',
        'Submitting an application or receiving an invitation does not guarantee an interview, job offer, employment, or continued access. Contact the hiring organization for application status or a scheduling change.',
        'Automated or AI-assisted summaries and suggested content may contain errors and require human review. Authorized staff remain responsible for decisions and final records.'
      ]),
      section('content', 'Records, content, and privacy', [
        'You retain applicable rights in content you submit. You authorize the processing, storage, and delivery needed to provide the requested service, carry out authorized organizational instructions, and meet legal obligations. Submit only information you are entitled to provide.',
        'The Plotline software, designs, branding, and licensed materials remain protected by applicable intellectual property rights. You may view, save, and print public policies and materials provided for your lawful use. Additional reuse is subject to permission or rights provided by law.',
        'The Plotline Privacy Policy explains data handling. Organizations may also provide their own privacy notices and recordkeeping rules. Optional recording, transcription, and other features require any separate permissions and notices applicable to their use.'
      ]),
      section('sms', 'Plotline People Operations hiring SMS terms', [
        'Program description. Plotline People Operations sends optional application and interview updates, interview reminders and join links, reference outreach and completion notices, pre-hire and onboarding portal invitations and progress updates, and notices about new documents or tasks assigned to you. Each message identifies Plotline People Operations and the hiring organization. Reference answers and ratings are not sent to applicants by text.',
        'Consent. On the application or your available notification preference form, choose Email and text, enter your US mobile number and full name, and separately confirm control of the number and your electronic signature. Email only is the default. The form identifies the hiring organization, explains the covered notices, and links these terms and the privacy policy. Your signed choice is reviewed by staff and a confirmation text precedes other hiring texts. One confirmed application choice covers the listed hiring stages for that organization; it does not enroll you for other organizations. A phone number or application submission alone does not establish text consent. See https://plotlinepo.com/hiring-sms-consent for the full online process. The separately published verbal interview script covers interview texts only and does not authorize broader hiring messages.',
        'Optional participation. Consent to texts is not a condition of applying, interviewing, employment, purchase, or use of other available services. Interview information can be provided by email. Declining or opting out of texts does not cancel your interview.',
        'Frequency and charges. Message frequency varies. The default interview reminder schedule is seven days, 24 hours, one hour, and five minutes before the interview, where those times are still upcoming. Settings and the number of scheduled interviews affect the messages you receive. Message and data rates may apply under your mobile plan.',
        'Opt out. Text STOP to opt-out of the program. You may receive a final confirmation of your opt-out. STOP suppresses further texts from the Plotline campaign across participating organizations and its sending numbers. To resume, follow the available restart process and complete any required current opt-in. Restarting delivery does not add consent for another organization or a broader purpose. Contact support if your number changes or you receive texts intended for someone else.',
        'Help. Text HELP for help, email Support@plottwistco.com, or call 833-756-8894. Include “Plotline” and the hiring organization in support requests. Carrier processing of HELP and STOP depends on the registered messaging configuration.',
        'Delivery. Carriers are not liable for delayed or undelivered messages. Delivery also depends on network coverage, the device, carrier support, and service availability. Use your email invitation or contact the hiring organization if a text or join link is missing. This messaging program is not continuously monitored for urgent requests.',
        'Privacy. Mobile information and text opt-in evidence are handled as described in the Plotline Privacy Policy, including its restrictions on marketing disclosures. Text consent does not authorize unrelated promotional messages or another organization’s hiring notices. Notices to references themselves use their own communication process; your opt-in does not enroll your references.'
      ]),
      section('links', 'Integrations and external services', [
        'Calendar, video, messaging, payment, and other integrations may have their own terms and privacy policies. Connecting a service authorizes the access described in its permissions and the configured workflow. Use personal invitation links only for their intended participant and purpose.'
      ]),
      section('fees', 'Subscriptions and charges', [
        'Organizational subscription prices, included features, any trial, billing frequency, renewals, cancellation, refunds, and additional services are governed by the accepted order and applicable service agreement. Website estimates do not replace those terms. We disclose paid services before charging for them. Mobile carrier charges for optional SMS are governed by your mobile plan.'
      ]),
      section('availability', 'Availability and service limits', [
        'Features may change or be interrupted for maintenance, security, failures, or other operational reasons. We do not guarantee uninterrupted service, message delivery, or a particular hiring or business result. Keep access to other channels for time-sensitive interview coordination.',
        'Access may be restricted for misuse, security, legal requirements, or as provided in an organizational agreement. Ending account access does not automatically remove records subject to lawful retention obligations.',
        'Liability, warranties, and remedies for organizational services are governed by applicable law and any governing service agreement. These public terms do not limit rights, remedies, or obligations that cannot lawfully be limited.'
      ]),
      section('changes', 'Changes and contact', [
        'We publish updates with an effective date and give further notice or obtain agreement where required. Changes do not retroactively broaden your text consent. Contact Support@plottwistco.com for questions about these terms or HQ@plottwistco.com for privacy requests. Plotline is operated by Plot Twist Co.'
      ])
    ]
  },
  'hiring-sms-consent': {
    title: 'Application and Hiring Text Opt-In',
    description: 'How applicants choose optional Plotline People Operations hiring texts for an identified organization.',
    intro: 'This public page explains the online opt-in offered in participating organizations’ applications and available notification preference forms. This page is an example of the process; it does not collect a phone number or enroll anyone.',
    sections: [
      section('choice', 'Choose how to hear from us', [
        'Email only is selected by default. You can apply and continue the hiring process without text messages. To request texts, select Email and text in your application’s notification section. The actual form identifies your hiring organization; for example, Plotline People Operations for ITSCO.',
        'The optional texts cover application and interview updates, interview reminders and join links, reference outreach and completion, pre-hire and onboarding portal invitations and progress, and new documents or tasks assigned to you. Email continues. Your choice applies to your phone number and that hiring organization, across these stages. A separate organization needs a separate choice.'
      ]),
      section('disclosure', 'Read the disclosure before signing', [
        'Plotline People Operations sends optional hiring texts for the organization named on the form. Consent is not a condition of applying, interviewing, employment, or purchase. Message frequency varies. Message and data rates may apply. Reply STOP to opt out of the Plotline texting program across participating organizations and its sending numbers. Reply HELP for help or contact support@plotlinepo.com.',
        'Read the terms at https://plotlinepo.com/terms and privacy policy at https://plotlinepo.com/privacy. The default interview reminders are seven days, 24 hours, one hour, and five minutes before the interview where those times are still upcoming. Other notices depend on activity in your application. Carriers are not liable for delayed or undelivered messages.'
      ]),
      section('signature', 'Provide an affirmative electronic signature', [
        'Enter your US mobile number and full name. Both confirmations begin unchecked: “I control this mobile number and want hiring and onboarding texts” and “I electronically sign this optional enrollment. Declining does not affect my application or employment.” Select both only if you agree, then submit the application or save your notification preference.',
        'Providing a phone number alone, leaving boxes unchecked, or choosing Email only does not authorize texts. We retain the organization, disclosure and its version, mobile number, signed choices, signature and timestamp. Staff review the enrollment before a confirmation is sent. Other hiring texts require that confirmation to succeed.'
      ]),
      section('messages', 'Recognize your messages', [
        'Messages identify both the service and the organization, for example: “Plotline People Operations · ITSCO: Your interview is scheduled…” or “Plotline People Operations · ITSCO: Your private pre-hire portal is ready.” Personal join and portal links are intended only for you. Reference answers, ratings and confidential reference contents are not included in applicant texts.',
        'The separate live-operator script at https://plotlinepo.com/sms-consent is limited to interview messages. Existing interview-only consent is not silently expanded to the full hiring journey.'
      ]),
      section('control', 'Opt out or get help', [
        'Reply STOP to stop Plotline campaign texts; email continues and your application or interview is not canceled. Reply HELP for help or email support@plotlinepo.com. Report an incorrect or reassigned phone number to People Operations. New or broader consent requires a current affirmative choice; changes to these public pages do not expand an earlier choice.'
      ])
    ]
  },
  'sms-consent': {
    title: 'Interview Text Reminder Opt-In Script',
    description: 'The full live operator script for optional Plotline People Operations interview text reminders.',
    intro: 'This is the verbal script recruiters use when offering interview text reminders. It is published for candidates, staff, and messaging program review. The script documents the consent process. Text delivery requires an approved, active campaign and a recorded affirmative opt-in.',
    sections: [
      section('program', 'Program and purpose', [
        'Plotline People Operations offers optional interview reminders to candidates scheduling a job interview with an identified hiring organization. A recruiter offers the program during an interview scheduling phone call, confirms the candidate’s US mobile number, and asks for explicit consent. Interview information remains available by email.'
      ]),
      section('introduction', plotlineInterviewOptInScript[0], plotlineInterviewOptInScript.slice(1, 3)),
      section('number', plotlineInterviewOptInScript[3], plotlineInterviewOptInScript.slice(4, 6)),
      section('request', plotlineInterviewOptInScript[6], plotlineInterviewOptInScript.slice(7, 8)),
      section('agreement', plotlineInterviewOptInScript[8], plotlineInterviewOptInScript.slice(9, 11)),
      section('decline', plotlineInterviewOptInScript[11], plotlineInterviewOptInScript.slice(12))
    ]
  }
};
