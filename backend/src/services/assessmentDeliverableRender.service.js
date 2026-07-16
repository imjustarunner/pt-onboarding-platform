import { getFamilyMeta } from './assessmentFamilyRegistry.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pickSummary(assessment) {
  return (
    assessment?.summary ||
    assessment?.summaryJson ||
    (typeof assessment?.summary_json === 'object' ? assessment.summary_json : null) ||
    assessment?.comparison ||
    {}
  );
}

function domainRowsFromAssessment(assessment) {
  const summary = pickSummary(assessment);
  const fromSummary =
    summary?.domains ||
    summary?.categories ||
    summary?.values ||
    summary?.areas ||
    [];
  if (Array.isArray(fromSummary) && fromSummary.length) {
    return fromSummary.map((d) => ({
      label: d.label || d.shortLabel || d.key || d.domainKey || d.categoryKey || 'Area',
      score:
        d.score ??
        d.currentRegulationScore ??
        d.currentScore ??
        d.currentAlignmentScore ??
        d.currentPerformanceScore ??
        d.average ??
        null,
      note: d.status || d.statusLabel || d.insight || d.level || ''
    }));
  }

  const responses = assessment?.responses || assessment?.categoryResponses || [];
  const templateDomains =
    assessment?.template?.domains ||
    assessment?.template?.categories ||
    assessment?.template?.values ||
    [];
  const byKey = Object.fromEntries(
    (responses || []).map((r) => [
      r.domainKey || r.categoryKey || r.valueKey || r.key,
      r
    ])
  );
  return (templateDomains || []).map((d) => {
    const r = byKey[d.key] || {};
    return {
      label: d.label || d.shortLabel || d.key,
      score:
        r.score ??
        r.currentRegulationScore ??
        r.currentScore ??
        r.currentAlignmentScore ??
        r.currentPerformanceScore ??
        null,
      note: r.seasonStatus || r.status || ''
    };
  });
}

function planItemsFromAssessment(assessment) {
  const plans =
    assessment?.regulationPlans ||
    assessment?.commitmentPlans ||
    assessment?.alignmentPlans ||
    assessment?.growthPlans ||
    assessment?.actionPlans ||
    assessment?.plans ||
    [];
  if (Array.isArray(plans) && plans.length) {
    return plans.map((p) => ({
      title: p.label || p.domainKey || p.categoryKey || p.title || 'Focus area',
      body:
        p.replace ||
        p.friction ||
        p.goalStatement ||
        p.action ||
        p.nextStep ||
        p.plan ||
        [p.cueRemove, p.friction, p.replace, p.protect, p.lapseResponse]
          .filter(Boolean)
          .join(' · ') ||
        JSON.stringify(p)
    }));
  }
  const priorities =
    assessment?.selectedPriorities ||
    assessment?.priorityKeys ||
    assessment?.priorityCategoryKeys ||
    [];
  return (priorities || []).map((k) => ({
    title: String(k),
    body: 'Discuss next steps with your coach and set one concrete action this week.'
  }));
}

