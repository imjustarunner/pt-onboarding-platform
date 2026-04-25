/**
 * Standard popular race distances — mirrors backend/src/utils/raceDistances.js.
 * Keep in sync manually if thresholds change.
 */
export const RACE_DISTANCES = [
  { key: '5k',    label: '5K',          shortLabel: '5K',     miles: 3.1068,  minMiles: 2.9,  maxMiles: 3.35,  defaultEmoji: '🏃'  },
  { key: '8k',    label: '8K',          shortLabel: '8K',     miles: 4.9709,  minMiles: 4.7,  maxMiles: 5.2,   defaultEmoji: '⚡'  },
  { key: '10k',   label: '10K',         shortLabel: '10K',    miles: 6.2137,  minMiles: 5.9,  maxMiles: 6.6,   defaultEmoji: '💨'  },
  { key: '15k',   label: '15K',         shortLabel: '15K',    miles: 9.3206,  minMiles: 9.0,  maxMiles: 9.7,   defaultEmoji: '🌟'  },
  { key: '10mi',  label: '10 Miles',    shortLabel: '10 mi',  miles: 10.0,    minMiles: 9.8,  maxMiles: 10.4,  defaultEmoji: '🦶'  },
  { key: 'half',  label: 'Half Marathon', shortLabel: '13.1', miles: 13.1094, minMiles: 12.9, maxMiles: 13.45, defaultEmoji: '🥈'  },
  { key: '20mi',  label: '20 Miles',    shortLabel: '20 mi',  miles: 20.0,    minMiles: 19.7, maxMiles: 20.4,  defaultEmoji: '🔥'  },
  { key: 'full',  label: 'Marathon',    shortLabel: '26.2',   miles: 26.2188, minMiles: 25.9, maxMiles: 26.6,  defaultEmoji: '🏅'  },
  { key: '50k',   label: '50K',         shortLabel: '50K',    miles: 31.0686, minMiles: 30.5, maxMiles: 31.7,  defaultEmoji: '⭐'  },
  { key: '50mi',  label: '50 Miles',    shortLabel: '50 mi',  miles: 50.0,    minMiles: 49.0, maxMiles: 51.0,  defaultEmoji: '💪'  },
  { key: '100k',  label: '100K',        shortLabel: '100K',   miles: 62.1371, minMiles: 61.0, maxMiles: 63.5,  defaultEmoji: '🦁'  },
  { key: '100mi', label: '100 Miles',   shortLabel: '100 mi', miles: 100.0,   minMiles: 98.0, maxMiles: 102.0, defaultEmoji: '🦅'  },
];

export const DEFAULT_ENABLED_KEYS = RACE_DISTANCES.map((d) => d.key);
