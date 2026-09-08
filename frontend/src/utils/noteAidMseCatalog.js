/**
 * Mental Status Exam + risk option catalog for Note Aid.
 * Nested-hover UI: domain → options → description.
 */

/** @typedef {{ label: string, description: string }} MseOption */
/** @typedef {{ key: string, label: string, options: MseOption[], allNormalLabel?: string }} MseDomainDef */

/** @type {MseDomainDef[]} */
export const MSE_DOMAIN_DEFS = [
  {
    key: 'Appearance',
    label: 'Appearance',
    allNormalLabel: 'Appropriate',
    options: [
      { label: 'Appropriate', description: 'Appearance and clothing are appropriate for the person’s age, setting, and circumstances.' },
      { label: 'Well-groomed', description: 'Hair, clothing, and personal hygiene appear neat and cared for.' },
      { label: 'Casual', description: 'Wearing informal clothing that remains appropriate for the setting.' },
      { label: 'Disheveled', description: 'Clothing, hair, or overall appearance appears noticeably unkempt or messy.' },
      { label: 'Poor hygiene', description: 'Observable concerns with cleanliness or personal care.' },
      { label: 'Unusual attire', description: 'Clothing or appearance is noticeably unusual or inconsistent with the setting, weather, or circumstances.' }
    ]
  },
  {
    key: 'Behavior',
    label: 'Behavior',
    allNormalLabel: 'Cooperative',
    options: [
      { label: 'Cooperative', description: 'Participates appropriately and responds to questions or directions.' },
      { label: 'Calm', description: 'Appears physically and emotionally settled during the interaction.' },
      { label: 'Engaged', description: 'Actively participates and shows interest in the interaction.' },
      { label: 'Guarded', description: 'Appears cautious or reluctant to provide information or participate fully.' },
      { label: 'Withdrawn', description: 'Demonstrates limited interaction or appears socially disengaged.' },
      { label: 'Restless', description: 'Has difficulty remaining still or appears physically uneasy.' },
      { label: 'Agitated', description: 'Demonstrates increased emotional or physical tension, such as pacing or visible frustration.' },
      { label: 'Distractible', description: 'Attention is easily drawn away from the conversation or task.' },
      { label: 'Oppositional', description: 'Frequently resists reasonable requests, directions, or attempts to engage.' },
      { label: 'Tearful', description: 'Cries or appears close to crying during the interaction.' }
    ]
  },
  {
    key: 'Eye Contact',
    label: 'Eye Contact',
    allNormalLabel: 'Appropriate',
    options: [
      { label: 'Appropriate', description: 'Eye contact is generally comfortable and appropriate to the situation and individual.' },
      { label: 'Intermittent', description: 'Makes eye contact periodically but not consistently.' },
      { label: 'Limited', description: 'Makes little eye contact during the interaction.' },
      { label: 'Avoidant', description: 'Actively looks away or appears uncomfortable making eye contact.' },
      { label: 'Intense', description: 'Eye contact is unusually prolonged or sustained.' }
    ]
  },
  {
    key: 'Psychomotor Activity',
    label: 'Psychomotor Activity',
    allNormalLabel: 'Within normal limits',
    options: [
      { label: 'Within normal limits', description: 'Movement and activity level appear typical for the person and situation.' },
      { label: 'Increased', description: 'Demonstrates more movement or physical activity than expected.' },
      { label: 'Decreased', description: 'Demonstrates reduced movement or physical activity.' },
      { label: 'Restless', description: 'Frequently shifts position, fidgets, or has difficulty remaining still.' },
      { label: 'Agitated', description: 'Demonstrates pronounced physical tension or excessive movement associated with distress.' },
      { label: 'Slowed', description: 'Movements appear noticeably slower than expected.' },
      { label: 'Tremulous', description: 'Shaking or trembling is observed.' }
    ]
  },
  {
    key: 'Speech',
    label: 'Speech',
    allNormalLabel: 'Normal rate and volume',
    options: [
      { label: 'Normal rate and volume', description: 'Speech is clear and occurs at an expected speed and volume.' },
      { label: 'Quiet', description: 'Speaks at a noticeably low volume.' },
      { label: 'Loud', description: 'Speaks at a noticeably elevated volume.' },
      { label: 'Rapid', description: 'Speaks faster than expected.' },
      { label: 'Pressured', description: 'Speech is unusually fast, difficult to interrupt, or driven.' },
      { label: 'Slow', description: 'Speech occurs at a noticeably reduced rate.' },
      { label: 'Minimal', description: 'Provides brief or limited verbal responses.' },
      { label: 'Excessive', description: 'Speaks at length or provides substantially more information than needed.' },
      { label: 'Slurred', description: 'Words are poorly articulated or run together.' },
      { label: 'Difficult to understand', description: 'Speech cannot be consistently understood due to clarity, volume, language, articulation, or other factors.' }
    ]
  },
  {
    key: 'Mood',
    label: 'Mood',
    allNormalLabel: 'Euthymic',
    options: [
      { label: 'Euthymic', description: 'Mood appears generally stable, balanced, and without significant depression or elevation.' },
      { label: 'Calm', description: 'Reports or demonstrates a relaxed emotional state.' },
      { label: 'Happy', description: 'Reports or demonstrates a positive or cheerful mood.' },
      { label: 'Anxious', description: 'Reports worry, nervousness, fear, or tension.' },
      { label: 'Depressed', description: 'Reports persistent sadness, low mood, or reduced emotional well-being.' },
      { label: 'Irritable', description: 'Reports feeling easily annoyed, bothered, or frustrated.' },
      { label: 'Angry', description: 'Reports significant anger or hostility.' },
      { label: 'Sad', description: 'Reports feelings of sadness or unhappiness.' },
      { label: 'Frustrated', description: 'Reports difficulty, dissatisfaction, or irritation regarding current circumstances.' },
      { label: 'Overwhelmed', description: 'Reports feeling unable to effectively manage current demands or stressors.' },
      { label: 'Labile', description: 'Mood appears to shift rapidly or significantly during the interaction.' }
    ]
  },
  {
    key: 'Affect',
    label: 'Affect',
    allNormalLabel: 'Appropriate',
    options: [
      { label: 'Appropriate', description: 'Emotional expression is appropriate to the situation and topics discussed.' },
      { label: 'Full range', description: 'Demonstrates a broad and expected range of emotional expression.' },
      { label: 'Congruent', description: 'Observed emotional expression matches the person’s reported mood or the situation.' },
      { label: 'Restricted', description: 'Emotional expression is present but limited in range or intensity.' },
      { label: 'Blunted', description: 'Emotional expression is significantly reduced in intensity.' },
      { label: 'Flat', description: 'Little or no observable emotional expression is present.' },
      { label: 'Labile', description: 'Emotional expression changes quickly or unpredictably.' },
      { label: 'Anxious', description: 'Facial expression, body language, or behavior reflects nervousness or worry.' },
      { label: 'Tearful', description: 'Crying or visible signs of sadness are observed.' },
      { label: 'Irritable', description: 'Emotional expression reflects annoyance, frustration, or agitation.' },
      { label: 'Incongruent', description: 'Emotional expression does not appear consistent with the person’s stated mood or discussion topic.' }
    ]
  },
  {
    key: 'Thought Process',
    label: 'Thought Process',
    allNormalLabel: 'Linear',
    options: [
      { label: 'Linear', description: 'Thoughts progress in a clear and understandable sequence.' },
      { label: 'Logical', description: 'Ideas and conclusions follow a reasonable pattern.' },
      { label: 'Goal-directed', description: 'Responses remain focused on answering questions or reaching the intended point.' },
      { label: 'Organized', description: 'Thoughts are expressed in a coherent and structured manner.' },
      { label: 'Concrete', description: 'Tends to interpret information literally and may have difficulty with abstract concepts.' },
      { label: 'Circumstantial', description: 'Provides excessive detail but eventually returns to the original point.' },
      { label: 'Tangential', description: 'Moves away from the original topic and may not return to the question or point.' },
      { label: 'Perseverative', description: 'Repeatedly returns to the same thought, topic, word, or concern despite attempts to move on.' },
      { label: 'Racing', description: 'Reports or demonstrates thoughts occurring very rapidly.' },
      { label: 'Disorganized', description: 'Thoughts are difficult to follow or lack a clear connection.' },
      { label: 'Loose associations', description: 'Ideas shift between topics with limited or unclear connections between them.' }
    ]
  },
  {
    key: 'Thought Content',
    label: 'Thought Content',
    allNormalLabel: 'Appropriate',
    options: [
      { label: 'Appropriate', description: 'Thought content is relevant to the situation with no significant abnormalities noted.' },
      { label: 'Future-oriented', description: 'Discusses plans, goals, responsibilities, or expectations for the future.' },
      { label: 'Preoccupied', description: 'Attention and thoughts are strongly focused on a particular issue or concern.' },
      { label: 'Obsessive', description: 'Recurrent, unwanted thoughts or concerns are reported that are difficult to dismiss.' },
      { label: 'Ruminative', description: 'Repeatedly thinks about the same concern, event, or problem.' },
      { label: 'Hopeless', description: 'Expresses little expectation that circumstances will improve.' },
      { label: 'Paranoid', description: 'Expresses significant mistrust or beliefs that others may intend harm without clear supporting evidence.' },
      { label: 'Delusional', description: 'Expresses a fixed belief that appears inconsistent with reality and is not readily changed by evidence.' },
      { label: 'Grandiose', description: 'Expresses an unusually exaggerated sense of abilities, importance, power, or status.' },
      { label: 'No unusual thought content noted', description: 'No significant abnormalities in thought content were observed or reported.' }
    ]
  },
  {
    key: 'Perception',
    label: 'Perception',
    allNormalLabel: 'No perceptual disturbance noted',
    options: [
      { label: 'No perceptual disturbance noted', description: 'No hallucinations or other significant perceptual concerns are reported or observed.' },
      { label: 'Auditory hallucinations reported', description: 'Reports hearing sounds or voices that others do not appear to hear.' },
      { label: 'Visual hallucinations reported', description: 'Reports seeing things that others do not appear to see.' },
      { label: 'Other hallucinations reported', description: 'Reports unusual sensory experiences involving touch, smell, taste, or other perceptions.' },
      { label: 'Responding to internal stimuli', description: 'Behavior suggests attention to something not apparent to others, such as looking toward or speaking to an unseen stimulus.' }
    ]
  },
  {
    key: 'Orientation',
    label: 'Orientation',
    allNormalLabel: 'Oriented ×4',
    options: [
      { label: 'Oriented ×4', description: 'Correctly identifies person, place, time, and current situation.' },
      { label: 'Oriented to person', description: 'Understands their own identity and/or recognizes relevant people.' },
      { label: 'Oriented to place', description: 'Understands where they are.' },
      { label: 'Oriented to time', description: 'Demonstrates awareness of the approximate date, time, or current period.' },
      { label: 'Oriented to situation', description: 'Understands the general circumstances or reason for the current interaction.' },
      { label: 'Partially oriented', description: 'Correctly identifies some, but not all, areas of orientation.' },
      { label: 'Disoriented', description: 'Demonstrates significant confusion regarding person, place, time, or situation.' }
    ]
  },
  {
    key: 'Attention and Concentration',
    label: 'Attention and Concentration',
    allNormalLabel: 'Intact',
    options: [
      { label: 'Intact', description: 'Maintains attention and concentration without noticeable difficulty.' },
      { label: 'Adequate', description: 'Generally able to focus, with only minor difficulties.' },
      { label: 'Mildly impaired', description: 'Some difficulty maintaining attention or completing tasks is observed.' },
      { label: 'Distractible', description: 'Attention is frequently redirected by outside stimuli or unrelated thoughts.' },
      { label: 'Poor', description: 'Significant difficulty sustaining attention or concentration.' },
      { label: 'Unable to assess', description: 'Insufficient information or participation to reliably evaluate this area.' }
    ]
  },
  {
    key: 'Memory',
    label: 'Memory',
    allNormalLabel: 'Intact',
    options: [
      { label: 'Intact', description: 'No significant memory difficulties are observed or reported.' },
      { label: 'Recent memory impaired', description: 'Has difficulty recalling recent events or newly presented information.' },
      { label: 'Remote memory impaired', description: 'Has difficulty recalling information or events from the more distant past.' },
      { label: 'Mild impairment', description: 'Some memory difficulty is evident but does not prevent participation.' },
      { label: 'Significant impairment', description: 'Memory problems substantially affect functioning or the assessment.' },
      { label: 'Unable to assess', description: 'Memory could not be reliably evaluated during the interaction.' }
    ]
  },
  {
    key: 'Cognition / Fund of Knowledge',
    label: 'Cognition / Fund of Knowledge',
    allNormalLabel: 'Age-appropriate',
    options: [
      { label: 'Age-appropriate', description: 'Knowledge, reasoning, and understanding appear consistent with developmental expectations.' },
      { label: 'Average', description: 'General knowledge and reasoning appear consistent with typical expectations.' },
      { label: 'Above average', description: 'Demonstrates knowledge or reasoning above typical expectations.' },
      { label: 'Below expected', description: 'Knowledge or reasoning appears below expected levels based on available information.' },
      { label: 'Concrete', description: 'Demonstrates primarily literal thinking with limited abstraction.' },
      { label: 'Cognitive limitations noted', description: 'Observable difficulties with understanding, reasoning, processing, or problem-solving are present.' },
      { label: 'Unable to assess', description: 'Insufficient information is available to evaluate cognitive functioning.' }
    ]
  },
  {
    key: 'Insight',
    label: 'Insight',
    allNormalLabel: 'Good',
    options: [
      { label: 'Good', description: 'Demonstrates clear understanding of their emotions, behavior, difficulties, and need for support when applicable.' },
      { label: 'Fair', description: 'Demonstrates some awareness of concerns but may have difficulty fully recognizing their impact.' },
      { label: 'Limited', description: 'Shows minimal awareness of problems, behaviors, or their consequences.' },
      { label: 'Poor', description: 'Demonstrates little or no recognition of significant concerns or their impact.' },
      { label: 'Improving', description: 'Demonstrates increasing awareness compared with previous encounters.' }
    ]
  },
  {
    key: 'Judgment',
    label: 'Judgment',
    allNormalLabel: 'Good',
    options: [
      { label: 'Good', description: 'Demonstrates appropriate decision-making and consideration of consequences.' },
      { label: 'Fair', description: 'Generally makes reasonable decisions but may demonstrate occasional difficulty evaluating consequences.' },
      { label: 'Limited', description: 'Has notable difficulty considering consequences or making safe/effective decisions.' },
      { label: 'Poor', description: 'Decision-making is significantly impaired or frequently places the individual at risk.' },
      { label: 'Impulsive', description: 'Tends to act quickly without adequately considering consequences.' }
    ]
  },
  {
    key: 'Impulse Control',
    label: 'Impulse Control',
    allNormalLabel: 'Good',
    options: [
      { label: 'Good', description: 'Able to appropriately manage urges, emotions, and behaviors.' },
      { label: 'Fair', description: 'Generally maintains control but has occasional difficulty regulating impulses.' },
      { label: 'Limited', description: 'Frequently struggles to control urges or behavioral responses.' },
      { label: 'Poor', description: 'Demonstrates significant difficulty controlling impulses or behaviors.' },
      { label: 'Variable', description: 'Ability to regulate impulses changes substantially depending on situation or emotional state.' }
    ]
  },
  {
    key: 'Engagement',
    label: 'Engagement',
    allNormalLabel: 'Actively engaged',
    options: [
      { label: 'Actively engaged', description: 'Participates consistently and meaningfully throughout the interaction.' },
      { label: 'Moderately engaged', description: 'Participates adequately but may require occasional support or prompting.' },
      { label: 'Minimally engaged', description: 'Provides limited participation or interaction.' },
      { label: 'Required prompting', description: 'Needed repeated encouragement or redirection to participate.' },
      { label: 'Refused participation', description: 'Declined to participate in some or all of the assessment or session.' }
    ]
  },
  {
    key: 'Overall Presentation',
    label: 'Overall Presentation',
    allNormalLabel: 'Stable',
    options: [
      { label: 'Stable', description: 'Presentation appears generally consistent and without significant acute concerns.' },
      { label: 'At baseline', description: 'Presentation appears consistent with the person’s typical level of functioning.' },
      { label: 'Improved', description: 'Presentation or functioning appears better compared with previous encounters.' },
      { label: 'Mildly distressed', description: 'Some emotional distress is present but the individual remains generally regulated and functional.' },
      { label: 'Moderately distressed', description: 'Noticeable emotional or behavioral distress is affecting participation or functioning.' },
      { label: 'Significantly distressed', description: 'Substantial emotional or behavioral distress is present and significantly affects functioning.' },
      { label: 'Decompensated', description: 'Significant decline from typical functioning is observed and additional assessment or intervention may be required.' }
    ]
  }
];

