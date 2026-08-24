/**
 * ITSCO employee evaluation rubrics (1–4 scale).
 * Shape matches employee_evaluation_templates.rubric_json.
 */

export const RATING_SCALE = [
  { value: 1, label: 'Needs Improvement' },
  { value: 2, label: 'Developing' },
  { value: 3, label: 'Proficient' },
  { value: 4, label: 'Exemplary' }
];

export const DEFAULT_REFLECTION_PROMPTS = [
  {
    key: 'strengths',
    label: 'What are your key strengths based on this evaluation?'
  },
  {
    key: 'improvements',
    label: 'What areas would you like to improve, and how do you plan to address them?'
  },
  {
    key: 'support',
    label: 'What additional support or resources would help you succeed?'
  }
];

function criterion(key, label, anchors) {
  return {
    key,
    label,
    anchors: {
      1: anchors[0],
      2: anchors[1],
      3: anchors[2],
      4: anchors[3]
    }
  };
}

function section(key, title, criteria) {
  return { key, title, criteria, hasActionItems: true };
}

function rubric({ title, sections }) {
  return {
    title,
    ratingScale: RATING_SCALE,
    sections,
    reflectionPrompts: DEFAULT_REFLECTION_PROMPTS
  };
}

export const ITSCO_EVALUATION_RUBRICS = {
  mental_health_counselor: {
    slug: 'mental_health_counselor',
    name: 'Mental Health Counselor Employee Self-Assessment & Evaluation Rubric',
    isSupervisorRubric: false,
    matchJobPatterns: [
      /mental health provider/i,
      /mental health counselor/i,
      /licensed mental health clinician/i
    ],
    rubric: rubric({
      title: 'Mental Health Counselor Employee Self-Assessment & Evaluation Rubric',
      sections: [
        section('individual_group_counseling', '1. Individual & Group Counseling', [
          criterion(
            'one_on_one_group',
            'Provides one-on-one and small-group counseling to children and adolescents experiencing mental health concerns',
            [
              'Rarely engages clients effectively in individual or group settings',
              'Inconsistent counseling support with minimal client progress',
              'Consistently provides effective counseling, leading to noticeable improvements',
              'Demonstrates exceptional counseling skills, resulting in significant client growth'
            ]
          ),
          criterion(
            'evidence_based',
            'Utilizes evidence-based therapeutic techniques (CBT, DBT, play therapy, mindfulness, etc.)',
            [
              'Rarely incorporates evidence-based strategies',
              'Occasionally applies techniques but with inconsistent impact',
              'Regularly uses evidence-based interventions with positive client outcomes',
              'Expertly integrates a variety of evidence-based techniques, optimizing client progress'
            ]
          ),
          criterion(
            'coping_regulation',
            'Supports clients in identifying triggers, coping strategies, and emotional regulation skills',
            [
              'Rarely assists clients in developing coping mechanisms',
              'Provides some support, but with limited client progress',
              'Regularly helps clients develop and apply effective coping skills',
              'Demonstrates expertise in emotional regulation techniques, fostering long-term resilience'
            ]
          )
        ]),
        section('school_community', '2. School & Community-Based Services', [
          criterion(
            'school_services',
            'Provides mental health services within school settings, engaging students effectively',
            [
              'Rarely engages students effectively in school settings',
              'Inconsistent presence in schools, with limited impact',
              'Regularly provides structured and effective support in schools',
              'Builds strong relationships with schools, maximizing student accessibility to services'
            ]
          ),
          criterion(
            'collaborate_staff',
            'Collaborates with school staff, teachers, and community partners to ensure holistic care',
            [
              'Rarely communicates or collaborates with school personnel',
              'Occasional collaboration, but with inconsistent follow-through',
              'Works effectively with school and community teams to support student success',
              'Proactively builds strong professional relationships that enhance overall care'
            ]
          ),
          criterion(
            'psychoeducation',
            'Offers psychoeducation workshops on emotional intelligence, stress management, and peer relationships',
            [
              'Rarely facilitates workshops or discussions',
              'Conducts some workshops but with limited engagement',
              'Regularly delivers interactive and engaging workshops that support student growth',
              'Designs and leads high-impact workshops that promote significant learning and behavioral change'
            ]
          )
        ]),
        section('progress_monitoring', '3. Progress Monitoring & Individualized Care Plans', [
          criterion(
            'assessments_planning',
            'Conducts assessments and treatment planning to develop individualized therapeutic goals',
            [
              'Rarely conducts assessments or sets measurable goals',
              'Sets basic goals, but with limited follow-through',
              'Consistently develops individualized, measurable, and effective therapeutic plans',
              'Expertly crafts comprehensive care plans that drive significant client progress'
            ]
          ),
          criterion(
            'tracks_progress',
            'Tracks client progress through clinical documentation, behavior observations, and self-reports',
            [
              'Rarely maintains records or tracks progress effectively',
              'Documents progress inconsistently, with gaps in reporting',
              'Regularly updates records with accurate and meaningful progress notes',
              'Maintains detailed, high-quality documentation that informs and enhances treatment plans'
            ]
          ),
          criterion(
            'evaluates_approaches',
            'Evaluates the effectiveness of therapeutic approaches using pre- and post-session assessments',
            [
              'Rarely evaluates or adjusts treatment strategies',
              'Conducts occasional evaluations with minimal adjustments',
              'Regularly assesses and modifies treatment approaches based on client response',
              'Demonstrates expertise in assessment, refining interventions for optimal client outcomes'
            ]
          )
        ]),
        section('family_community', '4. Family & Community Collaboration', [
          criterion(
            'parent_communication',
            'Maintains open communication with parents/guardians to reinforce therapy goals at home',
            [
              'Rarely communicates with families',
              'Provides occasional updates but lacks consistency',
              'Regularly engages parents with meaningful feedback and guidance',
              'Builds strong relationships with families, ensuring therapy goals are supported outside sessions'
            ]
          ),
          criterion(
            'family_interventions',
            'Offers family-based interventions to enhance emotional support and behavioral strategies at home',
            [
              'Rarely involves families in treatment strategies',
              'Provides some family interventions, but with limited success',
              'Regularly incorporates family support strategies that improve client outcomes',
              'Designs and implements highly effective family-based interventions that result in sustained progress'
            ]
          ),
          criterion(
            'community_orgs',
            'Engages with community organizations to expand access to mental health resources and referrals',
            [
              'Rarely connects with external community resources',
              'Occasionally refers clients to community services, but without ongoing follow-up',
              'Regularly provides meaningful referrals and coordinates with community partners',
              'Builds strong partnerships with community resources, enhancing holistic care for clients'
            ]
          )
        ])
      ]
    })
  },

  mental_health_facilitator: {
    slug: 'mental_health_facilitator',
    name: 'Mental Health Facilitator Employee Self-Assessment & Evaluation Rubric',
    isSupervisorRubric: false,
    matchJobPatterns: [/^mental health facilitator/i],
    excludeJobPatterns: [/mentorship/i],
    rubric: rubric({
      title: 'Mental Health Facilitator Employee Self-Assessment & Evaluation Rubric',
      sections: [
        section('group_facilitation', '1. Group Facilitation & Skill Development', [
          criterion(
            'leads_groups',
            'Leads small-group sessions on social-emotional learning, communication, emotional regulation, and coping skills',
            [
              'Rarely engages students effectively in group sessions',
              'Inconsistent facilitation with limited impact on student engagement',
              'Consistently delivers engaging group sessions, fostering participation and learning',
              'Exceptional group leadership, creating a highly interactive and meaningful experience'
            ]
          ),
          criterion(
            'evidence_based',
            'Utilizes evidence-based techniques to enhance problem-solving, peer relationships, and self-awareness',
            [
              'Rarely incorporates evidence-based strategies',
              'Uses some evidence-based techniques, but with limited effectiveness',
              'Regularly applies evidence-based techniques with noticeable student improvement',
              'Expert use of interventions, leading to significant skill development'
            ]
          ),
          criterion(
            'adapts_curriculum',
            "Adapts curriculum and instructional methods to meet students' developmental needs",
            [
              'Struggles to adjust curriculum to student needs',
              'Occasionally modifies curriculum with inconsistent effectiveness',
              "Regularly adapts curriculum to suit students' needs and engagement levels",
              'Expertly tailors instruction, maximizing student growth'
            ]
          )
        ]),
        section('school_community', '2. School & Community-Based Services', [
          criterion(
            'school_services',
            'Provides mental health services within school settings to support student well-being',
            [
              'Rarely engages students effectively in school settings',
              'Inconsistent presence in schools, with limited engagement',
              'Regularly provides effective support in school settings',
              'Builds strong relationships in schools, maximizing student access to services'
            ]
          ),
          criterion(
            'collaborate_staff',
            'Collaborates with school staff, teachers, and community partners',
            [
              'Rarely engages with school staff or partners',
              'Limited collaboration with inconsistent impact',
              'Regular collaboration with school and community teams, enhancing student care',
              'Proactively builds strong partnerships, improving holistic student support'
            ]
          )
        ]),
        section('behavioral_progress', '3. Behavioral Support & Progress Monitoring', [
          criterion(
            'structured_interventions',
            'Implements structured interventions to reduce barriers to social functioning and improve resilience',
            [
              'Rarely applies structured interventions effectively',
              'Occasionally uses interventions but with inconsistent impact',
              'Regularly applies structured interventions, leading to student improvement',
              'Expert use of interventions, resulting in significant student progress'
            ]
          ),
          criterion(
            'tracks_progress',
            'Tracks student progress through observations, feedback, and structured assessments',
            [
              'Rarely tracks student progress or makes adjustments',
              'Inconsistently tracks progress, with limited impact',
              'Consistently documents progress, making adjustments as needed',
              'Maintains detailed records, using data to enhance interventions'
            ]
          ),
          criterion(
            'hipaa_docs',
            'Maintains accurate documentation following HIPAA and confidentiality guidelines',
            [
              'Rarely documents or follows confidentiality policies',
              'Inconsistent documentation with occasional errors',
              'Regularly maintains thorough and accurate records',
              'Ensures impeccable documentation, aligning with all compliance standards'
            ]
          )
        ]),
        section('collaboration_family', '4. Collaboration & Family Engagement', [
          criterion(
            'professional_network',
            'Works with counselors, therapists, educators, and community partners to create comprehensive student support systems',
            [
              'Rarely engages with other professionals to support students',
              'Limited collaboration with inconsistent effectiveness',
              'Regularly collaborates with key stakeholders, enhancing student support',
              'Builds strong networks that significantly enhance student outcomes'
            ]
          ),
          criterion(
            'parent_guidance',
            'Provides feedback and guidance to parents to reinforce social-emotional skills at home',
            [
              'Rarely communicates with families',
              'Occasional family outreach with limited impact',
              'Regularly engages families, providing useful strategies',
              'Builds strong relationships with families, reinforcing therapy goals effectively'
            ]
          ),
          criterion(
            'team_training',
            'Participates in team meetings and training sessions for professional development',
            [
              'Rarely engages in professional development activities',
              'Attends some trainings but with inconsistent participation',
              'Regularly participates in trainings and team meetings',
              'Actively engages in development, applying new knowledge effectively'
            ]
          )
        ])
      ]
    })
  },

  mental_health_mentorship_facilitator: {
    slug: 'mental_health_mentorship_facilitator',
    name: 'Mental Health & Mentorship Facilitator Employee Self-Assessment & Evaluation Rubric',
    isSupervisorRubric: false,
    matchJobPatterns: [/mentorship facilitator/i, /mental health & mentorship/i],
    rubric: rubric({
      title: 'Mental Health & Mentorship Facilitator Employee Self-Assessment & Evaluation Rubric',
      sections: [
        section('group_behavioral', '1. Group Facilitation & Behavioral Support', [
          criterion(
            'leads_groups',
            'Leads small-group sessions on social-emotional learning, communication, coping strategies, and resilience-building',
            [
              'Rarely engages students effectively in group sessions',
              'Inconsistent facilitation with minimal student participation',
              'Consistently delivers structured and engaging sessions with student growth',
              'Creates dynamic, impactful sessions that foster deep learning and behavioral change'
            ]
          ),
          criterion(
            'structured_interventions',
            'Utilizes structured interventions to support problem-solving, peer relationships, and emotional regulation',
            [
              'Rarely incorporates interventions effectively',
              'Occasionally applies interventions with limited impact',
              'Regularly applies structured interventions leading to improved peer interactions and emotional skills',
              'Expertly tailors interventions, resulting in significant student development'
            ]
          ),
          criterion(
            'adapts_activities',
            "Adapts activities to meet students' developmental needs and engagement levels",
            [
              'Struggles to adjust activities for diverse student needs',
              'Occasionally modifies activities with inconsistent success',
              'Regularly adapts activities to fit student needs and maintain engagement',
              'Expertly customizes activities, maximizing student participation and learning'
            ]
          )
        ]),
        section('mentorship', '2. Mentorship & Peer Support', [
          criterion(
            'role_model',
            'Participates in the mentorship program as a positive role model',
            [
              'Rarely engages in mentorship responsibilities',
              'Provides occasional guidance with limited impact',
              'Regularly mentors students, fostering positive relationships',
              'Builds deep connections, significantly impacting mentee growth and development'
            ]
          ),
          criterion(
            'one_on_one_group',
            'Provides one-on-one and group mentoring, reinforcing personal growth, accountability, and leadership skills',
            [
              'Rarely engages in mentoring interactions',
              'Inconsistently provides mentorship with limited effectiveness',
              'Regularly mentors students, guiding them through challenges and growth',
              'Demonstrates expert mentorship, inspiring students to take ownership of their personal growth'
            ]
          ),
          criterion(
            'meaningful_connections',
            'Fosters meaningful connections with students through shared experiences and real-world guidance',
            [
              'Rarely connects with students in a meaningful way',
              'Inconsistent relationship-building, with limited student trust',
              'Regularly engages students with relatable and meaningful guidance',
              'Develops strong, lasting mentorship bonds that inspire and empower students'
            ]
          )
        ]),
        section('school_community', '3. School & Community Collaboration', [
          criterion(
            'collaborate',
            'Works with school staff, counselors, and community partners to support students',
            [
              'Rarely communicates or collaborates with school or community staff',
              'Engages in some collaboration, but with inconsistent follow-through',
              'Regularly collaborates with school and community teams to provide student support',
              'Builds strong professional relationships, enhancing the overall network of student support'
            ]
          ),
          criterion(
            'documentation',
            'Maintains accurate documentation of student participation and progress while following confidentiality guidelines',
            [
              'Rarely documents student progress or follows confidentiality guidelines',
              'Occasionally maintains documentation but with inconsistencies',
              'Regularly updates student records accurately and follows all confidentiality policies',
              'Maintains high-quality documentation that is detailed, timely, and compliant with policies'
            ]
          )
        ])
      ]
    })
  },

  skill_development_coordinator: {
    slug: 'skill_development_coordinator',
    name: 'Skill Development Coordinator Employee Self-Assessment & Evaluation Rubric',
    isSupervisorRubric: false,
    matchJobPatterns: [/skill development coordinator/i],
    rubric: rubric({
      title: 'Skill Development Coordinator Employee Self-Assessment & Evaluation Rubric',
      sections: [
        section('facilitator_oversight', '1. Facilitator Oversight & Support', [
          criterion(
            'mentorship',
            'Provides mentorship and guidance to facilitators, ensuring effective session delivery',
            [
              'Rarely engages facilitators or provides support',
              'Occasionally checks in with facilitators but lacks consistency',
              'Regularly mentors facilitators, providing effective guidance',
              'Proactively supports facilitators, ensuring high-quality service delivery'
            ]
          ),
          criterion(
            'check_ins',
            'Implements check-ins and support meetings as necessary for facilitator development',
            [
              'Rarely holds check-ins or provides feedback',
              'Holds occasional check-ins with limited impact',
              'Consistently meets with facilitators, providing structured feedback',
              'Implements a strong check-in process that fosters professional growth'
            ]
          ),
          criterion(
            'precepting',
            'Oversees precepting for new facilitators, guiding them through observation, co-facilitation, and supervised facilitation',
            [
              'Rarely provides structured guidance for new facilitators',
              'Offers some support but lacks a clear structure',
              'Consistently manages precepting with clear development milestones',
              'Implements an outstanding precepting process, preparing facilitators effectively'
            ]
          ),
          criterion(
            'call_off_coverage',
            'Covers call-offs from facilitators to prevent service disruptions',
            [
              'Rarely provides coverage when needed',
              'Occasionally steps in but inconsistently',
              'Regularly provides coverage to maintain program continuity',
              'Always ensures seamless coverage, minimizing service disruptions'
            ]
          )
        ]),
        section('summer_programming', '2. Summer Programming Oversight', [
          criterion(
            'leads_planning',
            'Leads planning and coordination for the summer skills program',
            [
              'Rarely participates in summer program planning',
              'Assists in planning but lacks thorough execution',
              'Effectively coordinates scheduling and staffing for summer programs',
              'Excels in summer program leadership, ensuring smooth execution and engagement'
            ]
          ),
          criterion(
            'scheduling_staffing',
            'Ensures effective scheduling, staff assignments, and program execution',
            [
              'Rarely assigns staff or schedules effectively',
              'Occasionally ensures proper staffing but lacks consistency',
              'Regularly manages assignments and scheduling effectively',
              'Demonstrates strong leadership in managing all aspects of summer programming'
            ]
          ),
          criterion(
            'quality_feedback',
            'Monitors summer program quality and provides feedback as needed',
            [
              'Rarely assesses program quality or provides feedback',
              'Provides occasional feedback but lacks a systematic approach',
              'Consistently evaluates program effectiveness and offers improvements',
              'Implements a strong feedback system, significantly enhancing program quality'
            ]
          )
        ]),
        section('scheduling_communication', '3. Scheduling & School Communication', [
          criterion(
            'liaison',
            'Acts as the Skill Development Liaison, coordinating with schools and community partners',
            [
              'Rarely communicates with schools or partners',
              'Occasionally collaborates but with limited engagement',
              'Regularly works with schools and community partners to ensure program success',
              'Builds and maintains strong relationships, improving program integration'
            ]
          ),
          criterion(
            'assigns_facilitators',
            'Assigns facilitators to groups and manages scheduling effectively',
            [
              'Rarely manages scheduling or assigns facilitators efficiently',
              'Occasionally schedules facilitators but lacks consistency',
              'Consistently assigns facilitators and maintains a balanced schedule',
              'Excels in scheduling and facilitator assignments, optimizing program efficiency'
            ]
          ),
          criterion(
            'school_comms',
            'Maintains regular communication with school staff to ensure smooth service delivery',
            [
              'Rarely communicates with school staff',
              'Communicates inconsistently with schools',
              'Regularly updates school staff and maintains strong relationships',
              'Establishes excellent communication systems that enhance collaboration'
            ]
          )
        ]),
        section('direct_client_work', '4. Direct Client Work & Skill-Based Groups', [
          criterion(
            'three_hours',
            'Provides at least three (3) hours per week of direct skill-based services',
            [
              'Rarely provides direct client services',
              'Occasionally delivers sessions but inconsistently',
              'Regularly provides structured, skill-based interventions',
              'Excels in delivering high-quality, engaging skill-based sessions'
            ]
          ),
          criterion(
            'structured_groups',
            'Ensures skill-building groups are structured, engaging, and aligned with therapeutic goals',
            [
              'Rarely follows program structure or therapeutic goals',
              'Occasionally aligns sessions with objectives but lacks consistency',
              'Regularly delivers structured and engaging sessions that meet program goals',
              'Designs and executes outstanding skill-building sessions that maximize student growth'
            ]
          ),
          criterion(
            'monitors_adjusts',
            'Monitors and adjusts groups to meet professional and programmatic standards',
            [
              'Rarely evaluates or adjusts group activities',
              'Occasionally assesses group progress but with limited impact',
              'Regularly monitors and adjusts sessions to enhance effectiveness',
              'Demonstrates expertise in adapting group interventions to meet student needs'
            ]
          )
        ]),
        section('training_precepting', '5. Training Support & Precepting Management', [
          criterion(
            'training_support',
            'Supports training initiatives and ensures alignment with program goals',
            [
              'Rarely participates in training efforts',
              'Occasionally supports training but lacks a structured approach',
              'Regularly assists in training, ensuring alignment with program objectives',
              'Plays a key role in improving and refining training programs'
            ]
          ),
          criterion(
            'precepting_mgmt',
            'Manages the precepting process for facilitators, ensuring structured onboarding, observation, and skill development',
            [
              'Rarely provides structured onboarding for new facilitators',
              'Offers limited onboarding and skill development',
              'Regularly oversees precepting with clear benchmarks',
              'Excels in precepting management, ensuring smooth facilitator transitions'
            ]
          )
        ]),
        section('program_growth', '6. Program Growth & Expansion', [
          criterion(
            'connect_expansion',
            'Works with the Connect team to expand programming into new schools and community settings',
            [
              'Rarely engages in expansion efforts',
              'Occasionally assists with program expansion but lacks initiative',
              'Regularly collaborates to bring programming into new schools and communities',
              'Proactively leads expansion efforts, significantly growing the program'
            ]
          ),
          criterion(
            'evaluates_success',
            'Coordinates with management to evaluate program success and identify areas for improvement',
            [
              'Rarely participates in program evaluation',
              'Occasionally offers insights but lacks follow-through',
              'Regularly evaluates program effectiveness and suggests improvements',
              "Plays a key role in refining and enhancing the program's success"
            ]
          ),
          criterion(
            'external_partners',
            'Establishes and maintains relationships with external partners to enhance program development',
            [
              'Rarely builds relationships with external partners',
              'Occasionally engages with partners but with minimal impact',
              'Regularly collaborates with external partners for program success',
              'Develops strong partnerships that significantly enhance program quality'
            ]
          )
        ]),
        section('crisis_coverage', '7. Crisis & Coverage Responsibilities', [
          criterion(
            'session_coverage',
            'Provides coverage for sessions if a facilitator is unable to attend',
            [
              'Rarely steps in to provide coverage',
              'Occasionally provides coverage but inconsistently',
              'Regularly steps in to ensure service continuity',
              'Always ensures smooth coverage, maintaining high program standards'
            ]
          ),
          criterion(
            'client_concerns',
            'Assists with client concerns and emergencies within the program',
            [
              'Rarely addresses client concerns or crises effectively',
              'Occasionally manages crises but lacks consistency',
              'Regularly handles client concerns professionally and effectively',
              'Demonstrates exceptional crisis management, ensuring client safety and program stability'
            ]
          )
        ])
      ]
    })
  },

  clinical_practice_assistant: {
    slug: 'clinical_practice_assistant',
    name: 'Clinical Practice Assistant Employee Self-Assessment & Evaluation Rubric',
    isSupervisorRubric: false,
    matchJobPatterns: [/clinical practice assistant/i],
    rubric: rubric({
      title: 'Clinical Practice Assistant Employee Self-Assessment & Evaluation Rubric',
      sections: [
        section('mhp_responsibilities', '1. Mental Health Provider Responsibilities', [
          criterion(
            'individual_counseling',
            'Provides effective individual counseling sessions',
            [
              'Rarely engages clients effectively',
              'Provides some therapeutic support but lacks consistency',
              'Regularly delivers structured, client-centered therapy',
              'Excels in therapy, demonstrating strong client progress'
            ]
          ),
          criterion(
            'evidence_based',
            'Utilizes evidence-based therapeutic approaches',
            [
              'Rarely uses evidence-based interventions',
              'Uses interventions inconsistently',
              'Regularly applies evidence-based therapy effectively',
              'Expert use of interventions, leading to significant client progress'
            ]
          ),
          criterion(
            'tracks_adjusts',
            'Tracks client progress and adjusts interventions',
            [
              'Rarely tracks progress or modifies interventions',
              'Occasionally evaluates progress but lacks consistency',
              'Regularly monitors client progress and adjusts strategies',
              'Expertly tracks, evaluates, and adjusts interventions for strong outcomes'
            ]
          )
        ]),
        section('facilitator_oversight', '2. Facilitator Oversight & Support', [
          criterion(
            'guides_mentors',
            'Guides, mentors, and oversees mental health facilitators in their core responsibilities',
            [
              'Rarely engages with facilitators or provides effective support',
              'Provides some guidance but lacks consistency or impact',
              'Regularly mentors facilitators, ensuring strong support and professional growth',
              'Excels in providing mentorship, significantly enhancing facilitator effectiveness'
            ]
          ),
          criterion(
            'support_sessions',
            'Conducts individual and group support sessions for facilitators and interns/practicum students',
            [
              'Rarely holds support sessions or provides structured guidance',
              'Holds occasional sessions but lacks a consistent approach',
              'Conducts structured, impactful support sessions that facilitate professional development',
              'Provides highly effective, well-structured sessions that foster strong growth'
            ]
          ),
          criterion(
            'check_in_frequency',
            'Determines the frequency of individual check-ins after the first 60-90 days',
            [
              'Does not adjust support based on facilitator needs',
              'Occasionally modifies frequency but lacks strategic adjustments',
              'Adjusts meetings as needed to ensure adequate support',
              'Skillfully adapts check-ins, ensuring optimal facilitator growth'
            ]
          ),
          criterion(
            'biweekly_meetings',
            'Leads biweekly group meetings with the Skill Development team',
            [
              'Rarely facilitates or engages in group meetings',
              'Occasionally leads meetings but lacks clear direction',
              'Regularly leads structured, engaging team meetings',
              'Demonstrates strong leadership, ensuring meaningful team collaboration'
            ]
          )
        ]),
        section('training_intern', '3. Training & Intern/Practicum Support', [
          criterion(
            'orientation',
            'Conducts orientation sessions for new hires on operational procedures, documentation, and electronic health records',
            [
              'Rarely provides structured orientation or clear guidance',
              'Occasionally conducts orientation but lacks thoroughness',
              'Regularly leads structured, informative orientations',
              'Provides outstanding orientation sessions, ensuring a seamless transition for new staff'
            ]
          ),
          criterion(
            'primary_contact',
            'Serves as the primary contact for practicum and intern students, providing scheduling and professional guidance',
            [
              'Rarely engages with interns or provides necessary support',
              'Provides some guidance but inconsistently',
              'Regularly supports interns, ensuring clear guidance and professional growth',
              'Provides exceptional mentorship, significantly enhancing intern development'
            ]
          ),
          criterion(
            'supervisor_connections',
            'Facilitates connections between interns/practicum students and their designated supervisors',
            [
              'Rarely facilitates connections or provides meaningful introductions',
              'Occasionally assists with supervisor connections but lacks consistency',
              'Regularly ensures interns are connected with appropriate supervisors',
              'Proactively strengthens intern-supervisor relationships, enhancing development'
            ]
          ),
          criterion(
            'intern_evaluations',
            'Participates in the evaluation process for interns/practicum students at 30 and 90 days',
            [
              'Rarely engages in the evaluation process or provides meaningful feedback',
              'Participates in evaluations but lacks structured input',
              'Regularly contributes meaningful insights to intern/practicum evaluations',
              'Provides detailed, insightful evaluations that guide professional growth'
            ]
          )
        ]),
        section('school_community', '4. School & Community Collaboration', [
          criterion(
            'school_meetings',
            'Represents the organization at school meetings and builds positive relationships with school personnel',
            [
              'Rarely attends or contributes effectively to school meetings',
              'Occasionally represents the organization but lacks engagement',
              'Regularly engages in school meetings, fostering collaboration',
              'Builds strong, lasting relationships that enhance school-based services'
            ]
          ),
          criterion(
            'caseload_expansion',
            'Coordinates with schools to support mental health facilitators in building and expanding caseloads',
            [
              'Rarely communicates with schools or supports caseload expansion',
              'Provides occasional support but lacks a structured approach',
              'Regularly coordinates with schools, ensuring smooth caseload development',
              'Excels in school coordination, leading to significant caseload expansion'
            ]
          ),
          criterion(
            'connect_team',
            'Collaborates with the Connect team to expand programming into schools and community settings',
            [
              'Rarely engages in program expansion efforts',
              'Occasionally collaborates with the Connect team but lacks follow-through',
              'Regularly contributes to program expansion efforts, ensuring sustainable growth',
              'Demonstrates strategic leadership in expanding programming and outreach'
            ]
          )
        ]),
        section('compliance', '5. Compliance & Professional Conduct', [
          criterion(
            'ethical_compliance',
            'Ensures compliance with ethical, regulatory, and professional standards',
            [
              'Frequently fails to meet compliance standards',
              'Occasionally meets compliance requirements but inconsistently',
              'Consistently ensures compliance with all professional standards',
              'Maintains exemplary compliance, serving as a role model for ethical practice'
            ]
          ),
          criterion(
            'documentation',
            'Maintains accurate and timely documentation for services rendered',
            [
              'Frequently late or incomplete with documentation',
              'Occasionally delays documentation or lacks thoroughness',
              'Regularly completes accurate and timely documentation',
              'Consistently maintains high-quality, well-documented records'
            ]
          ),
          criterion(
            'workplace_policies',
            'Adheres to all workplace policies and professional conduct guidelines',
            [
              'Frequently disregards policies or demonstrates unprofessional behavior',
              'Occasionally struggles with adherence to policies',
              'Regularly upholds workplace policies and professional expectations',
              'Consistently exemplifies professionalism and adherence to policies'
            ]
          )
        ]),
        section('subsidiary', '6. Engagement with Subsidiary Responsibilities', [
          criterion(
            'nlu_support',
            'Supports Next Level Up, LLC under the ITSCO, LLC umbrella',
            [
              'Rarely contributes to subsidiary responsibilities',
              'Provides occasional support but lacks engagement',
              'Regularly manages responsibilities across both organizations',
              'Excels in balancing responsibilities, ensuring seamless coordination'
            ]
          ),
          criterion(
            'consistent_support',
            'Ensures consistent support across both the primary organization and the subsidiary',
            [
              'Rarely ensures consistency between responsibilities',
              'Occasionally manages responsibilities but struggles with coordination',
              'Regularly provides consistent support across organizations',
              'Proactively enhances collaboration between organizations'
            ]
          )
        ])
      ]
    })
  },

  supervisor: {
    slug: 'supervisor',
    name: 'Supervisor Rubric',
    isSupervisorRubric: true,
    matchJobPatterns: [],
    rubric: rubric({
      title: 'Supervisor Rubric',
      sections: [
        section('relationship_building', '1. Relationship Building & Support', [
          criterion(
            'trust_safety',
            'Fosters trust, safety, and a learning environment',
            [
              'Dismissive, critical, or disempowering; unsafe environment',
              'Inconsistent support; may miss signs of distress or disengagement',
              'Provides safety, respect, and regular support in supervision',
              'Creates a consistently supportive, inclusive, and empowering space; actively checks in'
            ]
          )
        ]),
        section('ethical_practice', '2. Ethical Practice & Accountability', [
          criterion(
            'licensure_boundaries',
            'Upholds licensure, documentation, boundaries',
            [
              'Ethical violations or ongoing neglect of standards',
              'Reactive to ethical concerns; needs reminders on policy or protocol',
              'Follows ethics and licensure guidelines; addresses ethical questions appropriately',
              'Role models ethical conduct; ensures compliance with documentation & confidentiality standards'
            ]
          )
        ]),
        section('supervision_structure', '3. Supervision Structure & Preparedness', [
          criterion(
            'prepares_guides',
            'Prepares for and guides supervision sessions',
            [
              'Disorganized; frequent missed documentation; no supervision logs',
              'Supervision lacks structure or preparation; irregular documentation',
              'Sessions are structured and meet expectations; uses agenda and logs regularly',
              'Sets clear agenda, uses tools/assignments, documents sessions thoroughly'
            ]
          )
        ]),
        section('developmental_attunement', '4. Developmental Attunement', [
          criterion(
            'supports_growth',
            'Supports growth based on supervisee level',
            [
              'Applies a “one-size-fits-all” style with little regard to individual development',
              'Over/under-challenges supervisees; limited awareness of developmental stage',
              'Generally meets supervisees where they are; provides scaffolding',
              'Adapts supervision to experience level (intern, early-career, etc.); uses IDMs or tailored tools'
            ]
          )
        ]),
        section('feedback_communication', '5. Feedback & Communication', [
          criterion(
            'actionable_feedback',
            'Offers actionable, timely, and clear feedback',
            [
              'Feedback is harmful, dismissive, or absent',
              'Feedback is vague, infrequent, or overly corrective',
              'Gives regular feedback; open to discussion and questions',
              'Consistently provides constructive feedback and affirmation; balances support and challenge'
            ]
          )
        ]),
        section('clinical_teaching', '6. Clinical Teaching & Case Consultation', [
          criterion(
            'teaches_techniques',
            'Teaches techniques and supports case formulation',
            [
              'Rarely offers clinical guidance; lacks relevance or accuracy',
              'Provides limited clinical input; unclear or outdated techniques',
              'Reviews cases with clinical insight; provides useful tools and resources',
              'Demonstrates clinical expertise; guides treatment planning, diagnostics, modalities'
            ]
          )
        ]),
        section('documentation_oversight', '7. Documentation & Administrative Oversight', [
          criterion(
            'ensures_compliance',
            'Ensures compliance with ITSCO and licensure requirements',
            [
              'Fails to review supervisee documentation or meet compliance standards',
              'Misses documentation or supervision tracking deadlines',
              'Checks documentation regularly; follows ITSCO supervision protocols',
              'Reviews documentation, logs, evaluations, and case records for quality and accuracy'
            ]
          )
        ]),
        section('modeling_leadership', '8. Supervisory Modeling & Leadership', [
          criterion(
            'models_professionalism',
            'Models professionalism and values-based leadership',
            [
              'Unprofessional conduct; blurs roles/boundaries; unsafe leadership',
              'Inconsistently professional; avoids addressing hard issues',
              'Consistently demonstrates professionalism; holds supervisees accountable respectfully',
              'Demonstrates calm, reflective, ethical leadership; owns limitations and repairs when needed'
            ]
          )
        ]),
        section('engagement_availability', '9. Engagement & Availability', [
          criterion(
            'presence_followup',
            'Presence, follow-up, accessibility',
            [
              'Chronically unavailable, inconsistent presence, or avoids supervision duties',
              'Hard to reach or unresponsive at times; limited check-ins',
              'Available during crises or when needed; responds within expected timeframes',
              'Highly responsive and invested in supervisee development; provides timely follow-up'
            ]
          )
        ])
      ]
    })
  }
};

export default ITSCO_EVALUATION_RUBRICS;
