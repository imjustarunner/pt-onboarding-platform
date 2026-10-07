// Preparation only. Scenarios contain no caller data and cannot verify identity,
// look up appointments, change an appointment, or activate the Voice API.
const scenarios = new Set(['unknown', 'known_no_appointments', 'known_appointments', 'shared_number', 'lookup_unavailable']);
const intents = new Set(['support', 'scheduling', 'billing', 'provider', 'cancel', 'reschedule']);
const fail = (message) => { throw Object.assign(new Error(message), {status: 400}); };

export function previewMainLineReceptionist(config, {scenario = 'unknown', intent = 'support'} = {}) {
  if (!scenarios.has(scenario)) fail('Choose a receptionist caller scenario.');
  if (!intents.has(intent)) fail('Choose a receptionist request.');
  const appointmentMenu = scenario === 'known_appointments';
  const options = appointmentMenu
    ? ['Support', 'Cancel an appointment', 'Reschedule an appointment', 'Billing']
    : ['Support', 'Scheduling', 'Billing'];
  const question = appointmentMenu
    ? 'Would you like to speak with support, cancel or reschedule an appointment, or ask about billing?'
    : 'Would you like to speak with support, ask about scheduling, or ask about billing?';
  const steps = [];
  const appointmentRequest = intent === 'cancel' || intent === 'reschedule';
  if (appointmentRequest) {
    steps.push('Verify the caller and their authority to act for the client before finding or discussing an appointment. Caller ID alone is not verification.');
    steps.push('After verification, show only appointments this caller is authorized to manage. If there are several, ask which one; never select one automatically.');
    steps.push(intent === 'cancel'
      ? 'Read back the selected appointment and ask for explicit confirmation before cancelling. Recheck its current status and report success only after the change is saved.'
      : 'Confirm the selected appointment and a new available time before changing it. Keep the original appointment until the replacement is successfully saved.');
    steps.push('Until appointment actions are connected, send the request to staff and explain that the appointment has not been changed.');
  } else if (intent === 'billing') {
    steps.push('Route to billing support. Verify identity before discussing balances or other account information. Unresolved requests need a billing-tagged follow-up ticket.');
  } else if (intent === 'provider') {
    steps.push('Offer provider assistance without naming or confirming a provider relationship. Staff verifies the caller before discussing client information.');
  } else {
    steps.push(intent === 'scheduling' ? 'Route the scheduling request to staff.' : 'Route the caller to the support team.');
  }
  return {
    simulation: true, callsPlaced: false, callerLookupConnected: false, appointmentActionsConnected: false,
    scenario, intent, options,
    greeting: `${config.greeting} I'm the automated assistant. ${question} Say support or press zero at any time. If no one is available, you can leave a message.`,
    steps,
    safeguards: [
      'Recognize callers only within the agency that owns the called main number. Withheld, unknown, shared, or ambiguous numbers and lookup failures use the general greeting.',
      'A recognized number changes the menu only. Do not announce client names, appointment dates, providers, balances, or even that an appointment was found before verification.',
      'Unknown callers can still ask to cancel or reschedule; help them through verification or staff without confirming whether an account exists.',
      'Offer human help immediately when requested or when recognition fails. After-hours routing follows the saved support or voicemail settings.'
    ]
  };
}
