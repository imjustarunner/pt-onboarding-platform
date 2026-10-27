// Event attendance stays separate; the Submit form records the full travel report.
const travelInstructions = "<p>Use Submit → Event travel reimbursement to report actual trips to and from an assigned event, including materials pickup and return trips on other dates. Describe where you traveled and whether materials trips were required or made at your convenience. Payroll reviews the report and pays eligible travel and materials-handling time at the employee's Support Activity rate, with eligible personal-vehicle expenses recorded separately. Ordinary commuting is reviewed separately from travel between work locations. Earlier trips retain the compensation policy or agreement that applied when the travel occurred. Do not include event attendance or duplicate time or expenses already submitted.</p>";
export const APPROVED_EVENT_TIME_HTML = "<h4>Approved event time</h4><p>Approved events, including assigned school events, will be compensated at the employee's indirect rate. Use the event email or opted-in text reminder to clock in when event work begins and clock out when it ends. Event attendance does not include travel time.</p>" + travelInstructions;
export const APPROVED_EVENT_TRAVEL_HTML = travelInstructions + "<p>Time working at the approved event is compensated at the employee's indirect rate and recorded through event clock-in and clock-out.</p>";
export const APPROVED_EVENT_REVIEW_HTML = "<h4>Approved events and travel</h4>" + APPROVED_EVENT_TRAVEL_HTML;

const refreshTravelInstructions = (body = '') => body
  .replace(/<p>Use the event page to enter actual travel start and end times for each direction\.<\/p>/g, travelInstructions)
  .replace(/<p>Enter each direction's actual start and end times on the event page[^<]*<\/p>/g, travelInstructions)
  .replace(/<p>Travel to and from approved events[\s\S]*?<\/p>/g, travelInstructions)
  .replace(/<p>Approved events, including assigned school events,[\s\S]*?Support Activity → Approved Travel[\s\S]*?<\/p>/g, APPROVED_EVENT_TRAVEL_HTML);

const sectionSlugs = ['indirect-services', 'compensation-separately-compensated-indirect-service', 'compensation-support-activity'];
export function applyEventTimeHandbookAmendment(source, tenant) {
  if (tenant !== 'itsco') return source;
  for (const section of source.sections || []) {
    if (!sectionSlugs.includes(section.slug) || section.status !== 'ready') continue;
    const body = refreshTravelInstructions(section.bodyHtml || '');
    section.bodyHtml = body;
    if (section.slug === 'compensation-support-activity') {
      if (body.includes(travelInstructions) || body.includes('#handbook-event-travel-reimbursement')) continue;
      section.bodyHtml = body.replace('<li>compensable travel to outreach activities;</li>', '<li>travel to and from approved events, including assigned school and outreach events;</li>')
        .replace('<p>Compensable travel associated with that outreach assignment is generally classified as Support Activity.</p>', '') + '\n' + APPROVED_EVENT_TRAVEL_HTML;
    } else if (!body.includes('<h4>Approved event time</h4>')) {
      section.bodyHtml = body + '\n' + APPROVED_EVENT_TIME_HTML;
    }
  }
  return source;
}

export function applyEventTimeReviewAmendment(updates, tenant) {
  if (tenant !== 'itsco') return updates;
  const entry = updates.find(update => Number(update.id) === 4 && update.status === 'draft');
  if (entry) {
    entry.changed_content = refreshTravelInstructions(entry.changed_content || '');
    if (!String(entry.changed_content || '').includes('<h4>Approved events and travel</h4>')) entry.changed_content = (entry.changed_content || '') + '\n' + APPROVED_EVENT_REVIEW_HTML;
    entry.policy_section_slugs = [...new Set([...(entry.policy_section_slugs || []), ...sectionSlugs])];
  }
  return updates;
}
