/** Staff-facing wording supplied for the October Admin Update. This updates copy,
 * not feature activation, employee classifications, messages or published policies. */
const p = text => `<p>${text}</p>`;
const list = items => `<ul>${items.map(text => `<li>${text}</li>`).join('')}</ul>`;
const steps = items => `<ol>${items.map(text => `<li>${text}</li>`).join('')}</ol>`;
const app = 'https://app.itsco.health';

export const itscoSuggestedTopicEdits = {
  spanish_intake: {
    title: 'Spanish-speaking families · intake handoff',
    body: p('Record the client’s and parent/guardian’s primary languages separately in the intake paperwork and client profile. When a parent or guardian prefers Spanish, arrange a Spanish-speaking parent intake through the agency’s Spanish intake team.') + steps([
      '<strong>Request availability:</strong> Contact spanish@your-agency-domain (espanol@ is an alias for the same group), or use the agency’s Spanish intake channel. Request a parent-intake time without posting identifying clinical information to the group.',
      '<strong>Assign the Spanish-speaking provider:</strong> Support coordinates the handoff and adds that provider to the individual client’s authorized care team. Group membership alone does not grant access to client records.',
      '<strong>Complete the intake:</strong> The Spanish-speaking provider conducts the parent intake and completes its documentation in the client record. The primary provider may attend if helpful.',
      '<strong>Prepare the care summary:</strong> The primary provider uses the Note Aid treatment-summary workflow to prepare a brief, relevant summary, reviews it for accuracy, and saves the reviewed summary in the authorized medical record. The assigned Spanish-speaking provider accesses it there.',
      '<strong>Continue coordination:</strong> The assigned Spanish-speaking provider handles future parent check-ins and coordination of care, documenting contacts and sharing relevant updates with the primary provider through the client record.',
      '<strong>When coverage is unavailable:</strong> Ask support to arrange appropriate language assistance. Do not use children as interpreters or treat an unsuccessful English-language contact as a refusal of services.'
    ]) + p('In your Provider Update, list languages you can use proficiently enough to conduct sessions and select your proficiency. Update support when your availability changes. For ITSCO, use <a href="mailto:spanish@itsco.health">spanish@itsco.health</a> or <a href="mailto:espanol@itsco.health">espanol@itsco.health</a>; both reach the same team.')
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
    ]) + p('The kiosk will return to the welcome screen after completion or inactivity. Please finish or clear the screen before leaving it and let staff know if any information appears incorrect.') + p('The kiosk is intended for arrival and office information only. It is not used to start care or report an emergency.') + p(`<a target="_blank" rel="noopener noreferrer" href="${app}/itsco/kiosk?mode=office">Open the kiosk entry</a> · Opens in a new window. The entry link will change in the coming weeks to a fixed location. Remind clients to complete check-in as soon as they arrive; they should use the device provided at their office.`)
  },
  tasks_my_work: {
    title: 'Tasks & My Work · know what needs your attention',
    body: p('Tasks shows the work assigned to you. Open each task to see the instructions, due date, attachments, and required action.') + list([
      '<strong>Complete the actual task:</strong> Signing a document, submitting a request, and checking off a task are separate steps. Complete the required action before marking the task as done.',
      '<strong>If you’re blocked:</strong> Use the relevant task to ask for help rather than marking it complete.',
      '<strong>My Work / To-do:</strong> The right panel on the documentation page contains clinical to-dos for providers and their supervisors. These items connect with the Note Aid interface so you can open the relevant documentation workflow. The general Tasks list also contains other assigned work.',
      '<strong>Provider Update:</strong> Continue to review your school/client actions there as well. Each listed client has a specific outstanding action based on your assignment.',
      '<strong>Protect client information:</strong> Keep client details in the appropriate authorized record. Do not copy sensitive information into broad team tasks or announcements.'
    ]) + p('A reminder or checked-off task does not confirm that a clinical note, enrollment, signature, or other required step has actually been completed.') + p('During the current rollout, you may see tasks that do not apply to you or that should already have resolved. Open that task and choose <strong>Report a weird task</strong>. This creates a Technology ticket with the task, assignee, creation time and available source details so the team can investigate. Explain what seems wrong; reporting does not complete or delete the task.') + p(`<a target="_blank" rel="noopener noreferrer" href="${app}/itsco/tasks">Open Tasks ↗</a> · <a target="_blank" rel="noopener noreferrer" href="${app}/itsco/tasks?reportTask=1">Report a weird task ↗</a>`)
  },
  notes_workspace: {
    title: 'Notes Workspace · find, write & manage your notes',
    body: p('The Notes Workspace has three main areas, each with a different purpose:') + list([
      '<strong>Right — My Work / To-do:</strong> This shows the sessions and documentation tasks you need to work on. Select an item to open it in the workspace. When available, “Open next in queue” lets you move through your remaining work without searching for each client.',
      '<strong>Center — Writing & Review:</strong> Use this area to create and review notes. Select the appropriate note tool, verify the client, service date, and clinical details, and review all generated content before saving. AI-assisted text must be reviewed by you and does not replace clinical judgment.',
      '<strong>Left — Note Library:</strong> Use the library to search, filter, group, and reopen drafts or saved notes. The Note Library and Work Queue serve different purposes. Deleting a draft does not remove the related item from the Work Queue. If a to-do is no longer needed, remove it from the queue when appropriate.'
    ]) + p('<strong>Current workflow:</strong> ITSCO is using the note-generation tools while the full clinical charting and signing process is being rolled out in stages. A saved or reviewed note in this workspace is not automatically a signed TherapyNotes record. Until you receive notice that the workflow has changed, continue copying reviewed notes into TherapyNotes as required.') + p(`<a href="${app}/admin/clinical-note-generator">Open Notes Workspace</a>`)
  },
  supervision: {
    title: 'Supervision hours · now tracked in the app',
    body: p('Your supervision hours are now recorded in the app. Review the different hour totals shown in your Provider Update:') + list([
      '<strong>Starting hours — before app tracking:</strong> Your reported supervision hours from before supervision tracking began in this app.',
      '<strong>Imported billing-report hours:</strong> Supervision hours entered from billing reports for recorded periods.',
      '<strong>App-recorded supervision hours:</strong> Hours posted from supervision sessions finalized in the app. These are supervision hours, not pay or service credits; unfinished sessions are not included here.',
      '<strong>Calculated total:</strong> Starting hours plus imported billing-report hours plus app-recorded supervision hours. Compare this with your current recorded balance and report any missing or overlapping hours.'
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
    title: 'Security and passwords · Quick View on your phone',
    body: p('Use Security and passwords in this Provider Update to prepare your app sign-in password, an optional passkey, and your Quick View code. Password and passkey changes require your own verified account session. Preparing them does not turn off Google SSO.') + p('Set up Quick View on your mobile device for fast access during the workday:') + '<h3>Add to Home Screen</h3>' + list([
      '<strong>iOS (Safari):</strong> Tap Share → Add to Home Screen.',
      '<strong>Android (Chrome):</strong> Tap the menu (⋮) → Add to Home screen or Install app.'
    ]) + p('<strong>Get your six-digit code:</strong> Create your passcode through the Provider Update or go to My Preferences → Privacy & Quick View. Existing passcodes will not be displayed or overwritten.') + list([
      'Always use your own account and keep your device passcode-locked.',
      'Adding a shortcut does not enroll you in SMS messages.',
      'Contact Support if you cannot use a personal device.'
    ])
  }
};
