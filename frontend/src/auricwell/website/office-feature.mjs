// Uses the existing office/kiosk example and the website's shared feature cards.
// Physical-office tools are distinct from a provider's private virtual office.
export function officeFeatureSection({ feature, link }) {
  return `<section class="section tinted office-feature" id="office">
    <div class="section-heading"><div><p class="eyebrow">AURICWELL OFFICE · KIOSK & OFFICE MANAGEMENT</p><h2>Your office.<br> Your rooms. <em>All connected.</em></h2></div><p>Manage the spaces where care happens, from your buildings and room reservations to the moment a client checks in. AuricWell runs the office workflow in the app, with a welcoming kiosk at the front desk.</p></div>
    <div class="features feature-grid-six">
      ${feature('home', 'Buildings, offices and rooms', 'Keep your buildings, office spaces, room types and photos together. Manage which organizations can access and book each building.')}
      ${feature('calendar', 'Reservations in one calendar', 'See room availability, reserve space and review room/time conflicts. Link an office booking with an appointment where the workflow calls for it.')}
      ${feature('people', 'A workspace that fits your team', 'Set recurring provider assignments, reserve time for a person or place a company hold. Shared buildings keep each organization’s identity clear.', true)}
      ${feature('shield', 'An office kiosk, ready to welcome', 'Set up the office device with a building-specific code. Clients choose their provider and visit, then check in without opening a staff account or client chart.')}
      ${feature('note', 'Check-in shaped around the visit', 'Choose the questionnaires and digital forms shown at check-in. Apply them across a building or match them to a room, day and time window.')}
      ${feature('message', 'Know when your client arrives', 'Bring arrivals into the provider’s app, with configured email fallback. When enabled, completed check-in feedback gives the provider useful context for the visit.', true)}
    </div>
    <p class="feature-note">Office tools depend on your practice’s plan, permissions and setup. Buildings, assignments, bookings and kiosk check-in use app records; Google Calendar is an optional connection for calendar copies, not a requirement.</p>
    <div class="actions">${link('contact', 'Ask about AuricWell Office')}${link('product#kiosk', 'Try the kiosk example', 'button secondary')}</div>
    <div id="kiosk" class="office-kiosk-example">
      <div class="section-heading"><div><p class="eyebrow">TRY AN OFFICE ARRIVAL</p><h2>A warm welcome.<br> A timely heads-up.</h2></div><p>Follow a fictional client check-in, then explore the provider’s in-app arrival alert and email fallback. The SMS tab shows a design preview.</p></div>
      <div data-actual-example="kiosk"><p>Loading the office check-in example…</p></div>
      <noscript><p>Clients choose their provider and visit at the office kiosk. In-app arrival alerts and a configured email fallback help the provider respond. Enable JavaScript to explore the fictional example. Provider arrival SMS is a design preview.</p></noscript>
    </div>
  </section>`;
}
