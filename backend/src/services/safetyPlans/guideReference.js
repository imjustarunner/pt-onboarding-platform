// Apply only to newly prepared source editions; saved/published editions remain snapshots.
export function applyScreenerReference(source,tenant=''){
 const section=source.sections.find(s=>s.slug==='measure-c-ssrs');
 if(!section)return source;
 const prefix=['itsco','nlu','isi'].includes(tenant)?`/${tenant}`:'';
 section.body_html=`<p>Available in Clinical forms · Healthcare EHR reuse review 14 October 2026</p><p>Columbia-Suicide Severity Rating Scale · Screen Version – Recent (2026).</p><p>Conduct the screener with the individual and document the clinical response. Save in the client record, or use a private unlinked record until the client is available. Follow the agency’s crisis procedure; saving answers does not send an emergency alert.</p><p><a href="${prefix}/clinical-forms?form=cssrs-screener">Open the suicide ideation screener</a></p><p>The Columbia Lighthouse Project expressly permits embedding in healthcare EHR systems. Research electronic implementations have separate terms.</p><p><a href="https://cssrs.columbia.edu/the-columbia-scale-c-ssrs/cssrs-for-communities-and-healthcare/">Columbia Lighthouse Project · Healthcare reuse and source</a></p>`;
 return source;
}
