/**
 * Parse AI pre-screen / candidate research markdown into digestible bullets
 * for Overview highlights and interview workspace brief panels.
 */

function stripMarkdownInline(s) {
  return String(s || '')
    .replace(/\*\*/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

export function extractBulletsFromText(text) {
  const items = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^[-*•]\s+(.*)/) || trimmed.match(/^\d+\.\s+(.*)/);
    if (bullet?.[1]) {
      const clean = stripMarkdownInline(bullet[1]);
      if (clean) items.push(clean);
    }
  }
  return items;
}

export function splitMarkdownSections(md) {
  const lines = String(md || '').split(/\r?\n/);
  const sections = [];
  let current = { title: '', body: [] };

  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)/);
    if (heading) {
      if (current.title || current.body.length) {
        sections.push({
          title: current.title.trim(),
          body: current.body.join('\n').trim()
        });
      }
      current = { title: heading[1].trim(), body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.title || current.body.length) {
    sections.push({ title: current.title.trim(), body: current.body.join('\n').trim() });
  }
  return sections;
}

function findSection(sections, pattern) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
  return sections.find((s) => re.test(s.title)) || null;
}

function extractSubsectionBullets(body, labelPattern) {
  const re = labelPattern instanceof RegExp ? labelPattern : new RegExp(labelPattern, 'i');
  const parts = String(body || '').split(/(?=###\s+)/);
  for (const part of parts) {
    const firstLine = part.split('\n')[0].replace(/^#+\s*/, '').trim();
    if (re.test(firstLine)) {
      return extractBulletsFromText(part);
    }
  }
  // Inline "**Strengths**" block before next heading
  const inline = String(body || '').split(/\n(?=\*\*[A-Za-z])/);
  for (const chunk of inline) {
    const head = chunk.split('\n')[0];
    if (re.test(head)) {
      return extractBulletsFromText(chunk.replace(/^\*\*[^*]+\*\*:?\s*/i, ''));
    }
  }
  return [];
}

function firstParagraph(text, maxLen = 220) {
  const para = String(text || '')
    .split(/\n\s*\n/)
    .map((p) => stripMarkdownInline(p.replace(/^[-*•]\s+/gm, '').replace(/\n/g, ' ')))
    .find((p) => p.length > 20);
  if (!para) return '';
  return para.length > maxLen ? `${para.slice(0, maxLen - 1)}…` : para;
}

/**
 * @param {string} reportText - markdown from latestPreScreen.report_text
 */
export function digestPreScreenReport(reportText) {
  const md = String(reportText || '').trim();
  if (!md) {
    return {
      highlights: [],
      researchBrief: [],
      strengths: [],
      weaknesses: [],
      flags: []
    };
  }

  const sections = splitMarkdownSections(md);
  const jobMatch = findSection(sections, /job\s*match/i);
  const identity = findSection(sections, /identity/i);
  const employment = findSection(sections, /employment\s*verification/i);
  const psychToday = findSection(sections, /psychology\s*today/i);
  const discrepancies = findSection(sections, /discrepanc/i);
  const artifacts = findSection(sections, /professional\s*artifacts/i);

  let strengths = [];
  let weaknesses = [];

  if (jobMatch?.body) {
    strengths = extractSubsectionBullets(jobMatch.body, /strengths?/i);
    weaknesses = extractSubsectionBullets(
      jobMatch.body,
      /weaknesses?|discussion\s*points?|gaps?|concerns?/i
    );
  }

  // Fallback: standalone strength/weakness sections
  if (!strengths.length) {
    const s = findSection(sections, /^strengths?$/i);
    if (s) strengths = extractBulletsFromText(s.body);
  }
  if (!weaknesses.length) {
    const w = findSection(sections, /weaknesses?|discussion\s*points?|gaps?|concerns?/i);
    if (w && !/job\s*match/i.test(w.title)) {
      weaknesses = extractBulletsFromText(w.body);
    }
  }

  const researchBrief = [];

  if (identity?.body) {
    const idBullets = extractBulletsFromText(identity.body).slice(0, 2);
    if (idBullets.length) {
      researchBrief.push(...idBullets.map((b) => `Identity: ${b}`));
    } else {
      const p = firstParagraph(identity.body);
      if (p) researchBrief.push(`Identity: ${p}`);
    }
  }

  if (employment?.body) {
    const empBullets = extractBulletsFromText(employment.body).slice(0, 3);
    if (empBullets.length) {
      researchBrief.push(...empBullets.map((b) => `Employment: ${b}`));
    }
  }

  if (psychToday?.body) {
    const pt = extractBulletsFromText(psychToday.body).slice(0, 3);
    if (pt.length) {
      researchBrief.push(...pt.map((b) => `Psychology Today: ${b}`));
    } else {
      const p = firstParagraph(psychToday.body, 180);
      if (p) researchBrief.push(`Psychology Today: ${p}`);
    }
  }

  if (jobMatch?.body) {
    const checklist = extractSubsectionBullets(jobMatch.body, /requirements?\s*checklist/i);
    if (checklist.length) {
      researchBrief.push(...checklist.slice(0, 4).map((b) => `Job fit: ${b}`));
    }
  }

  if (discrepancies?.body) {
    researchBrief.push(...extractBulletsFromText(discrepancies.body).slice(0, 2).map((b) => `Flag: ${b}`));
  }

  if (artifacts?.body) {
    researchBrief.push(...extractBulletsFromText(artifacts.body).slice(0, 2).map((b) => `Artifact: ${b}`));
  }

  if (!researchBrief.length) {
    const fallback = extractBulletsFromText(md).slice(0, 6);
    researchBrief.push(...fallback);
  }

  const highlights = [];
  if (strengths.length) highlights.push(...strengths.slice(0, 5));
  if (psychToday?.body) {
    const ptHigh = extractBulletsFromText(psychToday.body).slice(0, 2);
    highlights.push(...ptHigh);
  }
  if (identity?.body) {
    const idOne = extractBulletsFromText(identity.body)[0] || firstParagraph(identity.body, 160);
    if (idOne) highlights.push(idOne);
  }
  if (employment?.body) {
    const eOne = extractBulletsFromText(employment.body)[0];
    if (eOne) highlights.push(`Verified employment: ${eOne}`);
  }

  const flags = [...weaknesses.slice(0, 4)];
  if (discrepancies?.body) {
    flags.push(...extractBulletsFromText(discrepancies.body).slice(0, 2));
  }

  return {
    highlights: [...new Set(highlights.map((s) => String(s).trim()).filter(Boolean))].slice(0, 8),
    researchBrief: researchBrief.slice(0, 10),
    strengths: strengths.slice(0, 8),
    weaknesses: weaknesses.slice(0, 8),
    flags: [...new Set(flags.map((s) => String(s).trim()).filter(Boolean))].slice(0, 6)
  };
}

/**
 * Overview highlights: prefer condensed pre-screen research; fallback to resume bullets.
 */
export function buildOverviewHighlights({ preScreenReportText, resumeSummaryBullets = [] }) {
  const digest = digestPreScreenReport(preScreenReportText);
  if (digest.highlights.length) return digest.highlights;
  return (resumeSummaryBullets || []).slice(0, 8);
}

/**
 * Overview flags: pre-screen weaknesses/discrepancies + optional extra flags.
 */
export function buildOverviewFlags({ preScreenReportText, extraFlags = [] }) {
  const digest = digestPreScreenReport(preScreenReportText);
  const out = [...digest.flags, ...(extraFlags || [])];
  return [...new Set(out.map((s) => String(s).trim()).filter(Boolean))].slice(0, 6);
}
