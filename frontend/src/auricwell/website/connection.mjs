// Public, illustrative content only. No account data, messaging client or API calls.
function conversationExample() {
  return `<figure class="connection-example">
    <div class="connection-example-top"><span class="connection-monogram" aria-hidden="true">aw</span><div><strong>Your practice. Your conversation.</strong><span>Assigned provider · Illustrative SMS</span></div><span class="connection-channel">SMS</span></div>
    <div class="connection-conversation">
      <div class="connection-recipient"><span class="connection-avatar" aria-hidden="true">SF</span><div><strong>Sample family</strong><span>Conversation with the practice</span></div></div>
      <div class="connection-bubble"><span>Family</span><p>Hi! Which entrance should we use for tomorrow’s appointment?</p></div>
      <div class="connection-bubble connection-bubble-out"><span>Assigned provider · App reply</span><p>Please use the main entrance. We’ll meet you in the lobby.</p></div>
      <div class="connection-history"><span aria-hidden="true">↳</span> The conversation stays in your workspace.</div>
    </div>
    <figcaption>Illustrative layout with fictional messages. No text is sent from this website.</figcaption>
  </figure>`;
}

function guardianExample() {
  return `<figure class="guardian-example">
    <figcaption><span class="eyebrow">ONE CHILD · AUTHORIZED ACCESS</span><strong>Connected to care.<br>Signed in as themselves.</strong></figcaption>
    <div class="guardian-accounts">
      <div class="guardian-account"><span class="connection-avatar" aria-hidden="true">AM</span><strong>Alex Morgan</strong><span>Guardian account</span><p>Own login<br>Own contact preferences</p></div>
      <div class="guardian-account"><span class="connection-avatar guardian-avatar-gold" aria-hidden="true">JM</span><strong>Jamie Morgan</strong><span>Guardian account</span><p>Own login<br>Own contact preferences</p></div>
    </div>
    <div class="guardian-shared"><strong>A shared view, where authorized</strong><span>Appointments · Shared care conversation</span></div>
    <p class="guardian-private">Private enrollment documents and individual payment details stay separate.</p>
    <p class="connection-disclosure">Illustrative account relationships · Fictional names</p>
  </figure>`;
}

function appointmentExample() {
  return `<figure class="connection-example appointment-example">
    <div class="connection-example-top"><span class="connection-monogram" aria-hidden="true">aw</span><div><strong>An appointment. A simple reply.</strong><span>Appointment reminders · Illustrative example</span></div><span class="connection-channel">SMS</span></div>
    <div class="connection-conversation">
      <div class="connection-bubble"><span>Practice reminder</span><p>Example Practice: Your appointment is Tuesday at 3:00 PM. Reply Y to confirm attendance.</p></div>
      <div class="connection-bubble connection-bubble-out"><span>Client reply</span><p class="appointment-reply">Y</p></div>
      <div class="appointment-confirmed"><span aria-hidden="true">✓</span><div><strong>Attendance confirmed</strong><span>The response is recorded on the appointment.</span></div></div>
    </div><figcaption>Fictional reminder and response. No text is sent and no appointment is changed.</figcaption>
  </figure>`;
}

export function homeConnectionStory({link}) {
  const slides = [
    {label:'Appointment reminders',title:'A reminder. A “Y”. A clearer day.',text:'Clients receive an appointment text and reply Y to confirm attendance. Your team can see the recorded confirmation as it prepares for the visit.',path:'appointment-reminders',action:'Explore appointment reminders',visual:appointmentExample()},
    {label:'In-app texting',title:'1:1 texting with the assigned provider.',text:'Clients can text their assigned provider through the practice’s number. Providers reply in the app, with authorized support coverage and conversation history available to the care team.',path:'texting',action:'Explore in-app texting',visual:conversationExample()},
    {label:'Guardian accounts',title:'Separate accounts. Connected care.',text:'Give each authorized guardian their own login and access to the child’s shared care conversation. Private enrollment documents and individual payment details stay separate.',path:'guardians',action:'Explore guardian accounts',visual:guardianExample()},
    {label:'Documentation',title:'Your notes. Optional AI assistance.',text:'Write the note yourself or choose AI drafting. With client consent collected in the app, an authorized session transcript can become a draft for the clinician to review, edit and sign.',path:'documentation',action:'Explore documentation',visual:'<div class="feature-document-example"><span class="eyebrow">NOTE WORKSPACE</span><strong>Context in.<br>Clinical judgment throughout.</strong><ol><li>Write manually or choose AI assistance</li><li>Collect consent before transcription</li><li>Turn the authorized transcript into a draft</li><li>Review, edit and sign the note</li></ol></div>'}
  ];
  return `<section class="section feature-rotation" id="feature-highlights" aria-labelledby="feature-highlights-heading" aria-roledescription="carousel" data-feature-rotation>
    <div class="feature-rotation-heading"><div><p class="eyebrow">EXPLORE AURICWELL</p><h2 id="feature-highlights-heading">Small details.<br> A more connected practice.</h2></div><div class="feature-rotation-controls" hidden data-rotation-controls><button type="button" data-rotation-toggle>Pause rotation</button><button type="button" data-rotation-previous aria-label="Previous feature">←</button><button type="button" data-rotation-next aria-label="Next feature">→</button></div></div>
    <div class="feature-rotation-tabs" role="group" aria-label="Choose a feature" hidden data-rotation-controls>${slides.map((slide,index)=>`<button type="button" data-feature-index="${index}" aria-pressed="${index===0}" aria-controls="feature-slide-${index}">${slide.label}</button>`).join('')}</div>
    <div class="feature-rotation-window">${slides.map((slide,index)=>`<div class="feature-rotation-slide" id="feature-slide-${index}" role="group" aria-roledescription="slide" aria-label="${index+1} of ${slides.length}: ${slide.label}" ${index?'hidden':''}><div class="feature-rotation-copy"><p class="eyebrow">${slide.label}</p><h3>${slide.title}</h3><p>${slide.text}</p>${link(`product#${slide.path}`,slide.action,'text-link')}</div>${slide.visual}</div>`).join('')}</div>
    <p class="feature-rotation-status" role="status" aria-live="polite" data-rotation-status></p>
    <p class="connection-footnote">Feature access follows your practice’s setup and plan. Texting requires consent and an activated messaging integration; guardian access follows authorization.</p>
  </section>`;
}

