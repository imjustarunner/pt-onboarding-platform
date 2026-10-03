// Reviewed against official vendor documentation on 2026-10-03.
// "Not verified" is deliberately different from "not offered".
const sources = {
 tnReminders: ['TherapyNotes reminder settings', 'https://support.therapynotes.com/hc/en-us/articles/30661340094619-Automated-Patient-Appointment-Reminders'],
 tnPortal: ['TherapyNotes public appointment requests', 'https://support.therapynotes.com/hc/en-us/articles/30661475624987-How-to-Set-Up-and-Customize-Your-Client-Portal'],
 tnAI: ['TherapyFuel documentation tools', 'https://support.therapynotes.com/hc/en-us/articles/34844327115291-TherapyFuel-Overview'],
 tnCheckin: ['TherapyNotes client check-in instructions', 'https://support.therapynotes.com/hc/en-us/articles/30661268584347-Check-In-a-Client'],
 tnSchedule: ['TherapyNotes work schedules', 'https://support.therapynotes.com/hc/en-us/articles/35988920578843-Work-Schedules'],
 spReminders: ['SimplePractice reminder customization', 'https://support.simplepractice.com/hc/en-us/articles/42050891133581-Customizing-appointment-reminder-templates'],
 spConfirm: ['SimplePractice confirmation tracking', 'https://support.simplepractice.com/hc/en-us/articles/42052510111629-Adding-a-confirm-or-cancel-option-in-text-and-voice-reminders'],
 spWidget: ['SimplePractice website appointment widget', 'https://support.simplepractice.com/hc/en-us/articles/115004734123-Adding-the-appointment-request-widget-to-your-website'],
 spPortal: ['SimplePractice online appointment requests', 'https://support.simplepractice.com/hc/en-us/articles/207624876-Enabling-online-appointment-requests'],
 spAI: ['SimplePractice Note Taker', 'https://support.simplepractice.com/hc/en-us/articles/34118738412685-Understanding-Note-Taker'],
 spRooms: ['SimplePractice group practice calendars', 'https://support.simplepractice.com/hc/en-us/articles/360020386171-Using-your-calendar-in-a-group-practice']
};
const source = key => `<a class="comparison-source" href="${sources[key][1]}" target="_blank" rel="noopener" aria-label="Read ${sources[key][0]} (opens in a new tab)">Vendor documentation ↗</a>`;
const cell = (title, text, key) => `<strong>${title}</strong><p>${text}</p>${key ? source(key) : ''}`;

