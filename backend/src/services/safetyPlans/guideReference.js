// Apply only to newly prepared source editions; saved/published editions remain snapshots.
export function applyScreenerReference(source,tenant=''){
 const prefix=['itsco','nlu','isi'].includes(tenant)?`/${tenant}`:'';
 const section=source.sections.find(s=>s.slug==='measure-c-ssrs');
 if(section)section.body_html=`<p>Available in Clinical forms · Healthcare EHR reuse review 14 October 2026</p><p>Columbia-Suicide Severity Rating Scale · Screen Version – Recent (2026).</p><p>Conduct the screener with the individual and document the clinical response. Save in the client record, or use a private unlinked record until the client is available. Follow the agency’s crisis procedure; saving answers does not send an emergency alert.</p><p><a href="${prefix}/clinical-forms?form=cssrs-screener">Open the suicide ideation screener</a></p><p>The Columbia Lighthouse Project expressly permits embedding in healthcare EHR systems. Research electronic implementations have separate terms.</p><p><a href="https://cssrs.columbia.edu/the-columbia-scale-c-ssrs/cssrs-for-communities-and-healthcare/">Columbia Lighthouse Project · Healthcare reuse and source</a></p>`;
 const anxiety=source.sections.find(s=>s.slug==='measure-scared');
 if(anxiety)anxiety.body_html=`<p>Available in the app · SCARED 41-item child and parent reports</p><p>Open the matching University of Pittsburgh questionnaire and record the numbered responses in AuricWell. Review the total and five subscales alongside the clinical assessment.</p><p><a href="${prefix}/outcome-measures?measure=scared">Child self-report</a> · <a href="${prefix}/outcome-measures?measure=scared-parent">Parent report</a></p>`;
 const appendix=source.sections.find(s=>s.slug==='appendix-a');
 if(appendix)appendix.body_html=appendix.body_html.replace('Outcome measures in the app</p>', 'Outcome measures in the app</p><p>The outcome-measure catalog also includes the two 41-item SCARED reports and PHQ-A. Open the catalog for current availability and instrument details.</p>');
 return source;
}
