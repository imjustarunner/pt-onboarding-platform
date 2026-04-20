/**
 * useGuidedChallengeDraft.js
 *
 * Shared helpers for the weekly-challenge Guided Draft Helper. Extracted from
 * ChallengeManagement.vue so both the per-week slot editor and the Challenge
 * Template Library editor use the same title parser, description pools,
 * concept generators, and icon randomizers.
 *
 * Consumers typically import:
 *   parseChallengeMetricsFromTitle  — extract min miles / min minutes / challenge type from a title
 *   pickDescriptionFactory          — pick a random description factory per activity
 *   generateAutoTitleForActivity    — invent a metric-bearing title for the activity
 *   guidedDraftProofPolicy          — default proof policy for an activity
 *   shuffleLibraryIcon              — pick a random icon from the Challenge sub-category
 *   CHALLENGE_EMOJI_POOL            — emoji options for the emoji-mode shuffle
 */
import api from '../services/api';

export const CHALLENGE_EMOJI_POOL = ['🏃', '🥾', '🌲', '👟', '🚴', '🌊', '💪', '🔥', '⚡', '🎯', '🏔', '⭐', '🏆'];

export const randomPick = (arr) => (arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);

export const guidedDraftProofPolicy = (activityType) => {
  const key = String(activityType || '').toLowerCase();
  if (key.includes('run') || key.includes('ruck') || key.includes('walk')) return 'gps_or_photo';
  if (key.includes('bike') || key.includes('swim') || key.includes('fit')) return 'photo_required';
  return 'none';
};

/**
 * Pull trackable metrics out of a human-friendly title (e.g. "5-Mile Run",
 * "10K Tempo", "45 min Swim", "Half Marathon", "2 hr Ruck"). Used to seed the
 * rich-criteria block automatically so the resulting challenge is actually
 * validated against a workout.
 */
export const parseChallengeMetricsFromTitle = (title) => {
  const out = { minMiles: null, minMinutes: null, challengeType: null };
  const raw = String(title || '').toLowerCase();
  if (!raw) return out;

  const mileMatch = raw.match(/(\d+(?:\.\d+)?)\s*-?\s*mi(?:les?)?\b/);
  if (mileMatch) out.minMiles = Number(mileMatch[1]);

  if (out.minMiles == null) {
    const kMatch = raw.match(/(\d+(?:\.\d+)?)\s*k\b/);
    if (kMatch) out.minMiles = Number((Number(kMatch[1]) * 0.621371).toFixed(2));
  }

  if (out.minMiles == null && /half\s*-?\s*marathon/.test(raw)) out.minMiles = 13.1;
  if (out.minMiles == null && /\bmarathon\b/.test(raw)) out.minMiles = 26.2;

  const hrMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr)s?\b/);
  if (hrMatch) out.minMinutes = Math.round(Number(hrMatch[1]) * 60);

  if (out.minMinutes == null) {
    const minMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:minute|min)s?\b/);
    if (minMatch) out.minMinutes = Math.round(Number(minMatch[1]));
  }

  if (/\brace\b|\b5k\b|\b10k\b|marathon|time\s*trial/.test(raw)) out.challengeType = 'race';
  else out.challengeType = 'workout';

  return out;
};

