import api from './api';

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizePollOption(option = {}, index = 0) {
  return {
    id: option.id || `option-${index + 1}`,
    label: String(option.label || `Option ${index + 1}`),
    percent: Number(option.percent || 0)
  };
}

function normalizePoll(poll = {}, index = 0) {
  return {
    id: poll.id || `poll-${index + 1}`,
    title: String(poll.title || `Poll ${index + 1}`),
    question: String(poll.question || ''),
    releaseMode: poll.releaseMode === 'manual' ? 'manual' : 'auto',
    visibility: String(poll.visibility || 'Live to class'),
    options: Array.isArray(poll.options) ? poll.options.map(normalizePollOption) : []
  };
}

function normalizeSlide(slide = {}, index = 0) {
  return {
    id: slide.id || `slide-${index + 1}`,
    number: Number(slide.number || index + 1),
    title: String(slide.title || `Slide ${index + 1}`),
    headline: String(slide.headline || slide.title || `Slide ${index + 1}`),
    summary: String(slide.summary || ''),
    notes: String(slide.notes || ''),
    googleSlidesUrl: String(slide.googleSlidesUrl || ''),
    activityId: slide.activityId ? String(slide.activityId) : '',
    documentId: slide.documentId ? Number(slide.documentId) : null,
    pollId: slide.pollId ? String(slide.pollId) : '',
    autoOpenDocument: slide.autoOpenDocument !== false,
    autoLaunchPoll: slide.autoLaunchPoll !== false
  };
}

function createSessionPlan(title, summary, overrides = {}) {
  return {
    ...createMentalHealthDemoPlan(createId('plan')),
    title,
    templateSummary: summary,
    ...overrides
  };
}

export function createMentalHealthDemoPlan(eventId = 'demo') {
  const eid = String(eventId || 'demo');
  return {
    version: 1,
    eventId: eid,
    title: 'Feelings Lab - Big Emotions and Calm Choices',
    templateSummary: 'A guided mental-health mini-class for children on emotions, regulation, and trusted adults.',
    deckSource: 'internal',
    deckGoogleSlidesUrl: '',
    layout: {
      defaultRailCollapsed: false,
      defaultEngageCollapsed: false
    },
    slides: [
      {
        id: 'slide-1',
        number: 1,
        title: 'Welcome',
        headline: 'Welcome to Feelings Lab',
        summary: 'Today we will notice emotions, practice calming strategies, and make a plan for asking for help.',
        notes: 'Warmly normalize that every child has big feelings. Invite quiet participation and remind them that cameras can stay off.',
        activityId: 'activity-1',
        pollId: '',
        documentId: null
      },
      {
        id: 'slide-2',
        number: 2,
        title: 'Body Clues',
        headline: 'What does your body do first?',
        summary: 'Help kids notice how emotions show up in their chest, stomach, hands, and face.',
        notes: 'Ask for examples in chat: shaky hands, butterflies, hot cheeks, tears, tight jaw.',
        activityId: 'activity-2',
        documentId: null,
        pollId: ''
      },
      {
        id: 'slide-3',
        number: 3,
        title: 'Calm Tools',
        headline: 'Pick a calm-down tool',
        summary: 'Breathing, movement, sensory strategies, and asking for space can all be healthy regulation tools.',
        notes: 'This is a great point to display the coping-plan worksheet if one is mapped.',
        activityId: 'activity-3',
        documentId: null,
        pollId: 'poll-1',
        autoLaunchPoll: true
      },
      {
        id: 'slide-4',
        number: 4,
        title: 'Trusted Adults',
        headline: 'Who can help when feelings get big?',
        summary: 'Kids identify safe adults at home, school, and in the community.',
        notes: 'Invite children to name one person privately in the worksheet if they do not want to share aloud.',
        activityId: 'activity-4',
        documentId: null,
        pollId: ''
      },
      {
        id: 'slide-5',
        number: 5,
        title: 'Wrap Up',
        headline: 'One thing I can try this week',
        summary: 'Close with a simple, realistic next step and celebrate participation.',
        notes: 'Review one coping step, one trusted adult, and one time to practice before the next session.',
        activityId: 'activity-5',
        documentId: null,
        pollId: 'poll-2',
        autoLaunchPoll: false
      }
    ],
    polls: [
      {
        id: 'poll-1',
        title: 'Emotion Check',
        question: 'When a big feeling shows up, what helps you the fastest?',
        releaseMode: 'auto',
        visibility: 'Live to class',
        options: [
          { id: 'breath', label: 'Slow breathing', percent: 42 },
          { id: 'move', label: 'Move my body', percent: 28 },
          { id: 'talk', label: 'Talk to an adult', percent: 18 },
          { id: 'quiet', label: 'Take quiet space', percent: 12 }
        ]
      },
      {
        id: 'poll-2',
        title: 'Confidence Check',
        question: 'How ready do you feel to use one calm-down tool this week?',
        releaseMode: 'manual',
        visibility: 'Release when the class closes',
        options: [
          { id: 'very', label: 'Very ready', percent: 36 },
          { id: 'somewhat', label: 'Somewhat ready', percent: 41 },
          { id: 'need-help', label: 'I still need help', percent: 23 }
        ]
      }
    ]
  };
}