export function comparisonSection({product='auricwell'}={}) {
 const hq = product === 'hq';
 const productName = hq ? 'Plot Twist HQ' : 'AuricWell';
 const context = hq
  ? '<strong>This comparison covers therapy workflows in Plot Twist HQ.</strong> The broader suite also includes people operations, public websites and business workflows. Feature access depends on permissions, plans, agreements and configured integrations. Provider arrival SMS is a design preview.'
  : '<strong>AuricWell is currently an administrator preview.</strong> Its column describes existing shared-platform capabilities and explicitly labeled previews. Practice access requires rollout validation, agreements and configured integrations. Vendor features may depend on plan or add-ons.';
 const rows = [
  ['Text and email appointment reminders',
   cell('Practice-configured notifications', 'Choose channels, timing and message templates within platform controls and recipient preferences.'),
   cell('Available', 'Email, text and phone reminders, with preferences for clients and their contacts.', 'tnReminders'),
   cell('Available', 'Customizable email, text and voice reminder templates.', 'spReminders')],
  ['Client confirmation on the schedule',
   cell('Replies update appointment status', 'Supported confirmation replies mark the appointment client-confirmed. The calendar distinguishes confirmed visits from those awaiting a response.'),
   cell('Specific workflow not verified', 'The reminder guide does not establish client SMS confirmation updating a calendar status. Confirm this detail with TherapyNotes.', 'tnReminders'),
   cell('Available', 'Text and voice confirmations appear in the calendar, client overview and daily agenda.', 'spConfirm')],
  ['A public path into care',
   cell('Enrollment + provider availability', 'Configurable enrollment links, intake forms and acknowledgements, alongside provider profiles and published openings. Placement follows practice review.'),
   cell('Public appointment requests', 'TherapyPortal can let anyone view and request appointments without signing in. Portal forms support intake.', 'tnPortal'),
   cell('Public appointment requests', 'Prospective clients can request appointments. An external website widget is documented for the Plus plan.', 'spWidget')],
  ['AI documentation and transcription',
   cell('Inside Practice Notes', 'Guided sections, treatment context and AI drafting in the note workspace. Authorized transcription supports drafts; clinicians review the result.'),
   cell('TherapyFuel', 'AI progress notes from summaries or transcripts, treatment plans and other documentation tools.', 'tnAI'),
   cell('Note Taker', 'Session transcription and AI-assisted documentation. Review the current plan and consent requirements.', 'spAI')],
  ['Office kiosk and provider arrival alerts',
   cell('Client self check-in', 'Choose the provider and visit; create an in-app arrival alert with an email fallback. Optional check-in feedback adds context. Provider SMS is a preview.'),
   cell('Staff-entered check-in', 'The documented approach uses an Appointment Alert entered by staff, visible on the clinician’s calendar.', 'tnCheckin'),
   cell('Not verified', 'We did not verify a native self-service office kiosk with this provider-arrival workflow in the public documentation reviewed.')],
  ['Physical office and room scheduling',
   cell('Dedicated office workflow', 'Room availability, provider assignments, bookings and holds, with an office directory. Access depends on the practice plan and setup.'),
   cell('Location-based schedules', 'Clinician availability can include locations and visit modes. A dedicated room-reservation workflow was not verified.', 'tnSchedule'),
   cell('Rooms as office locations', 'The documented approach creates a location for each room, then filters the group calendar to see availability.', 'spRooms')]
 ];
 return `<section class="section comparison-section" id="compare"><div class="section-heading"><div><p class="eyebrow">A CLOSER LOOK AT THE WORKFLOW</p><h2>${productName}, TherapyNotes<br> and SimplePractice.</h2></div><p>Reminders, online requests and AI tools are available elsewhere too. Compare how the work fits together, then try the workflows that matter to your team.</p></div><p class="comparison-context" id="comparison-context">${context}</p><div class="comparison-scroll" tabindex="0" role="region" aria-label="EHR feature comparison; scroll horizontally on smaller screens" aria-describedby="comparison-context comparison-method"><table class="comparison-table"><caption>Workflow comparison · Official documentation reviewed October 3, 2026</caption><thead><tr><th scope="col">Workflow</th><th scope="col">${productName} <small>${hq ? 'Configured platform features' : 'Shared platform / preview'}</small></th><th scope="col">TherapyNotes</th><th scope="col">SimplePractice</th></tr></thead><tbody>${rows.map(([label,...cells])=>`<tr><th scope="row">${label}</th>${cells.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="feature-note" id="comparison-method">“Not verified” means we could not confirm that specific workflow in the public documentation reviewed; it does not mean the vendor cannot provide it. This is a focused workflow comparison, not a complete feature inventory or a guarantee of clinical or billing results. Product names belong to their respective owners.</p><details class="comparison-references"><summary>Sources and comparison approach</summary><p>We reviewed the official guides below, including scheduling, portal and reminder instructions. We did not treat an appointment request as a complete enrollment workflow, or a location calendar as identical to a room-reservation system. Confirm current capabilities directly with each vendor.</p><ul>${Object.values(sources).map(([title,url])=>`<li><a href="${url}" target="_blank" rel="noopener">${title} ↗</a></li>`).join('')}</ul></details></section>`;
}

export const faqs = [
 ['What makes AuricWell different?', 'The focus is the connected workflow: guided Practice Notes, treatment-goal history, supervision queues, configurable enrollment, provider availability and office check-in. Try the examples to see how those pieces fit your practice. We do not claim to be the only EHR with AI, reminders or online requests.'],
 ['Can clients confirm appointments by text?', 'The shared scheduling workflow supports confirmation replies and shows client-confirmed status on the schedule. Practice settings govern reminder timing, templates and enabled email or text channels, subject to recipient preferences and consent. Confirm these integrations for your AuricWell rollout.'],
 ['What happens when a client checks in at the kiosk?', 'The client selects their provider and scheduled visit. The office workflow creates an in-app arrival alert, with a pending email fallback if it is not acknowledged and email is enabled. Optional feedback can capture connection and treatment progress. The provider SMS shown here is a preview, not an active kiosk delivery channel.'],
 ['Can clients start enrollment from our website?', 'The shared platform supports configurable public enrollment links, intake forms and signed acknowledgements, plus provider profiles and published availability. Your practice reviews placement and configures the information and forms it needs. An appointment request is not automatically a confirmed placement.'],
 ['Can more than one guardian have access?', 'Yes. The shared care platform supports separate client and guardian relationships, including multiple guardians. Access depends on each guardian’s authorization for that client; it is not blanket access to every record or document.'],
 ['Do AI-generated notes still need clinician review?', 'Yes. AI helps create a draft. The clinician reviews and edits the content before signing. Transcription and AI services require the applicable configuration, agreements and acknowledgements. Guided documentation remains useful without AI generation.'],
 ['Does every note need a supervisor cosign?', 'No. A configured review-only workflow can avoid an additional cosign where it is appropriate. Required approval and signature rules still apply to the clinician, service, payer and document. AuricWell does not remove a required cosign.'],
 ['Can we tailor treatment plans and amend signed notes?', 'The shared clinical tools support configurable plan sections, goals, objectives and rating scales, with historical ratings across visits. Signed notes can receive addenda, corrections and late entries while retaining the original and following the applicable review workflow.'],
 ['Does AuricWell guarantee an audit-proof note or paid claim?', 'No. Guided sections and configured timing, service and claim checks help identify missing requirements. Clinical accuracy, appropriate coding, required signatures and payer decisions still need professional review. No software can promise every note or claim will be error-free.'],
 ['Can a new practice start without migration files?', 'Yes—that is the new-practice onboarding path. It begins with the team, locations, services, fees, forms and agreements. Historical records and migration completion are not prerequisites. Customer rollout still requires the full operational workflow to be ready.'],
 ['Can we transition from our current EHR?', 'Begin with the exports available from your current system. Staff, clients, payers, clinical documents, billing history and opening balances need mapping, review and reconciliation before cutover. Compatibility is reviewed first; a direct connection to every EHR is not assumed.'],
 ['What is available now, and what does it cost?', 'The website shows an administrator preview and existing shared-platform workflows. Feature access depends on the practice’s plan, configuration and rollout readiness. Commercial terms are agreed before contracting; no prices or payment details are requested on this website.'],
 ['Is AuricWell the treating practice?', 'No. Your practice provides care. AuricWell provides the software experience; the actual treating practice and relevant legal parties remain identified in patient agreements.']
];

export const hqFaqs = faqs.map(([question,answer],index) => {
 const adapted = {
  0: ['What makes Plot Twist HQ different?', 'Plot Twist HQ brings client care and business operations together: guided Practice Notes, treatment-goal history, supervision, enrollment, scheduling and office check-in, alongside people operations, payroll workflows and public websites. We do not claim to be the only platform with AI, reminders or online requests.'],
  9: ['Can a new practice start without migration files?', 'A new practice can begin with its team, locations, services, fees, forms and agreements. Historical imports are for practices bringing existing records; they are not a prerequisite for starting fresh. Confirm the workflows and integrations your team needs before launch.'],
  11: ['Which features are included, and what does it cost?', 'Feature access follows your organization’s plan, permissions and enabled integrations. We agree on software access, management support and commercial terms before contracting. This website does not publish prices or require payment details.'],
  12: ['Who provides care when we use Plot Twist HQ?', 'Your treating practice and its providers deliver care. The software and management support do not change the legal parties identified in patient agreements. Plot Twist Co. and your organization agree separately on business support and responsibilities.']
 };
 return adapted[index] || [question.replaceAll('AuricWell','Plot Twist HQ'),answer.replaceAll('AuricWell rollout','Plot Twist HQ setup').replaceAll('AuricWell','Plot Twist HQ')];
});

export function faqSection({compact=false, base='/auricwell', product='auricwell'}={}) {
 const entries = product === 'hq' ? hqFaqs : faqs;
 const selected = compact ? [entries[0],entries[1],entries[9],entries[10]] : entries;
 return `<section class="section faq-section" id="faq"><div class="section-heading"><div><p class="eyebrow">FREQUENTLY ASKED QUESTIONS</p><h2>Good questions.<br> Clear answers.</h2></div><p>From the first appointment to the signed note, here is what to expect.${compact?` <a href="${base}${product === 'hq' ? '/hq' : '/product'}#faq">Read all questions →</a>`:''}</p></div><div class="faq-grid">${selected.map(([q,a])=>`<details class="faq"><summary>${q}<span aria-hidden="true">+</span></summary><p>${a}</p></details>`).join('')}</div></section>`;
}