export const WEEKLY_GUIDED_DESCRIPTIONS = {
  run: [
    (name) => `Complete "${name}" with one steady run that locks into race pace for the middle third, then finish with a controlled push.`,
    (name) => `Use "${name}" as a benchmark workout: log one quality run and keep your pacing smooth from the first mile to the last.`,
    (name) => `Make "${name}" your featured workout of the week with a purposeful run that builds effort instead of starting too fast.`
  ],
  'trail run': [
    (name) => `Turn "${name}" into a trail mission: choose rolling terrain, stay relaxed on climbs, and finish with clean footing on the descent.`,
    (name) => `Use "${name}" for one trail-focused workout that balances climbing strength, control, and steady aerobic effort.`,
    (name) => `Log "${name}" on dirt if possible and aim for a strong, even effort that rewards patience over the first half.`
  ],
  ruck: [
    (name) => `Treat "${name}" as a focused ruck session with strong posture, consistent pace, and a finish that still feels repeatable.`,
    (name) => `Build "${name}" around one quality ruck: maintain steady movement, keep transitions clean, and close out the final segment with intent.`,
    (name) => `Use "${name}" for a purposeful ruck workout that emphasizes consistency and disciplined effort instead of surges.`
  ],
  walk: [
    (name) => `Use "${name}" for an intentional walk that keeps cadence up, posture tall, and effort honest for the full session.`,
    (name) => `Make "${name}" a brisk movement session with smooth pacing and a strong finish over the last few minutes.`,
    (name) => `Complete "${name}" with one purposeful walk that feels active the whole way instead of drifting into recovery pace.`
  ],
  bike: [
    (name) => `Build "${name}" around a bike session with one sustained working block and a smooth cooldown to finish.`,
    (name) => `Use "${name}" for a ride that starts controlled, settles into tempo, and closes with one final push.`,
    (name) => `Make "${name}" the week's featured ride by keeping pressure on the pedals without blowing up early.`
  ],
  swim: [
    (name) => `Turn "${name}" into a swim set with clean form, measured pacing, and one confident finish effort near the end.`,
    (name) => `Use "${name}" as a technique-first swim workout that still asks for one solid sustained segment.`,
    (name) => `Complete "${name}" with a smooth swim session that emphasizes rhythm, breathing control, and a composed final set.`
  ],
  fitness: [
    (name) => `Build "${name}" around one focused fitness session with clear work intervals, short recovery, and a finish that feels earned.`,
    (name) => `Use "${name}" as a circuit-style workout that stacks quality reps, steady effort, and one hard closing round.`,
    (name) => `Make "${name}" your featured fitness challenge this week with controlled intensity and strong form all the way through.`
  ],
  other: [
    (name) => `Use "${name}" for one signature workout this week and make the effort specific, repeatable, and easy for captains to explain.`,
    (name) => `Turn "${name}" into a clean example workout with a clear objective, strong pacing, and a finish that matches the title.`,
    (name) => `Make "${name}" a standout challenge by pairing the title with one realistic workout people can picture immediately.`
  ]
};

export const pickDescriptionFactory = (activityType, { title = '', avoidText = '' } = {}) => {
  const key = String(activityType || '').toLowerCase();
  const options = WEEKLY_GUIDED_DESCRIPTIONS[key] || WEEKLY_GUIDED_DESCRIPTIONS.other;
  if (!options || !options.length) {
    return { factory: WEEKLY_GUIDED_DESCRIPTIONS.other[0], index: 0 };
  }
  const seedTitle = String(title || '__probe__');
  const avoid = String(avoidText || '').trim();
  const eligible = avoid
    ? options.map((fn, idx) => ({ fn, idx })).filter(({ fn }) => fn(seedTitle) !== avoid)
    : options.map((fn, idx) => ({ fn, idx }));
  const pool = eligible.length ? eligible : options.map((fn, idx) => ({ fn, idx }));
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  return { factory: chosen.fn, index: chosen.idx };
};

/**
 * Invent a sensible, metric-bearing title for the given activity. Titles always
 * embed a measurable number so `parseChallengeMetricsFromTitle` can seed the
 * rich-criteria block automatically.
 */