/** Risk items use the same nested-hover pattern; kept out of the MSE grid. */
export const RISK_DOMAIN_DEFS = [
  {
    key: 'Suicidal Ideation',
    label: 'Suicidal Ideation',
    allNormalLabel: 'Denied',
    options: [
      { label: 'Denied', description: 'Individual reports no current suicidal thoughts.' },
      { label: 'Passive thoughts', description: 'Reports thoughts related to death or not wanting to be alive without a stated plan or intent to act.' },
      { label: 'Active thoughts', description: 'Reports current thoughts of suicide or intentionally ending their life.' },
      { label: 'Plan reported', description: 'Reports having identified a method or plan for suicide.' },
      { label: 'Intent reported', description: 'Reports an intention or expectation of acting on suicidal thoughts.' },
      { label: 'Unable to assess', description: 'Current suicidal ideation could not be adequately determined.' }
    ]
  },
  {
    key: 'Homicidal Ideation',
    label: 'Homicidal Ideation',
    allNormalLabel: 'Denied',
    options: [
      { label: 'Denied', description: 'Individual reports no current thoughts of intentionally killing another person.' },
      { label: 'Thoughts reported', description: 'Reports thoughts of killing or causing lethal harm to another person.' },
      { label: 'Plan reported', description: 'Reports a specific plan or method for harming another person.' },
      { label: 'Intent reported', description: 'Reports an intention or expectation of acting on homicidal thoughts.' },
      { label: 'Unable to assess', description: 'Current homicidal ideation could not be adequately determined.' }
    ]
  },
  {
    key: 'Self-Harm',
    label: 'Self-Harm',
    allNormalLabel: 'Denied',
    options: [
      { label: 'Denied', description: 'Reports no current thoughts, urges, or recent intentional self-injury.' },
      { label: 'Thoughts or urges reported', description: 'Reports current thoughts or urges to intentionally injure themselves without suicidal intent.' },
      { label: 'Recent behavior reported', description: 'Reports recent intentional self-injury.' },
      { label: 'History reported', description: 'Reports previous self-harm behavior but no current behavior or urges.' },
      { label: 'Unable to assess', description: 'Current self-harm risk could not be adequately determined.' }
    ]
  }
];

