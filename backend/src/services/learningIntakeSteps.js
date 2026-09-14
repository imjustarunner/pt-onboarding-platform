// Replace the known counseling seed in learning packets. Custom steps and all
// configured consent/document steps are preserved. Applied on reads and submission.
const counselingSeedIds = new Set([
  "counseling_self_what_brings_you",
  "counseling_self_symptoms_and_life",
  "counseling_self_history_health",
  "counseling_self_life_and_history",
  "counseling_self_safety",
  "counseling_self_questionnaires",
  "counseling_couple_about_partner_1",
  "counseling_couple_about_partner_2",
  "counseling_couple_about_relationship",
  "counseling_couple_what_brings_you",
  "counseling_couple_how_relationship_going",
  "counseling_couple_partner_clinical_1",
  "counseling_couple_partner_clinical_2",
  "counseling_couple_private_safety_1",
  "counseling_couple_private_safety_2",
  "counseling_couple_goals",
  "counseling_couple_questionnaires",
  "counseling_family_primary_contact",
  "counseling_family_family_roster",
  "counseling_family_households",
  "counseling_family_what_brings",
  "counseling_family_how_family_doing",
  "counseling_family_important_changes",
  "counseling_family_member_mini",
  "counseling_family_safety",
  "counseling_family_member_safety",
  "counseling_family_goals",
  "counseling_family_member_goals",
  "counseling_dep_presenting",
  "counseling_dep_health_history",
  "counseling_dep_family_trauma",
  "counseling_dep_substance",
  "counseling_dep_safety",
  "counseling_dep_questionnaires"
]);
export function learningIntakeSteps(steps = []) {
  return steps.filter(step => !counselingSeedIds.has(step.id) && step.id !== 'office_package_selection');
}
