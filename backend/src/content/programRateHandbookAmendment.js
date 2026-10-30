import { AUTUMN_RELEASES } from './agencyHandbookAutumn2026.js';
import { isProgramRateTenant, programRateRowsHtml, programRatesHandbookHtml, PROGRAM_RATE_RATIONALE } from './programServiceRates.js';

export function applyProgramRateHandbookAmendment(source, updates, tenant) {
  if (!isProgramRateTenant(tenant)) return updates;
  const slug = tenant === 'nlu' ? 'nlu-tutoring-and-h2014-compensation' : 'program-service-rate-schedules';
  const title = 'Homework Help, Tutoring and Therapy + Tutoring rates';
  const bodyHtml = programRatesHandbookHtml(tenant);
  const existing = source.sections.find(section => section.slug === slug);
  if (existing) Object.assign(existing,{title,bodyHtml,status:'ready'});
  else source.sections.push({slug,title,bodyHtml,status:'ready',parentSlug:null,sourcePage:null});
  const link = `<a href="#handbook-${slug}">${title}</a>`;
  const changedSlugs = new Set([slug]);
  for (const section of source.sections) {
    const category = Number(section.slug.match(/^compensation-rate-category-([123])$/)?.[1]);
    if (category) {
      section.bodyHtml = section.bodyHtml.replace('Submit actual indirect time separately; no indirect time is added automatically.', 'For general services, submit actual indirect time separately. Tutoring and eligible H2014 follow their separate program allowance described below.');
      section.bodyHtml = section.bodyHtml.replace(/(<h5>Level ([1-5])<\/h5>[\s\S]*?)(<table\b[^>]*>[\s\S]*?<\/table>)/g,(_,before,level,table) => {
        // Earlier snapshots had four headings but only three cells. Preserve each
        // original rate while displaying its probation and workload columns.
        const rows = [...table.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)][0]?.[1] || '';
        const normalized = rows.replace(/<tr>([\s\S]*?)<\/tr>/g,(row,cells) => {
          const values = [...cells.matchAll(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/g)].map(m=>m[0]);
          return values.length === 3 ? `<tr>${values.join('')}${values[2]}</tr>` : row;
        });
        return `${before}<table><thead><tr><th>Pay type / basis</th><th>Regular base rate</th><th>Probationary rate</th><th>Minimum-workload rate</th></tr></thead><tbody>${normalized}${programRateRowsHtml(category,Number(level))}</tbody></table><p>For the three program rows, the probationary rate applies only during the applicable first 60 calendar days; Category 1 is not reduced. Program rates do not receive minimum-workload reductions or clinical tier additions. See ${link}.</p>`;
      }).replace(/<p>Next Level Up’s tutoring and Category 1 H2014 exceptions[\s\S]*?<\/p>/g,'');
      if (tenant === 'isi') section.bodyHtml += `<p>Your selected category and level determine these program rates, which are included in new individual compensation schedules. Service qualifications and payer requirements continue to apply. See ${link}.</p>`;
      changedSlugs.add(section.slug);
    }
    if (['role-based-supplemental-compensation-rate-schedule','compensation-included-indirect-service-component'].includes(section.slug)) {
      section.bodyHtml = section.bodyHtml.replace(/<p>Next Level Up’s tutoring and Category 1 H2014 exceptions[\s\S]*?<\/p>/g,'');
      section.bodyHtml += `<p>Homework Help, Tutoring and eligible Therapy + Tutoring H2014 use their separate program pay rows. Their service-specific rates and 60-day probation terms are in ${link}. They do not replace the Clinical Session Rate or general Direct Care Rate.</p>`;
      changedSlugs.add(section.slug);
    }
    if (tenant === 'nlu' && ['colorado-billing-compensation-appendix','service-code-compensation-and-authorizations'].includes(section.slug)) {
      section.bodyHtml = section.bodyHtml.replace(/(<tr><t[hd]>H2014<\/t[hd]><td>)Direct Care Rate classification, if approved/, '$1Therapy + Tutoring · H2014 program rate');
      section.bodyHtml += `<p><strong>Separate program pay types:</strong> eligible H2014 uses the Therapy + Tutoring program rate; Homework Help and Tutoring use separate academic-service rates. These program services do not use the general H-code or clinical-credit base. See ${link}.</p>`;
      changedSlugs.add(section.slug);
    }
  }
  const release = AUTUMN_RELEASES[tenant];
  const result = updates.map(update => {
    const destinations = update.policy_section_slugs?.length ? update.policy_section_slugs : [update.handbook_section_slug];
    if (!destinations.some(s=>changedSlugs.has(s))) return update;
    return {...update, subject:update.handbook_section_slug === slug ? title : update.subject,
      changed_content:destinations.map(s=>source.sections.find(section=>section.slug===s)).filter(Boolean).map(section=>`<h3>${section.title}</h3>${section.bodyHtml}`).join(''),
      rationale:`${update.rationale || ''} ${PROGRAM_RATE_RATIONALE}`.trim()};
  });
  if (!result.some(update => update.handbook_section_slug === slug)) result.push({id:`${tenant}-source-program-rates-2026-10-29`,status:'draft',period_label:release.period,digest_title:`${release.period} Workplace Handbook Updates`,subject:title,rationale:PROGRAM_RATE_RATIONALE,changed_content:bodyHtml,handbook_section_slug:slug,policy_section_slugs:[slug],related_section_slugs:[],link_origin:'source_review'});
  return result;
}