export const generateAutoTitleForActivity = (activity, { avoidTitle = '' } = {}) => {
  const key = String(activity || '').toLowerCase();
  const miles = () => randomPick([2, 3, 4, 5, 6, 8, 10]);
  const longMiles = () => randomPick([8, 10, 12, 14, 16]);
  const rideMiles = () => randomPick([10, 15, 20, 25, 30]);
  const minutes = () => randomPick([20, 30, 45, 60, 75]);

  const runConcepts = [
    () => `${miles()}-Mile Run`,
    () => `${miles()}-Mile Tempo Run`,
    () => `${minutes()}-Minute Steady Run`,
    () => `5K Time Trial`,
    () => `10K Benchmark Run`,
    () => `Half Marathon Tune-Up`,
    () => `${longMiles()}-Mile Long Run`
  ];
  const trailConcepts = [
    () => `${miles()}-Mile Trail Run`,
    () => `${minutes()}-Minute Trail Mission`,
    () => `${randomPick([1, 2])}-Hour Mountain Trail Run`,
    () => `Hilly ${miles()}-Mile Trail Loop`
  ];
  const ruckConcepts = [
    () => `${miles()}-Mile Ruck`,
    () => `${minutes()}-Minute Ruck March`,
    () => `Heavy Pack ${miles()}-Mile Ruck`
  ];
  const walkConcepts = [
    () => `${miles()}-Mile Power Walk`,
    () => `${minutes()}-Minute Brisk Walk`,
    () => `${minutes()}-Minute Morning Movement Walk`
  ];
  const bikeConcepts = [
    () => `${rideMiles()}-Mile Ride`,
    () => `${minutes()}-Minute Tempo Ride`,
    () => `${minutes()}-Minute Interval Bike Session`
  ];
  const swimConcepts = [
    () => `${minutes()}-Minute Swim Set`,
    () => `${minutes()}-Minute Endurance Swim`,
    () => `${minutes()}-Minute Technique Swim`
  ];
  const fitnessConcepts = [
    () => `${minutes()}-Minute Strength Circuit`,
    () => `${minutes()}-Minute Core & Conditioning`,
    () => `${minutes()}-Minute Full-Body Session`
  ];
  const otherConcepts = [
    () => `${minutes()}-Minute Signature Session`,
    () => `${minutes()}-Minute Effort Builder`,
    () => `${miles()}-Mile Challenge Session`
  ];

  const pool = (
    key.includes('trail') ? trailConcepts :
    key.includes('ruck')  ? ruckConcepts  :
    key.includes('walk')  ? walkConcepts  :
    key.includes('bike')  ? bikeConcepts  :
    key.includes('swim')  ? swimConcepts  :
    key.includes('fit')   ? fitnessConcepts :
    key.includes('run')   ? runConcepts   :
    otherConcepts
  );

  const avoid = String(avoidTitle || '').trim().toLowerCase();
  let title = '';
  for (let i = 0; i < 6; i++) {
    title = randomPick(pool)();
    if (!avoid || String(title).toLowerCase() !== avoid) return title;
  }
  return title;
};

/**
 * Pick a random library icon scoped to a specific sub-category (defaults to
 * "Challenge"). Falls back to the full library if no icons match the sub-category
 * so callers always get a pick instead of an empty-state.
 *
 * Returns { id, url } on success, or null if nothing is available.
 */
export const shuffleLibraryIcon = async (clubId, { subCategory = 'Challenge', avoidIconId = null } = {}) => {
  if (!clubId) return null;
  let icons = [];
  try {
    const { data } = await api.get(`/summit-stats/clubs/${clubId}/icons`, {
      params: { subCategory, limit: 400 }
    });
    icons = Array.isArray(data?.icons) ? data.icons : [];
    if (!icons.length) {
      const { data: all } = await api.get(`/summit-stats/clubs/${clubId}/icons`, { params: { limit: 400 } });
      icons = Array.isArray(all?.icons) ? all.icons : [];
    }
  } catch (e) {
    throw e;
  }
  if (!icons.length) return null;
  const currentId = Number(avoidIconId) || null;
  const eligible = currentId ? icons.filter((ic) => Number(ic.id) !== currentId) : icons;
  const chosen = randomPick(eligible.length ? eligible : icons);
  const chosenId = Number(chosen?.id);
  if (!Number.isFinite(chosenId) || chosenId <= 0) return null;
  return { id: chosenId, url: chosen?.url || null };
};

export const useGuidedChallengeDraft = () => ({
  CHALLENGE_EMOJI_POOL,
  randomPick,
  guidedDraftProofPolicy,
  parseChallengeMetricsFromTitle,
  pickDescriptionFactory,
  generateAutoTitleForActivity,
  shuffleLibraryIcon
});

export default useGuidedChallengeDraft;
