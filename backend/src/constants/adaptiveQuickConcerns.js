/**
 * Quick-join concern catalogs — aligned with long counseling intake
 * (self recent_symptoms / dependent presenting_concerns / couple & family shared).
 */

export const SELF_QUICK_CONCERN_OPTIONS = [
  { value: 'feeling_down', label: 'Feeling down, depressed, or emotionally flat' },
  { value: 'losing_interest', label: 'Losing interest or enjoyment' },
  { value: 'worry_on_edge', label: 'Worry or feeling on edge' },
  { value: 'panic', label: 'Panic' },
  { value: 'stress_overwhelmed', label: 'Stress or feeling overwhelmed' },
  { value: 'irritability_anger', label: 'Irritability or anger' },
  { value: 'mood_changing_quickly', label: 'Mood changing quickly' },
  { value: 'trouble_sleeping', label: 'Trouble sleeping' },
  { value: 'sleeping_too_much', label: 'Sleeping too much' },
  { value: 'low_energy', label: 'Low energy' },
  { value: 'trouble_concentrating', label: 'Trouble concentrating' },
  { value: 'low_motivation', label: 'Low motivation' },
  { value: 'appetite_changes', label: 'Changes in appetite or eating' },
  { value: 'feeling_disconnected', label: 'Feeling disconnected or numb' },
  { value: 'thoughts_wont_shut_off', label: 'Thoughts that will not shut off' },
  { value: 'intrusive_thoughts', label: 'Unwanted or intrusive thoughts' },
  { value: 'repetitive_behaviors', label: 'Repetitive behaviors or checking' },
  { value: 'disturbing_memories', label: 'Disturbing memories or nightmares' },
  { value: 'avoiding', label: 'Avoiding people, places, or situations' },
  { value: 'feeling_unusually_energetic', label: 'Feeling unusually energetic or needing very little sleep' },
  { value: 'unusual_experiences', label: 'Hearing, seeing, or experiencing things other people do not seem to' },
  { value: 'physical_stress_symptoms', label: 'Physical symptoms that seem connected to stress' },
  { value: 'sexual_intimacy', label: 'Sexual or intimacy concerns' },
  { value: 'chronic_pain', label: 'Chronic pain' },
  { value: 'something_else', label: 'Something else' },
  { value: 'none', label: 'None of these' }
];

export const DEPENDENT_QUICK_CONCERN_OPTIONS = [
  { value: 'worry_anxiety', label: 'Worry or anxiety' },
  { value: 'sadness_low_mood', label: 'Sadness or low mood' },
  { value: 'anger_irritability', label: 'Anger or irritability' },
  { value: 'emotional_outbursts', label: 'Emotional outbursts' },
  { value: 'difficulty_calming', label: 'Difficulty calming down' },
  { value: 'trouble_attention', label: 'Trouble paying attention' },
  { value: 'hyperactivity_impulsivity', label: 'Hyperactivity or impulsivity' },
  { value: 'defiance', label: 'Defiance or frequent arguments' },
  { value: 'school_avoidance', label: 'School avoidance' },
  { value: 'academic_difficulty', label: 'Academic difficulty' },
  { value: 'friendship_problems', label: 'Friendship problems' },
  { value: 'social_difficulty', label: 'Social difficulty' },
  { value: 'low_confidence', label: 'Low confidence' },
  { value: 'sleep_problems', label: 'Sleep problems' },
  { value: 'eating_concerns', label: 'Eating concerns' },
  { value: 'grief_loss', label: 'Grief or loss' },
  { value: 'stress_after_experience', label: 'Stress after a difficult experience' },
  { value: 'repetitive_behaviors', label: 'Repetitive behaviors or thoughts' },
  { value: 'sensory_difficulties', label: 'Sensory difficulties' },
  { value: 'developmental_concerns', label: 'Developmental concerns' },
  { value: 'substance_use', label: 'Substance use' },
  { value: 'self_harm_safety', label: 'Self-harm or safety concerns' },
  { value: 'something_else', label: 'Something else' },
  { value: 'none_describe', label: 'None of these' }
];

