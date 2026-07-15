/**
 * Values Alignment scoring helpers (mirrors backend logic for guest mode).
 */

export function calculateAlignmentGap(importanceScore, alignmentScore) {
  const imp = Number(importanceScore);
  const al = Number(alignmentScore);
  if (!Number.isFinite(imp) || !Number.isFinite(al)) return null;
  return Math.max(0, imp - al);
}

export function calculateAlignmentOpportunity(importanceScore, alignmentScore) {
  const gap = calculateAlignmentGap(importanceScore, alignmentScore);
  if (gap == null) return null;
  return gap * Number(importanceScore);
}

export function gapStatusLabel(gap) {
  if (gap == null) return '';
  if (gap <= 1) return 'Strongly Aligned';
  if (gap <= 3) return 'Mostly Aligned';
  if (gap <= 5) return 'Meaningful Opportunity';
  return 'Significant Alignment Gap';
}

export function averageGapLabel(avgGap) {
  if (avgGap == null) return null;
  if (avgGap <= 1) return 'Strongly Aligned';
  if (avgGap <= 2.5) return 'Generally Aligned';
  if (avgGap <= 4) return 'Partially Aligned';
  return 'Ready for Realignment';
}

export function buildValuesSummary(template, responses, priorityKeys = []) {
  const settings = template?.settings || {};
  const highImp = Number(settings.highImportanceThreshold || 7);
  const highAl = Number(settings.highAlignmentThreshold || 7);
  const values = template?.values || [];
  const scored = (responses || []).filter(
    (r) => r.importanceScore != null && r.alignmentScore != null
  );
  if (!scored.length) {
    return {
      averageImportance: null,
      averageAlignment: null,
      averageGap: null,
      alignmentLevel: null,
      stronglyAlignedCount: 0,
      priorityOpportunityCount: 0,
      coreStrengths: [],
      priorityOpportunities: [],
      stableSupports: [],
      lowerPriority: [],
      insights: []
    };
  }

  const withMeta = scored.map((r) => {
    const gap = calculateAlignmentGap(r.importanceScore, r.alignmentScore);
    const opportunity = calculateAlignmentOpportunity(r.importanceScore, r.alignmentScore);
    const val = values.find((v) => v.key === r.valueKey);
    return {
      valueKey: r.valueKey,
      label: val?.label || r.valueKey,
      color: val?.color || '#64748b',
      category: val?.category || null,
      importanceScore: r.importanceScore,
      alignmentScore: r.alignmentScore,
      gap,
      opportunity,
      status: gapStatusLabel(gap),
      morePresentThanPrioritized: Number(r.alignmentScore) > Number(r.importanceScore)
    };
  });

  const avgImp = withMeta.reduce((s, x) => s + x.importanceScore, 0) / withMeta.length;
  const avgAl = withMeta.reduce((s, x) => s + x.alignmentScore, 0) / withMeta.length;
  const avgGap = withMeta.reduce((s, x) => s + (x.gap || 0), 0) / withMeta.length;

  const coreStrengths = withMeta
    .filter((x) => x.importanceScore >= highImp && x.alignmentScore >= highAl && (x.gap || 0) <= 2)
    .sort((a, b) => b.importanceScore - a.importanceScore);
  const priorityOpportunities = withMeta
    .filter((x) => x.importanceScore >= highImp && (x.gap || 0) >= 3)
    .sort((a, b) => (b.opportunity || 0) - (a.opportunity || 0));
  const stableSupports = withMeta
    .filter((x) => x.importanceScore < highImp && x.alignmentScore >= highAl)
    .sort((a, b) => b.alignmentScore - a.alignmentScore);
  const lowerPriority = withMeta
    .filter((x) => x.importanceScore < highImp && x.alignmentScore < highAl)
    .sort((a, b) => a.importanceScore - b.importanceScore);

  const insights = [];
  if (coreStrengths.length) {
    insights.push(
      `${coreStrengths
        .slice(0, 2)
        .map((x) => x.label)
        .join(' and ')} appear to be deeply important and strongly reflected in your current life.`
    );
  }
  if (priorityOpportunities[0]) {
    const top = priorityOpportunities[0];
    insights.push(
      `${top.label} is highly important to you but currently has one of your largest alignment gaps.`
    );
  }
  const cats = [...new Set(withMeta.map((x) => x.category).filter(Boolean))];
  if (cats.length >= 2) {
    insights.push(`Your selected values emphasize ${cats.slice(0, 3).join(', ')}.`);
  }
  if (priorityKeys?.length) {
    insights.push(
      `You chose to focus intentional action on ${priorityKeys
        .map((k) => withMeta.find((x) => x.valueKey === k)?.label || k)
        .join(', ')}.`
    );
  }

  return {
    averageImportance: Math.round(avgImp * 10) / 10,
    averageAlignment: Math.round(avgAl * 10) / 10,
    averageGap: Math.round(avgGap * 10) / 10,
    alignmentLevel: averageGapLabel(avgGap),
    stronglyAlignedCount: withMeta.filter((x) => (x.gap || 0) <= 1).length,
    priorityOpportunityCount: priorityOpportunities.length,
    coreStrengths,
    priorityOpportunities,
    stableSupports,
    lowerPriority,
    insights
  };
}

export const REFLECTION_CHIPS = [
  'My schedule supports it',
  'My habits support it',
  'My relationships support it',
  'My environment supports it',
  'I make intentional choices',
  'I lack time',
  'I lack clarity',
  'I avoid difficult decisions',
  'Other priorities take over',
  'I need stronger boundaries',
  'I need support',
  'I am unsure where to begin',
  'Other'
];

export const CATEGORY_LABELS = {
  connection: 'Connection',
  character: 'Character',
  growth: 'Growth',
  purpose: 'Purpose',
  lifestyle: 'Lifestyle'
};
