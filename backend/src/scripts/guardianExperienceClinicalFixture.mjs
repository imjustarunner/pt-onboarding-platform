// Fictional guardian experience fixtures only. Caller owns both transactions.
// Uses SQL directly: no email, calendar, billing, notification, or signing service runs.
import crypto from 'node:crypto';
import { mysqlDateTimeForDateHour, parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';

const timeZone = 'America/Denver';
const timestamp = value => value.toISOString().slice(0, 19).replace('T', ' ');
const fingerprint = value => crypto.createHash('sha256').update(value.toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex');
const json = value => typeof value === 'string' ? JSON.parse(value) : value;
const shiftDate = (ymd, days) => {
  const date = new Date(`${ymd}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const guardianExperienceClinicalDefaults = Object.freeze({
  itscoOffice: { agencyId: 2, providerId: 1001, serviceLocationId: 22, officeLocationId: 6, weekday: 4, hour: 15 },
  nluOffice: { agencyId: 6, providerId: 1207, serviceLocationId: 16, officeLocationId: 5, weekday: 3, hour: 16 },
  itscoSchool: { agencyId: 2, providerId: 1007, schoolOrganizationId: 376, weekday: 5, hour: 10 }
});

export function guardianExperienceAppointmentDates({ now = new Date(), weekday, hour }) {
  const today = utcDateToZonedYmd(now, timeZone);
  const currentWeekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const next = shiftDate(today, ((weekday - currentWeekday + 7) % 7) || 7);
  const mostRecent = parseUtcDate(mysqlDateTimeForDateHour(shiftDate(next, -7), hour, timeZone));
  const pastWeekAdjustment = mostRecent >= now ? -1 : 0;
  return [-3, -2, -1, 0, 1, 2, 3].map(week => {
    const dateOfService = shiftDate(next, (week + (week < 0 ? pastWeekAdjustment : 0)) * 7);
    const startAt = mysqlDateTimeForDateHour(dateOfService, hour, timeZone);
    return {
      dateOfService,
      startAt,
      endAt: timestamp(new Date(parseUtcDate(startAt).getTime() + 45 * 60000)),
      status: week < 0 ? 'completed' : week === 0 ? 'confirmed' : 'scheduled'
    };
  });
}

function planContent(client) {
  const school = client.setting === 'school';
  const nlu = Number(client.agencyId) === 6;
  const context = school ? 'classroom transitions and asking for help'
    : nlu ? 'confidence, frustration tolerance, and routines around learning'
      : 'everyday worries, transitions, and family communication';
  return {
    title: `${school ? 'School counseling' : nlu ? 'Counseling and confidence' : 'Coping and connection'} plan — FICTIONAL DEMO`,
    presentingProblem: `FICTIONAL TEST DATA — no real clinical assessment. ${client.name} is practicing skills for ${context}. Strengths include curiosity, creativity, and support from a caring guardian.`,
    prescribedFrequency: school
      ? 'One 45-minute school counseling session weekly; review this fictional plan in 12 weeks.'
      : 'One 45-minute individual counseling session weekly, with periodic guardian check-ins; review in 12 weeks.',
    dischargePlan: 'FICTIONAL TEST DATA — sample discharge criteria: use coping and help-seeking skills independently in familiar settings for four weeks; review progress and next steps with the family.',
    goals: [
      {
        text: school ? 'Feel more confident during classroom transitions.'
          : nlu ? 'Build confidence and recover from frustration while learning.'
            : 'Recognize feelings and use coping skills during everyday worries.',
        objectives: [
          {
            text: 'Identify a feeling and choose one coping strategy during a challenging situation in four of five practice opportunities.',
            question: 'On a scale of 1–10, how consistently has your child used a coping skill this week? 1 means rarely; 10 means independently and consistently.',
            interventions: ['Emotion identification practice', 'Coping skills rehearsal'],
            scores: [3, 4, 6]
          },
          {
            text: 'Practice a short calming routine and return to the activity with one or fewer reminders.',
            question: 'On a scale of 1–10, how well has your child returned to an activity after feeling upset? 1 means very difficult; 10 means consistently manageable.',
            interventions: ['Grounding practice', 'Strengths-based reflection'],
            scores: [4, 4, 5]
          }
        ]
      },
      {
        text: school ? 'Ask for support and stay connected with trusted adults at school.'
          : nlu ? 'Use a predictable routine and ask for help when a task is difficult.'
            : 'Communicate needs and practice a predictable family routine.',
        objectives: [
          {
            text: 'Use a practiced phrase to ask a trusted adult for help in four of five practice opportunities.',
            question: 'On a scale of 1–10, how comfortable has your child been asking for help? 1 means not comfortable; 10 means very comfortable.',
            interventions: ['Communication role play', 'Positive reinforcement'],
            scores: [3, 5, 6]
          },
          {
            text: 'Follow a three-step routine with a visual reminder on at least four days per week.',
            question: 'On a scale of 1–10, how consistently has your child followed the agreed routine? 1 means rarely; 10 means independently and consistently.',
            interventions: ['Visual routine planning', 'Guardian-supported skills practice'],
            scores: [4, 5, 7]
          }
        ]
      }
    ]
  };
}

/**
 * @param {object} args
 * @param {object} args.db Main database connection, with caller-owned transaction.
 * @param {object} args.clinicalDb Clinical database connection, with caller-owned transaction.
 * @param {number} args.actorId Requesting administrator ID (audit only).
 * @param {number} args.guardianId Already-created demo guardian ID.
 * @param {Array<{id:number,agencyId:number,setting:'office'|'school',name:string}>} args.clients
 * @param {string} args.run Unique fixture identifier.
 * @param {Function} args.guardianPlanRevision Production revision function, injected to avoid opening pools.
 */
export async function seedGuardianExperienceClinical({
  db, clinicalDb, actorId, guardianId, clients, run, guardianPlanRevision, now = new Date()
}) {
  if (!/^[a-zA-Z0-9_-]{4,40}$/.test(String(run || ''))) throw new Error('A safe, unique fixture run ID is required.');
  if (typeof guardianPlanRevision !== 'function') throw new Error('Pass the production guardianPlanRevision function.');
  if (!Array.isArray(clients) || clients.length !== 3) throw new Error('This fixture requires exactly three fictional children.');
  const [[guardian]] = await db.execute('SELECT id,is_demo,role,email,first_name,last_name FROM users WHERE id=?', [guardianId]);
  if (Number(guardian?.is_demo) !== 1 || guardian.role !== 'client_guardian'
    || !/^guardian-test-[^@]+@example\.(com|invalid)$/i.test(guardian.email)) {
    throw new Error('Refusing to seed clinical fixtures for a non-demo guardian.');
  }
  const selected = [];
  for (const client of clients) {
    const key = client.setting === 'school' ? 'itscoSchool' : Number(client.agencyId) === 6 ? 'nluOffice' : 'itscoOffice';
    const defaults = guardianExperienceClinicalDefaults[key];
    if (Number(client.agencyId) !== defaults.agencyId || !['office', 'school'].includes(client.setting)) {
      throw new Error('Only ITSCO office, NLU office, and ITSCO school fixture contexts are supported.');
    }
    const [[stored]] = await db.execute('SELECT id,agency_id,organization_id,is_demo FROM clients WHERE id=?', [client.id]);
    const [[link]] = await db.execute('SELECT id FROM client_guardians WHERE client_id=? AND guardian_user_id=? AND access_enabled=1',
      [client.id, guardianId]);
    if (Number(stored?.is_demo) !== 1 || Number(stored.agency_id) !== defaults.agencyId || !link) {
      throw new Error('Refusing to modify a real, differently scoped, or unrelated client.');
    }
    if (client.setting === 'school' && Number(stored.organization_id) !== defaults.schoolOrganizationId) {
      throw new Error('The school demo child must already belong to Hogwarts (organization 376).');
    }
    const [[provider]] = await db.execute(`SELECT u.id,u.first_name,u.last_name,u.is_demo,u.is_active
      FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
      WHERE u.id=? AND COALESCE(u.is_archived,0)=0`, [client.agencyId, defaults.providerId]);
    if (Number(provider?.is_demo) !== 1 || Number(provider?.is_active) !== 1) throw new Error('Expected active demo provider is unavailable.');
    const [[existingPlan]] = await clinicalDb.execute('SELECT id FROM clinical_treatment_plans WHERE agency_id=? AND client_id=? LIMIT 1', [client.agencyId, client.id]);
    const [[existingAppointment]] = await db.execute('SELECT id FROM appointment_participants WHERE client_id=? LIMIT 1', [client.id]);
    if (existingPlan || existingAppointment) throw new Error('Use fresh demo children; this helper never overwrites existing appointments or plans.');
    selected.push({ client, defaults, provider });
  }
  if (new Set(selected.map(({ defaults }) => defaults)).size !== 3) throw new Error('Include one child in each supported context.');

  const output = [];
  for (const { client, defaults, provider } of selected) {
    let serviceLocationId = defaults.serviceLocationId;
    const officeLocationId = defaults.officeLocationId || null;
    let locationName;
    if (client.setting === 'school') {
      const [[school]] = await db.execute(`SELECT a.id,a.name FROM agencies a
        JOIN organization_affiliations oa ON oa.organization_id=a.id AND oa.agency_id=? AND oa.is_active=1
        WHERE a.id=? AND a.slug='hogwarts' AND a.organization_type='school' AND a.is_active=1`,
      [client.agencyId, defaults.schoolOrganizationId]);
      if (!school) throw new Error('Expected fictional Hogwarts school affiliation is unavailable.');
      locationName = `${school.name} — FICTIONAL DEMO`;
      const [location] = await db.execute(`INSERT INTO agency_service_locations
        (agency_id,name,place_of_service,notes,school_organization_id,location_kind,is_provider_visible,created_by_user_id)
        VALUES (?,?,'03',?,?,'school',0,?)`,
      [client.agencyId, locationName, `FICTIONAL guardian experience fixture ${run}; no real service or room reservation.`,
        school.id, actorId]);
      serviceLocationId = Number(location.insertId);
    } else {
      const [[location]] = await db.execute(`SELECT l.name,o.name AS office_name FROM agency_service_locations l
        JOIN office_locations o ON o.id=l.billing_office_location_id
        WHERE l.id=? AND l.agency_id=? AND l.is_active=1 AND l.place_of_service='11' AND o.id=? AND o.is_active=1`,
      [serviceLocationId, client.agencyId, officeLocationId]);
      if (!location) throw new Error('Expected office service location is unavailable.');
      locationName = location.office_name;
    }
    const dates = guardianExperienceAppointmentDates({ now, weekday: defaults.weekday, hour: defaults.hour });
    const serviceDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][defaults.weekday];
    const organizationId = defaults.schoolOrganizationId || client.agencyId;
    await db.execute(`UPDATE clients SET provider_id=?,provider_assigned_at=?,service_day=?,
      default_office_location_id=?,default_place_of_service=?,default_service_location_id=?,
      timezone=?,session_email_opt_in=0,session_sms_opt_in=0,session_phone_opt_in=0
      WHERE id=? AND agency_id=? AND is_demo=1`,
    [provider.id, timestamp(now), serviceDay, officeLocationId, client.setting === 'school' ? '03' : '11',
      serviceLocationId, timeZone, client.id, client.agencyId]);
    await db.execute(`INSERT INTO client_provider_assignments
      (client_id,organization_id,provider_user_id,is_primary,service_day,is_active,created_by_user_id,updated_by_user_id)
      VALUES (?,?,?,1,?,1,?,?)`, [client.id, organizationId, provider.id, serviceDay, actorId, actorId]);
    await db.execute(`INSERT INTO client_organization_assignments (client_id,organization_id,is_primary,is_active)
      VALUES (?,?,1,1) ON DUPLICATE KEY UPDATE is_primary=1,is_active=1`, [client.id, organizationId]);
    const appointments = [];
    for (const visit of dates) {
      const [appointment] = await db.execute(`INSERT INTO appointments
        (agency_id,business_type,provider_user_id,start_at,end_at,modality,office_location_id,status,
         participant_mode,source,title,notes,created_by_user_id,updated_by_user_id,notification_mode,
         service_location_id,source_timezone,location_label)
        VALUES (?,'mental_health',?,?,?,'IN_PERSON',?,?,'individual','guardian_demo',?,?,?,?,'in_app',?,?,?)`,
      [client.agencyId, provider.id, visit.startAt, visit.endAt, officeLocationId, visit.status,
        `${client.name} — FICTIONAL DEMO counseling`, `FICTIONAL TEST DATA (${run}). No care delivered; no claim, payment, external calendar, or real room reservation.`,
        actorId, actorId, serviceLocationId, timeZone, locationName]);
      const appointmentId = Number(appointment.insertId);
      await db.execute(`INSERT INTO appointment_participants
        (appointment_id,role,client_id,display_name,is_billing_responsible,receives_reminders,sort_order)
        VALUES (?,'client',?,?,0,0,0)`, [appointmentId, client.id, client.name]);
      await db.execute(`INSERT INTO appointment_participants
        (appointment_id,role,user_id,display_name,is_billing_responsible,receives_reminders,sort_order)
        VALUES (?,'guardian',?,?,1,0,1)`, [appointmentId, guardianId, `${guardian.first_name} ${guardian.last_name}`]);
      appointments.push({ id: appointmentId, ...visit });
    }
    const content = planContent(client);
    const [planInsert] = await clinicalDb.execute(`INSERT INTO clinical_treatment_plans
      (agency_id,client_id,title,effective_date,status,discharge_plan,presenting_problem,prescribed_frequency,
       source_tool_id,created_by_user_id,client_ack_status,kiosk_share_enabled)
      VALUES (?,?,?,?,'active',?,?,?,'guardian_experience_demo',?,'shared',1)`,
    [client.agencyId, client.id, content.title, dates[0].dateOfService, content.dischargePlan,
      content.presentingProblem, content.prescribedFrequency, provider.id]);
    const planId = Number(planInsert.insertId);
    for (const [goalIndex, goal] of content.goals.entries()) {
      const [goalInsert] = await clinicalDb.execute(`INSERT INTO clinical_treatment_plan_goals
        (treatment_plan_id,goal_index,goal_text,projected_completion,status,content_fingerprint)
        VALUES (?,?,?,?,'active',?)`,
      [planId, goalIndex + 1, goal.text, shiftDate(dates[0].dateOfService, 84), fingerprint(goal.text)]);
      const goalId = Number(goalInsert.insertId);
      for (const [objectiveIndex, objective] of goal.objectives.entries()) {
        const [objectiveInsert] = await clinicalDb.execute(`INSERT INTO clinical_treatment_plan_objectives
          (goal_id,objective_index,objective_text,scale_current,scale_start,scale_target,scale_direction,
           measurement_method,content_fingerprint,status,interventions_json,kiosk_prompt_other,
           kiosk_prompt_other_verified_at,kiosk_prompt_other_verified_by)
          VALUES (?,?,?,?,?,8,'increase',?,?,'active',?,?,?,?)`,
        [goalId, objectiveIndex + 1, objective.text, objective.scores.at(-1), objective.scores[0],
          'Fictional weekly skill-practice observations; 1 = rarely, 10 = independently and consistently.',
          fingerprint(objective.text), JSON.stringify(objective.interventions), objective.question, timestamp(now), provider.id]);
        for (const [index, score] of objective.scores.entries()) {
          await clinicalDb.execute(`INSERT INTO clinical_treatment_objective_ratings
            (agency_id,client_id,objective_id,goal_id,treatment_plan_id,rated_by_user_id,scale_value,
             scale_target_at_rating,disposition,progress_label,date_of_service,notes,rater_kind,rater_label,rated_at)
            VALUES (?,?,?,?,?,?,?,8,'rated',?,?,?,'clinician','Fictional demo observation',?)`,
          [client.agencyId, client.id, objectiveInsert.insertId, goalId, planId, provider.id, score,
            index > 0 && score > objective.scores[index - 1] ? 'progressing' : 'unchanged',
            dates[index].dateOfService, `FICTIONAL TEST DATA (${run}); no actual assessment or service.`, dates[index].endAt]);
        }
      }
    }
    // Read database representations so the exact production revision hashes dates and JSON identically.
    const [[plan]] = await clinicalDb.execute('SELECT * FROM clinical_treatment_plans WHERE id=?', [planId]);
    const [goals] = await clinicalDb.execute('SELECT * FROM clinical_treatment_plan_goals WHERE treatment_plan_id=? ORDER BY goal_index', [planId]);
    for (const goal of goals) {
      const [objectives] = await clinicalDb.execute('SELECT * FROM clinical_treatment_plan_objectives WHERE goal_id=? ORDER BY objective_index', [goal.id]);
      goal.objectives = objectives.map(objective => ({ ...objective, interventions: json(objective.interventions_json) || [] }));
    }
    const revision = guardianPlanRevision({ ...plan, goals, planDiagnoses: [] });
    const [ack] = await db.execute(`INSERT INTO treatment_plan_ack_links
      (agency_id,client_id,treatment_plan_id,public_key,channel,status,recipient_kind,recipient_user_id,
       recipient_name,issued_by_user_id,dashboard_visible,meta_json)
      VALUES (?,?,?,?,'dashboard_share','issued','guardian',?,?,?,1,?)`,
    [client.agencyId, client.id, planId, crypto.randomBytes(24).toString('hex'), guardianId,
      `${guardian.first_name} ${guardian.last_name}`, provider.id,
      JSON.stringify({ planRevision: revision, fictional: true, fixtureRun: run })]);
    output.push({
      clientId: client.id, agencyId: client.agencyId, setting: client.setting,
      providerId: provider.id, providerName: `${provider.first_name} ${provider.last_name}`,
      schoolOrganizationId: defaults.schoolOrganizationId || null,
      serviceLocationId, officeLocationId, locationName, appointments,
      planId, acknowledgmentId: Number(ack.insertId), planRevision: revision
    });
  }
  return output;
}