/** Shared by brief Initial Interest Form and full couple enrollment. */
export const COUPLE_QUICK_CONCERN_OPTIONS = [
  { value: 'communication', label: 'Communication' },
  { value: 'frequent_conflict', label: 'Frequent conflict or arguments' },
  { value: 'feeling_disconnected', label: 'Feeling disconnected' },
  { value: 'rebuilding_trust', label: 'Rebuilding trust' },
  { value: 'infidelity_betrayal', label: 'Infidelity or betrayal' },
  { value: 'intimacy_affection', label: 'Intimacy or affection' },
  { value: 'parenting_disagreements', label: 'Parenting disagreements' },
  { value: 'money_financial_stress', label: 'Money or financial stress' },
  { value: 'major_life_transition', label: 'Major life transition' },
  { value: 'blended_family', label: 'Blended-family concerns' },
  { value: 'stress_affecting_relationship', label: 'Stress affecting the relationship' },
  { value: 'different_expectations', label: 'Different expectations or priorities' },
  { value: 'separation_deciding', label: 'Separation or deciding whether to stay together' },
  { value: 'preparing_commitment', label: 'Preparing for marriage or long-term commitment' },
  { value: 'grief_loss_relationship', label: 'Grief or loss affecting the relationship' },
  { value: 'past_issues', label: 'Difficulty resolving past issues' },
  { value: 'strengthen_relationship', label: 'We are generally doing well and want to strengthen our relationship' },
  { value: 'something_else', label: 'Something else' }
];

/** Shared by brief Initial Interest Form and full family enrollment. */
export const FAMILY_QUICK_CONCERN_OPTIONS = [
  { value: 'communication', label: 'Communication' },
  { value: 'frequent_conflict', label: 'Frequent conflict' },
  { value: 'parent_child_conflict', label: 'Parent-child conflict' },
  { value: 'sibling_conflict', label: 'Sibling conflict' },
  { value: 'boundaries', label: 'Difficulty setting or maintaining boundaries' },
  { value: 'parenting_disagreements', label: 'Parenting disagreements' },
  { value: 'behavior_affecting_family', label: 'Behavior affecting the family' },
  { value: 'mh_affecting_family', label: 'Emotional or mental-health concerns affecting the family' },
  { value: 'major_family_transition', label: 'Major family transition' },
  { value: 'separation_divorce', label: 'Separation or divorce' },
  { value: 'blended_family_adjustment', label: 'Blended-family adjustment' },
  { value: 'loss_grief', label: 'Loss or grief' },
  { value: 'stressful_experience', label: 'A stressful or difficult experience' },
  { value: 'school_problems', label: 'School problems affecting the family' },
  { value: 'caregiving_stress', label: 'Caregiving stress' },
  { value: 'substance_use_family', label: "A family member's substance use" },
  { value: 'trust', label: 'Trust' },
  { value: 'feeling_disconnected', label: 'Family members feeling disconnected' },
  { value: 'adjusting_to_change', label: 'Difficulty adjusting to a change' },
  { value: 'strengthen_family', label: 'We want to strengthen how our family works together' },
  { value: 'something_else', label: 'Something else' }
];

export const FAMILY_ROLE_OPTIONS = [
  { value: 'parent', label: 'Parent' },
  { value: 'spouse_partner', label: 'Spouse/partner' },
  { value: 'adult_child', label: 'Adult child' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'other', label: 'Other' }
];

export const FAMILY_PARTICIPATION_OPTIONS = [
  { value: 'participating', label: 'Participating' },
  { value: 'may_participate', label: 'May participate' },
  { value: 'not_participating', label: 'Not currently participating' }
];

export const COUPLE_NOTIFY_PARTNER_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'not_yet', label: 'Not yet' }
];
