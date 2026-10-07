const section = (id, title, paragraphs = [], items = [], links = []) => ({ id, title, paragraphs, items, links });

export function messagingGuideForProfile(profile) {
  const care = profile.kind === 'healthcare';
  return {
    title: `${profile.name}: How messaging works`, shortTitle: 'How messaging works',
    updatedLabel: 'Updated October 7, 2026',
    intro: `A clear guide to reaching ${profile.name}, who can see your message, and what happens next. These routes apply when your organization enables the relevant messaging service. Your enrollment explains which channels and message types are available to you.`,
    flow: [
      { title: 'You send a message', body: 'Use the organization’s designated number or your account. A shared business number keeps personal staff numbers private.' },
      { title: 'We find the right inbox', body: care ? 'Your number and client assignment help route the message to your care team. Unrecognized or unclear senders go to support review.' : 'Messages are handled within this organization. Support helps direct inquiries to the appropriate authorized staff.' },
      { title: 'Your team responds', body: care ? 'Available assigned providers receive alerts according to their settings. Replies come from the business number and identify the staff sender.' : 'Authorized staff review your request and respond through the available service channels. Response times depend on working hours.' },
      { title: 'Support can help', body: care ? 'If all assigned providers are away, follow the SUPPORT instructions in the after-hours notice to request support review.' : 'Use the organization’s support contact if you need help with your account or are unsure whom to contact.' }
    ],
    sections: [
      section('right-inbox', 'Who receives your message', [
        care ? `A shared ${profile.name} care number connects you to your assigned providers through the app. It is a business inbox, not a provider’s personal phone. If more than one active provider is assigned to you, those providers can see the shared conversation and your replies.` : `Your message belongs to the ${profile.name} service you contacted. A shared platform does not make every participating organization a recipient. Platform support can help with technical or account issues; professional service questions belong with the organization providing that service.`,
        `Authorized support and administrative staff may also access messages for their work. Messaging one person does not make the conversation private from other authorized members of the team. Staff access is governed by their role and permissions.`,
        'A new number, a shared family number, or an unclear sender may need verification before routing. Such messages can be held for support review. Tell the organization if your number changes; do not send sensitive details to establish your identity.'
      ]),
      section('away', care ? 'When your providers are away' : 'Working hours and getting help', care ? [
        'Availability is based on each assigned provider’s work schedule and away settings. If one provider is available, the conversation stays with the available care team. If all assigned providers are unavailable, your message is saved for their return.',
        'When you receive an after-hours support offer, reply SUPPORT to request urgent support review. Without that reply, the message waits for your providers; it is not automatically forwarded for urgent review. Authorized administrative access still applies.',
        'SUPPORT opens a high-priority request and alerts available support staff, with available administrators as backup. Unclaimed requests receive reminders. Someone must claim the request, respond in the app, and close it when handled. An automated acknowledgment or delivery receipt does not mean a person has read your message.',
        'If nobody is available, the request remains queued. Urgent support priority does not promise immediate, overnight, or 24-hour care. Support replies securely through the app; phone alerts do not include the client’s message.'
      ] : [
        `Messages are reviewed according to ${profile.name}’s staffing and working hours. Sending a message or receiving an automated acknowledgment does not confirm that a person has read it.`,
        'Contact the organization through its published support channel for assistance. A platform account does not provide round-the-clock monitoring, clinical care, or a guaranteed response time.'
      ]),
      section('reminders', 'Reminders, links, and account updates', [
        'Depending on your selected subscriptions, you may receive appointment or service reminders, schedule changes, cancellations, account notices, or links to sign in. Follow the instructions in each message; available reply options depend on that request.',
        ...(care ? ['When an appointment reminder asks for it, reply Y to confirm, N to cancel, or R to request rescheduling. A rescheduling request is not a confirmed replacement appointment. School-visit notices do not require confirmation; follow the notice to let the team know about an absence or problem. Continue reporting school absences to the school.'] : []),
        'Meeting and account links may require sign-in or verification. Keep personal links private. Review detailed balances, records, and sensitive information in your account rather than sending them by ordinary text.'
      ]),
      section('staff', 'For staff: alerts and optional voting', [
        'Staff have separate communication choices for reminders and announcements, message-waiting alerts, and optional polls. Where enabled, these can include supervisor messages, schedule updates, meeting or session links, and training notices.',
        'A message-waiting alert asks you to open the app. Client content stays in the app; this guide does not enable forwarding full conversations to a personal phone. An urgent alert still requires someone to take responsibility for the request.',
        'Poll instructions specify the response options and any event code. Authorized organizers can see responses; voting is not anonymous. Eligible participants can view final aggregate results in the app after voting closes, with an optional results text selected for each poll.'
      ]),
      section('choices', 'You control your text choices', [
        `Reading this guide, accepting terms, or giving ${profile.name} your phone number does not enroll you in recurring texts. Choose Yes or No for the offered message types. You may decline optional texts and arrange another available way to communicate.`,
        'An incoming text allows a response about that request; it does not enroll you in reminders or promotions. Promotional messages require a separate affirmative choice. Message frequency varies; message and data rates may apply.',
        'Reply STOP to stop the sending program, or HELP for assistance. Stopping a program stops its shared message purposes, even if different staff use it. Other programs may use separate numbers; contact support to stop all texts. Opting out does not erase records that must be retained.'
      ]),
      section('privacy', 'Keep sensitive information in your account', [
        `Messages and related communication records are retained in the app and, where applicable, associated with the client’s record. They are accessible to authorized staff according to their responsibilities.`,
        'Ordinary SMS can be seen on lock screens, shared devices, phone backups, and carrier systems. Use the designated secure channel for sensitive records. A messaging campaign’s approval does not certify every communication as HIPAA compliant.',
        'Calls, voicemail, recording, transcription, and personal-phone forwarding are separate features. This guide does not activate them or provide consent to record a call. Ask the organization which services are currently available.'
      ]),
      section('safety', 'Not for crises or emergencies', [
        'Do not wait for an app or text reply during a crisis. In the United States, call or text 988 for suicide or emotional distress. Call 911 for immediate danger or a medical emergency. This messaging service is not an emergency service and is not continuously monitored.'
      ]),
      section('help', `Questions for ${profile.name}`, [
        `For help with messaging or another way to communicate, contact ${profile.email || profile.phone || profile.name + ' through its contact page'}. Your organization’s terms, privacy notice, and program-specific consent explain the services and choices that apply to you.`
      ], [], [
        {label: 'Terms & SMS', href: `/${profile.slug}/terms#sms`},
        {label: 'Privacy Policy', href: `/${profile.slug}/privacypolicy`},
        {label: `Contact ${profile.name}`, href: profile.contactUrl}
      ])
    ]
  };
}