export function normalizeClassPresentationPlan(rawPlan, eventId = 'demo') {
  const base = rawPlan && typeof rawPlan === 'object' ? rawPlan : createMentalHealthDemoPlan(eventId);
  const seed = createMentalHealthDemoPlan(eventId);
  const plan = {
    ...seed,
    ...base
  };
  plan.title = String(plan.title || seed.title);
  plan.templateSummary = String(plan.templateSummary || seed.templateSummary || '');
  plan.deckSource = plan.deckSource === 'google' ? 'google' : 'internal';
  plan.deckGoogleSlidesUrl = String(plan.deckGoogleSlidesUrl || '');
  plan.layout = {
    defaultRailCollapsed: !!plan.layout?.defaultRailCollapsed,
    defaultEngageCollapsed: !!plan.layout?.defaultEngageCollapsed
  };
  plan.slides = Array.isArray(plan.slides) ? plan.slides.map(normalizeSlide) : seed.slides;
  plan.polls = Array.isArray(plan.polls) ? plan.polls.map(normalizePoll) : seed.polls;
  return plan;
}

function createDefaultSeriesLibrary() {
  return [
    {
      title: 'Parent-Child Partnership Class',
      summary: 'A six-session family skills series with branded lesson decks, mapped worksheets, and guided participation.',
      sessions: [
        {
          title: 'Session 1: Building Safety and Connection',
          summary: 'Families practice opening rituals, shared expectations, and a calm start to the series.',
          eventLabel: 'Attach to Program Event when scheduled',
          plan: createSessionPlan(
            'Session 1: Building Safety and Connection',
            'Families practice opening rituals, shared expectations, and a calm start to the series.'
          )
        },
        {
          title: 'Session 2: Feelings and Body Clues',
          summary: 'Caregivers and children identify emotions early and track body clues together.',
          eventLabel: '',
          plan: createSessionPlan(
            'Session 2: Feelings and Body Clues',
            'Caregivers and children identify emotions early and track body clues together.'
          )
        },
        {
          title: 'Session 3: Calm Tools at Home',
          summary: 'The class builds a shared home regulation toolbox and a plan for practicing it.',
          eventLabel: '',
          plan: createSessionPlan(
            'Session 3: Calm Tools at Home',
            'The class builds a shared home regulation toolbox and a plan for practicing it.'
          )
        },
        {
          title: 'Session 4: Repair After Hard Moments',
          summary: 'Families practice repair scripts, empathy, and restarting after conflict.',
          eventLabel: '',
          plan: createSessionPlan(
            'Session 4: Repair After Hard Moments',
            'Families practice repair scripts, empathy, and restarting after conflict.'
          )
        },
        {
          title: 'Session 5: Coaching Through Transitions',
          summary: 'The lesson focuses on routines, transitions, and reducing escalation before it starts.',
          eventLabel: '',
          plan: createSessionPlan(
            'Session 5: Coaching Through Transitions',
            'The lesson focuses on routines, transitions, and reducing escalation before it starts.'
          )
        },
        {
          title: 'Session 6: Celebration and Next Steps',
          summary: 'Families reflect on progress, review their coping plans, and identify next supports.',
          eventLabel: '',
          plan: createSessionPlan(
            'Session 6: Celebration and Next Steps',
            'Families reflect on progress, review their coping plans, and identify next supports.'
          )
        }
      ]
    },
    {
      title: 'Feelings Lab Mini-Series',
      summary: 'A reusable child wellness series built around emotional awareness, coping, and trusted support.',
      sessions: [
        {
          title: 'Feelings Lab Demo Session',
          summary: 'Mental-health-for-kids demo session for previewing the class presentation experience.',
          eventLabel: '',
          plan: createMentalHealthDemoPlan('feelings-lab-1')
        }
      ]
    }
  ];
}