/** Domain keys used by structured chart / sign gate (MSE only). */
export const MSE_DOMAINS = MSE_DOMAIN_DEFS.map((d) => d.key);

export const RISK_DOMAIN_KEYS = RISK_DOMAIN_DEFS.map((d) => d.key);

const LEGACY_STATUS = new Set(['normal', 'abnormal', 'not_assessed', 'selected', '']);

export function findMseDomainDef(domainKey) {
  return MSE_DOMAIN_DEFS.find((d) => d.key === domainKey || d.label === domainKey) || null;
}

export function findRiskDomainDef(domainKey) {
  return RISK_DOMAIN_DEFS.find((d) => d.key === domainKey || d.label === domainKey) || null;
}

export function findOptionDescription(domainDef, optionLabel) {
  if (!domainDef || !optionLabel) return '';
  const hit = (domainDef.options || []).find(
    (o) => String(o.label).toLowerCase() === String(optionLabel).toLowerCase()
  );
  return hit?.description || '';
}

/** Selected option label for a stored domain cell (supports legacy normal/abnormal). */
export function domainSelectionLabel(cell) {
  if (!cell) return '';
  const option = String(cell.option || '').trim();
  if (option) return option;
  const status = String(cell.status || '').trim();
  if (!status || LEGACY_STATUS.has(status.toLowerCase())) {
    if (status.toLowerCase() === 'not_assessed') return 'Not assessed';
    if (status.toLowerCase() === 'abnormal') return 'Abnormal';
    if (status.toLowerCase() === 'normal') return 'Normal';
    return '';
  }
  return status;
}

