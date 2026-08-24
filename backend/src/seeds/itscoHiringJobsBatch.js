/**
 * ITSCO hiring job batch — Aug 2026 careers / contract clause sync.
 * Run via: node backend/src/seeds/syncItscoHiringJobsAndClauses.js
 *
 * Each entry becomes (or links to) one canonical hiring_job_descriptions row
 * plus a per-JD contract clause (JOB_DESC_JD_{id}).
 */
export const ITSCO_HIRING_JOBS_BATCH = [
  {
    syncKey: 'mhp_denver',
    title: 'Mental Health Provider - Denver',
    shortTitle: 'Mental Health Provider',
    city: 'Denver',
    state: 'CO',
    roleType: 'Provider',
    tags: ['School-Based', 'Denver', 'Full-Time', 'Part-Time'],
    serviceFocus: 'School-Based Counseling',
    defaultConfigSlug: 'itsco_standard_licensed_hourly',
    includeServiceExpectations: true,
    preferJdIds: [15, 14, 10, 8, 1],
    matchTitlePatterns: [/mental health provider.*denver/i],
    responsibilityBullets: [
      'Provide one-on-one and small-group counseling to children and adolescents using evidence-based therapeutic approaches within the {{ROLE_LABEL}}\'s scope of practice and training.',
      'Deliver services primarily within school-based settings at least 2–3 days per week, with in-office client sessions gradually increasing over time as directed by the Practice.',
      'Collaborate with school personnel, families, and community partners to support coordinated and effective client care.',
      'Conduct assessments and treatment planning; complete required clinical documentation, progress tracking, and progress monitoring in accordance with Practice standards.',
      'Offer family-based interventions and psychoeducation workshops as assigned to reinforce therapy goals outside of sessions.'
    ]
  },
  {
    syncKey: 'mhf_denver',
    title: 'Mental Health Facilitator - Denver',
    shortTitle: 'Mental Health Facilitator',
    city: 'Denver',
    state: 'CO',
    roleType: 'Facilitator',
    tags: ['School-Based', 'Denver', 'Part-Time'],
    serviceFocus: 'School-Based Skill Development',
    defaultConfigSlug: 'itsco_facilitator',
    preferJdIds: [11, 18, 6],
    matchTitlePatterns: [/mental health facilitator.*denver/i],
    responsibilityBullets: [
      'Lead interactive small-group sessions focused on social-emotional learning, communication, emotional regulation, and coping skills for children and adolescents.',
      'Provide mental health skill-development services within school settings to support student well-being, accessibility, and engagement.',
      'Implement structured interventions and track participant progress through observations, feedback, and required documentation in accordance with HIPAA and Practice policies.',
      'Collaborate with counselors, therapists, educators, and community partners; provide guidance to parents to reinforce social-emotional skills at home.',
      'Participate in team meetings and training sessions; assist with Skill Builders and special programming in the Denver area when requested.'
    ]
  },
  {
    syncKey: 'mhp_cos',
    title: 'Mental Health Provider - Colorado Springs',
    shortTitle: 'Mental Health Provider',
    city: 'Colorado Springs',
    state: 'CO',
    roleType: 'Provider',
    tags: ['School-Based', 'Colorado Springs', 'Full-Time', 'Part-Time'],
    serviceFocus: 'School-Based Counseling',
    defaultConfigSlug: 'itsco_standard_licensed_hourly',
    includeServiceExpectations: true,
    preferJdIds: [16, 13, 3],
    matchTitlePatterns: [/mental health provider.*colorado springs/i],
    responsibilityBullets: [
      'Provide one-on-one and small-group counseling to children and adolescents using evidence-based therapeutic approaches within the {{ROLE_LABEL}}\'s scope of practice and training.',
      'Deliver services primarily within school-based settings at least 2–3 days per week, with in-office client sessions gradually increasing over time as directed by the Practice.',
      'Collaborate with school personnel, families, and community partners to support coordinated and effective client care.',
      'Conduct assessments and treatment planning; complete required clinical documentation, progress tracking, and progress monitoring in accordance with Practice standards.',
      'Offer family-based interventions and community engagement to expand access to mental health resources and referrals.'
    ]
  },
  {
    syncKey: 'mhf_cos',
    title: 'Mental Health Facilitator - Colorado Springs',
    shortTitle: 'Mental Health Facilitator',
    city: 'Colorado Springs',
    state: 'CO',
    roleType: 'Facilitator',
    tags: ['School-Based', 'Colorado Springs', 'Part-Time'],
    serviceFocus: 'School-Based Skill Development',
    defaultConfigSlug: 'itsco_facilitator',
    preferJdIds: [19, 9, 7, 2, 4],
    matchTitlePatterns: [/mental health facilitator.*colorado springs/i],
    responsibilityBullets: [
      'Lead interactive small-group sessions focused on social-emotional learning, communication, emotional regulation, and coping skills for children and adolescents.',
      'Provide mental health skill-development services within school settings to support student well-being, accessibility, and engagement.',
      'Implement structured interventions and track participant progress through observations, feedback, and required documentation in accordance with HIPAA and Practice policies.',
      'Collaborate with counselors, therapists, educators, and community partners to create comprehensive support systems for students.',
      'Participate in team meetings and training sessions to stay informed on best practices and program updates.'
    ]
  },
  {
    syncKey: 'mhmf_cos',
    title: 'Mental Health & Mentorship Facilitator - Colorado Springs',
    shortTitle: 'Mental Health & Mentorship Facilitator',
    city: 'Colorado Springs',
    state: 'CO',
    roleType: 'Facilitator',
    tags: ['School-Based', 'Mentorship', 'Colorado Springs'],
    serviceFocus: 'School-Based Mentorship',
    defaultConfigSlug: 'itsco_facilitator',
    matchTitlePatterns: [/mentorship facilitator/i, /mental health & mentorship/i],
    responsibilityBullets: [
      'Lead small-group sessions focused on social-emotional learning, communication, coping strategies, and resilience-building for children and adolescents.',
      'Participate in the mentorship program as a positive role model, providing one-on-one and group mentoring that reinforces personal growth, accountability, and leadership skills.',
      'Work with school staff, counselors, and community partners to support students in school-based and community programs.',
      'Maintain accurate documentation of student participation and progress while following confidentiality guidelines.'
    ]
  },
  {
    syncKey: 'sdc_cos',
    title: 'Skill Development Coordinator - Colorado Springs',
    shortTitle: 'Skill Development Coordinator',
    city: 'Colorado Springs',
    state: 'CO',
    roleType: 'Facilitator',
    tags: ['Skill Builders', 'Colorado Springs', 'Part-Time'],
    serviceFocus: 'Skill Development Program Coordination',
    defaultConfigSlug: 'itsco_facilitator',
    matchTitlePatterns: [/skill development coordinator/i],
    responsibilityBullets: [
      'Provide mentorship and guidance to facilitators; oversee precepting for new facilitators through observation, co-facilitation, and supervised facilitation.',
      'Lead planning and coordination for summer skills programming at the direction of the Director of Operations and Administration.',
      'Serve as Skill Development Liaison with schools and community partners; assign facilitators to groups and manage scheduling.',
      'Provide at least three (3) hours per week of direct skill-based individual and group services.',
      'Support training initiatives, facilitator evaluations, hiring processes, and coverage for facilitator call-offs to ensure service continuity.',
      'Work with the Connect team to expand programming into new schools and community settings; assist with client concerns and emergencies as needed.'
    ]
  },
  {
    syncKey: 'cpa_cos',
    title: 'Clinical Practice Assistant - Colorado Springs',
    shortTitle: 'Clinical Practice Assistant',
    city: 'Colorado Springs',
    state: 'CO',
    roleType: 'Provider',
    tags: ['Clinical Leadership', 'Colorado Springs'],
    serviceFocus: 'Clinical Practice & Mentorship',
    defaultConfigSlug: 'itsco_standard_licensed_hourly',
    matchTitlePatterns: [/clinical practice assistant/i],
    responsibilityBullets: [
      'Provide individual counseling sessions to children, adolescents, and families experiencing mental health challenges such as anxiety, depression, trauma, and emotional dysregulation, utilizing evidence-based therapeutic approaches (CBT, DBT, play therapy, mindfulness).',
      'Assess client needs, develop individualized treatment plans, and maintain accurate and timely documentation of therapy sessions, treatment plans, and progress notes.',
      'Collaborate with school personnel, families, and community organizations to ensure holistic mental health support; participate in supervision, team meetings, and case consultations.',
      'Guide, mentor, and oversee the mental health facilitator team in their core responsibilities (excluding those reassigned to the Skill Development Coordinator).',
      'Conduct individual and group support sessions; during the first 90 days provide weekly or biweekly check-ins for all interns and newly hired staff, then schedule individual meetings as needed.',
      'Lead biweekly group meetings with the Skill Development team; conduct orientation sessions for new hires on operational procedures, documentation standards, and electronic health records.',
      'Serve as the primary contact for practicum and intern students; facilitate connections with designated supervisors; participate in intern/practicum evaluations at 30 and 90 days.',
      'Represent the organization at school meetings, coordinate with schools to expand facilitator caseloads, and collaborate with the Connect team on outreach and program expansion.'
    ]
  },
  {
    syncKey: 'licensed_supervisor_cos',
    title: 'Licensed Mental Health Clinician & Clinical Supervisor-Eligible Provider - Colorado Springs',
    shortTitle: 'Licensed Mental Health Clinician',
    city: 'Colorado Springs',
    state: 'CO',
    roleType: 'Provider',
    tags: ['Licensed', 'Supervision-Eligible', 'School-Based'],
    serviceFocus: 'School-Based Counseling',
    defaultConfigSlug: 'itsco_licensed_ffs',
    includeServiceExpectations: true,
    matchTitlePatterns: [/clinical supervisor-eligible/i, /licensed mental health clinician/i],
    responsibilityBullets: [
      'Provide individual and group counseling to children and adolescents using evidence-based and developmentally appropriate therapeutic approaches within licensed scope of practice.',
      'Deliver services within assigned school settings typically 2–3 days per week, with gradual expansion into office-based services as assigned.',
      'Conduct clinical assessments, treatment planning, and accurate clinical documentation within required timelines and payer requirements.',
      'Communicate with parents and guardians regarding treatment goals and progress consistent with consent and confidentiality requirements.',
      'Provide clinical supervision, consultation, or mentorship to pre-licensed clinicians, facilitators, interns, or trainees when approved and assigned.'
    ]
  },
  {
    syncKey: 'intern_mhp_cos',
    title: 'Mental Health Intern - Colorado Springs',
    shortTitle: 'Intern Mental Health Provider',
    city: 'Colorado Springs',
    state: 'CO',
    roleType: 'Intern',
    tags: ['Internship', 'Student Training Program', 'Colorado Springs'],
    serviceFocus: 'School-Based Counseling',
    defaultConfigSlug: 'itsco_intern_practicum',
    preferJdIds: [17, 12, 5],
    matchTitlePatterns: [/mental health intern/i, /intern mental health/i],
    responsibilityBullets: [
      'Provide mental health services to children, adolescents, and families within assigned school settings and approved office locations under appropriate supervision.',
      'Observe, co-facilitate, and conduct counseling sessions as authorized by the Practice Supervisor or designated Mentor.',
      'Participate in intake processes, assessments, and treatment or service planning under supervision; complete clinical documentation accurately and within required timelines.',
      'Participate in required individual and group supervision, training sessions, and Student Training Program activities.',
      'Communicate challenges or concerns to supervisors in a timely and professional manner.'
    ]
  },
  {
    syncKey: 'support_denver',
    title: 'Support Staff Assistant - Denver',
    shortTitle: 'Support Staff Assistant',
    city: 'Denver',
    state: 'CO',
    roleType: 'Support',
    tags: ['Outreach', 'Denver', 'Part-Time'],
    serviceFocus: 'Program Outreach & Administration',
    defaultConfigSlug: 'itsco_facilitator',
    matchTitlePatterns: [/support staff assistant/i],
    responsibilityBullets: [
      'Conduct outreach to potential clients and follow up on referrals for the Denver and Colorado Springs regions.',
      'Make professional phone calls to prospective participants to secure enrollment for skills programs.',
      'Maintain organized records and detailed notes of all outreach attempts and progress updates for every contact.',
      'Assist with the Skill Builders Program on Saturdays or other special programming in the Denver area when requested, in a non-clinical support role only.',
      'Submit activity logs and notes according to Practice policy for tracking and billing purposes.'
    ]
  }
];

export default ITSCO_HIRING_JOBS_BATCH;
