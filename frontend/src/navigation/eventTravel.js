// The server rebuilds this itinerary from answers; client-supplied legs never determine eligibility.
export const EVENT_TRAVEL_STEPS = ['Event', 'Materials', 'Your trips', 'Review'];
export const locationKinds = ['home', 'office', 'school', 'other'];
export function eventTravelJourneys(form) {
  const office = { kind: 'office' }, event = { kind: 'event' };
  const journeys = [];
  const add = (key, label, points) => {
    const stops = points.filter((p, i) => !i || p.kind !== points[i - 1].kind || (p.kind !== 'office' && p.kind !== 'event'));
    journeys.push({ key, label, legs: stops.slice(1).map((to, i) => ({ key: `${key}-${i}`, from: stops[i], to })) });
  };
  if (form.materialsPickup === 'before_event' && form.pickupTiming === 'separate') {
    add('pickup', 'Separate materials pickup', [form.pickupFrom, office, form.pickupTo]);
  }
  add('outbound', 'To the event', [form.departure, ...(form.materialsPickup === 'before_event' && form.pickupTiming === 'on_way' ? [office] : []), event]);
  add('inbound', 'After the event', [event, ...(form.materialsReturn === 'after_event' ? [office] : []), form.returnTo]);
  if (form.materialsReturn === 'separate') add('return', 'Separate materials return', [form.dropoffFrom, office, form.dropoffTo]);
  return journeys;
}

export function eventTravelDefaultForm() {
  return { eventDate: '', officeLocationId: null, materialsPickup: '', pickupTiming: 'on_way',
    pickupRequirement: 'convenient', materialsReturn: '', returnRequirement: 'convenient', vehicle: 'personal',
    departure: { kind: 'home' }, returnTo: { kind: 'home' }, pickupFrom: { kind: 'home' }, pickupTo: { kind: 'home' },
    dropoffFrom: { kind: 'home' }, dropoffTo: { kind: 'home' }, intervals: {}, handling: {}, notes: '', attestation: false };
}

export function recommendEventTravelLeg({ from, to, journey, form, legacyTravelPolicy = false }) {
  const home = from.kind === 'home' || to.kind === 'home';
  const separate = ['pickup', 'return'].includes(journey);
  const required = separate && (journey === 'pickup' ? form.pickupRequirement : form.returnRequirement) === 'required';
  const unknown = from.kind === 'other' || to.kind === 'other';
  const review = unknown || required || form.notes || form.transportDuties || form.specialTrip;
  const business = !home && !unknown;
  const legacy = legacyTravelPolicy && home && (from.kind === 'event' || to.kind === 'event');
  return { timeEligible: business || required || legacy, mileageEligible: (business || required) && form.vehicle === 'personal',
    reason: legacy ? 'Earlier event travel policy: review the agreement in effect for this trip.'
      : required ? 'Separate required materials trip: confirm the assignment and route.'
        : business ? 'Travel between work locations.' : unknown ? 'Other location: review the purpose of this trip.'
          : 'Ordinary home-to-work travel; review any reported exceptions.',
    needsReview: !!review };
}