function normalizeAttachedEvent(event = {}) {
  return {
    eventId: Number(event.eventId || 0) || null,
    eventTitle: String(event.eventTitle || ''),
    createdAt: event.createdAt || null,
    updatedAt: event.updatedAt || null
  };
}

function normalizeSession(session = {}, index = 0) {
  const sessionId = String(session.id || createId(`session-${index + 1}`));
  const title = String(session.title || `Session ${index + 1}`);
  const summary = String(session.summary || '');
  const attachedEvents = Array.isArray(session.attachedEvents) ? session.attachedEvents.map(normalizeAttachedEvent) : [];
  const eventLabel =
    String(session.eventLabel || '').trim() ||
    (attachedEvents.length === 1
      ? attachedEvents[0].eventTitle || ''
      : attachedEvents.length > 1
        ? `Attached to ${attachedEvents.length} events`
        : '');

  return {
    id: sessionId,
    seriesId: String(session.seriesId || ''),
    title,
    summary,
    eventLabel,
    positionIndex: Number(session.positionIndex ?? index),
    attachedEvents,
    plan: normalizeClassPresentationPlan(session.plan || {}, sessionId),
    createdAt: session.createdAt || null,
    updatedAt: session.updatedAt || null
  };
}

function normalizeSeries(series = {}, index = 0) {
  const seriesId = String(series.id || createId(`series-${index + 1}`));
  const sessions = Array.isArray(series.sessions) ? series.sessions.map(normalizeSession) : [];
  return {
    id: seriesId,
    title: String(series.title || `Class Series ${index + 1}`),
    summary: String(series.summary || ''),
    sessions: sessions.length ? sessions : [normalizeSession({}, 0)],
    createdAt: series.createdAt || null,
    updatedAt: series.updatedAt || null
  };
}

function normalizeAssignment(assignment = null) {
  if (!assignment?.series || !assignment?.session) return null;
  const series = normalizeSeries({ ...assignment.series, sessions: [assignment.session] }, 0);
  const session = series.sessions[0];
  return { series, session };
}

function normalizeLibraryResponse(payload = {}) {
  const sourceSeries = Array.isArray(payload.library)
    ? payload.library
    : Array.isArray(payload.series)
      ? payload.series
      : [];
  const series = sourceSeries.map(normalizeSeries);
  const directSeries = payload.series && !Array.isArray(payload.series) ? normalizeSeries(payload.series) : null;
  const directSession = payload.session ? normalizeSession(payload.session) : null;
  return {
    programOrganizationId: Number(payload.programOrganizationId || 0) || null,
    series,
    seriesRecord: directSeries,
    sessionRecord: directSession,
    attachment: normalizeAssignment(payload.attachment || payload.assignment || null)
  };
}

async function bootstrapDefaultLibrary({ agencyId }) {
  const defaults = createDefaultSeriesLibrary();
  for (const series of defaults) {
    await api.post(
      '/skill-builders/class-presentations/series',
      {
        agencyId,
        series
      },
      { skipGlobalLoading: true }
    );
  }
}

export async function fetchClassPresentationLibrary({ agencyId, eventId = null, ensureSeeded = true }) {
  const response = await api.get('/skill-builders/class-presentations/library', {
    params: {
      agencyId,
      ...(eventId ? { eventId } : {})
    },
    skipGlobalLoading: true
  });
  let normalized = normalizeLibraryResponse(response.data || {});
  if (ensureSeeded && agencyId && !normalized.series.length) {
    await bootstrapDefaultLibrary({ agencyId });
    const refreshed = await api.get('/skill-builders/class-presentations/library', {
      params: {
        agencyId,
        ...(eventId ? { eventId } : {})
      },
      skipGlobalLoading: true
    });
    normalized = normalizeLibraryResponse(refreshed.data || {});
  }
  return normalized;
}

