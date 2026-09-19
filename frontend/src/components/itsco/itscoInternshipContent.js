// Public recruitment copy supplied by ITSCO. Placement-specific terms stay in written agreements.
export const history = [
 'Founded on the shared vision of a supervisor and her supervisee, ITSCO was born out of a recognized need for accessible mental health care for youth. Observing the substantial barriers families faced in obtaining outside-school mental health services, our founders were inspired to create a solution that brought care directly to where the children are: in their schools.',
 'Our inception was guided by two fundamental principles: the well-being of the clinician and the needs of the client. This dual focus ensured that we not only provided our services in the most accessible manner but also fostered an environment where therapists could thrive professionally.',
 'Established with the conviction that mental health care is a critical component of a child’s overall well-being and educational success, ITSCO has been steadfast in its commitment to breaking down barriers to service. By prioritizing the clinician-client relationship, we have created a culture that values personal attention, therapeutic integrity, and the tailor-made treatment of every individual we serve.',
 'As we continue to grow and evolve, our history remains a testament to our enduring dedication to the mental health of our community’s youth, and our unwavering commitment to the professionals who make our mission possible.'
];
export const vision='To create a future where every individual—child, teen, and adult—has access to the mental wellness support they need to flourish academically, personally, and in their community, with a foundational commitment to nurturing the mental health of our children through dedicated, confidential therapy in schools.';
export const mission='ITSCO is dedicated to enhancing mental well-being across all ages by providing high-quality, accessible counseling services directly within schools for children and adolescents, as well as comprehensive mental health care for adults and families in our communities. Our mission is to empower every individual on their journey to personal growth and resilience.';
export const goals=[
 'Promote mental health as fundamental to student success.',
 'Ensure every child has the opportunity to succeed academically and personally through our support.',
 'Advance the holistic growth of our youth by addressing their mental health needs in a dedicated and confidential setting.',
 'Make mental health therapy accessible to all children, overcoming common barriers such as transportation and counselor availability.'
];
export const values=[
 ['Good judgment','Making wise decisions based on empathy and expertise.'],
 ['Communication','Engaging in open, honest, and constructive dialogue.'],
 ['Impact','Striving to make a significant positive difference in the lives of our clients.'],
 ['Curiosity','Fostering a culture of learning and exploration to better understand and serve our clients.'],
 ['Innovation','Continuously seeking creative and effective ways to enhance our services.'],
 ['Honesty','Upholding integrity in every action and interaction.'],
 ['Selflessness','Putting the needs of the children and communities we serve above all else.']
];
export const highlights=[
 {icon:'people',title:'Weekly supervision',body:'Meet with an assigned supervisor at least once a week for guidance, feedback, case review, and alignment with your educational goals.'},
 {icon:'leaf',title:'Dedicated mentorship',body:'A Clinical Practice Assistant supports your orientation and meets with you at least biweekly to help you navigate the program and grow.'},
 {icon:'school',title:'Meaningful practice settings',body:'Learn in school-based and approved office settings, with other assigned settings where appropriate to your training agreement.'}
];
export const duties=[
 'Observe, assist, co-facilitate, and conduct counseling sessions when authorized and supervised.',
 'Participate in intake assessments and gather clinical information with guidance.',
 'Support treatment or service planning alongside supervising clinicians.',
 'Practice evidence-informed, developmentally appropriate interventions within your training scope.',
 'Join case reviews, individual or group supervision, team meetings, and professional development.',
 'Build documentation skills and contribute to approved outreach and program support.'
];
export const expectations=[
 ['Academic fit & placement','Students must be enrolled in an approved practicum or internship program through an academic institution. Start dates, required hours, approved activities, and any transition between phases are agreed upon with ITSCO and the academic program.'],
 ['Supervision & scope','All clinical activities require authorization and supervision. Students may not practice independently, independently diagnose or change treatment plans, represent themselves as licensed providers, or assume billing authority. Supervisors retain clinical responsibility and review and co-sign student documentation.'],
 ['Documentation & feedback','Complete and submit session notes within 24 hours whenever possible. Completed notes must be submitted by Sunday at 11:59 p.m. of the week in which the session occurred; notes outside that deadline are late and deficient. Participate in feedback and correction processes with your supervisor.'],
 ['Confidentiality & professional conduct','Follow ITSCO policies, academic requirements, confidentiality and HIPAA safeguards, appropriate boundaries, and escalation and safety protocols. Discuss challenges promptly with your Practice Supervisor and Faculty Supervisor.'],
 ['Educational purpose & agreements','The program is designed for supervised learning and does not displace regular employees. Both practicum and internship placements pay $24–$30 per hour of direct service. Student classification, benefits eligibility, billing eligibility, insurance coverage, and placement terms are governed by the applicable written training or affiliation agreement. Participation does not guarantee employment or advancement.'],
 ['ITSCO’s commitment','ITSCO provides the resources and supervision needed for approved educational and operational activities, with a clear distinction between student learning and professional services. Training duties may evolve with educational objectives, supervision level, and program needs.']
];
export function selectInternshipJobs(jobs){
 return (Array.isArray(jobs)?jobs:[]).filter(job=>job.applicationPublicKey && /\bintern(?:ship)?\b|\bpracticum\b/i.test(`${job.title||''} ${job.roleType||''}`));
}
export function trainingPeople(data){
 const people=new Map();
 for(const person of [...(data?.providers||[]),...(data?.team||[]),...(data?.supervisors||[])])people.set(person.id,{...people.get(person.id),...person});
 return [...people.values()];
}

