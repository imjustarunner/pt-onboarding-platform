/** Classify the sender's current words, never instructions or quoted history. */
export function currentOutreachText(value) {
  return String(value || '').slice(0, 24000)
    .replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi, ' ')
    .split(/\n(?:On .{1,180}wrote:|From:\s|_{3,}|-{3,}\s*Original Message)/i)[0]
    .split(/\r?\n/).filter(line => !/^\s*>/.test(line)).join('\n')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/[’‘]/g, "'").replace(/<[^>]{0,500}>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim();
}

export function classifyUnsolicitedOutreach({subject = '', bodyText = ''} = {}) {
  const body = currentOutreachText(bodyText);
  const text = `${String(subject).slice(0,300)} ${body}`.toLowerCase();
  // Applicants and people requesting care are not vendor pitches. A selected
  // website category is deliberately not a classifier input.
  const care = /\b(?:i|we|my (?:child|son|daughter|family|parent))\b[^.!?]{0,90}\b(?:need|seeking|looking for|would like|want|trying|help me|help us)\b[^.!?]{0,80}\b(?:therap(?:y|ist)|counsel(?:ing|or)|appointment|treatment|mental health|tutor(?:ing)?|insurance|billing help|medical records|care for|enroll(?:ment)?)\b/i.test(body)
    || /\b(?:cancel|reschedule|confirm|book)\b[^.!?]{0,45}\b(?:my|our|child.s)\b[^.!?]{0,35}\b(?:appointment|session)\b/i.test(body);
  const applicant = /\b(?:i(?: am|'m) applying|i (?:would like|want|wish) to apply|my (?:resume|résumé|application|cv)|application for|seeking (?:an? )?(?:internship|practicum)|interested in (?:the|your|a|an) [^.!?]{0,45}(?:position|job|internship))\b/i.test(body);
  if (care || applicant) return {reject:false,reason:care?'care_request':'job_applicant'};
  const offer = /\b(?:i|we)\b[^.!?]{0,55}\b(?:offer|provide|speciali[sz]e|sell|supply|help|recruit(?:ing)?|represent|can (?:help|send|provide|offer|improve|increase|boost|fill)|would like to (?:send|offer|introduce|discuss|provide))\b/i.test(body)
    || /\b(?:our (?:(?:staffing|recruiting|marketing) )?(?:company|agency|team|firm|services|platform)|we have (?:qualified|vetted|experienced|available) candidates|with your permission|i was (?:checking|reviewing|browsing) your (?:web)?site)\b/i.test(body);
  const solicitation = /\b(?:interested|send (?:you )?(?:a |an |our |my )?(?:report|proposal|pricing|quote|details|resumes)|schedule (?:a |an |our )?(?:call|demo|meeting)|book (?:a |an )?(?:call|demo)|free (?:seo )?(?:report|audit|consultation)|prices?|pricing|packages?|quote|rates?|no obligation|cost.effective|increase your|boost your|improve your|not (?:ranking|listed)|rank(?:ing)? (?:higher|on google)|lets? connect|let me know|placement fee|recruitment fee)\b/i.test(text);
  const seo = /\b(?:seo|search engine optimi[sz]ation|backlinks?|search engine rankings?|google rankings?|rank on google)\b/i.test(text);
  const marketing = /\b(?:digital marketing|web(?:site)? (?:design|development|redesign)|lead generation|social media marketing|online reputation|google (?:ads|business)|paid advertising|guest posts?)\b/i.test(text);
  const recruiting = /\b(?:recruit(?:ing|ment)(?: agency| services)?|staffing(?: agency| services)?|headhunt(?:er|ing)|talent acquisition|qualified candidates|vetted candidates|available candidates|fill your (?:positions|vacancies)|candidate placement)\b/i.test(text);
  const business = /\b(?:medical billing services|credentialing services|outsourcing|virtual assistants?|b2b|business loans?|merchant services|payment processing|software development|mobile app development|janitorial services|business consulting|business insurance|office supplies|office cleaning|it (?:support|services)|cybersecurity services|email lists?|contact lists?)\b/i.test(text);
  if (solicitation && offer && (seo || marketing || recruiting || business)) return {reject:true,reason:seo?'seo':recruiting?'recruiting':'sales'};
  // Explicit cold-vendor language also covers products outside the named examples.
  const explicit = /\b(?:unsolicited (?:sales|marketing)|cold (?:outreach|email)|selling (?:our|my)|promote (?:our|my) (?:products?|services?)|offer you (?:our|my) (?:products?|services?)|our sales (?:team|representative)|(?:i|we) (?:are |am )?(?:sell(?:ing)?|market(?:ing)?|distribut(?:e|ing))|our (?:products?|services?|solutions?|software|platform) (?:can|will|could)|purchase our|buy our|special offer for your|selling [^.!?]{0,35} to (?:you|your))\b/i.test(body);
  if (solicitation && explicit) return {reject:true,reason:'sales'};
  return {reject:false,reason:'not_clear_commercial_outreach'};
}

export function outreachRejectionContent(agencyName) {
  const name = String(agencyName || 'our organization').replace(/[\r\n]+/g,' ').trim();
  return {subject:'Unsolicited commercial outreach is not welcome',text:
    `Unsolicited sales, marketing, SEO, and recruiting pitches are not welcome through ${name}’s website or care-support inboxes.\n\nFlooding these channels interferes with our clients’ ability to obtain care and delays our team’s responses to people seeking services. Remove ${name} from your outreach lists and do not send further solicitations.\n\nYour message has been blocked and will not be routed to our care team.\n\nThis is an automated notice from an unmonitored no-reply address. Do not reply.`};
}

export function isSharedOutreachTarget(identity, groupKey) {
  if (!identity?.agency_id || !Number(identity.is_active ?? 1)) return false;
  const key = String(identity.identity_key || '').toLowerCase();
  if (/^(?:personal_|login_|hire_)/.test(key) || identity.owner_user_id != null || String(identity.kind || '').toLowerCase() === 'personal') return false;
  return !!groupKey || ['people_operations','people_ops','po','forms','notifications','noreply','exchange_noreply','general','info','contact','website','careers','intake'].includes(key);
}