export function productConnectionStory({link}) {
  return `<section class="section connection-spotlight" id="appointment-reminders" aria-labelledby="appointment-reminders-heading"><div class="connection-layout"><div class="connection-copy"><p class="eyebrow">APPOINTMENT TEXTS & CONFIRMATION</p><h2 id="appointment-reminders-heading">A simple “Y”.<br> A confirmed appointment.</h2><p class="connection-lead">Give clients a familiar way to respond to an upcoming visit. A configured appointment text asks them to reply Y to confirm attendance, and the confirmation is recorded on the appointment.</p><ul class="connection-points"><li><strong>A timely reminder.</strong><span>Appointment texts follow the practice’s configured workflow and each recipient’s reminder preferences.</span></li><li><strong>A reply that connects back.</strong><span>The client replies Y. When the system can match the reply to the upcoming appointment, it records the confirmation for the team.</span></li><li><strong>A clearer schedule.</strong><span>See which appointments have a recorded confirmation and which still need follow-up.</span></li></ul>${link('contact','Discuss reminders for your practice','text-link')}</div>${appointmentExample()}</div><p class="connection-footnote">Requires recipient consent, an activated texting integration and an eligible appointment. A confirmation records the client’s response; it does not establish attendance at the visit.</p></section>
  <section class="section" id="texting" aria-labelledby="texting-heading">
    <div class="connection-layout"><div class="connection-copy"><p class="eyebrow">IN-APP TEXTING</p><h2 id="texting-heading">A familiar way to reach families.<br> A better place to manage it.</h2><p class="connection-lead">Give clients a direct texting conversation with their assigned provider through the practice’s number. The provider can respond in the app without sharing a personal phone number; authorized support coverage keeps the practice connected.</p>
      <ul class="connection-points"><li><strong>Your practice’s number.</strong><span>Send and receive texts in the app without using a provider’s personal phone number.</span></li><li><strong>Reply SUPPORT when a handoff is offered.</strong><span>If the provider is unavailable and the texting workflow offers support, replying SUPPORT requests review by the support team. The message remains available in the app for the provider; response time depends on staff availability. This is not an emergency service.</span></li><li><strong>Context for the next reply.</strong><span>Client text history connects the chart and messaging workspace. Provider conversations and support routing follow configured staff access.</span></li><li><strong>Preferences that follow the person.</strong><span>Consent, message categories and opt-outs guide which texts can be sent. Optional staff phone forwarding is configured separately.</span></li></ul>
      ${link('contact','See how texting fits your practice','text-link')}
    </div>${conversationExample()}</div>
    <p class="connection-footnote">Texting requires practice activation, carrier approval, an enabled integration and recipient consent. SMS is distinct from the authenticated portal’s shared care conversation. Delivery status does not confirm that a person has read a message.</p><aside class="texting-security"><h3>Powered by Notifyre’s HIPAA-compliant messaging service</h3><p>A BAA is required before activation. Practice access controls, recorded consent and opt-outs support the texting workflow. Carrier SMS does not have native end-to-end encryption; use the secure portal for sensitive clinical information.</p><p><a href="https://notifyre.com/us/online-sms/patient-appointment-reminders" target="_blank" rel="noopener">Notifyre’s healthcare safeguards ↗</a> · <a href="https://support.notifyre.com/does-notifyre-offer-business-associate-agreements" target="_blank" rel="noopener">About the BAA ↗</a></p></aside>
  </section>
  <section class="section guardian-spotlight" id="guardians" aria-labelledby="guardians-heading"><div class="connection-layout">
    ${guardianExample()}<div class="connection-copy"><p class="eyebrow">MULTIPLE GUARDIAN ACCOUNTS</p><h2 id="guardians-heading">Every guardian is a person.<br> Their account should be, too.</h2><p class="connection-lead">Support the people involved in a child’s care with individual logins and clearly defined access. Families stay connected without sharing a password.</p>
      <ul class="connection-points"><li><strong>Each person has their own account.</strong><span>Manage guardian relationships and contact-sharing preferences for each child, subject to access restrictions.</span></li><li><strong>A shared care conversation.</strong><span>Messages in the child’s shared care conversation are visible to the currently authorized guardians and care team. Appointment access alone does not grant clinical-message access.</span></li><li><strong>Personal details stay personal.</strong><span>Private enrollment documents and individual payment details remain separate. Access to a child’s care does not give unrestricted access to another guardian’s information.</span></li></ul>
      ${link('contact','Explore your family-access workflow','text-link')}
    </div></div></section>`;
}
