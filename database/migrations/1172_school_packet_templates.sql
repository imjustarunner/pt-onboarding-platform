-- Migration 1172: agency-scoped versioned school printable packet templates
-- One editable HTML template per agency (tenant-wide), shared across that agency's schools.
-- version increments by 1 on every admin save.

CREATE TABLE IF NOT EXISTS school_packet_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  html_content LONGTEXT NOT NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_school_packet_template_agency (agency_id),
  KEY idx_school_packet_templates_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed ITSCO (agency_id = 2) with Version 1.15 transcribed blank school packet content.
INSERT INTO school_packet_templates (agency_id, version, html_content, updated_by_user_id)
VALUES (2, 1, '<section class="school-packet-template">
  <h1>INTAKE PACKET</h1>

  <h2>INTAKE QUESTIONNAIRE</h2>
  <table class="form-table">
    <tbody>
      <tr>
        <td>Dependent''s Name</td>
        <td>______________________________________________</td>
        <td>Dependent''s Sex</td>
        <td>______</td>
      </tr>
      <tr>
        <td>Dependent''s Date of Birth</td>
        <td>_______________________</td>
        <td>Dependent''s Age</td>
        <td>_______</td>
        <td>Dependent''s Grade</td>
        <td>_________</td>
      </tr>
      <tr>
        <td>Dependent''s Address</td>
        <td colspan="5">________________________________________________________________________________</td>
      </tr>
      <tr>
        <td>Dependent''s City</td>
        <td>___________________________________</td>
        <td>State</td>
        <td>___________________</td>
        <td>Zip Code</td>
        <td>______________</td>
      </tr>
    </tbody>
  </table>

  <p>Are you the legal parent or custodian of the above-named minor? ___ Yes ___ No</p>
  <p>I have a legal right to obtain treatment for the above-named minor: ___ Yes ___ No</p>
  <p>In instances of divorce, it is important that both parents of the minor grant permission for services. You may be asked to provide a copy of the court order which names you as the legal custodian of the above minor.</p>
  <p>Are you willing to provide documentation? ___ Yes ___ No</p>

  <table class="form-table">
    <tbody>
      <tr>
        <td>Your name</td>
        <td>________________________________________________________________________________________</td>
      </tr>
      <tr>
        <td>Your phone number</td>
        <td>________________________________________________________________________________________</td>
      </tr>
      <tr>
        <td>Your email address</td>
        <td>_________________________________________________________________________________________</td>
      </tr>
      <tr>
        <td>Other parent/guardian name, phone, and email</td>
        <td>__________________________________________________________________________________________________________________________</td>
      </tr>
    </tbody>
  </table>

  <table class="form-table">
    <tbody>
      <tr>
        <td>Primary Insurance</td>
        <td>_________________________________</td>
        <td>Secondary Insurance</td>
        <td>_______________________________</td>
      </tr>
      <tr>
        <td>Policy Holder</td>
        <td>______________________________________</td>
        <td>Secondary Holder</td>
        <td>____________________________________</td>
      </tr>
      <tr>
        <td>Member ID #</td>
        <td>_______________________________________</td>
        <td>Secondary ID #</td>
        <td>______________________________________</td>
      </tr>
      <tr>
        <td>Policy Group</td>
        <td>_______________________________________</td>
        <td>Secondary Group</td>
        <td>______________________________________</td>
      </tr>
    </tbody>
  </table>

  <p>History of physical abuse _______ Yes _______ No</p>
  <p>History of neglect _______ Yes ________ No</p>
  <p>History of Emotional/Mental Abuse ________ Yes ________ No</p>
  <p>Please explain __________________________________________________________________________________________________</p>
  <p>______________________________________________________________________________________________________________________________________________________________________________________________________________________________________</p>

  <h3>Please select the answer that best fits your dependent:</h3>
  <table class="form-table">
    <tbody>
      <tr><td>Fidgety, unable to sit still</td><td>Never</td><td>Sometimes</td><td>Often</td></tr>
      <tr><td>Acts as if driven by a motor</td><td>Never</td><td>Sometimes</td><td>Often</td></tr>
      <tr><td>Daydreams too much</td><td>Never</td><td>Sometimes</td><td>Often</td></tr>
      <tr><td>Distracted Easily</td><td>Never</td><td>Sometimes</td><td>Often</td></tr>
      <tr><td>Feels sad, unhappy</td><td>Never</td><td>Sometimes</td><td>Often</td></tr>
      <tr><td>Feels hopeless</td><td>Never</td><td>Sometimes</td><td>Often</td></tr>
      <tr><td>Has trouble concentrating</td><td>Never</td><td>Sometimes</td><td>Often</td></tr>
      <tr><td>Fights with others</td><td>Never</td><td>Sometimes</td><td>Often</td></tr>
      <tr><td>Is down on him or herself</td><td>Never</td><td>Sometimes</td><td>Often</td></tr>
      <tr><td>Worries a lot</td><td>Never</td><td>Sometimes</td><td>Often</td></tr>
      <tr><td>Seems to be having less fun</td><td>Never</td><td>Sometimes</td><td>Often</td></tr>
      <tr><td>Does not listen to rules</td><td>Never</td><td>Sometimes</td><td>Often</td></tr>
      <tr><td>Does not understand other people''s feelings</td><td>Never</td><td>Sometimes</td><td>Often</td></tr>
      <tr><td>Teases others</td><td>Never</td><td>Sometimes</td><td>Often</td></tr>
      <tr><td>Blames others for his or her troubles</td><td>Never</td><td>Sometimes</td><td>Often</td></tr>
      <tr><td>Takes things that do not belong to him or her</td><td>Never</td><td>Sometimes</td><td>Often</td></tr>
      <tr><td>Refuses to share</td><td>Never</td><td>Sometimes</td><td>Often</td></tr>
    </tbody>
  </table>

  <p>How long has this been a concern?</p>
  <p>__________________________________________________________________________________________________________________</p>
  <p>What do you hope to gain from counseling?</p>
  <p>__________________________________________________________________________________________________________________</p>
  <p>__________________________________________________________________________________________________________________</p>
  <p>Has anything been helpful in the past?</p>
  <p>__________________________________________________________________________________________________________________</p>
  <p>Please list any necessary medical information, including food allergens.</p>
  <p>__________________________________________________________________________________________________________________</p>
  <p>__________________________________________________________________________________________________________________</p>

  <h2>CONSENT TO RELEASE AND EXCHANGE PROTECTED HEALTH INFORMATION</h2>
  <p><strong>Disclaimer:</strong> This document is generated as a default. Client and guardian identity details are inferred from the completed intake questionnaire (client name, DOB, parent/guardian). Default rule: items are authorized unless a Deny checkbox is marked where available. This release is for coordination with:</p>
  <p><strong>Relationship to party:</strong> Student</p>
  <p><strong>School name:</strong> {{SCHOOL_NAME}}</p>
  <p><strong>School address:</strong> {{SCHOOL_ADDRESS}}</p>
  <p>School-based services require the authorizations marked Required below. If you are not comfortable with required terms, in-school services may not be the best fit at this time. ITSCO also offers in-office services and can discuss that option at support@itsco.health or 719-657-7444 ext. 0.</p>

  <h3>Required authorizations</h3>
  <p><strong>(no denial option for in-school services)</strong></p>
  <p>By signing, I authorize ITSCO and assigned providers/staff to coordinate psychological services on school property; share limited scheduling and safety logistics when needed, limited to operational need-to-know details; make safety-related disclosures when necessary to prevent or lessen a serious and imminent threat, as permitted by law (including 45 CFR 164.512(j)); and maintain confidentiality/documentation standards and document correspondence in the clinical record as required by law.</p>

  <h3>Optional authorizations</h3>
  <p>Check Deny only if you do not authorize that item.</p>
  <ul>
    <li>Deny School communication &amp; care planning (communication with approved school staff to support needs/care plan).</li>
    <li>Deny Treatment goals &amp; plans (brief discussion of treatment goals/objectives for coordination; no session-content details beyond care purpose).</li>
  </ul>

  <h3>Term of authorization</h3>
  <p>This authorization is valid for 36 months from date signed, unless revoked earlier in writing.</p>

  <h3>Authorized School Staff</h3>
  <p>All listed staff are authorized unless Deny is checked.</p>
  <p>{{SCHOOL_STAFF_TABLE}}</p>

  <h3>Important disclosures</h3>
  <ul>
    <li>Information disclosed by ITSCO may be re-disclosed by recipients and may no longer be protected in the same manner after disclosure.</li>
    <li>I may revoke this authorization at any time by contacting support@itsco.health or 719-657-7444 ext. 0, but prior actions taken cannot be reversed.</li>
    <li>I understand the potential consequences of disclosure and voluntarily authorize release as described above, except items or individuals explicitly denied by checkbox.</li>
  </ul>

  <h3>ITSCO contact</h3>
  <p>Generated by ITSCO''s authorized representative, Michael Mendez, MA, LPC | Founder</p>
  <p>Questions or privacy concerns: Privacy@ITSCO.health</p>
  <p>Primary address: 437 Windchime Pl, Colorado Springs, CO 80919</p>

  <p>Client''s or Responsible Party''s Signature ____________________________ Date __________________</p>

  <h2>ACKNOWLEDGEMENT AND CONSENT SUMMARY</h2>
  <p>By signing below, I acknowledge and consent to the following documents for which the versions are as of the date of the signature of this document and included in Version 1.14:</p>
  <ul>
    <li>Insurance Information Acknowledgement (p.6): I authorize ITSCO, LLC to release information to the insurance companies provided, for the purposes of submitting claims on my behalf.</li>
    <li>Minor Consent (p.6) and Informed Consent (p.7): I confirm that I have reviewed, understand, and agree to the terms outlined in the Minor Consent and Informed Consent documents, acknowledging the rights, responsibilities, and the therapeutic relationship established between the client and ITSCO.</li>
    <li>Group Consent (p.10): I have read and understand the terms outlined in the Group Consent document, acknowledging the rights, responsibilities, potential risks, rules and regulations, and limitations to group participation, if and as applicable.</li>
    <li>Policy and Services Agreement (p.13): I have read and agree to the terms of the Policy and Services Agreement, understanding ITSCO''s services, policies, and my rights and obligations within the school and private practice settings.</li>
    <li>Disclosure Statement (p.16): I acknowledge receipt and understanding of the Disclosure Statement, detailing regulatory frameworks and my rights as a client or guardian within the therapeutic process.</li>
    <li>HIPAA Privacy Policy (p.19): I acknowledge the HIPAA Privacy Policy and understand my health information privacy rights under the Health Insurance Portability and Accountability Act.</li>
    <li>Personal Declaration: I hereby declare that all the information and signatures provided for the documents listed above are solely related to the individual mentioned and their personal information. No other individual''s information or signature is included or implied in any way.</li>
    <li>Law Compliance: Where this summary and acknowledgement differ from relevant state or federal laws, those laws will govern.</li>
  </ul>
  <p>Your Printed Name _____________________________________________________________________________________________</p>
  <p>Please state the relationship to dependent AND authority to consent (if client, "self") ________________________________________________________________________________________________________</p>
  <p>Client''s or Responsible Party''s Signature ____________________________ Date __________________</p>
  <p>Signature of Parent/Guardian #2 (if applicable) Relationship Date ______________________________________________</p>
  <p>Please retain these documents for your personal records. They include crucial information regarding your rights, our policies, and the specific services offered. Your acknowledgement and signatures pertaining to these matters have been captured in the Acknowledgement and Consent Summary page. Keeping a copy of these documents will ensure you have ready access to important details of our agreement and your privacy protections as we proceed with our professional relationship.</p>

  <h2>INSURANCE INFORMATION</h2>
  <p>I grant ITSCO, LLC permission to disclose necessary information to the insurers listed on this form for the purpose of filing claims. This permission includes sharing details relevant to securing payment for services rendered, such as mental health, substance use, or HIV-related information. Furthermore, I assign any eligible benefits directly to ITSCO, LLC and allow payments from my insurers, Medicare, or other payers to be made directly to them. I acknowledge my responsibility for any charges not covered by my insurance, including copays, coinsurance, deductibles, services not approved by my insurance, and fees for services considered not medically necessary.</p>

  <h2>MINOR CONSENT</h2>
  <p>Counseling services for minors require clear legal authorization. This includes the consent and approval for treatment from both parents or guardians, unless there is specific documentation provided at intake that states otherwise, or in cases where the parents are married and share dual full custody. The signature of a legal custodial parent or guardian on the intake documentation authorizes ITSCO to conduct a mental health assessment and provide treatment to the named minor child. This authorization remains valid until the professional relationship is terminated or the consent is explicitly revoked.</p>
  <p>It''s essential for ITSCO to ensure that the individual seeking services for a minor has the legal right to do so. In situations of divorce, both parents'' consent is necessary for the minor to receive services. Divorced parents, step-parents, grandparents, guardians, or others may need to provide a copy of the court order that establishes them as the legal custodian of the minor. This process is in place to safeguard the therapeutic environment and to uphold the minor''s right to privacy and confidential therapy, in accordance with legal requirements and professional ethics.</p>

  <h2>INFORMED CONSENT</h2>
  <p>This document contains important information about the client''s rights and the responsibilities of each of us as we enter in the counselor-client relationship. We believe that a well formed therapeutic relationship is the vehicle for progress and necessary to the healing process.</p>
  <p>Please ensure you carefully review and understand the information contained in this document. It is part of a comprehensive set of documents detailing our professional services, policies, and your rights as a client or guardian. We encourage you to take your time reading through this material and discuss any topics or questions you may have with your assigned counselor or facilitator. Your understanding and questions are crucial to us, as they help establish a clear and informed therapeutic relationship. Your formal acknowledgment and consent to this and other related documents will be captured on a summary page provided for your signature.</p>

  <h3>Client''s Rights</h3>
  <ul>
    <li>The client (or their parent/legal guardian) may ask any questions regarding what to expect during and end result of therapy.</li>
    <li>The client (or their parent/legal guardian) may decline to proceed in therapy as to the techniques which may be conducted by the counselor.</li>
    <li>The client (or their parent/legal guardian) may cease to continue therapy at any time, without impediment and may return to therapy at any time.</li>
    <li>The counselor has the right to dismiss the client from the course of therapy.</li>
    <li>The client (or their parent/legal guardian) has the right to review their records from the therapist.</li>
    <li>The client (or their parent/legal guardian) can raise any concerns and to speak with the therapist immediately of any concerns provided that the therapist is available to discuss matters with the client (or their parent/legal guardian).</li>
  </ul>

  <h3>Right to Confidentiality</h3>
  <p>The Health Insurance Portability and Accountability Act (HIPAA), along with relevant state and local laws, strictly governs the way ITSCO handles your protected health information (PHI). ITSCO is considered a "covered entity" under HIPAA, meaning that we comply with HIPAA privacy rules. Generally, there are three things we can use your protected health information for treatment, payment, and health care operations. Our full notice of privacy practices can also be found on our website at ITSCO.health/privacy.</p>
  <p>As a HIPAA covered entity, ITSCO keeps all of your PHI (including any communications you have with your counselor) strictly confidential. However, there are exceptions including situations where ITSCO must disclose information pursuant to state and federal law. The following is a list of some exceptions:</p>
  <ul>
    <li>The client signs a written consent or authorization to use or disclose PHI.</li>
    <li>The client expresses serious intent to harm self or someone else.</li>
    <li>There is reasonable suspicion of abuse or neglect against a minor, elderly person, or dependent adult.</li>
    <li>For billing purposes.</li>
    <li>For supervision purposes.</li>
    <li>For subpoena or court order.</li>
  </ul>

  <h3>Confidentiality in Schools</h3>
  <p>Confidentiality in the school care setting has limitations. By signing, you acknowledge that complete confidentiality for your minor dependent isn''t guaranteed, accepting the risk of others becoming aware of their therapy attendance. Risks include teachers and classmates may learn of the therapy sessions due to excused absences or seeing the dependent with a clinician; and school staff involved in hall monitoring, attendance, or office duties may also be aware of the dependent''s participation in therapeutic services.</p>

  <h3>Clinician Qualification Statement</h3>
  <p>ITSCO employs individuals who provide services based on their level of training and qualifications. The client (or their parent/legal guardian) acknowledges that, where not prohibited by license status or state regulation, the session may be conducted by a bachelor''s level, unlicensed master''s level, or provisionally licensed professional under the direct active supervision of a fully licensed clinician. If you would like to learn the license status of your clinician, you can find that information in their bio on www.ITSCO.health or in the Disclosure Agreement. If you have any other questions, please email Rachel@ITSCO.health.</p>

  <h3>Educational Observation</h3>
  <p>As part of our commitment to continuous learning and education in the field of mental health, ITSCO may involve interns or trainees in therapy sessions for educational and training purposes. These individuals are bound by the same standards of confidentiality and professional conduct as our licensed therapists.</p>
  <p>By signing this consent, you authorize the occasional observation of your therapy sessions by these trainees or interns. These observations will be conducted discreetly and will be used solely for the purpose of enhancing educational and professional standards. No film or audio recording will ever be allowed.</p>

  <h3>Professional Records Statement</h3>
  <p>ITSCO is required to keep appropriate records of the healthcare services that we provide. Your (or your minor''s) records are maintained in a secure electronic health record system. Except in unusual circumstances that involve danger to the client, the client has the right to a copy of their health records with proper authorization.</p>

  <h3>Electronic Communication &amp; Online Counseling Statement</h3>
  <p>Telephone (including text), email, and videoconference are not encrypted methods of communication, and some confidentiality risk exists with their use. Our team communicates using these mediums. By signing this document you consent to your (or your minor''s) counselor, or someone from our team, following up with you by telephone, text or email for scheduling, billing, quality assurance, or other reasons.</p>

  <h3>Emergency Contacts</h3>
  <p>Your counselor will establish emergency contacts for you, such as a family member, a mobile phone, or work phone number. These contacts may be used if your counselor perceives a need. If you are actively suicidal or if you are in crisis and cannot reach your counselor, please go to your nearest emergency room, call 1-844-493-TALK, or call/text 988.</p>

  <h2>GROUP CONSENT</h2>
  <p>Our program primarily utilizes Skill Builders to enhance mental health, social functioning, and community integration through structured activities. However, group work may also encompass other forms of engagement beyond skill development.</p>
  <p>Please ensure you carefully review and understand the information contained in this document. It is part of a comprehensive set of documents detailing our professional services, policies, and your rights as a client or guardian. We encourage you to take your time reading through this material and discuss any topics or questions you may have with your assigned counselor or facilitator. Your understanding and questions are crucial to us, as they help establish a clear and informed therapeutic relationship. Your formal acknowledgment and consent to this and other related documents will be captured on a summary page provided for your signature.</p>
  <h3>Objectives and Benefits</h3>
  <ul>
    <li>Skill Development: To improve social skills, coping strategies, self-esteem, and mental health awareness.</li>
    <li>Emotional Well-being: To promote healthy habits and ease transitions to new environments.</li>
    <li>Community Integration: To empower participants in their mental health journey and foster belonging.</li>
  </ul>
  <h3>Role of Group Facilitators</h3>
  <p>Facilitators are pivotal in creating a safe, supportive environment where participants can actively develop necessary skills. They tailor activities to individual needs, encourage open communication, and ensure group safety. Additional facilitators or co-facilitators may be present to help groups run safely and effectively, and they are bound by the same confidentiality standards.</p>
  <h3>Potential Risks</h3>
  <ul>
    <li>Emotional Discomfort: Participants might experience intense emotions or recall unpleasant memories.</li>
    <li>Group Dynamics: There is a risk of triggering or upsetting comments or behaviors from other members, especially given the diverse backgrounds and cultures within the group.</li>
  </ul>
  <h3>Safety and Conduct</h3>
  <ul>
    <li>Participant Conduct: Respectful behavior is expected, with zero tolerance for aggression or harassment.</li>
    <li>Physical Contact: Participants should assume that no holds or physical contact will occur during sessions.</li>
    <li>Emergency Protocols: If a participant becomes aggressive, threatens others, or attempts to leave, campus or district police will be contacted. Should a participant leave campus or school grounds, 911 will be called.</li>
    <li>Consistent Attendance: Regular participation is crucial for skill-building effectiveness. Frequent absences without prior notification may lead to reevaluation of participant fit.</li>
    <li>No-Tolerance for Substances: There is a zero-tolerance policy for any substances, including vapes, at group sessions.</li>
  </ul>
  <h3>Confidentiality</h3>
  <ul>
    <li>Privacy: Information shared within the group must remain confidential.</li>
    <li>Legal Disclosure: Exceptions include situations involving abuse, self-harm, or harm to others.</li>
  </ul>
  <h3>Rights of the Client</h3>
  <ul>
    <li>Right to Refuse: Participants can refuse any part of the program or activities without affecting their overall participation.</li>
    <li>Right to Information: Participants can request information about the program, their progress, or any changes in program structure.</li>
  </ul>
  <h3>Termination of Participation</h3>
  <ul>
    <li>By Participant: Participants can withdraw at any time without prejudice or obligation to continue.</li>
    <li>By Facilitator: Facilitators may terminate participation if it is deemed not in the best interest of the participant or the group, especially if consistent refusal to participate indicates that alternative services might be more suitable.</li>
  </ul>
  <h3>Voluntary Participation</h3>
  <p>Participation in the program is voluntary. However, consistent refusal to engage in activities might suggest that alternative services could better meet the participant''s needs, at which point the facilitator may refer them to other resources.</p>
  <h3>Liability</h3>
  <ul>
    <li>Host Site Liability: The venue provider, by offering space for our program, is not involved in its operation or content. They are released from all liabilities, claims, or actions arising from the program, except for gross negligence or willful misconduct.</li>
    <li>Operational Exclusivity: The facilitating partner is solely responsible for program delivery, participant selection, content, and activities.</li>
    <li>Billing and Financial Responsibilities: All billing inquiries must be directed to the facilitating partner, absolving the host site of any financial involvement.</li>
    <li>Non-Involvement in Care: The host site does not influence or participate in therapeutic services or care decisions, thus bearing no liability for care outcomes.</li>
    <li>Indemnification: The facilitating partner agrees to indemnify the host site against losses or damages related to the program, except for those directly caused by the host site.</li>
    <li>Emergency Situations: The host site''s role in emergencies is limited to providing access to emergency services, without liability for the incident''s cause.</li>
    <li>Limitation of Liability: Our organization''s liability is limited to direct negligence or misconduct. Some risks, including potential breaches of confidentiality due to venue aspects, are beyond our control.</li>
  </ul>
  <h3>Food and Snacks</h3>
  <ul>
    <li>Snack Provision: Snacks may be provided by our organization during sessions.</li>
    <li>Personal Snacks: Participants are allowed to bring their own snacks during designated times, but must indicate any food allergies on their intake document to ensure safety.</li>
  </ul>
  <h3>Conclusion of Participation</h3>
  <p>If the program does not meet your needs, facilitators will assist in finding alternative resources or referrals.</p>
  <h3>Acknowledgment</h3>
  <p>By signing, you acknowledge understanding the rights, responsibilities, and potential outcomes of participating in our group work, including the Skill Builders program.</p>

  <h2>POLICY AND SERVICES AGREEMENT</h2>
  <p>This document contains important information about our professional services and business policies.</p>
  <p>Please ensure you carefully review and understand the information contained in this document. It is part of a comprehensive set of documents detailing our professional services, policies, and your rights as a client or guardian. We encourage you to take your time reading through this material and discuss any topics or questions you may have with your assigned counselor or facilitator. Your understanding and questions are crucial to us, as they help establish a clear and informed therapeutic relationship. Your formal acknowledgment and consent to this and other related documents will be captured on a summary page provided for your signature.</p>
  <h3>About our Services In The Schools</h3>
  <p>It''s our goal to offer exceptional private practice counseling services to individual students in the school setting. We would like to empower students to reach their full potential through appropriate individual therapy, learning skills/utilizing tools/strategies, and expanding on their strengths.</p>
  <p>Our goal is for students to reach their full potential emotionally and mentally, as well as academically while removing the burdens of travel, time, and scheduling.</p>
  <p>ITSCO offers individualized counseling services to children ranging from Kindergarten through 12th grade located within the school. The company aims to help children explore their true potential, develop coping skills, navigate stressful life situations, and improve their mental health. We provide a safe, fun environment for students to grow in all areas of their life.</p>
  <h3>About our Services Outside of Schools</h3>
  <p>ITSCO also maintains "brick and mortar" location/s to offer private practice counseling outside of the schools. These offices will be in use by our counselors for a variety of sessions, including seeing their clients outside of school hours and days (including the summer!), family sessions, group sessions, and individual counseling that extends to adults of all ages.</p>
  <p>Our counselors provide personalized therapeutic mental health care utilizing a variety of specialties and are empowered to create their own caseload in addition to their school hours.</p>
  <h3>Acknowledgement of Stand-Alone Services</h3>
  <p>By signing this document, you agree and understand that ITSCO is NOT an employee of your child''s school or district. ITSCO is an independent, privately owned limited liability company who provides services directly to students with direct permission of the district and each school. Your child''s school agrees to provide ITSCO a safe and private environment for your child and the counselor to meet free of disruption. ITSCO is a stand-alone service.</p>
  <h3>Three Strike Attendance Policy</h3>
  <p>ITSCO providers are only able to see, on average, 6 clients per-school-day and are not able to fill a missed session like a typical provider in an office setting due to only seeing the students who attend that particular school. Therefore, slots will be prioritized for clients who are able to attend on a consistent basis.</p>
  <p>Clients who miss 3 sessions for any reason during a school year may lose their recurrent session time-slot and will therefore be placed on a waitlist or transitioned to in-office care, as applicable. In the event that a student is absent from school, a virtual parent session may be conducted and will not be considered a missed session.</p>
  <h3>Cessation of Services/Termination</h3>
  <p>By signing this document, you agree, understand, and acknowledge the following:</p>
  <ul>
    <li>You may terminate your or your child''s/minor''s therapy at any time for any reason.</li>
    <li>Cessation of services may occur for a variety of reasons, including but not limited to poor fit, lack of progress, repeated no shows (see our no show/cancellation policy below) and when a client''s issues are outside of a counselor''s training.</li>
    <li>In the event of termination while seeing a counselor within the school, ITSCO will refer you, your family, or your child/minor to options outside of the school setting.</li>
    <li>ITSCO cannot guarantee an alternative counselor will be sent into the school.</li>
    <li>In the event of termination due to your child''s/minor''s counselor leaving our organization, ITSCO will do everything in its power to replace that clinician at your child''s/minor''s school. Should ITSCO not fulfill that goal, it will provide you with several referrals, each of which will most likely not occur in your child''s/minor''s school. ITSCO cannot guarantee availability at those referrals.</li>
  </ul>
  <h3>Transportation/Selection of Counselors</h3>
  <p>In almost every case ITSCO selects one counselor to see up to six students per day at a particular location. That location is assigned based on the availability of the counselor as well as distance traveled from their homes. Due to these factors as well as availability of the school, ITSCO cannot guarantee the counselor who will be selected will be the best fit. You have the right to choose your (or your child''s) counselor. In the event the counselor we provide to your child''s school is not a good fit, ITSCO will provide you with referrals and recommendations that will be located outside of your child''s school, where ITSCO cannot guarantee availability.</p>
  <h3>Comments/Concerns</h3>
  <p>By signing this document, you agree, understand, and acknowledge the following:</p>
  <ul>
    <li>ITSCO is not an employee of the school, therefore all comments or concerns should be brought directly to the attention of your counselor or our ITSCO staff.</li>
    <li>ITSCO is governed by DORA, the department of regulatory agencies. The specific agency within the Department that has responsibility specifically for licensed and unlicensed psychotherapists is: Department of Regulatory Agencies Division of Registrations, Mental Health Section 1560 Broadway, Suite 1350 Denver, Colorado 80202 (303) 894-7800.</li>
    <li>As your child''s information is protected under the Health Insurance Portability and Accountability Act (HIPAA), unless there is specific written approval by the parent or guardian, the principal or other administration will not have access to any information regarding your child''s care. Therefore, please direct all inquiries to your counselor or our offices.</li>
  </ul>

  <div class="page-break"></div>

  <h2>Client Rights and Disclosures</h2>
  <p>(I) I understand that I am entitled to receive information about the methods of therapy, the techniques used, the duration of therapy, if known, and the fee structure.</p>
  <p>(II) I understand that I may seek a second opinion from another therapist or may terminate therapy at any time.</p>
  <p>(III) I understand that in a professional relationship such as this, sexual intimacy is never appropriate and should be reported to the board that licenses, registers, or certifies the licensee, registrant, or certificate holder.</p>
  <p>(IV) I understand that the information I provided during my therapy sessions is legally confidential in the case of individuals licensed, certified, or registered under Colorado''s Regulatory agencies, except for certain legal exceptions that will be identified by the licensee, registrant, or certificate holder should any such situation arise during therapy.</p>
  <p>(V) I understand that my records may not be maintained for longer than seven years, subject to changes in state or federal law.</p>
  <p><strong>Colorado Regulatory Responsibilities:</strong> The Colorado Department of Regulatory Agencies has the general responsibility of regulating the practice of licensed psychologists, licensed social workers, licensed professional counselors, licensed marriage and family therapists, licensed clinical social workers, licensed school psychologists practicing outside the school setting, and unlicensed individuals who practice psychotherapy.</p>
  <h3>Levels of Regulation Applicable</h3>
  <p>The levels of regulated titles and licenses are listed below. The levels of regulation applicable to mental health professionals vary in the requirements of educational experience, training requirements, and experience necessary to achieve the specific and particular licensure, registration, and certification requirements.</p>
  <ul>
    <li>An Unlicensed Psychotherapist is a psychotherapist listed in the State''s database and is authorized by law to practice psychotherapy in Colorado, but is not licensed by the state and is not required to satisfy any standardized educational or testing requirements to obtain a registration from the state.</li>
    <li>An Unlicensed Intern is a master''s level therapist who must be currently enrolled as a student and is provided 2-4 hours of individual and group supervision hours per week. They are authorized to practice psychotherapy in Colorado, but are not licensed by the state nor registered by the state. Their practice is overseen and falls under the responsibility of their primary supervisor''s licensure.</li>
    <li>A Certified Addiction Technician (CAT/ACA) must be a high school graduate or equivalent, complete required training hours, 1,000 hours of supervised experience and pass the NAADAC NCAC Level I exam.</li>
    <li>A Certified Addiction Specialist (CAS/ACC) must have a bachelor''s degree in clinical behavioral health, complete required training hours, 3,000 hours of supervised experience (may include hours completed for the CAT/ACA), and pass the NAADAC NCAC Level II exam.</li>
    <li>A Licensed Addiction Counselor (LAC/ACD) must have a clinical master''s degree, meet the CAS/ACC requirements or complete 2,000 additional hours of supervised experience, and pass the NAADAC MAC exam.</li>
    <li>A Licensed Social Worker must hold a master''s degree from a graduate school of social work and pass an examination in social work.</li>
    <li>A Licensed Clinical Social Worker (LCSW/CSW) must hold a master''s or doctorate degree from a graduate school of social work, practice as a social worker for at least two years, and pass an examination in social work.</li>
    <li>A Psychologist Candidate, a Marriage and Family Therapist Candidate, and a Licensed Professional Counselor Candidate must hold the necessary licensing degree and be in the process of completing the required supervision for licensure.</li>
    <li>A Licensed Marriage and Family Therapist must hold a master''s or doctoral degree in marriage and family counseling, have at least two years post-master''s or one year post-doctoral practice, and pass an exam in marriage and family therapy.</li>
    <li>A Licensed Professional Counselor must hold a master''s or doctoral degree in professional counseling, have at least two years post-master''s or one year postdoctoral practice, and pass an exam in professional counseling.</li>
    <li>A Licensed Psychologist must hold a doctorate degree in psychology, have one year of post-doctoral supervision, and pass an examination in psychology.</li>
  </ul>
  <p>If your clinician or provider is listed as an "Unlicensed Psychotherapist", that individual is listed in the state''s database and is authorized to practice psychotherapy in Colorado but is not licensed by the state and is not required to satisfy any standardized educational testing requirements to obtain registration from the state.</p>
  <p>I have read the preceding information on our Disclosure Statement and understand my rights as a client or as the client''s responsible party.</p>

  <h2>Disclosure Statement</h2>
  <p>This document is mandatory for all mental health professions in Colorado. The specific agency within the Department that has responsibility specifically for licensed and unlicensed psychotherapists is the Department of Regulatory Agencies, Division of Profession and Occupations, Healthcare Professions Programs, State Board Specific to Each Clinician/Provider is Listed with Each Individual, 1560 Broadway, Suite 1350 Denver, Colorado 80202 (303) 894-7800.</p>
  <p>The purpose of this document is to explain the levels of regulation applicable to mental health professionals under the Mental Health Practice Act and the differences between licensure, registration, and certification, including the educational, experience, and training requirements applicable to the particular level of regulation. The direct entity, ITSCO LLC, covered by this document can be found below, as well as the clinicians and providers who are employees of ITSCO LLC.</p>
  <p>Note: The clinicians and providers listed below are subject to change. This document will be sent, acknowledged, and signed by clients or their parent/guardian at the time of intake and accurate information about their specific clinician/provider will be listed.</p>
  <p><strong>Business Entity:</strong> ITSCO LLC</p>
  <p><strong>Business Address:</strong> 437 Windchime Place, Colorado Springs, CO 80919</p>
  <p><strong>Phone Number:</strong> 833-444-8726</p>
  <h3>Your care team</h3>
  <p>The roster below is where the live provider and disclosure team will be merged in at intake time.</p>
  <p>{{DISCLOSURE_CARE_TEAM}}</p>

  <h2>HIPAA Privacy Policy &amp; Notice of Privacy Practices</h2>
  <p>The Mental Range Collective (including ITSCO, Next Level Up, The Inner Strength Institute, PlotTwistCo, and MH4kidz)</p>
  <p>THIS NOTICE DESCRIBES HOW MEDICAL INFORMATION ABOUT YOU MAY BE USED AND DISCLOSED AND HOW YOU CAN GET ACCESS TO THIS INFORMATION. PLEASE REVIEW IT CAREFULLY.</p>
  <h3>Introduction and Our Legal Duty</h3>
  <p>We understand that information about your mental health and healthcare is personal. We are committed to protecting the privacy of your Protected Health Information (PHI) in accordance with federal and Colorado laws. As a healthcare provider, we are required by law to maintain the privacy of your PHI, provide you with this notice of our legal duties and privacy practices, and abide by the terms of this notice.</p>
  <p>This Notice applies to ITSCO and its authorized healthcare providers, staff, trainees, and business associates who support the delivery of your care. We will notify you promptly if a breach occurs that may compromise the privacy or security of your information, as required by law. We also follow any state laws that provide additional protections beyond federal law.</p>
  <h3>How We May Use and Disclose Your Health Information</h3>
  <p>The following categories describe the ways we use and disclose health information without your written authorization. For each category, we explain what we mean and give some examples. Not every use or disclosure will be listed, but all of our practices fall within these categories and are in accordance with HIPAA and applicable Colorado law.</p>
  <p><strong>Treatment:</strong> We may use and share your health information to provide, coordinate, or manage your care and related services. This includes sharing information, as needed, among our internal team members. For coordination with outside professionals (such as school counselors or primary care physicians), we will always obtain your prior written consent/authorization before sharing clinical details.</p>
  <p><strong>Payment:</strong> We may use and disclose your health information to bill and receive payment for the services we provide. For example, we might share necessary information with your insurance company to obtain authorization for treatment or reimbursement for services. This could include details like your diagnosis, treatment provided, and dates of service so that your insurer will pay for the care. We will only share the minimum necessary information for billing purposes. If you pay for a service or item out-of-pocket in full, you have the right to ask us not to share that information with your health insurer for payment or healthcare operations, and we will honor that request as required by law.</p>
  <p><strong>Health Care Operations:</strong> We may use and disclose your information for our healthcare operations - the administrative, technical, and quality improvement activities that allow us to run our organization and ensure that all clients receive quality care. This includes uses and disclosures necessary for internal management and to monitor the quality of our services. For example, we might use your information to evaluate the performance of our staff, to assess the quality of care you received, or to learn how we can improve our services. We may also combine information about many clients to decide what additional services we should offer, what services are not needed, or to compare our outcomes to other agencies for quality assurance. In doing so, whenever possible, we remove information that identifies specific clients to protect your privacy.</p>
  <p><strong>Use of Technology and AI Tools in Treatment &amp; Operations:</strong> As part of our treatment and operations, we use certain secure digital tools - including artificial intelligence (AI) powered tools - to enhance the accuracy and efficiency of our services. We want to be transparent about these tools and how we safeguard your information.</p>
  <p><strong>Clinical Note Documentation (AI-Assisted):</strong> Our clinicians may use secure AI-assisted software to help draft or summarize therapy notes and other clinical documentation. This means we utilize advanced computer programs to transcribe or organize information related to your care. Importantly, we do not include direct identifiers (like your full name or contact details) or unnecessary personal details when using these tools, so the notes are de-identified to the extent possible during drafting. The AI tool helps with the phrasing or structure of the note, but your provider reviews and finalizes all content. Once finalized, the note is entered into your official electronic health record (EHR), which is a secure system. Any temporary data or drafts created in the AI tool are deleted promptly after the note is transferred to our EHR. In this way, we ensure that no protected health information remains in the AI system beyond its immediate use for documentation. All access to the AI documentation tool is encrypted and secure, and only authorized staff can use it.</p>
  <p><strong>Audio Transcription (With Consent):</strong> With your explicit prior consent (or your parent/guardian''s consent for minors), we may occasionally audio-record a therapy session or a spoken clinical summary to ensure accuracy in documentation. For example, a therapist might record a summary of the session to transcribe it later. If we do this, we use a secure transcription process that may involve AI technology to convert speech to text. We will only do this if you have given written consent for that recording. The audio recording is used only to create a written clinical note or summary for your record. Immediately after transcription and verification, the audio file and any transcription data outside of our EHR are permanently deleted. The resulting written document is then stored in your EHR. We take care that even during transcription, the data is handled in a way that protects your identity - for instance, we may use your initials or a coding system during the transcription process rather than your full name, especially if the transcription service is a digital tool. Any AI-based transcription service or vendor we use will be a HIPAA-compliant Business Associate bound by a contract to safeguard your information. We will never retain recordings longer than necessary for transcription, and we will never use recorded sessions for any purpose other than creating your clinical documentation (unless you provide specific authorization for an alternate use).</p>
  <p><strong>Business Associate Agreement:</strong> PlotTwistCo operates as a trusted service provider (business associate) supporting our operations. We maintain a Business Associate Agreement (BAA) requiring them to safeguard your information in accordance with HIPAA. They may only use your information to support care coordination and are not permitted to use it for independent purposes, including marketing or communication. They are also required to maintain strong security practices and prevent any re-identification of de-identified data.</p>
  <p><strong>Care Coordination via PlotTwistCo App:</strong> We utilize a secure care management application provided by PlotTwistCo as part of coordinating and enhancing your services. This tool allows authorized healthcare providers involved in your care to temporarily access and share relevant medical information and care plans in order to support coordinated, continuous treatment. For example, members of your care team (such as a therapist and a case manager) may use this tool to stay aligned on your treatment needs and progress.</p>
  <p><strong>Safeguards:</strong> Any information entered into or viewed through this application is protected with industry-standard encryption and security controls. The PlotTwistCo application does not replace our primary electronic health record (EHR); it is used only as a supplementary coordination tool. Information shared through this system is limited to the minimum necessary and is used on a temporary, need-to-know basis. For example, a summary of goals or a progress update may be shared rather than a full record. Information within the application is routinely synchronized with or transferred to our primary EHR within a short period. Any temporary data stored in the application is deleted or made inaccessible once it is no longer needed.</p>
  <p><strong>School Portal Data Transfer (ITSCO Program):</strong> If you are receiving school-based services, we may obtain relevant information from school systems or educational records (such as intake materials or educational plans) to support your care. We will only access this information with proper authority or consent when required. In cases where full access has not yet been authorized, we may temporarily use limited identifying information (such as initials or internal identifiers) solely for the purpose of matching records until appropriate consent is obtained. Once authorization is in place, necessary information will be securely transferred into our electronic health record (EHR). Any information obtained from school systems is treated as Protected Health Information (PHI) and safeguarded in accordance with applicable laws. If temporary handling of information is required prior to full authorization, we limit the data used, restrict access, and ensure that any interim data is securely deleted or rendered inaccessible once it is no longer needed. All processes used to transfer or handle this information are designed to minimize exposure, use secure transmission methods, and prevent unnecessary retention of data.</p>
  <p><strong>Safeguards and Data Privacy in AI Workflows:</strong> Whenever we use any of the above digital or AI-assisted tools, we implement rigorous safeguards to protect your privacy and rights. Encryption: All electronic systems and devices we use (including the AI tools, transcription services, and the PlotTwistCo app) employ encryption in transit and at rest, meaning your information is encoded so that only authorized people can access it. We continuously update our security practices to meet or exceed modern standards and address emerging cybersecurity threats. De-identification: We use de-identified data whenever possible in these workflows. "De-identified" means information that can reasonably identify you (such as your name, contact info, or other direct identifiers) is removed or obscured, in line with HIPAA''s de-identification standards. For example, an AI tool might see "Client X" or initials instead of your name, and might not receive other direct identifiers. According to federal regulations, information that does not identify an individual (and cannot reasonably be used to identify them) is not considered identifiable health information, which is a standard we strive to achieve when using these tools. Furthermore, any vendor or service that assists us with AI or data processing is contractually forbidden from trying to re-identify any de-identified information or using your data for their own purposes. Access Controls: Only authorized members of our workforce or our vetted business associates can access the tools and information, and only as necessary for their job duties. We train our staff on these privacy practices and on how to handle data when using AI, so they understand the importance of not including unnecessary personal details. Consent and Choice: Where your consent is required (such as for audio recordings or certain data sharing), we will obtain it explicitly and in writing. Using these technologies will not override your privacy rights - for instance, if you prefer that we do not use a particular technology in handling your information, you have the right to request a restriction (see "Your Rights" below) and we will accommodate reasonable requests whenever feasible. Transparency: We want you to be fully informed about these practices. Please feel free to ask us any questions about our use of AI or other technology in your care. Our staff are prepared to explain how these tools work to assist you in your treatment and operations, and how your information is protected. We believe that being open about these tools is important for maintaining your trust. You will be informed if any significant new technology or AI process will be used with your health information in a way that wasn''t described here, and we will update this notice as needed to reflect changes in our practices.</p>
  <h3>Other Uses and Disclosures Permitted or Required by Law</h3>
  <p>We may use or disclose your PHI in certain other situations without your authorization, as allowed by law or required by law. For example:</p>
  <ul>
    <li>Required by Law: We will disclose health information about you when required to do so by federal, state, or local law.</li>
    <li>Public Health Activities: We may disclose PHI to public health authorities authorized to receive such information for purposes of preventing or controlling disease, injury, or disability.</li>
    <li>Health Oversight Activities: We may disclose PHI to governmental or regulatory agencies that oversee healthcare systems or providers, for activities such as audits, inspections, licensure, or disciplinary actions.</li>
    <li>Reports of Abuse, Neglect or Domestic Violence: If we believe you are a victim of abuse, neglect, or domestic violence, we may disclose PHI to the appropriate governmental authority authorized to receive such reports, such as a state child protective agency or adult protective services, as required or permitted by law.</li>
    <li>Legal Proceedings: We may disclose PHI in response to a court or administrative order, or in response to a subpoena, discovery request, or other lawful process, but only if efforts have been made to notify you or secure a protective order, as required by law.</li>
    <li>Law Enforcement: We may release PHI to law enforcement officials under certain circumstances, including to report certain types of wounds or injuries as required by law, or in response to a valid court order, warrant, or subpoena.</li>
    <li>Serious Threats to Health or Safety: We may use or disclose PHI if necessary to prevent or lessen a serious and imminent threat to your health or safety, or the health or safety of another person or the public.</li>
    <li>Specialized Government Functions: We may disclose PHI for certain specialized government functions, such as for military or veteran activities, for national security or intelligence activities as required by law, or for the protection of the President and other authorized persons.</li>
    <li>Workers'' Compensation: We may disclose health information as authorized by and to the extent necessary to comply with laws relating to workers'' compensation or similar programs that provide benefits for work-related injuries or illness.</li>
    <li>Research: In some cases, we may use or share your information for health research. All research projects are subject to a special approval process.</li>
    <li>Business Associates: We may share your health information with trusted service providers who perform services on our behalf that require access to Protected Health Information.</li>
  </ul>
  <h3>Uses and Disclosures Requiring Your Authorization</h3>
  <p>In general, we will not use or disclose your health information for any purpose not described in this notice unless you give us your written Authorization. If you do provide an authorization, you may revoke it at any time by submitting a written revocation, and we will stop the future use or disclosure of your information for that purpose (except to the extent we have already acted in reliance on your authorization).</p>
  <ul>
    <li>Psychotherapy Notes: Notes recorded (in any medium) by a mental health professional documenting or analyzing the contents of a private counseling session and that are separated from the rest of your medical record are given special privacy protections.</li>
    <li>Marketing: We will not use or disclose your PHI for marketing purposes unless you give us authorization.</li>
    <li>Text Messaging and Communication Privacy: We do not share your phone number, text message content, or SMS opt-in consent with trusted service providers for their independent communication or marketing purposes.</li>
    <li>Sale of PHI: We will never sell your health information to a third party without your explicit authorization.</li>
    <li>Other Situations: Any other use or disclosure of your PHI that is not described in this notice will be made only with your written authorization.</li>
  </ul>
  <h3>Special Protections for Sensitive Information</h3>
  <ul>
    <li>Substance Use Disorder Records: Records relating to substance use diagnosis, referral, or treatment may be protected by federal law 42 CFR Part 2.</li>
    <li>Mental Health Communications: Colorado law protects the confidentiality of communications between clients and mental health professionals.</li>
    <li>HIV/AIDS or Communicable Disease Information: Colorado law may provide additional protections for information related to HIV/AIDS testing or treatment and certain communicable disease information.</li>
    <li>Minors'' Health Information: If you are under 18 and are authorized by law to consent to certain services, those records might be kept confidential from parents or guardians in accordance with Colorado law.</li>
  </ul>
  <p>If a law (state or federal) ever prohibits or materially limits a use or disclosure of PHI that is permitted under HIPAA, we will follow the more protective law. Conversely, if another law requires us to disclose information that HIPAA would otherwise permit us to refrain from disclosing, we will make the disclosure as required.</p>
  <p>Potential Redisclosure: Please note that when we disclose your health information to outside entities, that information may at times be redisclosed by the recipient and may not be protected by the HIPAA Privacy Rule anymore. In certain cases, re-disclosure by recipients is strictly limited by law, and we will include required notices to that effect when we send out such information.</p>
  <h3>Your Rights Regarding Your Health Information</h3>
  <p>You have the following rights with respect to the health information we maintain about you:</p>
  <ul>
    <li>Right to Inspect and Copy: You have the right to see and get copies of your health information that we maintain in your designated record set, including medical and billing records.</li>
    <li>Right to Request Amendment: If you believe that health information we have about you is incorrect or incomplete, you have the right to request that we correct or add to the record.</li>
    <li>Right to an Accounting of Disclosures: You have the right to request a list (accounting) of certain disclosures of your PHI that we have made outside of treatment, payment, or healthcare operations.</li>
    <li>Right to Request Restrictions: You have the right to request that we limit the uses or disclosures of your health information for treatment, payment, or healthcare operations.</li>
    <li>Right to Request Confidential Communications: You have the right to request that we communicate with you about your health matters in a certain way or at a certain location to further protect your privacy.</li>
    <li>Right to a Paper Copy of This Notice: You have the right to a paper copy of this notice at any time, even if you have agreed to receive it electronically.</li>
    <li>Right to Be Notified of a Breach: If a breach of your unsecured PHI occurs, we will notify you without unreasonable delay and no later than required by law.</li>
    <li>Right to Withdraw Consent or Opt-Out of AI Usage: In any case where we rely on your consent to use such a tool, you have the right to refuse or withdraw that consent at any time.</li>
  </ul>
  <h3>Additional Information and Complaints</h3>
  <p>Changes to This Notice: We reserve the right to change the terms of this Privacy Policy and Notice of Privacy Practices as laws change or as our practices change. If we make a material change, we will revise this notice to reflect the change.</p>
  <p>Questions, Concerns, or Complaints: If you have any questions about this notice or how we handle your health information, please contact us at the information provided below. If you believe your privacy rights have been violated, you have the right to file a complaint with us or directly with the U.S. Department of Health and Human Services (Office for Civil Rights). You will not be retaliated against or penalized for filing a complaint.</p>
  <p>Contact Information: Privacy Officer, The Mental Range Collective Michael Mendez 437 Windchime Place Colorado Springs, CO, 80919 833-444-8726 PO@ITSCO.health</p>
  <p>You may contact our Privacy Officer with any questions about this notice or to exercise any of your rights described herein. We are here to help you understand this policy and your rights. If you have questions about the use of AI tools, digital apps, or any other aspect of your privacy, please do not hesitate to reach out. We will gladly explain more and ensure you feel comfortable with how your information is handled.</p>
  <p>Effective Date of This Notice: 4-2-2026 (This notice replaces any prior versions. Last revised on 2-24-2026.)</p>
  <p><strong>Version 1.15</strong></p>
</section>', NULL)
ON DUPLICATE KEY UPDATE
  html_content = IF(version = 1 AND updated_by_user_id IS NULL, VALUES(html_content), html_content),
  updated_at = CURRENT_TIMESTAMP;