// Public clinical-supervisor publication choices confirmed by ITSCO. These do not change app permissions.
// Destiny remains a student-training mentor; Melissa remains on the support team.
const excludedClinicalSupervisorIds = new Set([477, 538]);
export function internshipSupervisors(data) {
 const people=trainingPeople(data);
 const candidates=Array.isArray(data?.supervisors)
  ? data.supervisors.map(person=>({...people.find(p=>p.id===person.id),...person}))
  : people.filter(person=>/\bsupervisor\b/i.test(person.title));
 return candidates.filter(person=>!excludedClinicalSupervisorIds.has(Number(person.id)));
}

// Editorial biographies based on the founders’ published roles and ITSCO’s supplied history.
// A biography saved through Edit public profile takes precedence.
const founderBiographies = {
 'Rachel Finch': 'Rachel Finch is a co-founder of ITSCO and its Director of Strategy and Clinical Operations. She is also part of ITSCO’s supervision team. Her role connects the practice’s clinical work with its larger mission: making thoughtful, accessible mental health care available to children, adolescents, adults, and families.\n\nTogether with Michael Mendez, Rachel helped build ITSCO around two guiding priorities—the needs of clients and the well-being of clinicians. Their shared vision brought care directly into schools, helping families overcome barriers such as transportation and access to outside-school services. That same commitment shapes ITSCO’s approach to student training: supervised learning, professional growth, and an environment where clinicians can thrive.',
 'Michael Mendez': 'Michael Mendez is a co-founder of ITSCO and its Director of Operations and Administration. He also serves on ITSCO’s supervision team. His role brings together the operational side of the practice and its commitment to supporting the people who deliver care.\n\nMichael and Rachel Finch founded ITSCO in response to the barriers families faced when seeking mental health services for youth. By bringing counseling into schools, they created a more accessible path to support while keeping clinician well-being at the center of the practice. For students exploring ITSCO, that founding vision provides the context for the training program: meaningful work in school and approved office settings, close supervision, and room to develop as a professional.'
};

/** Fill empty recruitment biographies using only fields already published in the directory. */
export function publicProfileIntroduction(person) {
 const biography=String(person?.bio||'').trim();
 if(biography)return biography;
 const founderBio=founderBiographies[String(person?.displayName||'').trim()];
 if(founderBio)return founderBio;
 const name=String(person?.displayName||'This team member').trim();
 const credential=String(person?.credential||'').trim();
 const sentences=[`${name}${credential?` (${credential})`:''} ${person?.title?`serves as ${person.title} at ITSCO.`:'is part of the ITSCO team.'}`];
 const labels=values=>[...new Set((Array.isArray(values)?values:[]).filter(v=>typeof v==='string').map(v=>v.trim()).filter(v=>v&&v.length<=120))].slice(0,3);
 const join=items=>items.length<3?items.join(' and '):`${items.slice(0,-1).join(', ')}, and ${items.at(-1)}`;
 const specialties=labels(person?.specialties),approaches=labels(person?.modalities),ages=labels(person?.ageGroups);
 if(specialties.length)sentences.push(`Areas of focus include ${join(specialties)}.`);
 if(approaches.length)sentences.push(`Clinical approaches include ${join(approaches)}.`);
 if(ages.length)sentences.push(`Age groups served include ${join(ages)}.`);
 return sentences.join(' ');
}
