/**
 * Centralized event-type labeling.
 *
 * Background: many places in the UI used to hard-code "Skill Builders" as the
 * generic noun for any event/program — but Skill Builders is just one *type*
 * of program. Generic company events (book club, holiday parties), program
 * events (workshops, orientations, summer programs), and Skill Builders are
 * all different things on `company_events.event_type`.
 *
 * Use these helpers anywhere the UI needs to refer to an event in human terms,
 * so the wording matches the actual event's nature instead of always saying
 * "Skill Builders".
 *
 * Conventions:
 *   - `program_*` types (and the legacy `guardian_program_class`) are
 *     "Program Event"s.
 *   - `skill_builders_*` types (rare; mostly an agency-level affiliation now)
 *     are still "Skill Builders".
 *   - Everything else is a "Company Event".
 *
 * Always prefer the event's own `title` for a heading when one exists; these
 * helpers are for kickers, badges, breadcrumbs, and fallback titles.
 */

const PROGRAM_EVENT_TYPE_LABELS = {
  program_event: 'Program Event',
  program_workshop: 'Program Workshop',
  program_orientation: 'Program Orientation',
  program_open_house: 'Program Open House',
  guardian_program_class: 'Guardian Program'
};

const COMPANY_EVENT_TYPE_LABELS = {
  company_event: 'Company Event',
  team_building: 'Team Building',
  celebration: 'Celebration',
  meeting: 'Meeting',
  training: 'Training',
  social: 'Social Event',
  holiday: 'Holiday Event',
  school_back_to_school: 'Back to School',
  school_fall_check_in: 'Fall School Check-in',
  school_spring_event: 'Spring School Check-in',
  school_open_house: 'Open House',
  school_resource_fair: 'Resource Fair',
  school_family_night: 'Family Night',
  school_orientation: 'Orientation',
  school_holiday: 'Holiday',
  school_day_off: 'Day Off',
  school_other: 'School Event'
};

const SKILL_BUILDERS_EVENT_TYPE_LABELS = {
  skill_builders: 'Skill Builders',
  skill_builders_program: 'Skill Builders Program',
  skill_builders_session: 'Skill Builders Session'
};

const ALL_TYPE_LABELS = {
  ...PROGRAM_EVENT_TYPE_LABELS,
  ...COMPANY_EVENT_TYPE_LABELS,
  ...SKILL_BUILDERS_EVENT_TYPE_LABELS
};

const norm = (raw) => String(raw || '').trim().toLowerCase();

/**
 * @param {string} eventType - raw value from company_events.event_type
 * @returns {boolean}
 */
export function isProgramEventType(eventType) {
  const t = norm(eventType);
  if (!t) return false;
  if (t in PROGRAM_EVENT_TYPE_LABELS) return true;
  return t.startsWith('program_');
}

export function isSkillBuildersEventType(eventType) {
  const t = norm(eventType);
  return !!t && (t in SKILL_BUILDERS_EVENT_TYPE_LABELS || t.startsWith('skill_builder'));
}

export function isSchoolPortalEventType(eventType) {
  const t = norm(eventType);
  return (
    t === 'school_back_to_school' ||
    t === 'school_fall_check_in' ||
    t === 'school_spring_event' ||
    t === 'school_open_house' ||
    t === 'school_resource_fair' ||
    t === 'school_family_night' ||
    t === 'school_orientation' ||
    t === 'school_holiday' ||
    t === 'school_day_off' ||
    t === 'school_other' ||
    t.startsWith('school_')
  );
}

export function isCompanyEventType(eventType) {
  return !isProgramEventType(eventType) && !isSkillBuildersEventType(eventType);
}

/**
 * Friendly display label for a single event type, e.g.
 *   eventTypeLabel('program_event')   -> 'Program Event'
 *   eventTypeLabel('company_event')   -> 'Company Event'
 *   eventTypeLabel('skill_builders')  -> 'Skill Builders'
 *   eventTypeLabel('book_club_meeting') -> 'Book Club Meeting' (titleized)
 *   eventTypeLabel('')                -> 'Event'
 */
export function eventTypeLabel(eventType) {
  const t = norm(eventType);
  if (!t) return 'Event';
  if (ALL_TYPE_LABELS[t]) return ALL_TYPE_LABELS[t];
  if (t.startsWith('program_')) return 'Program Event';
  if (t.startsWith('skill_builder')) return 'Skill Builders';
  // Title-case fallback so unknown enums still look reasonable.
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Generic *plural* category label — useful for nav items, listing pages, and
 * counters (e.g. "3 program events upcoming").
 */
export function eventCategoryPluralLabel(eventType) {
  if (isSkillBuildersEventType(eventType)) return 'Skill Builders';
  if (isProgramEventType(eventType)) return 'Program events';
  return 'Company events';
}

/**
 * Singular category label, matching plural's category but in singular form.
 */
export function eventCategorySingularLabel(eventType) {
  if (isSkillBuildersEventType(eventType)) return 'Skill Builders event';
  if (isProgramEventType(eventType)) return 'Program event';
  return 'Company event';
}

/**
 * The "kicker" string shown above a portal/page title (e.g. the small caps
 * line above an event detail H1). Falls back to a generic, type-aware label
 * when the consumer doesn't have an event title.
 */
export function eventDisplayKicker(event) {
  if (!event) return 'Program event';
  return eventCategorySingularLabel(event.eventType ?? event.event_type);
}

/**
 * Convenience: title for the generic "X Workspace" label in headings.
 *   eventWorkspaceLabel({ event_type: 'program_event' })  -> 'Program Event Workspace'
 *   eventWorkspaceLabel({ event_type: 'skill_builders' })  -> 'Skill Builders Workspace'
 *   eventWorkspaceLabel({ event_type: 'meeting' })         -> 'Company Event Workspace'
 */
export function eventWorkspaceLabel(event) {
  const t = event?.eventType ?? event?.event_type ?? '';
  if (isSkillBuildersEventType(t)) return 'Skill Builders Workspace';
  if (isProgramEventType(t)) return 'Program Event Workspace';
  return 'Company Event Workspace';
}

export default {
  isProgramEventType,
  isSkillBuildersEventType,
  isSchoolPortalEventType,
  isCompanyEventType,
  eventTypeLabel,
  eventCategoryPluralLabel,
  eventCategorySingularLabel,
  eventDisplayKicker,
  eventWorkspaceLabel
};
