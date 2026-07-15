/**
 * Pure Athlete Readiness scoring (no DB).
 */

export function calculateAthleteReadinessScore(inputs) {
  const list = (inputs || []).filter(
    (i) => i && Number.isFinite(Number(i.score)) && Number.isFinite(Number(i.weight)) && Number(i.weight) > 0
  );
  if (!list.length) return null;
  const totalWeight = list.reduce((sum, item) => sum + Number(item.weight), 0);
  if (!totalWeight) return null;
  const weightedTotal = list.reduce((sum, item) => sum + Number(item.score) * Number(item.weight), 0);
  return Math.round((weightedTotal / totalWeight) * 10);
}

export function readinessStatusLabel(score, athleteFacing = true) {
  if (score == null) return null;
  if (athleteFacing) {
    if (score <= 39) return 'Needs Support';
    if (score <= 54) return 'Limited Today';
    if (score <= 69) return 'Moderately Ready';
    if (score <= 84) return 'Ready';
    return 'Highly Ready';
  }
  if (score <= 39) return 'Significant Support Needed';
  if (score <= 54) return 'Low Readiness';
  if (score <= 69) return 'Limited Readiness';
  if (score <= 84) return 'Ready';
  return 'High Readiness';
}

export function dailyRecommendation(score) {
  if (score == null) return null;
  if (score >= 85) {
    return {
      status: 'High Readiness',
      message: 'Your responses suggest strong readiness for today’s planned demands.'
    };
  }
  if (score >= 70) {
    return {
      status: 'Ready',
      message: 'Your responses suggest that you are generally prepared, with a few areas worth monitoring.'
    };
  }
  if (score >= 55) {
    return {
      status: 'Modified Readiness',
      message:
        'Your responses suggest that one or more areas may benefit from adjustment or coach review.'
    };
  }
  return {
    status: 'Support Recommended',
    message:
      'Your responses suggest limited readiness. Discussing recovery, physical comfort, stress, or training demands may be useful before proceeding.'
  };
}

function avgScores(scores) {
  const list = (scores || []).filter((n) => n != null && Number.isFinite(Number(n)));
  if (!list.length) return null;
  return Math.round((list.reduce((s, n) => s + Number(n), 0) / list.length) * 10) / 10;
}

export function buildSummary(template, responses, mode = 'daily') {
  const domains = (template?.domains || []).filter((d) => {
    if (d.isOptional && d.key === 'competition') return mode === 'competition';
    if (d.isOptional) return (d.availableModes || []).includes(mode);
    return (d.availableModes || ['daily']).includes(mode) || !d.availableModes?.length;
  });

  const byKey = Object.fromEntries((responses || []).map((r) => [r.domainKey, r]));
  const scoreInputs = [];
  for (const d of domains) {
    if (d.isOptional && d.weight <= 0 && d.key === 'competition') continue;
    const score = byKey[d.key]?.score;
    if (score == null) continue;
    if (d.weight > 0) scoreInputs.push({ score, weight: d.weight });
  }

  const readinessScore = calculateAthleteReadinessScore(scoreInputs);

  const layerOf = (keys) =>
    avgScores(keys.map((k) => byKey[k]?.score).filter((s) => s != null));

  const layerScores = {
    recovery: layerOf(['sleep', 'recovery']),
    physical: layerOf(['energy', 'soreness', 'nutrition']),
    mental: layerOf(['focus', 'motivation']),
    emotional: layerOf(['confidence', 'stress']),
    competitive: layerOf(
      mode === 'competition'
        ? ['competition', 'connection', 'confidence', 'focus']
        : ['connection', 'confidence', 'focus']
    )
  };

  const scored = domains
    .map((d) => {
      const r = byKey[d.key];
      if (!r || r.score == null) return null;
      return {
        domainKey: d.key,
        label: d.label,
        shortLabel: d.shortLabel,
        color: d.color,
        layer: d.readinessLayer,
        score: r.score,
        supportPreference: r.supportPreference || 'none',
        reflectionChips: r.reflectionChips || [],
        bodyAreas: r.bodyAreas || []
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const strongest = scored.slice(0, 3);
  const limiters = [...scored].sort((a, b) => a.score - b.score).slice(0, 3);

  const indicators = [];
  const sleep = byKey.sleep?.score;
  const recovery = byKey.recovery?.score;
  const soreness = byKey.soreness?.score;
  const stress = byKey.stress?.score;
  const focus = byKey.focus?.score;
  const motivation = byKey.motivation?.score;
  const confidence = byKey.confidence?.score;

  if ((sleep != null && sleep <= 4) || (recovery != null && recovery <= 4)) {
    indicators.push({
      key: 'recovery_concern',
      severity: 'attention',
      message:
        'Recovery is currently limited and may be worth discussing before high-intensity training.'
    });
  }
  if (soreness != null && soreness <= 4) {
    indicators.push({
      key: 'physical_comfort',
      severity: 'attention',
      message:
        'The athlete reports notable discomfort or movement limitation. Follow-up may be appropriate before training.'
    });
  }
  if (stress != null && stress <= 4 && focus != null && focus <= 5) {
    indicators.push({
      key: 'stress_focus',
      severity: 'attention',
      message: 'Elevated stress may be affecting concentration and readiness.'
    });
  }
  if (motivation != null && motivation >= 8 && recovery != null && recovery <= 4) {
    indicators.push({
      key: 'motivation_recovery',
      severity: 'info',
      message:
        'The athlete is highly motivated, but current recovery may not support the desired training intensity.'
    });
  }
  if (mode === 'competition' && confidence != null && confidence <= 4) {
    indicators.push({
      key: 'low_confidence_competition',
      severity: 'attention',
      message:
        'The athlete may benefit from strategy review, reassurance, or mental-performance support.'
    });
  }

  const supportRequests = (responses || []).filter(
    (r) => r.supportPreference && r.supportPreference !== 'none'
  );

  const insights = [];
  if (strongest[0]) {
    insights.push(`${strongest[0].label} is currently one of your strongest readiness areas.`);
  }
  if (limiters[0] && strongest[0] && limiters[0].domainKey !== strongest[0].domainKey) {
    insights.push(
      `${limiters[0].label} appears lower than your stronger areas and may be worth monitoring.`
    );
  }
  if (motivation != null && recovery != null && motivation >= 8 && recovery <= 4) {
    insights.push(
      'Motivation is high relative to recovery — responses suggest discussing intensity with your coach.'
    );
  }
  if (byKey.connection?.score != null && byKey.connection.score >= 8) {
    insights.push('Team connection appears to be supporting your current readiness.');
  }

  return {
    readinessScore,
    readinessStatus: readinessStatusLabel(readinessScore, true),
    readinessStatusCoach: readinessStatusLabel(readinessScore, false),
    recommendation: dailyRecommendation(readinessScore),
    layerScores,
    strongest,
    limiters,
    indicators,
    insights,
    supportRequestCount: supportRequests.length,
    scoredCount: scored.length,
    domainCount: domains.filter(
      (d) => !(d.isOptional && mode !== 'competition' && d.key === 'competition')
    ).length
  };
}
