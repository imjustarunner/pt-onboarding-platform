/** Staff-facing wording supplied for the October Admin Update. This updates copy,
 * not feature activation, employee classifications, messages or published policies. */
const p = text => `<p>${text}</p>`;
const list = items => `<ul>${items.map(text => `<li>${text}</li>`).join('')}</ul>`;
const steps = items => `<ol>${items.map(text => `<li>${text}</li>`).join('')}</ol>`;
const app = 'https://app.itsco.health';

export const itscoSuggestedTopicEdits = {
  spanish_intake: {
    title: 'Spanish-speaking families · intake handoff',
    body: p('When a client or parent prefers Spanish, document their language preference and connect them with the designated Spanish-speaking team member for intake.') + list([
      '<strong>Ask language preference:</strong> The client and parent may have different preferences, so ask each separately.',
      '<strong>Make the handoff:</strong> Use the client’s authorized record or a secure support request. Include preferred contact method and availability. Do not share client information in broad team texts.',
      '<strong>Document progress:</strong> The Spanish-speaking team member records contact attempts, intake progress, outstanding items, and who is responsible for the next step. The assigned provider should refer to the same record to avoid duplicate work.',
      '<strong>If the Spanish-speaking intake team member is unavailable:</strong> Ask support to arrange language assistance and follow-up. An unsuccessful English-language contact should not be treated as a refusal of services.',
      '<strong>Use appropriate language support:</strong> Use approved translated forms or qualified interpretation when needed. Children should not interpret intake, consent, or clinical information.'
    ]) + p('No additional approval is needed to make the handoff. As always, interpreting, translation, and clinical services should stay within the staff member’s training, skills, and assigned responsibilities.')
  },
  office_kiosk: {
    title: 'The new office kiosk · arrival, directions & provider information',
    body: p('The new office kiosk brings client check-in and office information together in one place.') + list([
      '<strong>Client check-in:</strong> Clients select their provider and appointment time, confirm who is checking in, and let the provider know they have arrived. If an appointment is missing, they can use “Message our support team” or ask the office team for help.',
      '<strong>Arrival notifications:</strong> The kiosk records the client’s arrival and sends an in-app notification to the provider. Depending on notification settings, text or email alerts may also be available. Check the app for arrivals.',
      '<strong>Today’s providers:</strong> View provider office hours and room information.',
      '<strong>Office directory:</strong> Find rooms and view the office layout.',
      '<strong>Provider profiles:</strong> View current provider photos and public profile information. Please keep your photo, biography, and focus areas up to date through your Provider Update.',
      '<strong>Programs & events:</strong> View available office programs and events. Program-specific check-in or clock-in/out options will only appear where configured.',
      '<strong>Visit forms & feedback:</strong> Complete assigned visit questionnaires or feedback after check-in. Optional feedback can be skipped and will not prevent check-in. Authorized providers can review saved responses and available trends.'
    ]) + p('The kiosk will return to the welcome screen after completion or inactivity. Please finish or clear the screen before leaving it and let staff know if any information appears incorrect.') + p('The kiosk is intended for arrival and office information only. It is not used to start care or report an emergency.') + p(`<a href="${app}/itsco/kiosk?mode=office">Open the kiosk entry</a> · Staff can open the configured office kiosk; clients should use the device provided at their office.`)
  },
  tasks_my_work: {
    title: 'Tasks & My Work · know what needs your attention',
    body: p('Tasks shows the work assigned to you. Open each task to see the instructions, due date, attachments, and required action.') + list([
      '<strong>Complete the actual task:</strong> Signing a document, submitting a request, and checking off a task are separate steps. Complete the required action before marking the task as done.',
      '<strong>If you’re blocked:</strong> Use the relevant task to ask for help rather than marking it complete.',
      '<strong>My Work:</strong> This gives you an overview of items that need your attention. Some accounts may still display this as Checklist. Use the dashboard for a quick view of what is due, then open the full task list for details.',
      '<strong>Provider Update:</strong> Continue to review your school/client actions there as well. Each listed client has a specific outstanding action based on your assignment.',
      '<strong>Protect client information:</strong> Keep client details in the appropriate authorized record. Do not copy sensitive information into broad team tasks or announcements.'
    ]) + p('A reminder or checked-off task does not confirm that a clinical note, enrollment, signature, or other required step has actually been completed.') + p(`<a href="${app}/tasks">Open Tasks</a>`)
  },
  notes_workspace: {
    title: 'Notes Workspace · find, write & manage your notes',
    body: p('The Notes Workspace has three main areas, each with a different purpose:') + list([
      '<strong>Right — Work Queue:</strong> This shows the sessions and documentation tasks you need to work on. Select an item to open it in the workspace. When available, “Open next in queue” lets you move through your remaining work without searching for each client.',
      '<strong>Center — Writing & Review:</strong> Use this area to create and review notes. Select the appropriate note tool, verify the client, service date, and clinical details, and review all generated content before saving. AI-assisted text must be reviewed by you and does not replace clinical judgment.',
      '<strong>Left — Note Library:</strong> Use the library to search, filter, group, and reopen drafts or saved notes. The Note Library and Work Queue serve different purposes. Deleting a draft does not remove the related item from the Work Queue. If a to-do is no longer needed, remove it from the queue when appropriate.'
    ]) + p('<strong>Current workflow:</strong> ITSCO is using the note-generation tools while the full clinical charting and signing process is being rolled out in stages. A saved or reviewed note in this workspace is not automatically a signed TherapyNotes record. Until you receive notice that the workflow has changed, continue copying reviewed notes into TherapyNotes as required.') + p(`<a href="${app}/admin/clinical-note-generator">Open Notes Workspace</a>`)
  },
  supervision: {
    title: 'Supervision hours · now tracked in the app',
    body: p('Your supervision hours are now recorded in the app. Review the different hour totals shown in your Provider Update:') + list([
      '<strong>Starting hours:</strong> Your previously reported hours.',
      '<strong>Imported hours:</strong> Hours brought over from the previous tracking period.',
      '<strong>Finalized credits:</strong> Hours that have been reviewed and converted to app credits.',
      '<strong>Total:</strong> Your current overall balance.'
    ]) + p('The Provider Update keeps these sources separate so you can spot missing or duplicate hours.') + p('<strong>If something looks incorrect:</strong> Submit a correction with an explanation and any supporting information. Do not enter historical hours again if they are already included in your balance.')
  },
  availability_profiles: {
    title: 'Weekly availability & your public profile',
    body: p('Set your weekly availability in the Provider Update. You can:') + list([
      'Add available virtual appointment slots.',
      'Choose whether eligible office time is available for in-person visits, virtual visits, both, or kept private/booked.',
      'Review your existing appointments, meetings, and other busy time, which will continue to block those times from public availability.'
    ]) + p('<strong>Setting availability does not create a meeting or reserve additional office time.</strong>') + '<h3>Your public profile</h3>' + p('Open your personal public profile link from the Provider Update to see what clients see. You can copy the link or download its QR code to share. Please review your photo, biography, and top focus areas to make sure they are current.') + p('Public availability, booking permissions, and notification/contact hours are separate settings. An open appointment slot does not guarantee an immediate booking.')
  },
  business_cards: {
    title: 'Print your own business cards',
    body: p('You can print your own ITSCO business cards at the office. Preprinted cardstock with the ITSCO website QR code will be available, so you can print your provider information on the other side.') + '<h3>How to print</h3>' + steps([
      '<strong>Check your profile first.</strong> Open your public provider profile from the Provider Update and make sure your name, credentials, photo, contact information, and profile link are correct.',
      'Open the business card template in the app and use the current version.',
      '<strong>Get the cardstock.</strong> Preprinted business-card cardstock is located in the right drawer of the kitchen desk.',
      'Use the color Brother printer on the back side of the kitchen desk. The printer can only take one sheet at a time.',
      'Load the cardstock with the QR-code side facing up so the QR code is readable when you look at it.',
      'In the printer settings, set <strong>Print Quality to Great</strong> instead of Good and <strong>Paper Type to Matte Photo Paper</strong>. Click OK.',
      'Print one sheet first. Check that your information is correct and everything is properly aligned before printing additional cards.',
      'Once the test sheet looks correct, print additional sheets one at a time.'
    ]) + p('The preprinted QR code links to the main ITSCO website. If needed, the cards can also be printed on both sides.') + p('Please use the current app-generated template and do not add a private care-texting number or other personal contact information that is not intended for public use.') + p('If your profile information is incorrect or you have trouble with the template, printer, or alignment, use <strong>Need help</strong> in the Provider Update to submit a <strong>Technology support ticket</strong> before continuing. You can attach screenshots. General ITSCO support: <a href="mailto:support@itsco.health">support@itsco.health</a>.')
  },
  communication_rollout: {
    title: 'App messaging, calling & team polls · staged rollout',
    body: p('Features for calling, client texting, staff notifications, and team polls are launching in stages.') + '<h3>Access & setup</h3>' + list([
      '<strong>Request access:</strong> Features are not enabled automatically. Submit your access request and select your notification preferences in the Provider Update.',
      '<strong>Wait for confirmation:</strong> Support will notify you when your phone number, routing, and account setup are complete.'
    ]) + '<h3>Client messaging & security</h3>' + p('Client texting will launch after our Vonage BAA is signed, covered numbers and safeguards are confirmed, and testing is finished. Standard SMS on personal phones has privacy and security limitations. Keep clinical conversations inside the approved secure app workflow; a BAA alone does not make ordinary text messages secure.') + '<h3>Team polls & opt-outs</h3>' + p('Participate in team polls directly in the app. Optional results may be sent via text. You can decline or stop optional SMS polls at any time without losing overall app access.') + p('Advanced features—phone forwarding, call recordings/transcripts, and AI answering—will be announced separately when ready.') + '<h3>Safety & emergency notice</h3>' + p('App messages are not continuously monitored and are not a crisis service. In the U.S., call or text 988 for suicide or mental health crisis support; call 911 for immediate medical emergencies.') + p(`<a href="${app}/itsco/terms#sms">Review full ITSCO messaging terms</a>`)
  },
  private_virtual_rooms: {
    title: 'Coming soon · your private virtual room',
    body: p('We are rolling out personal virtual rooms for work conversations, supervision, and team meetings.') + list([
      '<strong>Full details coming:</strong> Access links, invite instructions, and privacy controls will be shared prior to release.',
      '<strong>Not for telehealth yet:</strong> This is not a substitute for our current telehealth workflow. Any future client use will follow official security and consent requirements.',
      '<strong>Action item:</strong> Continue using your current approved meeting links until further notice.'
    ])
  },
  therapynotes_transition: {
    title: 'TherapyNotes transition · key information & next steps',
    body: p('<strong>Target dates: November 26–29, 2026 (Thanksgiving weekend).</strong>') + '<h3>What you need to know</h3>' + list([
      '<strong>Keep using the current system:</strong> Continue documenting in your current designated record system until you receive the official go-live notice.',
      '<strong>Exact instructions coming soon:</strong> Cutover guides, training, and support arrangements will be provided prior to transition weekend.',
      '<strong>Cutover checks:</strong> Workflows and migrated records—including billing, permissions, and access—will be verified before full cutover, with a fallback if a critical workflow is not ready.'
    ]) + '<h3>Your action items before the move</h3>' + list([
      '<strong>Reconcile your records:</strong> Clear out unfinished notes, outstanding client actions, upcoming appointments, supervision information, and your overall caseload.',
      '<strong>Do not delete anything:</strong> Do not delete records or assume a draft saved in the app has migrated or been signed in TherapyNotes.'
    ])
  },
  google_transition: {
    title: 'Google Workspace transition · what you need to know',
    body: p('We are transitioning to a single app for daily work, email, and shared documents. Google Workspace accounts will be retired in phased stages. Do not close accounts, stop using current tools, or delete Drive files until your individual migration is confirmed.') + '<h3>Key updates by system</h3>' + list([
      '<strong>Email:</strong> You will eventually manage all work email directly in the app. Even if your inbox works inside the app, the underlying Google account must stay active until formal verification is complete.',
      '<strong>Documents & Shared Library:</strong> Shared policies, forms, and reference tools are moving to the app’s Library. Do not delete original Google Drive files just because you see a link in the app. Client and personnel records will retain all current security and retention rules.',
      '<strong>Calendar & meetings:</strong> Continue using your existing meeting links. Updated links and private virtual room instructions will be provided before any Google calendar features are turned off.',
      '<strong>Sign-in & Quick View:</strong> We are testing replacement app logins for roles using Google sign-in. Your six-digit Quick View code is separate and cannot replace your main login.'
    ]) + '<h3>Action items & next steps</h3>' + list([
      '<strong>Verify:</strong> Check your contact details and notification settings in the system.',
      '<strong>Identify:</strong> Make a note of the shared mailboxes, documents, and calendars you rely on daily.',
      '<strong>Wait:</strong> Hold off on changing settings until you receive your official migration checklist and cutover notice.',
      '<strong>Report:</strong> Flag missing access to Support once your migration begins.'
    ]) + p('Forwarding client information to personal email remains prohibited.')
  },
  quick_view: {
    title: 'Quick View · set up one-touch access on your phone',
    body: p('Set up Quick View on your mobile device for fast access during the workday:') + '<h3>Add to Home Screen</h3>' + list([
      '<strong>iOS (Safari):</strong> Tap Share → Add to Home Screen.',
      '<strong>Android (Chrome):</strong> Tap the menu (⋮) → Add to Home screen or Install app.'
    ]) + p('<strong>Get your six-digit code:</strong> Create your passcode through the Provider Update or go to My Preferences → Privacy & Quick View. Existing passcodes will not be displayed or overwritten.') + list([
      'Always use your own account and keep your device passcode-locked.',
      'Adding a shortcut does not enroll you in SMS messages.',
      'Contact Support if you cannot use a personal device.'
    ])
  }
};
