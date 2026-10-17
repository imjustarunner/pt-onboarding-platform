// Owner-requested October 17, 2026 amendment. Full handbook sources remain in private storage.
export const APPROVED_EVENT_TIME_HTML = "<h4>Approved event time</h4><p>Approved events, including assigned school events, will be compensated at the employee's indirect rate. Record actual time working at the event as Indirect Service. Assigned providers receive an email check-in link and, when opted in, a text reminder. Reply CHECKIN to check in when event work begins, or open the email link and select Check in. Check out when event work ends using the event page or by replying CHECKOUT. If more than one event is available, include the event code requested in the text reply.</p><p>Travel to and from approved events is recorded separately under Support Activity → Approved Travel and compensated at the employee's Support Activity rate. Use the event page to enter actual travel start and end times for each direction. Do not include travel in event attendance time or submit the same time twice.</p>";
export const APPROVED_EVENT_TRAVEL_HTML = "<p>Travel to and from approved events is compensated at the employee's Support Activity rate. Record each direction separately as Support Activity → Approved Travel using actual travel start and end times on the event check-in page. Time working at the approved event is compensated at the employee's indirect rate and must not include travel time.</p>";
export const APPROVED_EVENT_REVIEW_HTML = "<h4>Approved events and travel</h4><p>Approved events, including assigned school events, will be compensated at the employee's indirect rate. Assigned providers can use their email event link or reply CHECKIN to an opted-in reminder text. Check out when event work ends. Travel to and from is recorded separately as Support Activity → Approved Travel at the employee's Support Activity rate. Enter each direction's actual start and end times on the event page without duplicating event attendance time.</p>";

const sectionSlugs = ['indirect-services', 'compensation-separately-compensated-indirect-service', 'compensation-support-activity'];
export function applyEventTimeHandbookAmendment(source, tenant) {
  if (tenant !== 'itsco') return source;
  for (const section of source.sections || []) {
    if (!sectionSlugs.includes(section.slug) || section.status !== 'ready') continue;
    const body = section.bodyHtml || '';
    if (section.slug === 'compensation-support-activity') {
      if (body.includes(APPROVED_EVENT_TRAVEL_HTML)) continue;
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
    if (!String(entry.changed_content || '').includes('<h4>Approved events and travel</h4>')) entry.changed_content = (entry.changed_content || '') + '\n' + APPROVED_EVENT_REVIEW_HTML;
    entry.policy_section_slugs = [...new Set([...(entry.policy_section_slugs || []), ...sectionSlugs])];
  }
  return updates;
}