export async function createClassPresentationSeries({ agencyId, series }) {
  const response = await api.post(
    '/skill-builders/class-presentations/series',
    { agencyId, series },
    { skipGlobalLoading: true }
  );
  return normalizeLibraryResponse(response.data || {});
}

export async function duplicateClassPresentationSeries({ agencyId, seriesId }) {
  const response = await api.post(
    `/skill-builders/class-presentations/series/${seriesId}/duplicate`,
    { agencyId },
    { skipGlobalLoading: true }
  );
  return normalizeLibraryResponse(response.data || {});
}

export async function saveClassPresentationSeries({ agencyId, seriesId, updates }) {
  const response = await api.patch(
    `/skill-builders/class-presentations/series/${seriesId}`,
    { agencyId, ...updates },
    { skipGlobalLoading: true }
  );
  return normalizeLibraryResponse(response.data || {});
}

export async function deleteClassPresentationSeries({ agencyId, seriesId }) {
  const response = await api.delete(`/skill-builders/class-presentations/series/${seriesId}`, {
    data: { agencyId },
    skipGlobalLoading: true
  });
  return normalizeLibraryResponse(response.data || {});
}

export async function createSeriesSession({ agencyId, seriesId, session }) {
  const response = await api.post(
    `/skill-builders/class-presentations/series/${seriesId}/sessions`,
    { agencyId, session },
    { skipGlobalLoading: true }
  );
  return normalizeLibraryResponse(response.data || {});
}

export async function duplicateSeriesSession({ agencyId, sessionId }) {
  const response = await api.post(
    `/skill-builders/class-presentations/sessions/${sessionId}/duplicate`,
    { agencyId },
    { skipGlobalLoading: true }
  );
  return normalizeLibraryResponse(response.data || {});
}

export async function saveSeriesSession({ agencyId, sessionId, updates }) {
  const response = await api.patch(
    `/skill-builders/class-presentations/sessions/${sessionId}`,
    { agencyId, ...updates },
    { skipGlobalLoading: true }
  );
  return normalizeLibraryResponse(response.data || {});
}

export async function deleteSeriesSession({ agencyId, sessionId }) {
  const response = await api.delete(`/skill-builders/class-presentations/sessions/${sessionId}`, {
    data: { agencyId },
    skipGlobalLoading: true
  });
  return normalizeLibraryResponse(response.data || {});
}

export async function attachClassPresentationSessionToEvent({ agencyId, eventId, sessionId }) {
  const response = await api.put(
    `/skill-builders/events/${eventId}/class-presentation`,
    { agencyId, sessionId },
    { skipGlobalLoading: true }
  );
  return normalizeAssignment(response.data?.assignment || null);
}

export async function loadClassPresentationSession({ agencyId, sessionId }) {
  const response = await api.get(`/skill-builders/class-presentations/sessions/${sessionId}`, {
    params: { agencyId },
    skipGlobalLoading: true
  });
  return normalizeAssignment(response.data || null);
}

export async function loadClassPresentationEventAssignment({ agencyId, eventId }) {
  const response = await api.get(`/skill-builders/events/${eventId}/class-presentation`, {
    params: { agencyId },
    skipGlobalLoading: true
  });
  return normalizeAssignment(response.data?.assignment || null);
}

export async function loadGuardianClassPresentationEventAssignment({ eventId }) {
  const response = await api.get(`/guardian-portal/skill-builders/events/${eventId}/class-presentation`, {
    skipGlobalLoading: true
  });
  return normalizeAssignment(response.data?.assignment || null);
}

export function buildSeedSeriesLibrary() {
  return createDefaultSeriesLibrary().map(normalizeSeries);
}

export function buildFallbackSeriesSelection(series = []) {
  const firstSeries = series[0] || null;
  const firstSession = firstSeries?.sessions?.[0] || null;
  return {
    activeSeriesId: firstSeries?.id || '',
    activeSessionId: firstSession?.id || ''
  };
}

export function clonePresentationPlan(plan) {
  return normalizeClassPresentationPlan(clone(plan || {}));
}