function wrapDocument({ title, orgName, logoUrl, subtitle, bodyHtml, docKind }) {
  const logo = logoUrl
    ? `<img src="${esc(logoUrl)}" alt="${esc(orgName || 'Organization')}" style="max-height:56px;max-width:200px;object-fit:contain;" />`
    : '';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; line-height: 1.5; margin: 0; padding: 0; background: #f7f4ef; }
    .page { max-width: 760px; margin: 0 auto; padding: 36px 40px 56px; background: #fff; }
    .brand { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #2c4a3e; padding-bottom: 16px; margin-bottom: 24px; }
    .brand-text { font-family: 'Helvetica Neue', Arial, sans-serif; }
    .org { font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #2c4a3e; margin: 0; }
    .doc-kind { font-size: 12px; color: #666; margin: 4px 0 0; font-family: 'Helvetica Neue', Arial, sans-serif; }
    h1 { font-size: 28px; margin: 0 0 8px; color: #14231c; }
    .subtitle { color: #555; margin: 0 0 28px; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0 28px; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e5e0d8; }
    th { background: #f0ebe3; color: #2c4a3e; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    .score { font-weight: 700; color: #1b4332; }
    .insight { background: #f4f7f5; border-left: 4px solid #2c4a3e; padding: 14px 16px; margin: 18px 0; }
    .plan-card { border: 1px solid #e5e0d8; border-radius: 8px; padding: 14px 16px; margin: 12px 0; }
    .plan-card h3 { margin: 0 0 6px; font-size: 16px; color: #14231c; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e0d8; font-size: 12px; color: #777; font-family: 'Helvetica Neue', Arial, sans-serif; }
  </style>
</head>
<body>
  <div class="page">
    <div class="brand">
      ${logo}
      <div class="brand-text">
        <p class="org">${esc(orgName || 'Assessment Report')}</p>
        <p class="doc-kind">${esc(docKind)}</p>
      </div>
    </div>
    <h1>${esc(title)}</h1>
    ${subtitle ? `<p class="subtitle">${esc(subtitle)}</p>` : ''}
    ${bodyHtml}
    <div class="footer">Generated for coaching use. Scores reflect self-reported responses at the time of completion.</div>
  </div>
</body>
</html>`;
}

function defaultResultHtml({ familyMeta, assessment, branding }) {
  const summary = pickSummary(assessment);
  const rows = domainRowsFromAssessment(assessment);
  const overall =
    summary?.rewardRegulationScore ??
    summary?.overallScore ??
    summary?.average ??
    summary?.index ??
    summary?.individualIndex ??
    summary?.alignmentIndex ??
    null;
  const insights = []
    .concat(summary?.insights || [])
    .concat(summary?.biggestOpportunities || [])
    .concat(summary?.highlights || [])
    .slice(0, 6);

  const table = rows.length
    ? `<table>
        <thead><tr><th>Area</th><th>Score</th><th>Notes</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr>
              <td>${esc(r.label)}</td>
              <td class="score">${r.score == null ? '—' : esc(r.score)}</td>
              <td>${esc(r.note || '')}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>`
    : `<p>Completed assessment on file. Open the in-app results for interactive visuals.</p>`;

  const insightHtml = insights.length
    ? `<div class="insight"><strong>Highlights</strong><ul>${insights
        .map((i) => {
          const text =
            typeof i === 'string'
              ? i
              : i.label || i.title || i.insight || i.domainKey || JSON.stringify(i);
          return `<li>${esc(text)}</li>`;
        })
        .join('')}</ul></div>`
    : '';

  const overallHtml =
    overall != null
      ? `<p style="font-family:Helvetica Neue,Arial,sans-serif;font-size:15px;"><strong>Overall:</strong> ${esc(overall)}</p>`
      : '';

  return wrapDocument({
    title: `${familyMeta.title} — Results`,
    orgName: branding?.orgName,
    logoUrl: branding?.logoUrl,
    subtitle: `Completed ${assessment?.completedAt || assessment?.completed_at || new Date().toISOString().slice(0, 10)}`,
    docKind: 'Assessment Results',
    bodyHtml: `${overallHtml}${table}${insightHtml}`
  });
}

function defaultPlanHtml({ familyMeta, assessment, branding }) {
  const items = planItemsFromAssessment(assessment);
  const body =
    items.length > 0
      ? items
          .map(
            (p) => `<div class="plan-card"><h3>${esc(p.title)}</h3><p>${esc(p.body)}</p></div>`
          )
          .join('')
      : `<div class="plan-card"><h3>Next steps</h3><p>Review results with your coach and choose 1–3 focus areas for the coming weeks. Capture concrete actions, supports, and a check-in date.</p></div>`;

  return wrapDocument({
    title: `${familyMeta.title} — Action Plan`,
    orgName: branding?.orgName,
    logoUrl: branding?.logoUrl,
    subtitle: 'Recommendations and next steps',
    docKind: 'Action Plan',
    bodyHtml: body
  });
}

function plainFromHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
}

/**
 * Family-specific overrides can be registered here; defaults cover all 16.
 */
const REGISTRY = {};

for (const family of [
  'life_balance',
  'values_alignment',
  'teen_wellbeing',
  'personal_fulfillment',
  'digital_wellness',
  'mens_life',
  'marriage_alignment',
  'parenting_confidence',
  'burden_purpose',
  'family_functioning',
  'savage_blueprint',
  'reward_regulation',
  'athlete_readiness',
  'student_success',
  'college_readiness',
  'relationship_health'
]) {
  REGISTRY[family] = {
    renderResultHtml: (ctx) => defaultResultHtml(ctx),
    renderPlanHtml: (ctx) => defaultPlanHtml(ctx)
  };
}

export function renderResultHtml({ family, assessment, branding = {} }) {
  const familyMeta = getFamilyMeta(family);
  if (!familyMeta) throw Object.assign(new Error(`Unknown family: ${family}`), { status: 400 });
  const entry = REGISTRY[familyMeta.family];
  return entry.renderResultHtml({ familyMeta, assessment, branding });
}

export function renderPlanHtml({ family, assessment, branding = {} }) {
  const familyMeta = getFamilyMeta(family);
  if (!familyMeta) throw Object.assign(new Error(`Unknown family: ${family}`), { status: 400 });
  const entry = REGISTRY[familyMeta.family];
  return entry.renderPlanHtml({ familyMeta, assessment, branding });
}

export function buildScoresSnapshot(assessment) {
  return {
    summary: pickSummary(assessment),
    responses: assessment?.responses || null,
    selectedPriorities:
      assessment?.selectedPriorities || assessment?.priorityKeys || null,
    completedAt: assessment?.completedAt || assessment?.completed_at || null,
    scores: {
      overall:
        assessment?.rewardRegulationScore ??
        assessment?.summary?.rewardRegulationScore ??
        assessment?.summary?.average ??
        null
    }
  };
}

export function plainSummaryFromHtml(html) {
  return plainFromHtml(html);
}
