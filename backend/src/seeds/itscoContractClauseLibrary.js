/**
 * ITSCO employment + management contract clause library (seed data).
 * Source: Google Sheets contract builder — full clause table from People Ops.
 */

export const ITSCO_TEMPLATE_NAME = 'ITSCO Standard';

/**
 * Convert markdown-like clause text to HTML for contract_clauses.body_html.
 * - **bold** -> strong
 * - *italic* / _italic_ -> em
 * - Blank lines -> paragraph breaks
 * - <<PAGE_BREAK>> -> page-break div
 * - Lines starting with * or • -> list items
 */
export function mdToHtml(md) {
  if (md == null || md === '') return '';
  const parts = String(md).split('<<PAGE_BREAK>>');
  const pageBreak = '<div class="page-break" style="page-break-after:always;"></div>';
  return parts.map((part) => convertBlock(part)).join(pageBreak);
}

function convertBlock(text) {
  const lines = String(text).split('\n');
  const out = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      continue;
    }

    const bulletMatch = trimmed.match(/^(?:[*•]|[-–])\s+(.+)$/);
    if (bulletMatch) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inlineFormat(bulletMatch[1])}</li>`);
      continue;
    }

    closeList();
    out.push(`<p>${inlineFormat(trimmed)}</p>`);
  }

  closeList();
  return out.join('\n');
}

function inlineFormat(s) {
  let out = String(s);
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
  out = out.replace(/_(.+?)_/g, '<em>$1</em>');
  return out;
}

export const ITSCO_CONTRACT_CLAUSES = [
  {
    clause_key: "INTRO",
    title: "",
    body_md: "This Employment Agreement (“Agreement”) is made and entered into this **{{EXECUTION_DATE}}** (the _“Execution Date”_) by and between **{{COMPANY_NAME}}** (the _“Practice”_), with a principal place of business at **{{COMPANY_ADDRESS}}**, and **{{CANDIDATE_NAME}}**, an individual employed in the Job Title of **{{JOB_TITLE}}**, with an assigned Service Focus of **{{SERVICE_FOCUS}}** (the _“{{ROLE_LABEL}}”_).\n\n**WHEREAS**, the {{ROLE_LABEL}} is willing to be employed by the Practice in the above-referenced Job Title and Service Focus, and the Practice is willing to employ the {{ROLE_LABEL}}, subject to the terms, covenants, and conditions set forth herein;\n\n**WHEREAS**, the Practice provides mental health, skill development, academic support, and related services, engaging Contractors, Students, Facilitators, and Providers to offer professional care to its Clients at various office-based and school sites (_“Sites”_).\n\nIn consideration of the mutual promises of the Parties, the Practice and the {{ROLE_LABEL}} covenant and agree as follows:",
    sort_hint: 10
  },
  {
    clause_key: "INTRO_ITSCO",
    title: "",
    body_md: "This Employment Agreement (“Agreement”) is made and entered into this **{{EXECUTION_DATE}}** (the _“Execution Date”_) by and between **{{COMPANY_NAME}}** (the _“Practice”_), with a principal place of business at **{{COMPANY_ADDRESS}}**, and **{{CANDIDATE_NAME}}**, an individual employed in the Job Title of **{{JOB_TITLE}}**, with an assigned Service Focus of **{{SERVICE_FOCUS}}** (the _“{{ROLE_LABEL}}”_).\n\n**WHEREAS**, the {{ROLE_LABEL}} is willing to be employed by the Practice in the above-referenced Job Title and Service Focus, and the Practice is willing to employ the {{ROLE_LABEL}}, subject to the terms, covenants, and conditions set forth herein;\n\n**WHEREAS**, the Practice provides mental health, skill development, academic support, and related services, engaging Contractors, Students, Facilitators, and Providers to offer professional care to its Clients at various office-based and school sites (_“Sites”_).\n\nIn consideration of the mutual promises of the Parties, the Practice and the {{ROLE_LABEL}} covenant and agree as follows:",
    sort_hint: 10
  },
  {
    clause_key: "INTRO_ALL_OFFICE",
    title: "",
    body_md: "This Employment Agreement (“Agreement”) is made and entered into this **{{EXECUTION_DATE}}** (the _“Execution Date”_) by and between **{{COMPANY_NAME}}** (the _“Practice”_), with a principal place of business at **{{COMPANY_ADDRESS}}**, and **{{CANDIDATE_NAME}}**, an individual employed in the Job Title of **{{JOB_TITLE}}**, with an assigned Service Focus of **{{SERVICE_FOCUS}}** (the _“{{ROLE_LABEL}}”_).\n\n**WHEREAS**, the {{ROLE_LABEL}} is willing to be employed by the Practice in the above-referenced Job Title and Service Focus, and the Practice is willing to employ the {{ROLE_LABEL}}, subject to the terms, covenants, and conditions set forth herein;\n\n**WHEREAS**, the Practice provides mental health, skill development, and related services, engaging Contractors, Students, Facilitators, and Providers to offer professional care to its Clients at various office-based sites (_“Sites”_).\n\nIn consideration of the mutual promises of the Parties, the Practice and the {{ROLE_LABEL}} covenant and agree as follows:",
    sort_hint: 10
  },
  {
    clause_key: "INTRO_INTERN",
    title: "",
    body_md: "This Student Training Agreement (“Agreement”) is made and entered into this **{{EXECUTION_DATE}}** (the _“Execution Date”_) by and between **{{COMPANY_NAME}}** (the _“Practice”_), with a principal place of business at **{{COMPANY_ADDRESS}}**, and **{{CANDIDATE_NAME}}**, an individual currently enrolled at **{{UNIVERSITY_NAME}}**, serving in the Job Title of **{{JOB_TITLE}}**, with an assigned Service Focus of **{{SERVICE_FOCUS}}** (the _“Student”_).\n\n**WHEREAS**, the Student is engaged by the Practice in a training capacity for educational purposes under the terms, covenants, and conditions of this Agreement, and participation in the Student Training Program does not constitute employment and does not guarantee future employment with the Practice;\n\n**WHEREAS**, the Student agrees to participate in the Practice’s Student Training Program, which may include practicum and/or internship components, and which is governed by the terms of this Agreement, the Practice’s Workplace Handbook, and applicable policies, as amended from time to time;\n\n**WHEREAS**, upon successful completion of the Student Training Program or any portion thereof, and subject to mutual agreement, the Student may be eligible to apply for or transition into a separate internship or employment role within the Practice; however, any such transition is not guaranteed and would require a separate written agreement;\n\n**WHEREAS**, the Practice provides mental health, skill development, and related services, engaging Contractors, Students, Facilitators, and Providers to offer professional care to its Clients at various office-based and school sites (_“Sites”_).\n\nIn consideration of the mutual promises of the Parties, the Practice and the Student covenant and agree as follows:",
    sort_hint: 10
  },
  {
    clause_key: "INTRO_NLU",
    title: "",
    body_md: "**WHEREAS**, **{{COMPANY_NAME}}** (the _“Practice”_) is willing to employ **{{CANDIDATE_NAME}}**, an individual employed in the Job Title of **{{JOB_TITLE}}**, with an assigned Service Focus of **{{SERVICE_FOCUS}}**, and **{{CANDIDATE_NAME}}** (the _“{{ROLE_LABEL}}”_) is willing to be employed by the Practice to provide assigned services (“Services”) outlined in this Agreement to the Practice’s clients (“Clients”) at office-based and other approved service locations (“Sites”);\n\n**WHEREAS**, the Practice provides mental health, learning, wellness, tutoring, assessment, and related services, engaging Contractors, Students, Providers, and Facilitators to offer professional care and educational support to its Clients at various office-based and approved Sites.\n\nIn consideration of the mutual promises of the Parties, the Practice and the Facilitator covenant and agree as follows:",
    sort_hint: 10
  },
  {
    clause_key: "TERM_AT_WILL",
    title: "Term and At-Will Status",
    body_md: "**(A)** _At-Will Relationship_: The {{ROLE_LABEL}}’s employment with the Practice is “At-Will.” This means that either the {{ROLE_LABEL}} or the Practice may terminate this Agreement at any time, for any reason or no reason, with or without cause.\n\n**(B)** _Review Period_: While employment is indefinite, this Agreement shall commence on **{{START_DATE}}** and will be reviewed annually by the Parties. This review does not constitute a guarantee of employment for any specific duration.\n\n**(C)** _Notice_: In the event of voluntary resignation, the {{ROLE_LABEL}} agrees to provide at least 30 days' written notice to ensure continuity of care for clients.",
    sort_hint: 20
  },
  {
    clause_key: "ASSIGNED_OFFICE",
    title: "Assigned Office",
    body_md: "**Assigned Office**: The {{ROLE_LABEL}} is assigned to the **{{ASSIGNED_OFFICE_NAME}}** office located at **{{ASSIGNED_OFFICE_ADDRESS}}** (the _“Assigned Office”_). The {{ROLE_LABEL}} agrees to provide services from the Assigned Office and other Sites as directed by the Practice, subject to scheduling, program needs, and Practice policies.",
    sort_hint: 25
  },
  {
    clause_key: "LICENSURE_STATUS",
    title: "Licensure Status",
    body_md: "**(A)** _Licensure Status_:  The {{ROLE_LABEL}} represents and warrants that they currently hold the following professional license(s): **{{LICENSE_TYPE}}**, issued by **{{LICENSING_BOARD}}**, and that such license(s) are in good standing without restriction.\n\nThe {{ROLE_LABEL}} agrees to maintain all required licensure, registrations, and credentials necessary to perform services within their assigned role and Service Focus throughout the term of this Agreement.",
    sort_hint: 30
  },
  {
    clause_key: "LICENSURE_CONT",
    title: "Licensure Status and Contigency",
    body_md: "**(A)** _Licensure Contingency_:  This Agreement is contingent upon the {{ROLE_LABEL}}’s acquisition of **{{LICENSE_TYPE}}** (or equivalent licensure, as determined by the Practice) by **{{LICENSURE_DEADLINE}}**. The {{ROLE_LABEL}} acknowledges that failure to obtain such licensure by the stated deadline may result in modification of role assignment, Service Focus, compensation structure, or termination of this Agreement.\n\n**(B)** _Compensation and Role Adjustment_:  If the {{ROLE_LABEL}} does not obtain the required licensure by the deadline set forth above, the Practice reserves the right to alter compensation, duties, Service Focus, or role classification, including modification of compensation terms set forth in this Agreement or applicable appendices, consistent with the {{COMPANY_NAME}} Workplace Handbook.\n\nSuch modification shall not be deemed a breach of this Agreement.\n\n**(C)** _Ongoing Obligation_:  The {{ROLE_LABEL}} agrees to promptly notify the Practice of any delay, denial, lapse, restriction, or disciplinary action related to licensure status.",
    sort_hint: 30
  },
  {
    clause_key: "JOB_DESC_LPC",
    title: "Duties and Responsibilities",
    body_md: "The {{ROLE_LABEL}} shall perform the duties of the **{{JOB_TITLE}}** in accordance with the expectations of the Practice and applicable policies. The responsibilities listed below describe the core functions of the role and are not intended to be exhaustive.\n\n_Primary Responsibilities_:\n\n**(A)** Provide individual and small-group counseling services to children and adolescents using evidence-based therapeutic approaches within the {{ROLE_LABEL}}’s scope of practice and training.\n\n**(B)** deliver services with a priority focus within school-based settings, with scheduling and placement determined by Practice and program needs.\n\n**(C)** Collaborate professionally with school personnel, families, and other relevant stakeholders to support coordinated and effective client care.\n\n**(D)** Complete required clinical documentation, assessments, and progress tracking in accordance with Practice standards, timelines, and compliance requirements.\n\n**(E)** Perform additional duties consistent with the **{{JOB_TITLE}}** and reasonably assigned by the Practice, as outlined in the Workplace Handbook or program-specific policies.\n\n**(F)** Acknowledge that the Workplace Handbook describes the typical duties, professional standards, and role expectations applicable to this position, which apply in addition to this Agreement and may be updated from time to time.\n\n_Service Expectations_: \n\nThe {{ROLE_LABEL}} is expected to maintain an average of {{MIN_HOURS}} Direct service hours per week, calculated over applicable measurement periods, as an expectation of the role. Failure to meet service expectations may result in review, adjustment of duties, or changes to role status in accordance with Practice policies, but does not eliminate compensation for approved services actually performed.",
    sort_hint: 40
  },
  {
    clause_key: "JOB_DESC_LPC_ALL",
    title: "Duties and Responsibilities",
    body_md: "The {{ROLE_LABEL}} shall perform the duties of the **{{JOB_TITLE}}** in accordance with the expectations of the Practice and applicable policies. The responsibilities listed below describe the core functions of the role and are not intended to be exhaustive.\n\n_Primary Responsibilities_:\n\n**(A)** Provide individual and small-group counseling services to children and adolescents using evidence-based therapeutic approaches within the {{ROLE_LABEL}}’s scope of practice and training.\n\n**(B)** Deliver services primarily within office-based settings, with scheduling and placement determined by Practice's needs.\n\n**(C)** Collaborate professionally with families and other relevant stakeholders to support coordinated and effective client care.\n\n**(D)** Complete required clinical documentation, assessments, and progress tracking in accordance with Practice standards, timelines, and compliance requirements.\n\n**(E)** Perform additional duties consistent with the **{{JOB_TITLE}}** and reasonably assigned by the Practice, as outlined in the Workplace Handbook or program-specific policies.\n\n**(F)** Acknowledge that the Workplace Handbook describes the typical duties, professional standards, and role expectations applicable to this position, which apply in addition to this Agreement and may be updated from time to time.\n\n_Service Expectations_: \n\nThe {{ROLE_LABEL}} is expected to maintain an average of {{MIN_HOURS}} Direct service hours per week, calculated over applicable measurement periods, as an expectation of the role. Failure to meet service expectations may result in review, adjustment of duties, or changes to role status in accordance with Practice policies, but does not eliminate compensation for approved services actually performed.",
    sort_hint: 40
  },
  {
    clause_key: "JOB_DESC_FAC",
    title: "Duties and Responsibilities",
    body_md: "The {{ROLE_LABEL}} shall perform the duties of the **{{JOB_TITLE}}** in accordance with Practice expectations, program requirements, and applicable policies. The responsibilities listed below describe the core functions of the role and are not intended to be exhaustive.\n\n_Primary Responsibilities_:\n\n**(A)** Facilitate structured small-group skill development sessions for children and adolescents focused on social-emotional learning, communication, emotional regulation, coping skills, and interpersonal development.\n\n**(B)** deliver services with a priority focus within school-based and approved community settings, as assigned based on program and operational needs.\n\n**(C)** Implement Practice-approved curricula, activities, and evidence-informed strategies to support participant engagement, behavioral growth, and skill acquisition.\n\n**(D)** Monitor participant progress through observation, feedback, and required documentation in accordance with Practice standards and confidentiality requirements.\n\n**(E)** Collaborate professionally with school personnel, families, and internal team members to support coordinated care and program effectiveness.\n\n**(F)** Perform additional duties consistent with the **{{JOB_TITLE}}** and reasonably assigned by the Practice, as outlined in the Workplace Handbook or program-specific policies.\n\n**(G)** Acknowledge that the Workplace Handbook describes the typical duties, professional standards, and role expectations applicable to this position, which apply in addition to this Agreement and may be updated from time to time.",
    sort_hint: 40
  },
  {
    clause_key: "JOB_DESC_INTERN",
    title: "Duties and Responsibilities",
    body_md: "The {{ROLE_LABEL}} shall participate in the Student Training Program as an Student Mental Health Provider under the supervision and direction of the Practice. The responsibilities listed below describe the core expectations of the internship and are not intended to be exhaustive.\n\n_Primary Responsibilities_:\n\n**(A)** Provide mental health services to children, adolescents, and families within school-based and approved office settings under appropriate supervision and in accordance with educational and training objectives.\n\n**(B)** Engage in counseling-related activities, including observation, assisting, co-facilitation, and direct service delivery, as approved and directed by the Practice Supervisor or designated Mentor.\n\n**(C)** Complete required clinical documentation, assessments, and records accurately and in compliance with applicable laws, ethical standards, and Practice policies.\n\n**(D)** Participate in supervision, training, case review meetings, and other educational activities required by the Practice and the Student Training Program.\n\n**(E)** Maintain professional conduct, confidentiality, and ethical standards consistent with applicable regulatory requirements, Practice policies, and the Student’s academic program.\n\n**(F)** Perform additional duties reasonably related to the internship and educational objectives as assigned by the Practice, consistent with the Workplace Handbook and program policies.\n\n**(G)** Acknowledge that the Workplace Handbook describes the typical duties, professional standards, and role expectations applicable to this position, which apply in addition to this Agreement and may be updated from time to time.",
    sort_hint: 40
  },
  {
    clause_key: "JOB_DESC_LWF",
    title: "Duties and Responsibilities",
    body_md: "The {{ROLE_LABEL}} shall perform the duties of the **{{JOB_TITLE}}** in accordance with Practice expectations, program requirements, and applicable policies. The responsibilities listed below describe the core functions of the role and are not intended to be exhaustive.\n\n_Primary Responsibilities_:\n\n**(A)** Provide individualized academic support and skill-based instruction to students across a range of grade levels, reinforcing learning and supporting academic growth.\n\n**(B)** Integrate wellness-oriented and skill-development strategies into academic support, including techniques related to emotional regulation, coping skills, focus, and stress management, consistent with training and program guidelines.\n\n**(C)** Facilitate one-on-one and small-group sessions designed to support academic engagement, personal development, and overall student well-being.\n\n**(D)** Monitor student progress and participation through observation, feedback, and required documentation in accordance with Practice standards.\n\n**(E)** Collaborate professionally with families, educators, and internal team members to support coordinated student growth and program effectiveness.\n\n**(F)** Perform additional duties consistent with the **{{JOB_TITLE}}** and reasonably assigned by the Practice, as outlined in the Workplace Handbook or program-specific policies.\n\n**(G)** Acknowledge that the Workplace Handbook describes the typical duties, professional standards, and role expectations applicable to this position, which apply in addition to this Agreement and may be updated from time to time.",
    sort_hint: 40
  },
  {
    clause_key: "JOB_DESC_TUT",
    title: "Duties and Responsibilities",
    body_md: "The {{ROLE_LABEL}} shall perform the duties of the **{{JOB_TITLE}}** in accordance with Practice expectations, program requirements, and applicable policies. The responsibilities listed below describe the core functions of the role and are not intended to be exhaustive.\n\n_Primary Responsibilities_:\n\n**(A)** Provide individualized, one-on-one academic tutoring to students across a range of grade levels, reinforcing classroom learning and supporting academic progress.\n\n**(B)** Deliver instruction in core subject areas consistent with student needs, curriculum standards, and program guidelines.\n\n**(C)** Support the development of effective study habits, organizational skills, and independent learning strategies to promote academic confidence and consistency.\n\n**(D)** Monitor student progress through observation, assessments, and required documentation in accordance with Practice standards.\n\n**(E)** Communicate professionally with parents or guardians, as appropriate, regarding student progress and academic goals.\n\n**(F)** Perform additional duties consistent with the **{{JOB_TITLE}}** and reasonably assigned by the Practice, as outlined in the Workplace Handbook or program-specific policies.\n\n**(G)** Acknowledge that the Workplace Handbook describes the typical duties, professional standards, and role expectations applicable to this position, which apply in addition to this Agreement and may be updated from time to time.",
    sort_hint: 40
  },
  {
    clause_key: "JOB_DESC_COUN",
    title: "Duties and Responsibilities",
    body_md: "The {{ROLE_LABEL}} shall perform the duties of the **{{JOB_TITLE}}** in accordance with Practice expectations, clinical standards, and applicable policies. The responsibilities listed below describe the core functions of the role and are not intended to be exhaustive.\n\n_Primary Responsibilities_:\n\n**(A)** Provide individual counseling services to children and adolescents addressing emotional, behavioral, and mental health concerns within the {{ROLE_LABEL}}’s scope of practice.\n\n**(B)** Facilitate therapeutic small-group counseling sessions focused on emotional awareness, coping skills, communication, and interpersonal development, as clinically appropriate.\n\n**(C)** Utilize evidence-based and developmentally appropriate therapeutic approaches consistent with training, supervision, licensure status, and Practice guidelines.\n\n**(D)** Conduct assessments, contribute to treatment planning, and monitor client progress through clinical documentation, observations, and client or caregiver feedback.\n\n**(E)** Collaborate professionally with families, school personnel, and other involved providers, as appropriate, to support coordinated and effective client care.\n\n**(F)** Maintain accurate, timely clinical documentation and comply with all applicable ethical, legal, and Practice requirements.\n\n**(G)** Perform additional duties consistent with the **{{JOB_TITLE}}** and reasonably assigned by the Practice, as outlined in the Workplace Handbook or program-specific policies.\n\n**(H)** Acknowledge that the Workplace Handbook describes the typical duties, professional standards, and role expectations applicable to this position, which apply in addition to this Agreement and may be updated from time to time.",
    sort_hint: 40
  },
  {
    clause_key: "JOB_DESC_SDCOR",
    title: "Duties and Responsibilities",
    body_md: "The {{ROLE_LABEL}} shall perform the duties of the **{{JOB_TITLE}}** in accordance with Practice expectations, program requirements, and applicable policies. The responsibilities listed below describe the core functions of the role and are not intended to be exhaustive.\n\n_Primary Responsibilities_:\n\n**(A)** Provide oversight, mentorship, and professional support to skill development facilitators to ensure effective service delivery and program quality.\n\n**(B)** Coordinate skill development programming, including scheduling, facilitator assignments, and communication with schools and community partners.\n\n**(C)** Serve as a liaison between facilitators, schools, and internal teams to support consistent and effective program integration.\n\n**(D)** Provide limited direct skill-based services, including individual or group interventions, as required to support program needs and continuity of care.\n\n**(E)** Support onboarding, precepting, and professional development processes for facilitators in alignment with Practice standards.\n\n**(F)** Assist with program planning, implementation, and evaluation, including seasonal or special programming initiatives.\n\n**(G)** Provide coverage and support in response to facilitator absences, client concerns, or urgent program needs when reasonably required.\n\n**(H)** Perform additional duties consistent with the **{{JOB_TITLE}}** and reasonably assigned by the Practice, as outlined in the Workplace Handbook or program-specific policies.\n\n**(I)** Acknowledge that the Workplace Handbook describes the typical duties, professional standards, and role expectations applicable to this position, which apply in addition to this Agreement and may be updated from time to time.",
    sort_hint: 40
  },
  {
    clause_key: "JOB_DESC_STUD_MENT",
    title: "Duties and Responsibilities",
    body_md: "The {{ROLE_LABEL}} shall perform the duties of the **{{JOB_TITLE}}** in accordance with the expectations of the Practice and applicable policies.\n\n**(A)** _Subject to Supervision_: Subject to the supervision and pursuant to the orders, advice, and directions of the Practice, the {{ROLE_LABEL}} will perform such duties that are customarily performed by one holding such position in similar businesses or enterprises as that engaged in by the Practice, and will also render such other and unrelated services and duties as may be assigned to the {{ROLE_LABEL}} from time to time by the Practice. The {{ROLE_LABEL}} agrees to perform services in accordance with the ethical standards applicable to their profession and specialty and in accordance with the standards of professional conduct and practice as is required by applicable regulatory, licensing and accrediting authorities, professional associations, and third party payers.\n\n**(B)** _Student Training Mentor Responsibilities_:\n* Serve as the primary point of contact for practicum and intern students, assisting with schedules, activities, and professional conduct within the clinical setting.\n* Facilitate connections between interns/practicum students and their designated supervisors, offering organizational insight and support as needed.\n* Provide feedback to the management team on the effectiveness of orientation and support processes, and participate in the evaluation of interns at 30 and 90 days.\n\n**(C)** _Active Service_: The {{ROLE_LABEL}} will actively provide services for and on behalf of the Practice. The Parties acknowledge that the {{ROLE_LABEL}} does not need to be present at Site(s) if the {{ROLE_LABEL}} does not have Clients scheduled or administrative meetings or trainings scheduled.\n\n**(D)** _Documentation_: The {{ROLE_LABEL}} will accurately prepare and complete medical records documentation in accordance with applicable laws, regulations, and policies for all Services rendered on the same day as the Service.\n\n**(E)** _Compliance and Conduct_: The {{ROLE_LABEL}} agrees to comply with all general regulations and instructions from time to time issued by the Practice, including those governing hours and conditions of work, and to obey all lawful orders given by the Practice, its executives, or other authorized person or persons; to conduct themselves at all times in such a manner as not to bring discredit on the {{ROLE_LABEL}} or the Practice; and to abide by all laws and ordinances of the United States, and the state, county and municipality in which the {{ROLE_LABEL}} is working.\n\n**(F)** _Handbook_: The {{ROLE_LABEL}} will comply with the policies, procedures, and Workplace Handbook which may be revised from time-to-time.",
    sort_hint: 40
  },
  {
    clause_key: "JOB_DESC_MHF",
    title: "Duties and Responsibilities",
    body_md: "The {{ROLE_LABEL}} shall perform the duties of the **{{JOB_TITLE}}** in accordance with the expectations of the Practice and applicable policies.\n\n_Primary Responsibilities_:\n\n**(A)** Provide community-based treatment, skill development, and behavioral health interventions to children and adolescents in school, home, and community settings as per approved service plans.\n\n**(B)** Facilitate individual and group counseling sessions, including specific services for Substance Use Disorders (SUD) and Alcohol and Other Drugs (AOD) treatment goals, as mutually agreed and clinically appropriate.\n\n**(C)** Collaborate with clinical teams to coordinate recovery, resiliency, and crisis management plans, ensuring all medical records documentation is completed on the same day services are rendered.\n\n**(D)** Acknowledge that the **{{COMPANY_NAME}} Workplace Handbook** describes the detailed duties, professional standards, and role expectations applicable to this position, which apply in addition to this Agreement.",
    sort_hint: 40
  },
  {
    clause_key: "JOB_DESC_SDF",
    title: "Duties and Responsibilities",
    body_md: "The {{ROLE_LABEL}} shall perform the duties of the **{{JOB_TITLE}}** in accordance with the expectations of the Practice and applicable policies.\n\n_Primary Responsibilities_:\n\n**(A)** _Skill Development & Community Services_: Provide community-based skill building, behavioral interventions, and emotional regulation support to children and adolescents in school, home, and community settings. This includes facilitating individual and group sessions under the direction of the administrative team and completing all required documentation on the same day as service.\n\n**(B)** _Integration & Support_: Assist clients in identifying natural supports, accessing necessary services, and developing functional coping skills to maintain community placement and succeed in the school environment.\n\n**(C)** _Advancement Opportunity_: The Parties acknowledge that the {{ROLE_LABEL}} is currently enrolled in a degree program. Upon successful attainment of **Bachelor’s status** and subject to Practice approval, the {{ROLE_LABEL}} may be eligible to advance into roles involving individual counseling, group therapy, and SUD/AOD services (as described in Handbook Section 3). Such advancement is not guaranteed and requires a separate written modification to this Agreement.\n\n**(D)** _Handbook Reference_: Acknowledge that the **{{COMPANY_NAME}} Workplace Handbook** describes the detailed duties, professional standards, and role expectations applicable to this position, which apply in addition to this Agreement.",
    sort_hint: 40
  },
  {
    clause_key: "JOB_DESC_JACQUE",
    title: "Duties and Responsibilities",
    body_md: "The {{ROLE_LABEL}} shall perform the duties of the **{{JOB_TITLE}}** in accordance with the expectations of the Practice and applicable policies.\n\n_Primary Responsibilities_:\n\n**(A)** _Skill Development Services_: Facilitate individual and group skill-building sessions (day, after-school, and weekend) to help members develop functional, interpersonal, and coping skills. This includes participating in summer programming and ensuring all documentation is completed on the same day as service.\n\n**(B)** _Individual Counseling & Therapy_: Provide evidence-based individual counseling tailored to client treatment plans. Responsibilities include assessment, progress monitoring, developing emotional regulation strategies, and maintaining clinical compliance under the supervision of the clinical team.\n\n**(C)** _Operations Assistant (Denver)_: Actively assist in launching ITSCO services in Denver (specifically the Skill Builders program) and oversee the general upkeep of the Denver office. The {{ROLE_LABEL}} shall serve as the lead liaison for Denver staff, surfacing operational issues, supporting onboarding, and building team cohesion.\n\n**(D)** _Reporting & Meetings_: The {{ROLE_LABEL}} reports directly to **Rachel Finch and Michael Mendez**. Attendance at staff meetings is required and is considered a regular duty included in the {{ROLE_LABEL}}'s compensation.\n\n**(E)** _Handbook Reference_: Acknowledge that the **{{COMPANY_NAME}} Workplace Handbook** describes the detailed duties, professional standards, and role expectations applicable to this position, which apply in addition to this Agreement.",
    sort_hint: 40
  },
  {
    clause_key: "COMP_FFS",
    title: "Compensation",
    body_md: "**(A)** _Fee-For-Service_: The Practice will pay the {{ROLE_LABEL}} for approved services rendered in accordance with the schedule set forth below. Compensation under this subsection is contingent upon the timely and accurate completion of all required clinical documentation. Failure to complete documentation may result in delayed payment until such requirements are satisfied.\n\n**(B)** _Collections_: The Parties acknowledge that the Practice has the exclusive right to bill and collect all fees for services rendered. All revenue generated by the {{ROLE_LABEL}} belongs to the Practice except for the compensation expressly set forth in subsection (A).\n\n**(C)** _Pay Schedule_: Payment will be issued at regular intervals (currently bi-weekly) in the pay period subsequent to the completion of services and required documentation.\n\n**(D)** _Transition from Fee-For-Service_: The Practice reserves the right, in its sole discretion, to modify, replace, or discontinue the fee-for-service compensation model at any time. In the event the fee-for-service model is terminated or no longer applicable, the {{ROLE_LABEL}}’s compensation shall automatically default to the compensation structure associated with the **{{JOB_TITLE}}** or equivalent role, as defined in the {{COMPANY_NAME}} Workplace Handbook and applicable compensation policies in effect at that time. Any such transition shall not be deemed a termination, demotion, or breach of this Agreement.\n\n**(E)** _Limitation of Compensation_: Compensation under this Agreement is limited to the amounts expressly described herein or, upon transition, to the compensation applicable to the **{{JOB_TITLE}}** as set forth in the Workplace Handbook. Compensation does not include benefits, reimbursements, or discretionary compensation, which—if any—are governed separately.\n\n**(F)** _Compensation Adjustments_: Compensation adjustments, including those related to credentialing, licensure, performance, or role changes, shall be made only by written addendum executed by both Parties.\n\n**(G)** _Services Not Listed in Pay Table_: Any approved service, activity, or work performed by the {{ROLE_LABEL}} that is not expressly listed in the fee schedule above shall be compensated, if compensable, in accordance with the hourly direct or indirect service rate associated with the **{{JOB_TITLE}}** (or equivalent role) as set forth in the {{COMPANY_NAME}} Workplace Handbook, as amended from time to time. No compensation is owed for services not approved, not documented, or not compensable under Practice policy.",
    sort_hint: 50
  },
  {
    clause_key: "FFS_TABLE",
    title: "Compensation Table",
    body_md: "{{INSERT_PAY_TABLE}}",
    sort_hint: 50
  },
  {
    clause_key: "FFS_TABLE2",
    title: "",
    body_md: "\n+ Compensation for services under this code is payable only when the client is a member of Health First Colorado (Colorado Medicaid) or is billed under an approved self-pay arrangement. Services that are not billable to a third-party payor or self-pay are not eligible for compensation. Providers are responsible for confirming client eligibility prior to service delivery.\n++ Compensation for group services applies to the primary rendering Provider. Participation of a co-facilitator requires either voluntary participation by the co-facilitator or a mutually agreed allocation of compensation from the primary Provider. No additional compensation is guaranteed unless expressly approved.\n+++ Compensation for services billed under code 99051 shall be paid at the flat rate listed in the standard rate schedule unless the Provider follows the procedures outlined in the “99051 Nights and Weekends Upcharge” policy. Eligibility for the alternate rate is contingent upon compliance with that policy.\n++++ Compensation for group services based on a percentage of collections is contingent upon receipt of collections. Compensation will be calculated and paid only after collections are received.",
    sort_hint: 50
  },
  {
    clause_key: "COMP_PRAC",
    title: "Compensation",
    body_md: "**(A)** _Educational Purpose_:  The practicum phase of the Student Training Program is educational in nature and is designed to satisfy academic training requirements. The Student is not classified as an hourly employee during the practicum phase and is not entitled to wages, hourly compensation, or fee-for-service payment.\n\n**(B)** _Practicum Stipend_:  Upon successful completion of the practicum phase, the Student shall be eligible to receive a **one-time stipend of $500.00**, issued as recognition of participation and completion of practicum requirements. Receipt of the stipend is contingent upon satisfactory performance, compliance with supervision and documentation requirements, and completion of required practicum hours.\n\n**(C)** _Performance-Based Bonus_:  Students who achieve **50 or more approved billable credits** during the practicum phase, as the primary or face-to-face rendering provider where permitted, may be eligible for an additional **one-time performance bonus of $500.00**.  \nThis bonus is discretionary, non-guaranteed, and contingent upon supervision approval, documentation compliance, and program needs.\n\n**(D)** _No Incentivization or Expectation_:  The Practice does not encourage Students to pursue billable volume at the expense of academic obligations, supervision requirements, personal well-being, or quality of care. Neither the stipend nor the bonus constitutes wages, ongoing compensation, or an entitlement.\n\n**(E)** _End of Practicum Compensation_:  No compensation, stipend, or bonus shall accrue for services rendered after the official completion of the practicum phase and prior to the commencement of any internship phase, unless expressly approved in writing by the Practice.\n\n**(F)** _Transition to Studentship_:  Any transition from the practicum phase to an internship phase is not guaranteed and, if approved, shall be governed by a separate written addendum establishing the terms, conditions, and compensation structure applicable to the internship phase.\n\n**(G)** _Limitation_:  Compensation under this Section is limited solely to the stipends described above. Students are not eligible for wages, benefits, reimbursements, or other compensation during the practicum phase unless expressly stated in writing.",
    sort_hint: 50
  },
  {
    clause_key: "COMP_HOURLY_HANDBOOK",
    title: "Compensation",
    body_md: "**(A)** _Direct and Indirect Service Compensation Model_: The Practice will pay the {{ROLE_LABEL}} for approved direct and indirect services rendered in accordance with the compensation structure set forth below. Compensation under this subsection is contingent upon the timely and accurate completion of all required clinical documentation.\n\n**(B)** _Service Expectations and Measurement_: Service expectations and ongoing employment requirements are determined by the {{ROLE_LABEL}}’s ability to meet the minimum direct and indirect service credit or hour thresholds associated with the **{{JOB_TITLE}}** or equivalent role. Measurement is calculated over defined payroll periods or rolling averages, as described in the Workplace Handbook. Failure to meet such thresholds may result in review, adjustment of duties, or changes to compensation structure, but does not eliminate payment for approved services actually performed.\n\n**(C)** _Pay Structure and Schedule_: The compensation rate, salary, stipend, or credit value applicable to the {{ROLE_LABEL}} is determined by the compensation structure assigned to the **{{JOB_TITLE}}** and is set forth in the Workplace Handbook. Payment will be issued at regular intervals (currently bi-weekly) following the applicable pay period.\n\n**(D)** _Documentation and Eligibility_: Compensation is contingent upon the timely and accurate completion of required documentation, time tracking, and service reporting in accordance with Practice policies in the Workplace Handbook. Failure to comply may result in delayed payment until such requirements are satisfied.\n\n**(E)** _Modification of Compensation Model_: The Practice reserves the right, in its sole discretion, to modify, replace, or discontinue the direct and indirect service compensation model and to transition the {{ROLE_LABEL}} to a different compensation structure associated with the **{{JOB_TITLE}}** or equivalent role, as reflected in the Workplace Handbook. Any modification or transition of the compensation model shall not be deemed a termination, demotion, or breach of this Agreement.\n\n**(F)** _Limitation of Compensation_: Compensation under this Agreement is limited to the amounts and structures expressly described herein or, where applicable, as set forth in the Workplace Handbook. Compensation does not include benefits, reimbursements, or discretionary compensation, which—if any—are governed separately.\n\n**(G)** _Compensation Adjustments_: Compensation adjustments, including those related to credentialing, licensure, performance, or role changes, shall be made only by written addendum executed by both Parties.",
    sort_hint: 50
  },
  {
    clause_key: "COMP_HOURLY",
    title: "Compensation",
    body_md: "\"\"**(A)** _Direct and Indirect Service Compensation Model_: The {{ROLE_LABEL}} will be compensated under a direct and indirect service model currently utilized by the Practice. Approved direct services and approved indirect services are compensable at the rates set forth below. Compensation is contingent upon the timely and accurate completion of all required documentation and service reporting.\n\n_Direct Service Rate_: **$**{{Direct_Rate}}**** per hour (or per credit, as applicable)\n_Indirect Service Rate_: **${{INDIRECT_RATE}}** per hour (or per credit, as applicable)\n\n**(B)** _Approved Services and Tracking_: Only direct and indirect services expressly approved by the Practice and performed in accordance with Practice policies are eligible for compensation. The definitions, scope, and limitations of compensable direct and indirect services are governed by the {{COMPANY_NAME}} Workplace Handbook and applicable policies, as amended from time to time.\n\n**(C)** _Pay Schedule_: Payment will be issued at regular intervals (currently bi-weekly) for approved and documented services performed during the applicable pay period.\n\n**(D)** _No Guarantee of Hours or Assignments_: Nothing in this Agreement guarantees a minimum number of hours, credits, clients, assignments, or compensation. Work availability may fluctuate based on program needs, school schedules, client demand, funding, and operational considerations.\n\n**(E)** _Modification or Transition of Compensation Model_: The Practice reserves the right, in its sole discretion, to modify, replace, adjust, or discontinue the direct and indirect service compensation model and/or the rates set forth herein at any time. In the event the model is modified or discontinued, the {{ROLE_LABEL}}’s compensation shall transition to the compensation structure associated with the **{{JOB_TITLE}}** or equivalent role, as defined in the {{COMPANY_NAME}} Workplace Handbook and applicable compensation policies in effect at that time.\n\nAny modification or transition of the compensation model shall not be deemed a termination, demotion, or breach of this Agreement.\n\n**(F)** _Limitation of Compensation_: Compensation under this Agreement is limited to the rates and structures expressly described herein or, upon transition, to the compensation applicable to the **{{JOB_TITLE}}** as set forth in the Workplace Handbook. Compensation does not include benefits, reimbursements, or discretionary compensation, which—if any—are governed separately.\n\n**(G)** _Compensation Adjustments_: Compensation adjustments, including those related to credentialing, licensure, performance, or role changes, shall be made only by written addendum executed by both Parties.",
    sort_hint: 50
  },
  {
    clause_key: "COMP_JACQUE",
    title: "Compensation",
    body_md: "**(A)** _Salary and Role Requirements_: The {{ROLE_LABEL}} shall receive an annual base salary of **$40,000.00**, paid in bi-weekly installments less applicable federal and state withholdings. This salary covers a **40-hour work week** comprised of:\n* Direct client services (individual counseling, skill development, group sessions); and\n* Administrative, operational, and leadership duties associated with the Operations Assistant role.\n\n**(B)** _Availability and Service Focus_: The {{ROLE_LABEL}} is required to maintain **thirty (30) hours per week** of availability for direct client care. The {{ROLE_LABEL}} is expected to schedule the majority of direct service via the **H0004** service code and manage additional duties during cancellations or outside of clinical hours.\n\n**(C)** _Performance Bonus_: The {{ROLE_LABEL}} is eligible for a performance bonus based on direct service productivity:\n* _Threshold_: Direct service credits submitted in excess of **twenty-four (24) credits per pay period** shall be compensated at a bonus rate of **$8.00 per excess credit**, payable on the subsequent payroll cycle.\n* _H0004 Accelerator_: Once a minimum of **twenty-four (24) H0004 credits** has been met in a single pay period, each additional H0004 credit will be calculated at **1.5 credits** for bonus calculation purposes.\n\n**(D)** _Paid Time Off (PTO)_: The {{ROLE_LABEL}} is entitled to **two (2) weeks (10 business days)** of paid vacation per year. Vacation requests must be submitted in writing and approved in advance by the Practice. Unused vacation days do not carry over to the following year and are forfeited if not used.\n\n**(E)** _Documentation and Compliance_: All medical documentation must be submitted on the **same day** the service is rendered. Notes submitted after **Sunday at 11:59 PM** following the end of the pay period are considered late and may result in disciplinary action or delayed payment. The Practice reserves the right to audit submissions to verify compliance and appropriate code usage.\n\n**(F)** _Credit Accumulation and Service Codes_:\n* _Credit Definition_: For approved Medicaid clients, one (1) credit is earned per hour of service. For code **H2014**, one (1) credit per hour is awarded **per client**.\n* _Approved Codes_: Direct services eligible for credit accumulation include: **97535, H0004, H0023, H0025, H0031, H0032, H2014, H2021, H2022, H2033, S9454, and T1017**.",
    sort_hint: 50
  },
  {
    clause_key: "SUP_COMP",
    title: "Supervision Services Compensation",
    body_md: "**(A)** _Optional Supervision Services_:  In addition to the {{ROLE_LABEL}}’s primary role, the Practice may, at its discretion, offer the {{ROLE_LABEL}} the opportunity to provide approved supervision services (“Supervision Services”). Supervision Services are **not guaranteed**, are **not an entitlement**, and are subject to eligibility, assignment, and continuation as set forth in the {{COMPANY_NAME}} Workplace Handbook.\n\n**(B)** _Approved Supervision Services_:  Only supervision services expressly approved by the Practice and performed in accordance with Practice policies are eligible for compensation. Approved Supervision Services are limited to individual or triadic supervision sessions and supervision-related administrative activities associated with supervisee documentation review and note signing, as defined in the Workplace Handbook.\n\n**(C)** _Supervision Compensation Rates_:  When authorized and properly documented, Supervision Services are compensable at the following rates:\n\n_Individual / Triadic Supervision_: **$65.00** per hour  \n_Supervision-Related Administrative Time (Note Signing Only)_: **$32.50** per hour\n\nAdministrative compensation applies solely to time spent reviewing and signing supervisee documentation and does not include general administrative duties, meetings, or training unless expressly approved in writing.\n\n**(D)** _Documentation and Pay Schedule_:  All Supervision Services must be accurately documented in accordance with Practice supervision, timekeeping, and EHR policies. Payment will be issued at regular intervals (currently bi-weekly) for approved and documented Supervision Services performed during the applicable pay period.\n\n**(E)** _No Guarantee of Hours or Continuation_:  Nothing in this Agreement guarantees supervision hours, supervisees, assignments, or supervision-related compensation. Supervision Services may be modified, suspended, or discontinued at any time based on Practice needs, compliance considerations, or operational requirements.\n\n**(F)** _Independent of Base Role Compensation_:  Compensation for Supervision Services is separate from and in addition to the {{ROLE_LABEL}}’s compensation for services performed under their primary role. Removal or expiration of Supervision Services shall not be deemed a termination, demotion, reduction in base compensation, or breach of this Agreement.",
    sort_hint: 50
  },
  {
    clause_key: "BENEFITS",
    title: "Benefits and Reimbursements",
    body_md: "**(A)** _Eligibility for Benefits_: The {{ROLE_LABEL}} may be eligible to participate in certain Practice-sponsored benefits, reimbursements, and discretionary compensation programs, subject to eligibility requirements and conditions established by the Practice.\n\n**(B)** _Governing Policies_: All benefits, reimbursements, and discretionary compensation—including but not limited to health insurance contributions, supervision, childcare assistance, retirement plans, paid time off, continuing education, mileage reimbursement, flexible scheduling, and similar programs—are governed exclusively by the Practice’s Workplace Handbook and applicable policies, as amended from time to time.\n\n**(C)** _Benefit Tier Framework_: Eligibility for benefits is determined under the Practice’s Benefit Tier Framework and may vary based on factors including, but not limited to, service credits, role classification, program assignment, compliance status, and operational needs. Not all employees are eligible for all benefits, and benefits may differ among employees performing similar roles.\n\n**(D)** _No Guaranteed or Vested Benefits_: The Practice reserves the right, in its sole discretion, to modify, suspend, replace, or discontinue any benefit, reimbursement, or related policy at any time, with or without notice, subject to applicable law. No benefit described in the Workplace Handbook or otherwise referenced constitutes guaranteed compensation or a vested right.",
    sort_hint: 60
  },
  {
    clause_key: "BEN_INTERN",
    title: "Benefits Eligibility",
    body_md: "**(A)** _Ineligibility for Benefits_: Students are not eligible to participate in Practice-sponsored benefits, reimbursements, or discretionary compensation programs, including but not limited to health insurance contributions, retirement plans, childcare assistance, paid time off, mileage reimbursement, or other Tier-based benefits, unless expressly stated in writing in this Agreement.\n\n**(B)** _Student Compensation and Program Scope_: Student compensation, stipends, supervision, training, and educational support—if any—are governed solely by the terms of this Agreement and applicable internship policies. Participation in the internship program does not create eligibility for benefits available to employees or providers.\n\n**(C)** _Discretionary Mileage Reimbursement_: Students may receive limited mileage reimbursement only if expressly approved in writing by the Practice and subject to program-specific policies. Such reimbursement is discretionary and does not create ongoing eligibility.",
    sort_hint: 60
  },
  {
    clause_key: "POLICIES",
    title: "Policies and Handbook",
    body_md: "**(A)** _Workplace Handbook_: The {{ROLE_LABEL}} agrees to abide by all policies, procedures, and rules set forth in the {{COMPANY_NAME}} Workplace Handbook, as amended from time to time. The Handbook is incorporated into this Agreement by reference.\n\n**(B)** _Confidentiality_: The {{ROLE_LABEL}} acknowledges their duty to protect the privacy of clients and the proprietary information of the Practice as detailed in the \"\"Confidentiality and Privacy\"\" section of the Workplace Handbook. Violation of these policies may result in immediate termination and legal action.\n\n**(C)** _HIPAA_: The {{ROLE_LABEL}} agrees to adhere to the highest standards of HIPAA compliance.",
    sort_hint: 70
  },
  {
    clause_key: "DISC_CONF",
    title: "Confidentiality, Ownership of Records, and Protection of Practice Material",
    body_md: "**(A)** _Confidentiality and Ownership of Practice Materials_: All records, client lists, client information, clinical notes, treatment plans, documentation, reports, training materials, workflows, templates, internal tools, policies, procedures, and other work product created, accessed, or maintained by the {{ROLE_LABEL}} during the term of this Agreement, whether in paper, electronic, or other form, are and shall remain the sole and exclusive property of the Practice.\n\nThe {{ROLE_LABEL}} acknowledges that all such materials constitute Confidential Information and, in some cases, Protected Health Information (PHI), and agrees that no ownership, license, or right to use such materials is granted except as expressly authorized for the performance of duties under this Agreement.\n\n**(B)** _Use and Disclosure Restrictions_: During the term of this Agreement and for a period of two (2) years following termination, whether voluntary or involuntary, the {{ROLE_LABEL}} shall not use, disclose, copy, remove, retain, transmit, or otherwise exploit any Confidential Information or Practice property for any unauthorized purpose or for the benefit of any third party, except as required to perform duties under this Agreement or as expressly authorized in writing by the Practice.\n\n**(C)** _Return and Non-Retention of Materials_: Upon termination of this Agreement for any reason, the {{ROLE_LABEL}} shall immediately return to the Practice all Practice property and Confidential Information in their possession or control, including physical documents, electronic files, credentials, access devices, and stored data. The {{ROLE_LABEL}} expressly agrees not to retain, download, summarize, or preserve copies of any client records, internal documents, or Confidential Information in any form, regardless of whether such materials were personally created or believed to be necessary for future reference.\n\n**(D)** _Required Legal Disclosure_: If disclosure of Confidential Information is required by law, regulation, or court order, the {{ROLE_LABEL}} shall provide prompt written notice to the Practice, unless legally prohibited, to allow the Practice an opportunity to seek a protective order or other appropriate remedy.\n\n**(E)** _Survival_: The obligations set forth in this section shall survive the termination or expiration of this Agreement.",
    sort_hint: 70
  },
  {
    clause_key: "DUTY",
    title: "Duty of Loyalty",
    body_md: "During the term of engagement, the {{ROLE_LABEL}} owes a duty of loyalty to the Practice and agrees to act in the Practice’s best interests while performing services. The {{ROLE_LABEL}} shall not engage in activities that materially conflict with the Practice’s interests, interfere with assigned duties, or undermine the Practice’s relationships, operations, or programs.\n\nAbsent prior written approval from the Practice, the {{ROLE_LABEL}} shall not provide competing services in a manner that directly conflicts with their role, assigned Service Focus, or obligations to the Practice, including activities that would impair client continuity, program integrity, or operational stability.",
    sort_hint: 70
  },
  {
    clause_key: "CONFLICT",
    title: "Conflict of Interest",
    body_md: "The {{ROLE_LABEL}} agrees to avoid any actual or perceived conflicts of interest that could reasonably be expected to interfere with their professional judgment or obligations to the Practice. The {{ROLE_LABEL}} shall not engage in conduct intended to divert, solicit, or redirect current, former, or prospective clients, referral sources, or business opportunities away from the Practice for personal benefit or the benefit of another entity without the Practice’s express written consent.\n\nAny potential conflict of interest must be promptly disclosed to the Practice for review and determination.",
    sort_hint: 70
  },
  {
    clause_key: "RET_REF",
    title: "Client Retention and Referral",
    body_md: "Upon notice of termination initiated by either Party, the Practice retains the right to make reasonable efforts to retain all active clients. For clients who have completed six (6) or more sessions and request an external referral, the {{ROLE_LABEL}} may disclose their future practice location or services, consistent with ethical standards and client autonomy.\n\nFor clients with fewer than six (6) completed sessions, the {{ROLE_LABEL}} agrees to encourage continuity of care within the Practice, unless an external referral is ethically required. Any intent to solicit or transition such clients outside the Practice must be discussed with and approved by Practice administration in advance.",
    sort_hint: 70
  },
  {
    clause_key: "NON_SOLICIT",
    title: "Non-Solicitation",
    body_md: "During the term of engagement and for a period of two (2) years following termination, the {{ROLE_LABEL}} shall not directly or indirectly solicit, recruit, or induce any employee, contractor, or facilitator of the Practice to terminate or alter their relationship with the Practice, nor assist any third party in doing so.\n\nThis provision is intended to protect the Practice’s workforce stability and does not prohibit general advertising or employment inquiries not specifically targeted at Practice personnel.",
    sort_hint: 70
  },
  {
    clause_key: "LEGALESE",
    title: "Legal Provisions and Remedies",
    body_md: "**(A)** _Governing Law and Venue_: This Agreement shall be governed by and construed in accordance with the laws of the State of Colorado. Each Party expressly consents to the exclusive personal jurisdiction and venue of the state and federal courts located in Colorado for any legal action arising out of this Agreement.\n\n**(B)** _Recovery of Costs and Fees_: In the event of any legal action, arbitration, or other proceeding necessary to enforce or interpret the terms of this Agreement, the prevailing Party shall be entitled to recover reasonable costs and attorneys' fees in addition to any other relief awarded.\n\n**(C)** _Recoupment and Deficient Services_: The Practice reserves the right to withhold or recoup compensation previously paid to the {{ROLE_LABEL}} for Services that are later determined to be deficient, unbillable, or unreimbursed due to the {{ROLE_LABEL}}’s actions or omissions, provided such determination is consistent with applicable law.\n\nDeficient Services may include, but are not limited to, circumstances in which the Practice determines that:\n\n    **(i)** the {{ROLE_LABEL}} failed to provide the Services for which compensation was issued;\n    **(ii)** the {{ROLE_LABEL}} failed to complete required clinical documentation in accordance with the\n                {{COMPANY_NAME}} Workplace Handbook, including the Same-Day Documentation and \n                correction or resubmission requirements;\n   **(iii)** the {{ROLE_LABEL}} failed or refused, after notice, to correct, amend, or resubmit documentation\n                 or service codes reasonably requested to support billing or compliance; or\n   **(iv)** a third-party payor recoups, retracts, or denies payment as a direct result of inadequate\n                 services, documentation, coding, or noncompliance attributable to the {{ROLE_LABEL}}.\n\nWhere practicable, the Practice will provide notice of the deficiency and a reasonable opportunity to cure prior to recoupment. Compensation subject to recoupment shall be limited to amounts paid for the deficient Services and shall not be deemed earned compensation under this Agreement.\n\n**(D)** _Mediation_: Prior to the initiation of any lawsuit (except for actions seeking injunctive relief), the Parties agree to attempt to resolve disputes through mediation. The costs of such mediation shall be split equally between the Parties.\n\n**(E)** _Entire Agreement_: This Agreement, including any exhibits and the Handbook (incorporated by reference), constitutes the entire agreement between the Parties and supersedes all prior agreements or understandings, whether written or oral. No modification to this Agreement shall be binding unless in writing and signed by both Parties.\n\n**(F)** _Severability_: If any provision of this Agreement is held to be unenforceable, such provision shall be modified to the extent necessary to render it enforceable, and the remaining provisions shall remain in full force and effect.\n\n**(G)** _Survival_: The provisions of this Agreement which by their nature should survive termination—including, but not limited to, confidentiality obligations, documentation requirements, recoupment and deficient services provisions, dispute resolution, and any payment or reimbursement obligations—shall survive the termination or expiration of this Agreement.",
    sort_hint: 80
  },
  {
    clause_key: "SIG_BLOCK",
    title: "",
    body_md: "<<PAGE_BREAK>>By signing below, the {{ROLE_LABEL}} acknowledges that they have received, reviewed, and fully understood this Agreement in its entirety, including all sections incorporated herein by reference, such as the {{COMPANY_NAME}} Workplace Handbook and applicable compensation policies, as amended from time to time.\n\nThe {{ROLE_LABEL}} further acknowledges that compensation, duties, service expectations, and operational requirements applicable to their Job Title, **{{JOB_TITLE}}**, and assigned Service Focus, **{{SERVICE_FOCUS}}**, are governed by this Agreement, the Workplace Handbook, and any written addenda executed by the Parties. No separate appendix or protocol shall be deemed part of this Agreement unless expressly stated in writing.\n\nThe {{ROLE_LABEL}} affirms that any questions regarding this Agreement have been discussed with and satisfactorily answered by a representative of the Practice prior to execution. Except as modified by written addendum, this Agreement constitutes the complete and controlling agreement between the Parties and supersedes all prior discussions, representations, or understandings.\n\nThis Agreement becomes legally binding upon execution and remains in effect in accordance with its terms unless amended or terminated as provided herein.\n\n**_Validity of Offer_**: This Agreement constitutes an offer of employment. If this Agreement is not signed and returned to the Practice by **{{EXPIRATION_DATE}}**, the offer shall automatically expire and be deemed withdrawn. Any subsequent employment or engagement after expiration shall require a new written agreement, which may contain different terms and shall be subject to the Practice’s sole discretion.\n\n**IN WITNESS WHEREOF**, the Parties, intending to be legally bound, have executed this Agreement as of **{{EXECUTION_DATE}}**.\n\n**{{COMPANY_NAME}}**  \nBy: ___________________________  \nName: _________________________  \nTitle: _________________________  \nDate: _________________________  \n\n**{{CANDIDATE_NAME}}**  \nSignature: _____________________  \nDate: _________________________",
    sort_hint: 90
  },
  {
    clause_key: "COMP_ADJ_ADDENDUM",
    title: "",
    body_md: "This Compensation and Role Adjustment Addendum (the _“Addendum”_) is entered into as of **{{EFFECTIVE_DATE}}** (the _“Effective Date”_) and amends and supplements the Employment Agreement dated **{{ORIGINAL_AGREEMENT_DATE}}** (the _“Original Agreement”_), previously entered into by and between **{{COMPANY_NAME}}** (the _“Practice”_) and **{{CANDIDATE_NAME}}** (the _“{{ROLE_LABEL}}”_). The Practice and the {{ROLE_LABEL}} may be referred to individually as a _“Party”_ and collectively as the _“Parties.”_\n\n**(A)** _Purpose of Addendum_:  This Addendum is issued to reflect an approved adjustment to the {{ROLE_LABEL}}’s compensation and/or role status based on **{{ADJUSTMENT_REASON}}**, which may include credentialing completion, licensure acquisition, performance-based increase, market adjustment, or other Practice-approved considerations.\n\n**(B)** _Updated Compensation_:  Effective **{{EFFECTIVE_DATE}}**, the {{ROLE_LABEL}}’s compensation shall be adjusted as follows:\n\n_Direct Service Rate_: **$**{{Direct_Rate}}****  \n_Indirect Service Rate_: **${{INDIRECT_RATE}}**\n\nAll other aspects of compensation not expressly modified herein remain unchanged.\n\n**(C)** _Role or Tier Adjustment (If Applicable)_:  As of the Effective Date above, the {{ROLE_LABEL}}’s Job Title and/or Tier classification is updated to **{{JOB_TITLE}}**, with a Service Focus of **{{SERVICE_FOCUS}}**, as reflected in the **{{COMPANY_NAME}} Workplace Handbook**.\n\n**(D)** _No Other Modifications_:  Except as expressly modified by this Addendum, all terms, covenants, and conditions of the Original Agreement remain in full force and effect.\n\n**(E)** _No Guarantee of Future Adjustments_:  This Addendum does not guarantee future compensation increases, role changes, or continued employment.\n\nThis Addendum is incorporated into and made part of the Original Agreement.\n\n<<PAGE_BREAK>>By signing this Addendum, the {{ROLE_LABEL}} acknowledges that they have read, understood, and agreed to the amendments and clarifications set forth herein, including any changes to duties, compensation, or applicable terms. The {{ROLE_LABEL}} affirms that any questions related to this Addendum have been discussed and resolved to their satisfaction. Except as expressly amended by this Addendum, all terms, covenants, and conditions of the Original Agreement remain in full force and effect.\n\n**IN WITNESS WHEREOF**, the Parties, intending to be legally bound, have executed this Addendum as of **{{EXECUTION_DATE}}**.\n\n**{{COMPANY_NAME}}**  \nBy: ___________________________  \nName: _________________________  \nTitle: _________________________  \nDate: _________________________  \n\n**{{CANDIDATE_NAME}}**  \nSignature: _____________________  \nDate: _________________________",
    sort_hint: 50
  },
  {
    clause_key: "JOB_DESC_ACK_ADDENDUM",
    title: "",
    body_md: "This Job Description Acknowledgment Addendum (the _“Addendum”_) is entered into as of **{{EFFECTIVE_DATE}}** (the _“Effective Date”_) and amends and supplements the Employment Agreement or engagement previously entered into by and between **{{COMPANY_NAME}}** (the _“Practice”_) and **{{CANDIDATE_NAME}}** (the _“{{ROLE_LABEL}}”_). The Practice and the {{ROLE_LABEL}} may be referred to individually as a _“Party”_ and collectively as the _“Parties.”_\n\n**(A)** _Purpose_: This Addendum confirms the {{ROLE_LABEL}}’s current position of **{{JOB_TITLE}}** with Service Focus **{{SERVICE_FOCUS}}** and incorporates the Job Description duties set forth in the following section, which govern the {{ROLE_LABEL}}’s role as of the Effective Date.\n\n**(B)** _Acknowledgment of Job Description_: By signing below, the {{ROLE_LABEL}} acknowledges that they have received, reviewed, and **agree to the Job Description** duties incorporated herein, including any updates reflected in this Addendum effective **{{EFFECTIVE_DATE}}**. The {{ROLE_LABEL}} affirms that any questions regarding these duties have been discussed with and satisfactorily answered by a representative of the Practice prior to execution.\n\n**(C)** _No Other Modifications_: Except as expressly set forth in this Addendum and the incorporated Job Description, all terms, covenants, and conditions of the prior Employment Agreement or engagement remain in full force and effect.\n\n**(D)** _Continuing Effect_: The Job Description may be updated from time to time in accordance with Practice policies; material changes requiring re-acknowledgment will be communicated in writing.",
    sort_hint: 48
  },
  {
    clause_key: "INTERN_ADDENDUM_FFS",
    title: "",
    body_md: "This Student Training Agreement Addendum (the _“Addendum”_) is made as of **{{EXECUTION_DATE}}** (the _“Addendum Date”_) and amends and supplements the Student Training Agreement dated **{{ORIGINAL_AGREEMENT_DATE}}** (the _“Original Agreement”_), by and between **{{COMPANY_NAME}}** (the _“Practice”_) and **{{CANDIDATE_NAME}}** (the _“Student”_), collectively referred to as the _“Parties.”_\n\n**WHEREAS**, under the Original Agreement, the Student participated in the practicum phase of the Practice’s Student Training Program;\n\n**WHEREAS**, the Student has successfully completed practicum requirements and, subject to continued compliance and supervision, the Practice has approved the Student’s transition to the internship phase;\n\n**WHEREAS**, the Parties desire to set forth the terms governing the Student’s internship phase, including compensation under a fee-for-service model;\n\nNOW, THEREFORE, in consideration of the mutual covenants herein, the Parties agree as follows:\n\n**(A)** _Studentship Phase Term_:  The internship phase shall commence on **{{START_DATE}}** and continue until the earlier of (i) completion of internship requirements, (ii) termination pursuant to the Original Agreement, or (iii) **{{INTERNSHIP_END_DATE}}**, unless otherwise extended in writing.\n\n**(B)** _Fee-For-Service Compensation_:  The Practice shall compensate the Student for approved services rendered during the internship phase in accordance with the fee schedule set forth below. Compensation is contingent upon the timely, accurate, and compliant completion of all required clinical documentation.",
    sort_hint: 50
  },
  {
    clause_key: "FFS_TABLE_INTERN",
    title: "Compensation Table",
    body_md: "{{INSERT_PAY_TABLE}}",
    sort_hint: 50
  },
  {
    clause_key: "FFS_TABLE2_INTERN",
    title: "",
    body_md: "\n+ Compensation for services under this code is payable only when the client is a member of Health First Colorado (Colorado Medicaid) or is billed under an approved self-pay arrangement. Services that are not billable to a third-party payor or self-pay are not eligible for compensation. Students are responsible for confirming client eligibility prior to service delivery.\n++Compensation for group services applies only to the primary rendering provider. Participation of a co-facilitator does not increase compensation or credits unless expressly approved in writing by the Practice. Credits are earned based on session duration, not number of attendees.\n+++ Students compensated for OUTREACH services are not eligible for additional compensation under H0023 for the same activity. H0023 is compensable only when performed outside of assigned outreach activities.",
    sort_hint: 50
  },
  {
    clause_key: "FFS_INTERN_ADDITIONAL",
    title: "",
    body_md: "**(C)** _Collections_: The Parties acknowledge that the Practice retains the exclusive right to bill and collect all fees for services rendered. All revenue generated by the Student belongs to the Practice except for the compensation expressly described in subsection (B).\n\n**(D)** _Pay Schedule_: Payment shall be issued at regular intervals (currently bi-weekly) in the pay period following the completion of services and required documentation.\n\n**(E)** _Transition from Fee-For-Service_: The Practice reserves the right, in its sole discretion, to modify, replace, or discontinue the fee-for-service compensation model at any time. In the event the model is discontinued, the Student’s compensation shall automatically transition to the compensation structure associated with the applicable role or equivalent position as defined in the **{{COMPANY_NAME}} Workplace Handbook**, as amended from time to time. Any such transition shall not constitute a termination, demotion, or breach of the Original Agreement or this Addendum.\n\n**(F)** _No Guarantee of Hours or Earnings_: Nothing in this Addendum guarantees a minimum number of hours, credits, clients, assignments, or compensation, except those for which {{COMPANY_NAME}} is contractually bound with the Student's University.\n\n**(G)** _Limitation of Compensation_: Compensation under this Addendum is limited to the amounts expressly described herein. The Student is not eligible for employee benefits, reimbursements, or discretionary compensation unless expressly stated in writing.\n\n**(H)** _Services Not Listed in Pay Table_: Any approved service, activity, or work performed by the {{ROLE_LABEL}} that is not expressly listed in the fee schedule above shall be compensated, if compensable, in accordance with the hourly direct or indirect service rate associated with the **{{JOB_TITLE}}** (or equivalent role) as set forth in the {{COMPANY_NAME}} Workplace Handbook, as amended from time to time. No compensation is owed for services not approved, not documented, or not compensable under Practice policy.\n\n**(I)** _Performance-Based Studentship Bonus_: During the internship phase, the Student may be eligible for a performance-based bonus tied to billable productivity. Eligibility is assessed using a **two-week average of approved billable credits earned during any pay period**.\n\nCredits earned **in excess of twenty (20) credits per billable week** (forty (40) credits per bi-weekly pay period) shall accrue an additional **$7.00 per excess credit**, issued as a discretionary bonus.\n\n**Example**: If an Student renders thirteen (13) 90832 sessions, twenty-nine (29) 90837 sessions, and twelve (12) 90834 sessions during a bi-weekly pay period, resulting in **44.5 total credits**, the Student exceeds the forty (40)-credit threshold by **4.5 credits** and would earn an additional **$31.50** for that pay period.\n\n**(J)** _Bonus Conditions and Limitations_: The internship bonus is **discretionary**, **non-guaranteed**, and contingent upon accurate and timely documentation, compliance with supervision and program requirements, and services being approved, billable, and properly submitted. The Practice reserves the right to withhold, adjust, or deny bonus payment if services are later deemed non-billable, incomplete, deficient, or subject to recoupment by a third-party payor.\n\n**(K)** _No Guarantee or Wage Classification_: The internship bonus does not constitute wages, salary, or guaranteed compensation and does not alter the Student’s classification or compensation structure. Eligibility for any bonus does not create an expectation of continued assignment, hours, or future compensation.\n\n**(L)** _Continuing Effect_: Except as expressly modified by this Addendum, all terms and conditions of the Original Agreement remain in full force and effect.\n\nThis Addendum is incorporated into and made part of the Original Agreement.\n\n<<PAGE_BREAK>>By signing this Addendum, the {{ROLE_LABEL}} acknowledges that they have read, understood, and agreed to the amendments and clarifications set forth herein, including any changes to duties, compensation, or applicable terms. The {{ROLE_LABEL}} affirms that any questions related to this Addendum have been discussed and resolved to their satisfaction. Except as expressly amended by this Addendum, all terms, covenants, and conditions of the Original Agreement remain in full force and effect.\n\n**IN WITNESS WHEREOF**, the Parties, intending to be legally bound, have executed this Addendum as of **{{EXECUTION_DATE}}**.\n\n**{{COMPANY_NAME}}**  \nBy: ___________________________  \nName: _________________________  \nTitle: _________________________  \nDate: _________________________  \n\n**{{CANDIDATE_NAME}}**  \nSignature: _____________________  \nDate: _________________________",
    sort_hint: 50
  },
  {
    clause_key: "INTERN_ADDENDUM_HOURLY",
    title: "",
    body_md: "This Student Training Agreement Addendum (the _“Addendum”_) is made as of **{{EXECUTION_DATE}}** (the _“Addendum Date”_) and amends and supplements the Student Training Agreement dated **{{ORIGINAL_AGREEMENT_DATE}}** (the _“Original Agreement”_), by and between **{{COMPANY_NAME}}** (the _“Practice”_) and **{{CANDIDATE_NAME}}** (the _“Student”_), collectively referred to as the _“Parties.”_\n\n**WHEREAS**, under the Original Agreement, the Student participated in the practicum phase of the Practice’s Student Training Program;\n\n**WHEREAS**, the Student has successfully completed practicum requirements and, subject to continued compliance and supervision, the Practice has approved the Student’s transition to the internship phase;\n\n**WHEREAS**, the Parties desire to set forth the terms governing the Student’s internship phase, including compensation under a direct and indirect service model;\n\nNOW, THEREFORE, in consideration of the mutual covenants herein, the Parties agree as follows:\n\n**(A)** _Studentship Phase Term_: The internship phase shall commence on **{{START_DATE}}** and continue until the earlier of (i) completion of internship requirements, (ii) termination pursuant to the Original Agreement, or (iii) **{{INTERNSHIP_END_DATE}}**, unless otherwise extended in writing.\n\n**(B)** _Direct and Indirect Service Compensation_: The Practice shall compensate the Student for approved direct and indirect services rendered during the internship phase in accordance with the compensation structure, rates, definitions, scope, and limitations set forth in the **{{COMPANY_NAME}} Workplace Handbook**, as amended from time to time. No compensation rates are established by this Addendum.\n\n**(C)** _Documentation and Eligibility_: Compensation eligibility is contingent upon the timely, accurate, and compliant completion of all required clinical documentation, time tracking, and service reporting in accordance with Practice policies, billing requirements, and supervision standards.\n\n**(D)** _Pay Schedule_: Payment shall be issued at regular intervals (currently bi-weekly) in the pay period following the completion of approved services and required documentation.\n\n**(E)** _Modification of Compensation Model_: The Practice reserves the right, in its sole discretion, to modify, replace, or discontinue the direct and indirect service compensation model at any time, as reflected in the **{{COMPANY_NAME}} Workplace Handbook**, as amended from time to time. Any such modification shall not constitute a termination, demotion, or breach of the Original Agreement or this Addendum.\n\n**(F)** _No Guarantee of Hours or Earnings_: Nothing in this Addendum guarantees a minimum number of hours, credits, clients, assignments, or compensation, except those for which **{{COMPANY_NAME}}** is contractually bound with the Student’s academic institution.\n\n**(G)** _Limitation of Compensation_: Compensation under this Addendum is limited to the amounts and structures expressly authorized by the Workplace Handbook. The Student is not eligible for employee benefits, reimbursements, or discretionary compensation unless expressly stated in writing.\n\n**(H)** _Performance-Based Studentship Bonus_: During the internship phase, the Student may be eligible for a performance-based bonus tied to billable productivity. Eligibility is assessed using a **two-week average of approved billable credits earned during any pay period**.\n\nCredits earned **in excess of twenty (20) credits per billable week** (forty (40) credits per bi-weekly pay period) shall accrue an additional **$7.00 per excess credit**, issued as a discretionary bonus.\n\n**Example**: If a Student renders thirteen (13) 90832 sessions, twenty-nine (29) 90837 sessions, and twelve (12) 90834 sessions during a bi-weekly pay period, resulting in **44.5 total credits**, the Student exceeds the forty (40)-credit threshold by **4.5 credits** and would earn an additional **$31.50** for that pay period.\n\n**(I)** _Bonus Conditions and Limitations_: The internship bonus is discretionary, non-guaranteed, and contingent upon accurate and timely documentation, supervision approval, compliance with billing and program requirements, and services being approved, billable, and properly submitted. The Practice reserves the right to withhold, adjust, or deny bonus payment if services are later deemed non-billable, deficient, incomplete, or subject to recoupment by a third-party payor.\n\n**(J)** _No Wage Classification or Entitlement_: The internship bonus does not constitute wages, salary, or guaranteed compensation and does not alter the Student’s classification, role, or compensation structure. Eligibility for a bonus does not create an expectation of continued assignments, hours, or future compensation.\n\n**(K)** _Continuing Effect_: Except as expressly modified by this Addendum, all terms and conditions of the Original Agreement remain in full force and effect.\n\nThis Addendum is incorporated into and made part of the Original Agreement.\n\n<<PAGE_BREAK>>By signing this Addendum, the {{ROLE_LABEL}} acknowledges that they have read, understood, and agreed to the amendments and clarifications set forth herein, including any changes to duties, compensation, or applicable terms. The {{ROLE_LABEL}} affirms that any questions related to this Addendum have been discussed and resolved to their satisfaction. Except as expressly amended by this Addendum, all terms, covenants, and conditions of the Original Agreement remain in full force and effect.\n\n**IN WITNESS WHEREOF**, the Parties, intending to be legally bound, have executed this Addendum as of **{{EXECUTION_DATE}}**.\n\n**{{COMPANY_NAME}}**  \nBy: ___________________________  \nName: _________________________  \nTitle: _________________________  \nDate: _________________________  \n\n**{{CANDIDATE_NAME}}**  \nSignature: _____________________  \nDate: _________________________",
    sort_hint: 50
  },
  {
    clause_key: "MULTI",
    title: "Multi-Entity Assignment and Shared Workforce Status",
    body_md: "**(A)** _Affiliated Organizations_: The {{COMPANY_NAME}} operates as part of The Mental Range Collective, which includes affiliated organizations such as ITSCO, LLC; Next Level Up, LLC; The Inner Strength Institute; MH4kidz; and PlotTwistCo (collectively, the _“Affiliated Organizations”_).\n\n**(B)** _Authorized Multi-Entity Assignment_: Subject to Practice approval, the {{ROLE_LABEL}} may be assigned to perform services, duties, or operational responsibilities for one or more Affiliated Organizations. Such assignments may include similar or related services consistent with the {{ROLE_LABEL}}’s Job Title, Level, Service Focus, credentials, and scope of practice.\n\nAssignment to work for multiple Affiliated Organizations is discretionary, not guaranteed, and may be modified or discontinued at any time.\n\n**(C)** _Shared Workforce and Confidentiality Obligations_: When performing services for any Affiliated Organization, the Provider shall be deemed a member of the shared workforce for purposes of HIPAA and applicable organizational compliance requirements. “Confidential Information” includes, without limitation, client or patient information (including Protected Health Information in any form) and any business, operational, or financial information obtained through an Affiliated Organization.\n\nThe Provider shall access Confidential Information only to the extent necessary to perform assigned duties for the applicable Affiliated Organization. The Provider shall not access, use, or disclose Confidential Information of one Affiliated Organization for the benefit of another unless expressly authorized and permitted by law. Confidential Information shall not be removed, disclosed, or discussed outside authorized systems or settings. The Provider shall promptly report any suspected privacy or security incident to the appropriate supervisor or privacy officer.\n\nThese confidentiality obligations shall survive termination of employment or engagement with any Affiliated Organization.\n\n**(D)** _Compensation and Timekeeping_: Compensation for services performed for any Affiliated Organization shall be governed by this Agreement, the applicable compensation structure (fee-for-service, hourly, salary, or supplemental), and the {{COMPANY_NAME}} Workplace Handbook.\n\nThe {{ROLE_LABEL}} is responsible for accurately documenting time, services, and assignments in accordance with Practice policies, including correct attribution to the applicable Affiliated Organization.\n\n**(E)** _No Guarantee of Cross-Entity Work_: Nothing in this section guarantees assignment, hours, compensation, or continued work with any Affiliated Organization.\n\n**(F)** _Disciplinary Action_: Unauthorized access, use, or disclosure of Confidential Information may result in disciplinary action, up to and including termination, and may carry civil or criminal penalties under applicable law.",
    sort_hint: 70
  },
  {
    clause_key: "Management_Intro",
    title: "",
    body_md: "This Management Agreement (the _“Agreement”_) is made and entered into as of **{{EXECUTION_DATE}}** (the _“Execution Date”_) by and between **{{MANAGER_NAME}}**, a **{{MANAGER_ENTITY_TYPE}}** with a principal place of business at **{{MANAGER_ADDRESS}}** (the _“Manager”_), and **{{CLIENT_NAME}}**, a **{{CLIENT_ENTITY_TYPE}}** with a principal place of business at **{{CLIENT_ADDRESS}}** (the _“Client”_).\n\nThe Manager and the Client may be referred to individually as a _“Party”_ and collectively as the _“Parties.”_",
    sort_hint: 10
  },
  {
    clause_key: "Recitals",
    title: "Recitals",
    body_md: "**WHEREAS**, the Manager possesses specialized knowledge, experience, and expertise in the management, operational support, and strategic oversight of businesses similar to counseling and behavioral health practices;\n\n**WHEREAS**, the Client operates a counseling and mental health practice and desires to engage the Manager to provide management, operational, and strategic services to support the Client’s business operations;\n\n**WHEREAS**, the Manager is willing to provide such services to the Client in accordance with the terms and conditions set forth in this Agreement and the applicable appendices incorporated herein;\n\n**NOW, THEREFORE**, in consideration of the mutual covenants and agreements contained herein, the Parties agree as follows:",
    sort_hint: 10
  },
  {
    clause_key: "Appointment",
    title: "Appointment of Manager",
    body_md: "**(A)** _Appointment_: The Client hereby appoints **{{MANAGER_NAME}}** (the _“Manager”_) to provide management, operational, and strategic support services to **{{CLIENT_NAME}}** (the _“Client”_) in accordance with the terms of this Agreement.\n\n**(B)** _Independent Contractor Status_: The Manager shall at all times act as an independent contractor and not as an employee, partner, joint venturer, or agent of the Client. Nothing in this Agreement shall be construed to create any partnership, joint venture, fiduciary, or agency relationship.",
    sort_hint: 70
  },
  {
    clause_key: "Scope_of_Services",
    title: "Scope of Management Services",
    body_md: "**(A)** _General Services_: Commencing on **{{EXECUTION_DATE}}**, the Manager shall provide management, operational, and strategic support services necessary to support the Client’s counseling practice (the _“Practice”_), as further detailed in **{{APPENDIX_A_TITLE}}** and governed by the procedures set forth in **{{APPENDIX_C_TITLE}}**.\n\n**(B)** _Service Framework_: The scope, pricing, service tiers, and implementation procedures for management services shall be defined and governed by the applicable appendices, which are incorporated herein by reference.",
    sort_hint: 70
  },
  {
    clause_key: "Financial_Oversight",
    title: "Financial and Operational Oversight",
    body_md: "**(A)** _Financial Administration_: The Manager shall administer and oversee financial operations of the Practice, including payroll coordination, bookkeeping, accounting support, banking coordination, accounts payable and receivable, and financial reporting.\n\n**(B)** _Expenditure Approval_: The Manager shall obtain prior written approval from the Client for any single expenditure exceeding **${{APPROVAL_THRESHOLD}}**, or for changes to accounting systems or financial platforms.\n\n**(C)** _Purchasing and Assets_: The Manager may oversee purchasing, leasing, maintenance, or disposal of supplies and equipment necessary for Practice operations, subject to budgetary constraints and approval requirements.",
    sort_hint: 70
  },
  {
    clause_key: "Billing_and_Reporting",
    title: "Billing and Reporting",
    body_md: "**(A)** _Billing Management_: The Manager shall manage billing operations for services rendered by the Practice, including payer submissions, invoicing, payment processing, and follow-up on outstanding balances, in compliance with applicable laws and payer requirements.\n\n**(B)** _Reporting_: The Manager shall provide the Client with periodic reports, which may include: (i) weekly operational summaries; (ii) monthly financial statements; (iii) budget projections; and (iv) quarterly performance reviews. Reports shall be prepared using generally accepted accounting principles (GAAP) or other agreed standards.",
    sort_hint: 70
  },
  {
    clause_key: "Personnel_and_Policies",
    title: "Personnel and Policies",
    body_md: "**(A)** _Personnel Administration_: The Manager shall oversee onboarding and offboarding processes for personnel supporting the Practice, in accordance with procedures outlined in **{{APPENDIX_C_TITLE}}**.\n\n**(B)** _Approval for Key Roles_: Prior written approval from the Client is required for onboarding personnel into leadership or authority positions, including Directors, Managers, or Legal Counsel.\n\n**(C)** _Policy Development_: The Manager may recommend or implement operational policies; however, any policy that materially affects culture, service delivery, legal compliance, or risk exposure shall require prior written approval from the Client.",
    sort_hint: 70
  },
  {
    clause_key: "Compliance_and_Insurance",
    title: "Compliance and Insurance",
    body_md: "**(A)** _Regulatory Compliance_: The Manager shall take reasonable steps to support the Client’s compliance with applicable federal, state, and local laws and regulations relevant to the operation of a counseling practice. The Manager shall not take, nor permit within its control, any action that would knowingly place the Client out of legal or regulatory compliance.\n\n**(B)** _Compliance Audits_: The Manager may conduct periodic compliance reviews or audits, consistent with **{{APPENDIX_C_TITLE}}**, to identify operational or regulatory risks and recommend corrective actions.\n\n**(C)** _Insurance Oversight_: The Manager shall assist in monitoring the Client’s insurance coverage. Any material modification, addition, or removal of insurance coverage shall require prior written approval from the Client.",
    sort_hint: 70
  },
  {
    clause_key: "Marketing_and_Branding",
    title: "Marketing and Branding Services",
    body_md: "**(A)** _Marketing Strategy_: The Manager shall develop and implement marketing strategies designed to enhance brand visibility, client engagement, and referral growth, including advertising, outreach, and promotional planning.\n\n**(B)** _Tier Alignment_: Marketing services shall align with the Client’s assigned revenue or service tier as defined in **{{APPENDIX_B_TITLE}}**.\n\n**(C)** _Branding Support_: The Manager may provide branding services, including logo development, brand guidelines, or visual assets. Additional branding projects shall be subject to approval and pricing consistent with **{{APPENDIX_B_TITLE}}**.",
    sort_hint: 70
  },
  {
    clause_key: "Systemization_and_Media",
    title: "Systemization and Media",
    body_md: "**(A)** _Operational Systems_: The Manager may streamline and standardize operational systems, including workflows, internal communication processes, and client management platforms, consistent with the Client’s service tier and operational needs.\n\n**(B)** _Media Services_: The Manager may plan and execute media-related initiatives, including public relations efforts and social media content, with scope and frequency aligned to **{{APPENDIX_B_TITLE}}**.",
    sort_hint: 70
  },
  {
    clause_key: "Client_Responsibilities",
    title: "Responsibilities of the Client",
    body_md: "**(A)** _Information Sharing_: The Client shall provide accurate, complete, and timely information reasonably necessary for the Manager to perform its duties, including financial, operational, and compliance-related data.\n\n**(B)** _Non-Interference_: The Client agrees not to take actions that materially interfere with or obstruct the Manager’s performance of services under this Agreement.\n\n**(C)** _Licensing and Legal Standing_: The Client shall remain in good standing as a **{{CLIENT_ENTITY_TYPE}}** and shall be solely responsible for obtaining and maintaining all licenses, permits, and certifications required to operate the Practice.",
    sort_hint: 70
  },
  {
    clause_key: "Financial_Obligations",
    title: "Financial Obligations and Fees",
    body_md: "**(A)** _Operational Funding_: The Client shall maintain sufficient funds to cover operational expenses and management fees as outlined in **{{APPENDIX_A_TITLE}}**.\n\n**(B)** _Expense Reimbursement_: The Client shall reimburse the Manager for reasonable and necessary out-of-pocket expenses incurred in connection with services provided, subject to documentation and approval requirements in **{{APPENDIX_C_TITLE}}**.\n\n**(C)** _Management Fee_: The Client shall compensate the Manager in accordance with the management fee structure set forth in **{{APPENDIX_A_TITLE}}**, payable on or before the last day of each calendar month.",
    sort_hint: 70
  },
  {
    clause_key: "Insufficient_Funds",
    title: "Insufficient Funds and Interest",
    body_md: "**(A)** _Late Payments_: If the Client fails to remit any management fee or reimbursable expense when due, the outstanding balance shall accrue interest at a rate of **{{INTEREST_RATE}}** per month, calculated daily from the due date until paid in full.\n\n**(B)** _Operational Safeguards_: In the event of insufficient funds, the Manager may take reasonable steps to prevent overdrafts or financial exposure, including temporarily withholding services or requiring alternative payment arrangements, until balances and accrued interest are satisfied.\n\nFailure to remit payment may constitute a material breach of this Agreement.",
    sort_hint: 70
  },
  {
    clause_key: "Confidentiality_and_HIPAA",
    title: "Confidentiality and HIPAA",
    body_md: "**(A)** _Confidential Information_: “Confidential Information” includes non-public business information, financial records, operational data, trade secrets, and Protected Health Information (“PHI”) as defined under HIPAA.\n\n**(B)** _Confidentiality Obligations_: Each Party agrees to safeguard Confidential Information and to use such information solely for purposes consistent with this Agreement.\n\n**(C)** _Exclusions_: Confidential Information does not include information that becomes publicly available through no fault of the receiving Party or is independently developed without reference to the disclosing Party’s Confidential Information.\n\n**(D)** _Survival_: Confidentiality obligations shall survive termination of this Agreement for **{{CONFIDENTIALITY_SURVIVAL_PERIOD}}** years.",
    sort_hint: 80
  },
  {
    clause_key: "Term_and_Termination",
    title: "Term and Termination",
    body_md: "**(A)** _Term_: This Agreement shall commence on **{{EXECUTION_DATE}}** and continue until terminated in accordance with this Section.\n\n**(B)** _Termination by Client_: The Client may terminate this Agreement with **{{TERMINATION_NOTICE_DAYS}}** days’ written notice if the Manager materially breaches this Agreement and fails to cure such breach within **{{CURE_PERIOD_DAYS}}** days.\n\n**(C)** _Termination by Manager_: The Manager may terminate this Agreement upon written notice if the Client fails to remit payment or materially breaches this Agreement and fails to cure within the applicable cure period.\n\n**(D)** _Effect of Termination_: Upon termination, all outstanding balances shall become immediately due and payable. Provisions that by their nature should survive shall remain in effect.",
    sort_hint: 20
  },
  {
    clause_key: "Independent_Contractor",
    title: "Independent Contractor Status",
    body_md: "The Parties acknowledge that the Manager is an independent contractor and not an employee, partner, joint venturer, or agent of the Client. Nothing herein shall be construed to create an employment or fiduciary relationship.\n\nThe Client shall not provide benefits, insurance, or employee compensation to the Manager or its personnel.",
    sort_hint: 80
  },
  {
    clause_key: "Miscellaneous",
    title: "Miscellaneous",
    body_md: "**(A)** _Governing Law_: This Agreement shall be governed by and construed in accordance with the laws of the State of **{{GOVERNING_STATE}}**.\n\n**(B)** _Amendments_: This Agreement may be amended only by a written document executed by both Parties.\n\n**(C)** _Notices_: All notices shall be delivered in writing to the addresses designated by the Parties or as otherwise updated in writing.\n\n**(D)** _Entire Agreement_: This Agreement, together with all incorporated appendices, constitutes the entire agreement between the Parties and supersedes all prior discussions or agreements.",
    sort_hint: 80
  },
  {
    clause_key: "Indemnification",
    title: "Indemnification",
    body_md: "**(A)** _Manager Indemnification_: The Manager shall indemnify, defend, and hold harmless the Client from and against any claims, damages, losses, liabilities, or expenses arising out of the Manager’s gross negligence, willful misconduct, or material breach of this Agreement.\n\n**(B)** _Client Indemnification_: The Client shall indemnify, defend, and hold harmless the Manager from and against any claims, damages, losses, liabilities, or expenses arising out of the Client’s business operations, licensing, clinical services, or failure to comply with applicable laws.",
    sort_hint: 80
  },
  {
    clause_key: "Insurance",
    title: "Insurance Requirements",
    body_md: "**(A)** _Coverage_: Each Party shall maintain commercially reasonable insurance coverage appropriate to its role and responsibilities under this Agreement.\n\n**(B)** _Proof of Insurance_: Upon reasonable request, either Party shall provide proof of required insurance coverage.",
    sort_hint: 80
  },
  {
    clause_key: "Non_Exclusivity",
    title: "Non-Exclusivity",
    body_md: "Nothing in this Agreement shall prohibit the Manager from providing services to other clients, or the Client from engaging other service providers, provided such activities do not materially interfere with obligations under this Agreement.",
    sort_hint: 80
  },
  {
    clause_key: "Assignment",
    title: "Assignment",
    body_md: "Neither Party may assign or transfer this Agreement without the prior written consent of the other Party, except that the Manager may assign this Agreement to an affiliated entity upon written notice to the Client.",
    sort_hint: 80
  },
  {
    clause_key: "Severability",
    title: "Severability",
    body_md: "If any provision of this Agreement is held to be invalid or unenforceable, such provision shall be severed, and the remaining provisions shall remain in full force and effect.",
    sort_hint: 80
  },
  {
    clause_key: "Notices",
    title: "Notices",
    body_md: "Any notice required or permitted under this Agreement shall be in writing and shall be deemed properly given when delivered personally, sent by a nationally recognized overnight courier, or mailed by certified or registered mail, return receipt requested, to the addresses set forth below, or to such other address as a Party may designate by written notice:\n\n_To the Client_:  \n**{{CLIENT_NAME}}**  \n**{{CLIENT_ADDRESS}}**  \nAttention: **{{CLIENT_CONTACT_NAME}}**\n\n_To the Manager_:  \n**{{MANAGER_NAME}}**  \n**{{MANAGER_ADDRESS}}**  \nAttention: **{{MANAGER_CONTACT_NAME}}**",
    sort_hint: 80
  },
  {
    clause_key: "Governing_Law",
    title: "Governing Law and Venue",
    body_md: "This Agreement shall be governed by and construed in accordance with the laws of the State of **{{GOVERNING_STATE}}**, without regard to conflict-of-law principles. Any legal action arising out of or relating to this Agreement shall be brought exclusively in the state or federal courts located within **{{GOVERNING_COUNTY}}**, **{{GOVERNING_STATE}}**.",
    sort_hint: 80
  },
  {
    clause_key: "Attorneys_Fees",
    title: "Attorney's Fees",
    body_md: "In the event of any dispute, action, or proceeding arising out of or relating to this Agreement, the prevailing Party shall be entitled to recover its reasonable attorneys’ fees, costs, and expenses incurred in connection with such action or proceeding.",
    sort_hint: 80
  },
  {
    clause_key: "Amendment_and_Waiver",
    title: "Amendment and Waiver",
    body_md: "This Agreement may be amended or modified only by a written instrument executed by both Parties. No waiver of any provision of this Agreement shall be effective unless in writing and signed by the Party against whom the waiver is asserted. A waiver of any breach shall not be deemed a waiver of any subsequent breach.",
    sort_hint: 80
  },
  {
    clause_key: "Entire_Agreement",
    title: "Entire Agreement",
    body_md: "This Agreement, together with all appendices and exhibits incorporated herein by reference, constitutes the entire agreement between the Parties with respect to the subject matter hereof and supersedes all prior or contemporaneous agreements, negotiations, representations, or understandings, whether written or oral.\n\nNo appendix, exhibit, or referenced document shall require a separate signature unless expressly stated. Execution of this Agreement constitutes acknowledgment and acceptance of all incorporated materials.",
    sort_hint: 80
  },
  {
    clause_key: "Severability_2",
    title: "Severability",
    body_md: "If any provision of this Agreement is held to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect as if such invalid provision had never been included.\n",
    sort_hint: 80
  },
  {
    clause_key: "Counterparts",
    title: "Counterparts and Electronic Signatures",
    body_md: "This Agreement may be executed in counterparts, each of which shall be deemed an original and all of which together shall constitute one and the same instrument. Signatures transmitted electronically or via PDF shall be deemed valid and binding.",
    sort_hint: 80
  },
  {
    clause_key: "Execution",
    title: "Acknowledgement and Execution",
    body_md: "<<PAGE_BREAK>>By executing this Agreement, each Party acknowledges that it has read, understood, and voluntarily agreed to all terms and conditions contained herein, including all sections and incorporated appendices.\n\n**IN WITNESS WHEREOF**, the Parties, intending to be legally bound, have executed this Agreement as of the **{{EXECUTION_DATE}}**.\n\n**{{CLIENT_NAME}}**  \nBy: ___________________________  \nName: **{{CLIENT_SIGNATORY_NAME}}**  \nTitle: **{{CLIENT_SIGNATORY_TITLE}}**  \nDate: _________________________  \n\n---\n\n**{{MANAGER_NAME}}**  \nBy: ___________________________  \nName: **{{MANAGER_SIGNATORY_NAME}}**  \nTitle: **{{MANAGER_SIGNATORY_TITLE}}**  \nDate: _________________________  ",
    sort_hint: 90
  },
  {
    clause_key: "Appendix_A",
    title: "",
    body_md: "<<PAGE_BREAK>>**APPENDIX A**  \n_SERVICE PRICING AND DETAILS_\n\nThis Appendix A is incorporated by reference into the Management Agreement between **{{CLIENT_NAME}}** (the _“Client”_) and **{{MANAGER_NAME}}** (the _“Manager”_). This Appendix establishes the service categories, operational scope, and applicable pricing framework for management, operational, strategic, and compliance support services provided by the Manager. Services are structured to support scalability, regulatory compliance, and alignment with the Client’s business objectives.\n\n**_Operational Services_**  \nThe Manager shall provide comprehensive operational support, which includes, but is not limited to:\n\n_Billing and Revenue Cycle Management (Included in Monthly Fee)_:\n• Weekly entry and submission of electronic and paper claims  \n• Ongoing claims tracking, correction, resubmission, and denial management  \n• Government, commercial, and private-pay billing processes  \n• Patient statements, soft collections, and payment posting  \n• Monthly customized billing and financial reports  \n\n_Payroll and Bookkeeping (Included in Monthly Fee)_:\n• Biweekly payroll processing, tax withholdings, and payment issuance  \n• End-of-year payroll audits and delivery of tax statements (W-2s, 1099s)  \n• Unemployment claims assistance and representation  \n• Monthly bookkeeping, income and expense tracking, and financial statements  \n\n_Credentialing and Provider Enrollment (Included in Monthly Fee)_:\n• Initial and ongoing insurance credentialing  \n• CAQH profile creation and maintenance  \n• Attestation completion and payer revalidation  \n• NPI creation and updates  \n• Provider contract administration and record maintenance  \n• Tracking and renewal monitoring for licenses, malpractice insurance, DEA, and related credentials  \n\n_People Operations (Included in Monthly Fee Unless Otherwise Noted)_:\n• Employee onboarding systems and integration  \n• Training program development and delivery  \n• Exit and offboarding procedures  \n• Policy development and implementation  \n• Remediation processes for performance, compliance, or operational issues  \n• Employee handbook development  \n• Contract development  \n   – One-time contract development fee: **${{CONTRACT_DEV_FEE}}** per contract  \n   – Revisions: Included in monthly fee  \n• Benefits administration and support  \n\n_Compliance Services (Included in Monthly Fee)_:\n• Government-required audit support  \n• Studental regulatory compliance audits  \n• Data protection, privacy, and HIPAA-related safeguards  \n\n**_Strategic and Growth Services_**  \n\n_Branding and Identity_:\n• Brand strategy consulting (Included in monthly fee)  \n• Corporate identity packages (Included in monthly fee)  \n• Brand refresh services (Included in monthly fee)  \n• Logo design or refresh:  \n   – New logo design: **${{LOGO_DESIGN_FEE}}**  \n   – Logo refresh: **${{LOGO_REFRESH_FEE}}**  \n\n_Design Services (As Detailed in Appendix B)_:\n• Flyers, brochures, business cards  \n• Website creation, management, and SEO optimization  \n• Branded merchandise and digital graphics  \n\n_Outreach and Marketing (Included in Monthly Fee)_:\n• Paid ad campaign management  \n• Google Business listing optimization  \n• Community outreach advising and event support  \n\n_Content Services_:\n• Email marketing campaigns  \n• Social media content creation and posting  \n• Digital content included with approved graphic services  \n\n**_Pricing and Modifications_**  \nUnless otherwise stated, services described in this Appendix are included in the applicable monthly management fee outlined in the Management Agreement or Appendix B. One-time fees and variable costs must be approved in writing by the Client prior to execution. The Manager reserves the right to modify service scope or pricing structures upon written notice, subject to the terms of the Management Agreement.\n\nThis Appendix A is effective as of **{{EXECUTION_DATE}}** and remains in force unless modified by written amendment executed by both Parties.",
    sort_hint: 80
  },
  {
    clause_key: "Appendix_B",
    title: "",
    body_md: "**APPENDIX B**  \n_TIERED SERVICE LEVELS AND CREDIT SYSTEM_\n\nThis Appendix B is incorporated by reference into the Management Agreement between **{{CLIENT_NAME}}** (the _“Client”_) and **{{MANAGER_NAME}}** (the _“Manager”_). This Appendix establishes tier-based service levels and a quarterly credit system designed to align management support, scalability, and strategic resources with the Client’s operational size and growth.\n\n**_Tier Determination_**  \nService tiers are determined based on the **greater of** the Client’s annual revenue or total number of employees. Tier placement is reviewed quarterly and adjusted as necessary to reflect growth or operational changes.\n\n**Tier Structure**\n\n_Tier 1_  \nAnnual Revenue: **$0 – $199,000**  \nEmployees: **1 – 9**\n\n_Tier 2_  \nAnnual Revenue: **$200,000 – $499,000**  \nEmployees: **10 – 24**\n\n_Tier 3_  \nAnnual Revenue: **$500,000 – $999,000**  \nEmployees: **25 – 49**\n\n_Tier 4_  \nAnnual Revenue: **$1,000,000 – $1,999,000**  \nEmployees: **50 – 74**\n\n_Tier 5_  \nAnnual Revenue: **$2,000,000 and above**  \nEmployees: **75+**\n\n**_Quarterly Credit Allocation_**  \nEach service tier includes a quarterly credit allocation that may be applied toward eligible strategic and operational services.\n\nTier 1: **3 credits per quarter**  \nTier 2: **5 credits per quarter**  \nTier 3: **7 credits per quarter**  \nTier 4: **9 credits per quarter**  \nTier 5: **11 credits per quarter**\n\n**_Credit Rollover and Reset_**  \n• Unused credits may roll over within the same calendar year  \n• Credits reset at the beginning of each calendar year  \n• Credits do not carry over between calendar years  \n\n**_Additional Credit Cost_**  \nCredits used in excess of the quarterly allocation will be billed at **${{CREDIT_RATE}} per credit**.\n\n**_Services Eligible for Credit Use_**\n\n_Flier Creation_  \n• Cost: **1 credit per flier**  \n• Includes content creation, layout, and print-ready or digital delivery  \n• Available in English and Spanish  \n\n_Website Creation and Management_  \n• Cost: **1 credit per billable hour**  \n• Includes design, development, SEO optimization, and core site features  \n\n_Brochure Design_  \n• Cost: **2 credits per brochure**  \n• Includes multiple design iterations and print-ready files  \n\n_Business Card Design_  \n• Cost: **1 credit per design**  \n\n_Branded Merchandise Design_  \n• Cost: **1 credit per design**  \n• Includes promotional items such as apparel or branded materials  \n\n_Digital Graphics_  \n• Cost: **1 credit per design**  \n• Includes graphics for web, presentations, or social media  \n\n**_Quarterly Review and Adjustment_**  \nThe Manager shall conduct quarterly assessments of the Client’s revenue and employee count to confirm appropriate tier placement. Tier adjustments, and corresponding credit allocations, will be applied prospectively following review.\n\n**_Integration and Precedence_**  \nThis Appendix B forms an integral part of the Management Agreement. In the event of a conflict between this Appendix and the main Agreement, the provisions of this Appendix shall govern with respect to tier determination, credit allocation, and eligible services.\n\nThis Appendix B is effective as of **{{EXECUTION_DATE}}**.",
    sort_hint: 80
  },
  {
    clause_key: "Appendix_C",
    title: "",
    body_md: "**APPENDIX C**  \n_MANAGEMENT PROCEDURES_\n\nThis Appendix C is incorporated by reference into the Management Agreement between **{{CLIENT_NAME}}** (the _“Client”_) and **{{MANAGER_NAME}}** (the _“Manager”_). This Appendix establishes the operational framework, administrative protocols, and compliance standards used to support effective collaboration, organizational efficiency, and alignment with the Client’s operational goals.\n\n**1. Operational Division**\n\n**1.1 Billing Services**\n\n**(A)** _Weekly Claims Entry_:  \n• Each Monday, compile the prior week’s billable services in **{{EHR_SYSTEM}}**.  \n• Verify client demographics, dates of service, rendering provider, payer, authorizations (if applicable), and codes.  \n• Enter claims per payer rules and internal billing standards.  \n• Generate a weekly claim-entry summary and retain it in the billing records.\n\n**(B)** _Claim Submission (Electronic and Paper)_:  \n• Submit electronically when supported by payer/clearinghouse; retain submission confirmations.  \n• When paper submission is required, generate forms from **{{EHR_SYSTEM}}**, review for accuracy, and mail with tracking.  \n• Track submission status weekly until accepted or resolved.\n\n**(C)** _Follow-Up and Status Tracking_:  \n• Maintain a claims tracker (internal log or **{{EHR_SYSTEM}}** reporting).  \n• Review payer/clearinghouse status weekly to identify pending, pended, or unpaid claims.  \n• Document follow-up activities (date, payer contact, outcome, next steps).  \n• Provide monthly follow-up summaries to the Client.\n\n**(D)** _Corrections and Re-Submission_:  \n• Review denials/rejections upon notice.  \n• Identify the root cause (coding, eligibility, authorization, documentation, or demographic error).  \n• Correct and re-submit under payer timelines and requirements.  \n• Document correction actions in the claim record or tracker.\n\n**(E)** _Government, Commercial, and Private Billing Standards_:  \n• Apply payer-specific workflows in **{{EHR_SYSTEM}}** for:  \n  – Medicaid/government programs (including documentation and coding requirements)  \n  – Commercial plans (including authorization and documentation standards)  \n  – Private/self-pay invoicing and patient statements  \n• Maintain an internal library of payer rules and billing references.\n\n**(F)** _Monthly Reporting_:  \n• Generate monthly billing and collections reports using **{{BOOKKEEPING_SYSTEM}}** and **{{EHR_SYSTEM}}**.  \n• Reports may include: claims status, collections, A/R aging, balances, and revenue by service type.  \n• Deliver reports securely by the agreed monthly deadline.\n\n**(G)** _Patient Statements and Soft Collections_:  \n• Generate monthly statements through **{{EHR_SYSTEM}}**.  \n• For past-due accounts, send up to three reminders (e.g., 30/60/90 days past due).  \n• Maintain documentation of statement delivery and reminders.\n\n**(H)** _Payment Posting and Adjustments_:  \n• Post payments upon receipt and match to the correct claim/invoice.  \n• Apply contractual adjustments, write-offs, or corrections consistent with EOBs and payer rules.  \n• Reconcile payment posting with **{{BOOKKEEPING_SYSTEM}}** monthly.\n\n**(I)** _Denial Management_:  \n• Review denials at least weekly and document denial reasons.  \n• Appeal or correct and re-submit under payer timelines.  \n• Track denial trends and implement preventive improvements (training, workflows, documentation standards).\n\n**(J)** _Collections Escalation_:  \n• Maintain an overdue list through **{{EHR_SYSTEM}}** and **{{BOOKKEEPING_SYSTEM}}**.  \n• Offer reasonable payment plan options when appropriate.  \n• If escalation beyond soft collections is required, proceed only with Client approval and in compliance with applicable laws.\n\n**(K)** _Bookkeeping Support_:  \n• Record and categorize income/expenses in **{{BOOKKEEPING_SYSTEM}}**.  \n• Reconcile bank/credit activity and financial reports monthly.  \n• Generate monthly financial statements (P&L, balance sheet, cash flow summaries) when applicable.\n\n---\n\n**1.2 Payroll Services**\n\n**(A)** _Biweekly Payroll Processing_:  \n• Collect and verify time, PTO, and adjustments in **{{PAYROLL_SYSTEM}}**.  \n• Process payroll on the Client’s approved schedule, including tax withholdings and deductions.  \n• Produce payroll reports and resolve discrepancies promptly.\n\n**(B)** _Unemployment Claims Support_:  \n• Monitor and respond to unemployment claims through **{{PAYROLL_SYSTEM}}** or state portals.  \n• Provide supporting documentation and written responses when required.  \n• Maintain a log of claim outcomes and supporting records.\n\n**(C)** _Year-End Payroll Audit_:  \n• Reconcile payroll records with **{{BOOKKEEPING_SYSTEM}}** and internal financial records annually.  \n• Identify discrepancies and provide corrective recommendations as needed.\n\n**(D)** _Tax Statement Delivery_:  \n• Prepare W-2/1099 forms through **{{PAYROLL_SYSTEM}}**.  \n• Verify accuracy (names, SSNs/EINs, totals) and distribute by required deadlines.  \n• Maintain required retention copies.\n\n---\n\n**1.3 Credentialing Services**\n\n**(A)** _Initial Credentialing_:  \n• Collect required provider documents (licenses, malpractice, certifications, IDs, etc.).  \n• Submit credentialing applications to payers and track status through completion.  \n• Provide confirmation and credentialing records to the Client.\n\n**(B)** _Ongoing Updates and Maintenance_:  \n• Maintain credential currency with payer portals and internal records.  \n• Notify the Client and/or provider of upcoming expirations **{{CREDENTIALING_NOTICE_DAYS}}** days in advance, when possible.\n\n**(C)** _CAQH Creation and Maintenance_:  \n• Create/complete CAQH profiles as requested and ensure required documentation is uploaded.  \n• Track and complete periodic updates/attestations.\n\n**(D)** _Attestations_:  \n• Monitor payer/CAQH attestation requirements and complete timely to prevent network interruptions.  \n• Retain records of attestations for audit readiness.\n\n**(E)** _NPI Creation and Updates_:  \n• Submit NPI requests via NPPES and update profiles for changes (address, taxonomy, name).  \n• Provide confirmations to the Client.\n\n**(F)** _Provider Contract Management_:  \n• Add/remove providers from payer contracts and maintain communication with networks.  \n• Maintain organized contract records and status logs.\n\n**(G)** _Document Expiration Tracking_:  \n• Track expiration dates for key documents (licenses, DEA where applicable, malpractice, board certifications).  \n• Use reminders at 90/60/30 days prior to expiration when possible.\n\n---\n\n**1.4 People Operations**\n\n**(A)** _Onboarding Systems_:  \n• Maintain onboarding checklist: paperwork, system access, role expectations, and orientation.  \n• Coordinate access to **{{EHR_SYSTEM}}**, **{{PAYROLL_SYSTEM}}**, and approved tools.  \n• Track onboarding completion and gather feedback for improvement.\n\n**(B)** _Training Program Administration_:  \n• Maintain a training calendar by role and compliance requirements.  \n• Track participation and completion for required trainings.  \n• Update training content as policies or standards change.\n\n**(C)** _Offboarding Procedures_:  \n• Conduct exit/offboarding steps: access removal, equipment return, final pay coordination, and documentation retention.  \n• Ensure offboarding records are securely stored.\n\n**(D)** _Policy Development and Implementation_:  \n• Draft and implement policies aligned with legal standards and organizational practices.  \n• Coordinate review with Client leadership and/or counsel as needed.  \n• Support dissemination and consistent application.\n\n**(E)** _Remediation Process Support_:  \n• Support structured remediation processes including assessment, corrective plan, check-ins, and outcome documentation.\n\n**(F)** _Handbook Development and Maintenance_:  \n• Organize handbook content and update sections based on operational and compliance changes.  \n• Coordinate distribution and acknowledgment tracking.\n\n**(G)** _Contract Development Support_:  \n• Use standardized templates; tailor as required; coordinate review and revisions.  \n• Store finalized agreements securely and retain version control.\n\n**(H)** _Benefits Administration Support_:  \n• Coordinate enrollment logistics and employee communication.  \n• Provide support for benefits questions and annual review cycles.\n\n---\n\n**1.5 Compliance Services**\n\n**(A)** _Government-Required Audits_:  \n• Identify and organize required documentation.  \n• Support audit responses and communications.  \n• Document findings and implement corrective actions when needed.\n\n**(B)** _Studental Regulatory Compliance Audits_:  \n• Conduct periodic internal audits (quarterly or biannually, as applicable).  \n• Evaluate billing, documentation, credentialing, and privacy compliance.  \n• Maintain audit records and corrective action documentation.\n\n**(C)** _Data Protection and Privacy_:  \n• Maintain policies and procedures aligned with HIPAA and applicable privacy standards.  \n• Require secure handling, storage, and transmission practices.  \n• Provide training guidance and maintain an incident response protocol.\n\n---\n\n**2. Strategic Division**\n\n**2.1 Branding Services**\n\n**(A)** _Logo Design (Startup/Rebrand)_:  \n• Conduct intake to identify brand vision, audience, and preferences.  \n• Provide multiple concepts and up to **{{LOGO_REVISION_ROUNDS}}** revision rounds (unless otherwise approved).  \n• Deliver final files in multiple formats and basic usage guidance.\n\n**(B)** _Brand Strategy Consulting_:  \n• Review brand positioning and messaging; identify gaps and opportunities.  \n• Provide strategic recommendations and implementation steps.\n\n**(C)** _Corporate Identity Package_:  \n• Develop business card/letterhead and brand guidelines (colors, typography, logo usage).  \n• Provide final assets in print-ready and digital formats.\n\n**(D)** _Brand Refresh_:  \n• Assess current assets; propose updates; deliver refreshed brand components and guidelines.\n\n---\n\n**2.2 Design Services and Credit Administration**\n\n**(A)** _Tier/Credit Tracking_:  \n• Track quarterly credit usage and remaining balances.  \n• Apply rollover and reset rules consistent with Appendix B.  \n• Process additional credits at **${{CREDIT_RATE}}** per credit.\n\n**(B)** _Flier Creation_:  \n• Intake requirements (purpose, audience, language).  \n• Produce draft; incorporate revisions; deliver final files (print-ready and digital).\n\n**(C)** _Website Creation and Management_:  \n• Intake goals and features; provide sitemap/wireframes.  \n• Build responsive site with basic SEO; review; launch; provide update guidance.\n\n**(D)** _Brochure Design_:  \n• Gather content; develop design options; revise; deliver final files.\n\n**(E)** _Business Cards_:  \n• Intake branding and details; draft/revise; deliver print-ready files.\n\n**(F)** _Branded Merchandise_:  \n• Intake merchandise specs; provide mockups; deliver production-ready files.\n\n**(G)** _Digital Graphics_:  \n• Intake platform/purpose; design; include one revision round unless otherwise approved; deliver optimized files.\n\n---\n\n**2.3 Outreach Services**\n\n**(A)** _Ads Services_:  \n• Develop audience strategy and campaign parameters (budget, duration).  \n• Create copy and graphics; launch; monitor; adjust for performance.\n\n**(B)** _Google Listing Management_:  \n• Optimize listing accuracy; maintain updates (photos, posts).  \n• Support review response and inquiry response protocols.\n\n**(C)** _Outreach Advising_:  \n• Provide event planning guidance, materials recommendations, and promotion support.  \n• Provide post-event feedback and improvement recommendations.\n\n---\n\n**2.4 Content Services**\n\n**(A)** _Email Marketing_:  \n• Create campaign schedule and content plan.  \n• Design and distribute campaigns; track performance; report insights.\n\n**(B)** _Social Media Posts_:  \n• Create a posting plan and content themes.  \n• Design graphics and publish posts; track engagement and refine strategy.\n\n---\n\n**3. General Procedure Notes**\n\n**(A)** _Systems and Tools_:  \nProcedures in this Appendix are intended to be executed using the Client’s approved systems, including **{{EHR_SYSTEM}}**, **{{PAYROLL_SYSTEM}}**, and **{{BOOKKEEPING_SYSTEM}}**, or equivalent systems approved by the Client.\n\n**(B)** _Secure Handling_:  \nAll documentation and communications involving financial data, operational records, or protected health information shall be handled through secure, approved channels consistent with HIPAA and the Client’s policies.\n\n**(C)** _Updates_:  \nThe Manager may recommend updates to procedures as operational needs evolve. Material changes impacting scope, cost, or risk shall be implemented only with Client approval or as otherwise permitted by the Agreement.\n\nThis Appendix C is effective as of **{{EXECUTION_DATE}}**.",
    sort_hint: 80
  },
  {
    clause_key: "SUPERVISION",
    title: "Clinical Supervision and Oversight",
    body_md: "Unless otherwise expressly stated in writing, the {{ROLE_LABEL}} shall practice under the supervision of **{{SUPERVISOR_NAME}}**, or another designated **Clinical Supervisor** assigned by the Practice. The Clinical Supervisor shall be a fully licensed clinician approved by the Practice and shall be responsible for providing clinical oversight in accordance with applicable laws, regulations, payer requirements, and Practice policies.\n\nThe Clinical Supervisor is responsible for reviewing and signing all clinical documentation as required, providing supervisory guidance, and ensuring appropriate oversight of services rendered while the {{ROLE_LABEL}} is supervised or credentialed under the Practice. This oversight may include, but is not limited to, documentation review, individual or group supervisory meetings, case consultation, and compliance monitoring.\n\nSupervision structure, frequency, documentation requirements, scope of supervisory authority, and any applicable limitations are governed by the **{{COMPANY_NAME}} Workplace Handbook**, including the Clinical Supervision and Oversight policies, as amended from time to time. The assignment of a Clinical Supervisor, including **{{SUPERVISOR_NAME}}**, and any modification thereto, is at the sole discretion of the Practice and may change based on credentialing status, program needs, compliance requirements, or organizational considerations.\n\nNothing in this section shall be construed as a guarantee of licensure eligibility, credentialing approval, or continuation of supervision beyond that required or approved by the Practice.",
    sort_hint: 70
  }
];

export const ITSCO_CONTRACT_CONFIGS = [
  {
    name: "ITSCO Standard Licensed Hourly",
    slug: "itsco_standard_licensed_hourly",
    pay_mode: "hourly",
    rate_config_key: null,
    clause_keys: [
        "INTRO_ITSCO",
        "TERM_AT_WILL",
        "ASSIGNED_OFFICE",
        "LICENSURE_STATUS",
        "JOB_DESC_DYNAMIC",
        "COMP_HOURLY",
        "SUP_COMP",
        "BENEFITS",
        "POLICIES",
        "DISC_CONF",
        "DUTY",
        "CONFLICT",
        "RET_REF",
        "NON_SOLICIT",
        "LEGALESE",
        "SUPERVISION",
        "SIG_BLOCK"
    ]
  },
  {
    name: "ITSCO LPCC Licensure Contingent FFS",
    slug: "itsco_lpcc_licensure_contingent_ffs",
    pay_mode: "ffs",
    rate_config_key: "prelicensed_masters",
    clause_keys: [
        "INTRO_ITSCO",
        "TERM_AT_WILL",
        "ASSIGNED_OFFICE",
        "LICENSURE_CONT",
        "JOB_DESC_DYNAMIC",
        "COMP_FFS",
        "FFS_TABLE",
        "FFS_TABLE2",
        "SUP_COMP",
        "BENEFITS",
        "POLICIES",
        "DISC_CONF",
        "DUTY",
        "CONFLICT",
        "RET_REF",
        "NON_SOLICIT",
        "LEGALESE",
        "SUPERVISION",
        "SIG_BLOCK"
    ]
  },
  {
    name: "ITSCO Licensed FFS",
    slug: "itsco_licensed_ffs",
    pay_mode: "ffs",
    rate_config_key: "licensed_masters",
    clause_keys: [
        "INTRO_ITSCO",
        "TERM_AT_WILL",
        "ASSIGNED_OFFICE",
        "LICENSURE_STATUS",
        "JOB_DESC_DYNAMIC",
        "COMP_FFS",
        "FFS_TABLE",
        "FFS_TABLE2",
        "SUP_COMP",
        "BENEFITS",
        "POLICIES",
        "DISC_CONF",
        "DUTY",
        "CONFLICT",
        "RET_REF",
        "NON_SOLICIT",
        "LEGALESE",
        "SUPERVISION",
        "SIG_BLOCK"
    ]
  },
  {
    name: "ITSCO Intern Practicum",
    slug: "itsco_intern_practicum",
    pay_mode: "none",
    rate_config_key: null,
    clause_keys: [
        "INTRO_INTERN",
        "TERM_AT_WILL",
        "JOB_DESC_INTERN",
        "COMP_PRAC",
        "BEN_INTERN",
        "POLICIES",
        "DISC_CONF",
        "DUTY",
        "LEGALESE",
        "SUPERVISION",
        "SIG_BLOCK"
    ]
  },
  {
    name: "ITSCO Intern Addendum FFS",
    slug: "itsco_intern_addendum_ffs",
    pay_mode: "ffs",
    rate_config_key: "intern",
    clause_keys: [
        "INTERN_ADDENDUM_FFS",
        "FFS_TABLE_INTERN",
        "FFS_TABLE2_INTERN",
        "FFS_INTERN_ADDITIONAL",
        "SIG_BLOCK"
    ]
  },
  {
    name: "ITSCO Intern Addendum Hourly",
    slug: "itsco_intern_addendum_hourly",
    pay_mode: "hourly",
    rate_config_key: null,
    clause_keys: [
        "INTERN_ADDENDUM_HOURLY",
        "SIG_BLOCK"
    ]
  },
  {
    name: "ITSCO Compensation Adjustment Addendum",
    slug: "itsco_compensation_adjustment_addendum",
    pay_mode: "none",
    rate_config_key: null,
    clause_keys: [
        "COMP_ADJ_ADDENDUM"
    ]
  },
  {
    name: "ITSCO Job Description Acknowledgment Addendum",
    slug: "itsco_job_description_acknowledgment_addendum",
    pay_mode: "none",
    rate_config_key: null,
    clause_keys: [
        "JOB_DESC_ACK_ADDENDUM",
        "JOB_DESC_DYNAMIC",
        "SIG_BLOCK"
    ]
  },
  {
    name: "ITSCO Office-Based LPC",
    slug: "itsco_office_based_lpc",
    pay_mode: "hourly",
    rate_config_key: null,
    clause_keys: [
        "INTRO_ALL_OFFICE",
        "TERM_AT_WILL",
        "ASSIGNED_OFFICE",
        "LICENSURE_STATUS",
        "JOB_DESC_LPC_ALL",
        "COMP_HOURLY",
        "SUP_COMP",
        "BENEFITS",
        "POLICIES",
        "DISC_CONF",
        "DUTY",
        "CONFLICT",
        "RET_REF",
        "NON_SOLICIT",
        "LEGALESE",
        "SUPERVISION",
        "SIG_BLOCK"
    ]
  },
  {
    name: "ITSCO Facilitator",
    slug: "itsco_facilitator",
    pay_mode: "hourly",
    rate_config_key: null,
    clause_keys: [
        "INTRO_ITSCO",
        "TERM_AT_WILL",
        "ASSIGNED_OFFICE",
        "LICENSURE_STATUS",
        "JOB_DESC_FAC",
        "COMP_HOURLY",
        "SUP_COMP",
        "BENEFITS",
        "POLICIES",
        "DISC_CONF",
        "DUTY",
        "CONFLICT",
        "RET_REF",
        "NON_SOLICIT",
        "LEGALESE",
        "SUPERVISION",
        "SIG_BLOCK"
    ]
  }
];