export function isDomainCellComplete(cell) {
  const label = domainSelectionLabel(cell);
  return !!label;
}

export function isMentalStatusExamComplete(mse, domains = MSE_DOMAINS) {
  if (!mse) return false;
  if (mse.allNormal || mse.allNotAssessed) return true;
  const map = mse.domains || {};
  return domains.every((d) => isDomainCellComplete(map[d]));
}

export function isRiskAssessmentComplete(risk) {
  if (!risk) return false;
  if (risk.patientDeniesAll) return true;
  const items = risk.items && typeof risk.items === 'object' ? risk.items : null;
  if (items) {
    return RISK_DOMAIN_KEYS.every((k) => isDomainCellComplete(items[k]));
  }
  // Legacy areas[] path: require at least one named area OR notes after explicit deny-off.
  const areas = Array.isArray(risk.areas) ? risk.areas : [];
  if (areas.some((a) => String(a?.name || '').trim())) return true;
  return false;
}

export function buildAllNormalMse() {
  const domains = {};
  for (const def of MSE_DOMAIN_DEFS) {
    const label = def.allNormalLabel || def.options[0]?.label || '';
    const description = findOptionDescription(def, label);
    domains[def.key] = { status: 'selected', option: label, detail: description };
  }
  return { allNormal: true, allNotAssessed: false, domains };
}

export function buildAllNotAssessedMse() {
  const domains = {};
  for (const def of MSE_DOMAIN_DEFS) {
    const unable = (def.options || []).find((o) => /unable to assess/i.test(o.label));
    if (unable) {
      domains[def.key] = { status: 'selected', option: unable.label, detail: unable.description };
    } else {
      domains[def.key] = { status: 'not_assessed', option: '', detail: '' };
    }
  }
  return { allNormal: false, allNotAssessed: true, domains };
}

export function buildDeniedRiskAssessment(notes = '') {
  const items = {};
  for (const def of RISK_DOMAIN_DEFS) {
    const label = def.allNormalLabel || 'Denied';
    items[def.key] = {
      status: 'selected',
      option: label,
      detail: findOptionDescription(def, label)
    };
  }
  return {
    patientDeniesAll: true,
    items,
    areas: [],
    notes: notes || ''
  };
}

export function emptyRiskAssessment() {
  return {
    patientDeniesAll: false,
    items: {},
    areas: [],
    notes: ''
  };
}
