// ITSCO's public notices. Keep website, portal, and printable copies on this source.
// Adoption/publication checks are recorded in docs/ITSCO_LEGAL_PUBLICATION.md.
export const ITSCO_LEGAL_VERSION = '2026-10-05.1';
export const ITSCO_LEGAL_ORIGIN = 'https://www.itsco.health';
export const itscoLegalLinks = [
  { type: 'privacypolicy', path: '/itsco/privacypolicy', label: 'Privacy Policy' },
  { type: 'terms', path: '/itsco/terms', label: 'Terms of Service & SMS Terms' },
  { type: 'platformhipaa', path: '/itsco/platformhipaa', label: 'HIPAA Notice of Privacy Practices' }
];
const section = (id, title, paragraphs = [], items = [], links = []) => ({ id, title, paragraphs, items, links });
const contact = section('contact', 'Questions, privacy requests, and help', [
  'ITSCO, LLC • Privacy Officer: Michael Mendez • 437 Windchime Place, Colorado Springs, CO 80919.',
  'Privacy questions and requests: PO@ITSCO.health or 833-444-8726. Website, portal, and SMS help: support@itsco.health. Please start with your contact information and the type of assistance you need; do not send detailed health information through ordinary email or text. We can arrange an appropriate way to exchange records.'
], [], [
  { label: 'Email the Privacy Officer', href: 'mailto:PO@ITSCO.health' },
  { label: 'Call the Privacy Officer', href: 'tel:+18334448726' },
  { label: 'Contact ITSCO support', href: 'mailto:support@itsco.health' }
]);

export const itscoLegalDocuments = {
  privacypolicy: {
    title: 'ITSCO Privacy Policy', shortTitle: 'Privacy Policy',
    intro: 'How ITSCO, LLC handles information when you visit our website, use our portal, complete forms, or communicate with our team.',
    sections: [
      section('scope', '1. Who this policy covers', [
        'This policy applies to ITSCO, LLC (ITSCO, we, us), its website at www.itsco.health, and ITSCO services provided through its portals, forms, and messaging tools, including ITSCO’s use of AuricWell. It does not establish a joint privacy notice for other practices or authorize them to contact you.',
        'AuricWell and its operator, Plot Twist Co, provide technology used by ITSCO. A technology provider is not your treating clinician merely because it hosts a form or delivers a message. Independent organizations have their own privacy obligations.',
        'Our HIPAA Notice of Privacy Practices explains how protected health information is used and disclosed and how you can exercise your health-record rights. That notice and applicable law govern protected health information. This website policy is not an authorization to release medical records. Reading either document does not enroll you in text messaging.'
      ], [], [{ label: 'Read the ITSCO HIPAA notice', href: '/itsco/platformhipaa' }]),
      section('information', '2. Information we collect', [], [
        'Information you provide: your name, contact details, communication preferences, form responses, electronic signatures, appointments, requests, and messages. Enrollment and care workflows may also collect guardian or representative details, health information, insurance information, and billing information.',
        'Information received for your care: information from your authorized representative, referring professionals, schools, insurers, and other sources when permitted by law or your authorization.',
        'Technical and usage information: IP address, browser and device information, session and authentication data, pages or features used, timestamps, error reports, and security or audit events. Sensitive information can also appear in forms or messages you submit.',
        'Communication records: message contents, delivery status, consent and withdrawal records, the version of a disclosure you accepted, and related signature and audit evidence. Calls or sessions are recorded only through a workflow that gives the required notice and obtains any required consent.'
      ]),
      section('uses', '3. How we use information', [], [
        'Respond to inquiries; coordinate enrollment, referrals, appointments, and care; communicate with clients and authorized representatives; and manage billing and insurance.',
        'Operate accounts and portals, verify identity and authority, provide technical assistance, maintain records, protect against misuse, and investigate security incidents.',
        'Honor communication choices, deliver requested messages, maintain evidence of consent, and prevent messages after an opt-out.',
        'Improve services and meet legal, licensing, recordkeeping, and reporting duties. Uses of protected health information remain subject to the HIPAA notice and applicable law.',
        'Send optional ITSCO announcements or promotions only with the required separate consent. Agreeing to reminders or care-team messages does not authorize marketing.'
      ]),
      section('sharing', '4. When information is shared', [
        'Access is limited to the purposes of the service and applicable law. Authorized ITSCO clinicians, administrative staff, supervisors, and support personnel may access information needed for their work. A message addressed to a clinician may be handled by another authorized team member.',
        'Service providers may process information to host the portal, store records, deliver communications, process payments, or provide support and security. Providers must be subject to appropriate contractual restrictions, including a business associate agreement when HIPAA requires one. This processing does not give a vendor permission to market to you independently.',
        'We may disclose information to persons you authorize, for care and payment as described in the HIPAA notice, or when legally required or otherwise permitted by applicable law. We do not treat participation in a school program as blanket permission to release counseling records to the school.',
        'A change in ownership or service provider does not eliminate applicable privacy obligations or turn an existing SMS consent into permission for unrelated marketing.'
      ]),
      section('sms-privacy', '5. Mobile information and SMS consent', [
        'We do not sell personal information. We do not share mobile numbers, text message contents, or SMS opt-in data and consent with third parties or affiliates for their marketing or promotional purposes. SMS consent is not transferable to another brand.',
        'Messaging vendors and carriers may process the information needed to deliver ITSCO messages, operate the service, and honor opt-outs. This is service delivery on our behalf, not permission for their independent marketing. Disclosures required by law remain subject to applicable privacy protections.',
        'Each SMS purpose requires its own affirmative choice. A required choice between Yes and No does not require you to choose Yes; neither option is preselected. You may decline all SMS purposes and still request care. Providing a phone number, signing a treatment waiver, acknowledging the HIPAA notice, or accepting website terms does not itself enroll you in recurring SMS.',
        'Reply STOP to opt out of the messaging program that sent the message. Reply HELP for help, or contact support@itsco.health to update preferences or request another way to communicate. Ordinary SMS may be visible on shared devices, lock screens, carrier systems, or to anyone with access to your phone. Please use the designated portal or contact the team for sensitive clinical information.'
      ], [], [{ label: 'Read the SMS terms', href: '/itsco/terms#sms' }]),
      section('cookies', '6. Cookies, storage, and external services', [
        'Our website and portal use browser storage and similar technologies for functions such as sign-in, security, preferences, and reliable operation. Technical logs may also be used to understand errors and website performance. Blocking storage may prevent parts of the portal from working.',
        'Links, maps, videos, payment pages, and other external services may take you to a third party or connect your browser to it. Those services have their own notices. We do not authorize advertising vendors to use patient information or SMS consent for their independent marketing. You can ask us about a particular feature before using it.'
      ]),
      section('technology', '7. Clinical technology and assisted documentation', [
        'Where ITSCO uses electronic or AI-assisted tools for documentation or administrative work, health-information rules still apply. A clinician remains responsible for reviewing clinical documentation and making care decisions. Removing a name or replacing it with initials does not necessarily make information anonymous.',
        'A recording consent, when required, is requested separately. Contact your clinician to discuss recording, transcription, or technology preferences. This policy does not itself authorize recording, unrestricted AI use, or training a general-purpose AI model on your health information.'
      ]),
      section('retention', '8. Security and retention', [
        'We use administrative, technical, and physical safeguards appropriate to the information and the service. No website, device, or communication channel can guarantee absolute security. Keep sign-in credentials private, use devices you trust, and report suspected unauthorized access.',
        'We retain information for care, business, consent evidence, and applicable legal or professional recordkeeping requirements. The period depends on the type of record, age of the client, legal holds, and other obligations. Closing an account or withdrawing SMS consent does not necessarily require deletion of clinical records or the evidence needed to honor that withdrawal.',
        'Deleting a working draft or exporting a note does not guarantee immediate deletion of all copies, logs, or backups. Requests to access, correct, restrict, or delete information are evaluated under the law that applies to that information.'
      ]),
      section('choices', '9. Your choices and rights', [
        'You may request access to or correction of your information, ask about retention, withdraw optional communication consent, or request deletion where applicable law provides that right. We may need to verify your identity and authority before fulfilling a request. Health-record rights and any exceptions are explained in the HIPAA notice.',
        'Additional state privacy rights may apply to information outside HIPAA. If a request is denied, we will explain the reason and any applicable review or appeal process. Exercising a privacy right does not waive your other rights or authorize retaliation.',
        'A parent or guardian does not automatically have access to every minor’s confidential record. We verify representative authority and follow the laws governing the particular service and record. Public website browsing is not a substitute for the appropriate enrollment and consent process for a minor.'
      ]),
      section('updates', '10. Updates', [
        'We will post revisions here with a new effective date and provide additional notice or seek consent where required. A policy revision does not retroactively expand an SMS consent or a medical-record authorization.'
      ]), contact
    ]
  },
  terms: {
    title: 'ITSCO Terms of Service & SMS Terms', shortTitle: 'Terms of Service',
    intro: 'Terms for the ITSCO website, portal, forms, and optional text messaging programs.',
    sections: [
      section('scope', '1. About these terms', [
        'These terms apply to your use of ITSCO, LLC’s website at www.itsco.health and ITSCO’s digital services, including its use of AuricWell. ITSCO is the practice responsible for its services. Plot Twist Co and other technology vendors may operate systems on ITSCO’s behalf.',
        'Use these services only as permitted by these terms and applicable law. Where an agreement or signature is needed, we request it through the relevant workflow. These website terms do not replace treatment consent, a financial agreement, a release of information, a recording consent, or a separate employment agreement.',
        'The Privacy Policy and HIPAA Notice explain our information practices. Acknowledging a notice is different from authorizing disclosure. No provision here waives a patient right that cannot lawfully be waived.'
      ]),
      section('urgent-help', '2. Urgent help and clinical care', [
        'The website, portal, email, and SMS are not emergency services and are not continuously monitored. For an immediate emergency, call 911. In the United States, call or text 988 for the Suicide & Crisis Lifeline. Do not wait for a portal or text reply when urgent help is needed.',
        'General website content is educational. Submitting an inquiry does not by itself establish a clinician-client relationship, confirm an appointment, guarantee insurance coverage, or provide a diagnosis. Clinical care begins through the appropriate enrollment and professional care process.'
      ]),
      section('accounts', '3. Accounts, authority, and acceptable use', [], [
        'Provide accurate contact information and keep it current. Use only accounts and records you are authorized to access. Tell us if your phone number changes or you no longer control it.',
        'Protect credentials and verification codes. Report suspected unauthorized access. Parents, guardians, and other representatives must have authority for the action they take; access may differ by service and applicable confidentiality law.',
        'Do not impersonate another person, upload malicious software, attempt to bypass access controls, interfere with service, or use the service for unlawful harassment or unauthorized collection or disclosure of information.',
        'Use the designated clinical channels for sensitive information. Information submitted for scheduling or support may be reviewed by authorized administrative or supervisory staff as well as your clinician.'
      ]),
      section('appointments', '4. Appointments, payments, and electronic forms', [
        'Appointment availability, cancellation requirements, clinical fees, insurance responsibilities, and payment arrangements are governed by the applicable care and billing agreements. A reminder is a convenience; contact ITSCO if you are unsure whether an appointment is confirmed.',
        'An electronic signature applies to the specific document and choices presented to you. You may request a copy. Signing one document does not authorize unrelated disclosures or optional marketing. Contact us for assistance or an available alternative if you cannot complete an electronic form.'
      ]),
      section('sms', '5. ITSCO SMS program terms', [
        'Sender: ITSCO, LLC, using the name ITSCO. Our optional text programs support appointment reminders, changes, cancellations and session-access links; administrative care-team conversations; separately accepted billing-account and statement-update notices; staff schedules, supervision, team/video sessions and assigned-training notices; and separately selected ITSCO announcements or promotions. The consent form identifies the particular program and purposes you are choosing.',
        'Enrollment: make an affirmative selection for each SMS purpose offered and complete the consent process. Where a Yes or No answer is required, you may select No for every purpose. No answer is preselected. Providing a phone number, accepting these terms, signing a waiver, or acknowledging the HIPAA notice is not enough to enroll you in recurring texts.',
        'Marketing: promotional texts require a separate affirmative opt-in. Reminder, care-team, or staff messaging consent does not include promotions. Consent is not a condition of purchase or treatment. A HIPAA authorization is also obtained when legally required for a use of health information; an SMS opt-in does not replace it.',
        'Message frequency varies. Message and data rates may apply. Messages may be sent using automated technology. Your carrier’s charges and service terms apply. Carriers are not liable for delayed or undelivered messages.',
        'Opt out: reply STOP to the sending number. END, QUIT, CANCEL, UNSUBSCRIBE, REVOKE, and OPT OUT are also supported. You may receive one confirmation of your opt-out. Further messages from that program will stop. If reminders and care-team texts share a program, opting out stops both. Separately enrolled programs can use different numbers; contact support to stop all ITSCO texting or to make a more specific request. We also honor other valid withdrawal requests as required by law.',
        'Help: reply HELP or email support@itsco.health. To re-enroll after opting out, contact support or complete a new consent. Where offered, START or UNSTOP restores only a previously authorized subscription; it does not create consent for a new purpose or another brand.',
        'An incoming text may be answered about the request you made. It does not automatically enroll you in recurring reminders or promotions. Messages may be routed to authorized ITSCO team members for coverage or support. A dedicated number is not a promise that only one clinician will see a message.',
        'SMS is not an end-to-end encrypted clinical messaging service. Avoid sending detailed clinical histories, diagnoses, financial account information, or other sensitive records by ordinary text. Messages can appear on lock screens and shared devices. Ask us about portal messaging or another suitable communication method.',
        'Declining or stopping SMS does not prevent you from seeking care. Contact ITSCO to arrange another communication method. You remain responsible for appointments and other obligations in your separate agreements even if a reminder fails to arrive.'
      ], [], [{ label: 'SMS privacy and data sharing', href: '/itsco/privacypolicy#sms-privacy' }]),
      section('service-access', 'Using SchoolCareBridge and AuricWell', [
        'ITSCO provides the practice services identified in your care or service agreement. SchoolCareBridge is a program of MH4Kidz, with technology managed by Plot Twist Co. AuricWell is software operated by Plot Twist Co. A shared login, website address, ownership relationship or integration does not merge these organizations or make all records available to each of them.',
        'When school personnel use SchoolCareBridge through an ITSCO website or portal, SchoolCareBridge terms govern that service and ITSCO notices continue to govern ITSCO services and provider records. Use only the student records your school or organization authorizes. A referral, a roster entry or permission to sign in is not a blanket release of clinical or education records.',
        'AuricWell platform terms apply when you use its software. Your practice remains responsible for professional decisions and the care it provides. An organization representative signs any required service agreement, data-protection terms and business associate agreement separately; individual users do not bind their employer merely by reading a website notice.',
        'For school coordination, the responsible organizations must identify the lawful basis for each disclosure and any required parent, guardian or eligible-student authorization. School-held education records and a provider’s clinical records may be governed by different laws. Do not place psychotherapy notes, unrelated diagnoses or complete clinical charts into a school coordination message.'
      ], [], [
        { label: 'SchoolCareBridge terms of use', href: 'https://schoolcarebridge.org/schoolcarebridge/terms' },
        { label: 'SchoolCareBridge privacy policy', href: 'https://schoolcarebridge.org/schoolcarebridge/privacypolicy' },
        { label: 'AuricWell platform terms', href: 'https://auricwell.com/auricwell/terms' },
        { label: 'AuricWell privacy policy', href: 'https://auricwell.com/auricwell/privacypolicy' }
      ]),
      section('availability', '6. Availability, external services, and content', [
        'Digital services may be interrupted for maintenance, technical failures, or events outside our control. We cannot guarantee uninterrupted access or message delivery. Contact ITSCO through another available channel if a time-sensitive task cannot be completed online.',
        'External websites and services have their own terms. Links do not guarantee the accuracy or suitability of outside content. You retain your rights in information you submit; we may process it as needed to provide the service and as permitted by the privacy notices and law.',
        'ITSCO and its licensors retain rights in website design, software, and other protected content. You may read, save, and print these policies and materials provided for your personal care or lawful records. Other reuse requires permission unless the law allows it.'
      ]),
      section('access-changes', '7. Access changes and responsibilities', [
        'We may restrict digital access when reasonably necessary to address misuse, security concerns, or legal requirements. Any termination or transition of clinical care is handled separately under professional and legal obligations. Restricting portal access does not eliminate your right to request records or raise a complaint.',
        'ITSCO remains responsible for obligations imposed by applicable law. These terms do not exclude liability where exclusion is unlawful, waive professional duties, or require you to give up privacy, consumer-protection, or patient rights.'
      ]),
      section('changes', '8. Changes and applicable law', [
        'We may update these terms and post the revised effective date. We will provide additional notice or obtain agreement when required. Updates do not expand prior SMS consents, treatment consents, or record-release authorizations.',
        'Applicable federal law and Colorado law govern these terms, subject to any mandatory protections that apply to you. Contact ITSCO to discuss a concern; doing so does not limit your right to contact a regulator or pursue a remedy available under law.'
      ]), contact
    ]
  },
  platformhipaa: {
    title: 'ITSCO HIPAA Notice of Privacy Practices', shortTitle: 'HIPAA Notice',
    intro: 'THIS NOTICE DESCRIBES HOW MEDICAL INFORMATION ABOUT YOU MAY BE USED AND DISCLOSED AND HOW YOU CAN GET ACCESS TO THIS INFORMATION. PLEASE REVIEW IT CAREFULLY.',
    sections: [
      section('scope', '1. Our practice and our responsibilities', [
        'This notice applies to ITSCO, LLC and its workforce when providing ITSCO services. It applies to protected health information in paper, electronic, spoken, and other forms. It is not a joint notice for other practices, schools, the Mental Range Collective, or the operator of a technology platform.',
        'We are required by law to protect the privacy of your health information, provide this notice of our legal duties and privacy practices, and follow the notice currently in effect. We must notify you as required by law following a breach of unsecured protected health information. We apply more protective state or federal confidentiality requirements when they apply.',
        'You can exercise the rights below by contacting our Privacy Officer. We will verify identity and representative authority when needed. A portal may help you obtain information, but using a portal is not a condition of exercising your rights.'
      ]),
      section('rights', '2. Your health-information rights', [], [
        'Access and copies. Ask to inspect or receive paper or electronic copies of information in your designated record set, including medical and billing records. We generally respond within 30 days, or sooner if applicable law requires. A permitted extension requires written notice. We provide the requested format when readily producible, or agree with you on an alternative. Any permitted fee is reasonable and cost-based. We explain a denial in writing and any available review rights. Certain records, including separately maintained psychotherapy notes, have access exceptions.',
        'Corrections. Request an amendment in writing and explain why information is inaccurate or incomplete. We generally respond within 60 days, subject to a legally permitted extension with notice. If we deny the request, we explain why and how to submit a statement of disagreement for your record.',
        'Confidential communication. Ask us to contact you at a particular number or location or in a particular way. We accommodate reasonable requests. You do not have to explain why you are making the request.',
        'Restrictions. Ask us to limit uses or disclosures for treatment, payment, operations, or persons involved in your care. We need not agree to every request. We must honor a request to withhold information about a service paid out-of-pocket in full from your health plan for payment or health care operations, unless disclosure is required by law. Agreed restrictions remain subject to applicable emergency and legal exceptions.',
        'Accounting of disclosures. Ask for a list of disclosures that must be included under HIPAA for a period of up to six years before your request. Treatment, payment, operations, authorized disclosures, and other legally excluded disclosures generally are not included. The first accounting in a 12-month period is free. We tell you in advance about any permitted fee for an additional request and allow you to change or withdraw it.',
        'Paper notice. Request a paper copy of this notice at any time, even if you previously agreed to receive it electronically.',
        'Personal representatives. A person legally authorized to act for you may exercise rights within that authority. We verify the authority and follow applicable exceptions, including protections involving abuse, neglect, safety, and confidential care for minors.',
        'Complaints and breach notice. You may complain to ITSCO or HHS without retaliation. You have the right to receive any breach notification required by law.'
      ]),
      section('routine-uses', '3. Treatment, payment, and health care operations', [
        'Treatment: we use information to assess needs, plan and provide counseling, coordinate care, and make appropriate referrals. For example, members of your authorized care team may review a treatment plan. Sharing with an outside professional remains subject to applicable consent and confidentiality requirements.',
        'Payment: we use and disclose information to determine coverage, obtain authorizations, bill, collect payment, or respond to a health plan’s payment review. A claim may include information about the service and diagnosis. Your right to restrict certain fully self-paid services is described above.',
        'Operations: we use and disclose information for activities such as clinical supervision, quality and safety review, staff training, compliance, audits, and practice administration. Access must relate to the person’s work and applicable law.',
        'We may contact you about appointments, treatment alternatives, and services related to your care. Communication preferences and separate SMS consent requirements still apply. Business associates providing services such as billing, hosting, or record management must have the agreements and safeguards required by HIPAA.'
      ]),
      section('choices', '4. Family, representatives, schools, and your choices', [
        'Where permitted, we may share information relevant to a family member’s or other person’s involvement in care or payment if you agree, do not object when given an opportunity, or the law otherwise permits. If you cannot express a preference, a limited disclosure may be made using professional judgment and applicable law, such as in an emergency. We follow stricter rules for mental health or substance use disorder information.',
        'Receiving services at a school does not by itself authorize disclosure of counseling records to school personnel. Any release must have an appropriate legal basis and any required authorization. School-maintained education records may be governed by FERPA rather than HIPAA; this notice describes ITSCO’s records and obligations.',
        'For minors, consent and access depend on the service, legal authority, and applicable confidentiality law. We do not presume that every parent or guardian may see every record. Ask us to explain the rules relevant to your situation.',
        'If we contact you for fundraising as permitted by law, you can opt out of further fundraising communications. Choosing not to receive them does not affect treatment or payment. Before using records protected by Part 2 for fundraising, we provide a clear opportunity to choose not to receive those communications.'
      ]),
      section('legal-disclosures', '5. Other uses and disclosures allowed or required by law', [
        'The following categories are subject to legal conditions and to more protective confidentiality rules. A request from an outside party does not automatically permit disclosure. We limit disclosures as required by law.'
      ], [
        'Public health and safety: required reporting of disease or other public health matters; reporting suspected child abuse or neglect, abuse of an at-risk person, or domestic violence when authorized or required; and legally permitted action to reduce a serious and imminent threat.',
        'Oversight and compliance: authorized licensing, auditing, investigation, and health oversight activities, including disclosures to HHS to review compliance with privacy rules.',
        'Legal proceedings and law enforcement: responding to a valid legal process only after the applicable conditions, privileges, authorizations, and confidentiality protections are satisfied. Special Part 2 restrictions are described below.',
        'Other public purposes: disclosures permitted for workers’ compensation, specified military or national-security functions, coroners, medical examiners, funeral directors, and organ or tissue donation.',
        'Research: only with an appropriate authorization or another lawful basis, such as a legally approved waiver and required safeguards. This category does not itself enroll you in a research study.'
      ]),
      section('authorization', '6. Uses requiring your written authorization', [
        'We obtain your written authorization for uses or disclosures not otherwise permitted by this notice and law. Most uses or disclosures of separately maintained psychotherapy notes require authorization; limited legal exceptions apply. Ordinary progress notes are not automatically psychotherapy notes.',
        'Marketing uses of health information require authorization when HIPAA requires it. SMS marketing consent is a separate choice and does not serve as a blanket HIPAA authorization. We do not sell your health information. Any proposed sale requiring authorization under HIPAA could not proceed without a separate valid authorization.',
        'You may revoke an authorization in writing. Revocation stops future reliance on it, except for actions already taken in reliance on the authorization and other exceptions permitted by law. Ask the Privacy Officer for assistance.'
      ]),
      section('part-2', '7. Substance use disorder records and additional protections', [
        'Some substance use disorder records are protected by 42 CFR Part 2. If ITSCO receives or maintains these records, we follow the applicable Part 2 rules in addition to HIPAA. This statement does not mean every counseling record is a Part 2 record or that ITSCO is itself a Part 2 program.',
        'Part 2 may allow a single written consent for future treatment, payment, and health care operations. When a HIPAA covered entity or business associate receives records under that consent, subsequent uses and disclosures may be permitted under HIPAA, subject to Part 2’s restrictions and more protective applicable law.',
        'Part 2 records, or testimony describing their contents, cannot be used or disclosed in civil, criminal, administrative, or legislative proceedings or investigations against you without the required specific written consent or a qualifying court order accompanied by a subpoena or similar legal mandate. A routine records request or ordinary subpoena alone does not remove these protections. Consent for proceedings against you must be separate from consent for other purposes.',
        'Colorado and other applicable laws may impose additional limits on mental health communications, minors’ confidential care, and certain other sensitive records. We obtain any consent required by those laws and follow their disclosure limits. A permission described elsewhere in this notice does not override a stricter rule.',
        'Information disclosed to a recipient not subject to HIPAA may be redisclosed and may no longer have HIPAA protection. Other protections, including Part 2 and state confidentiality law, may still apply. We provide legally required disclosure notices.'
      ]),
      section('digital-care', '8. Portals, messaging, recordings, and documentation tools', [
        'ITSCO may use electronic records, portals, communications services, and assisted documentation tools to provide and administer care. These tools do not remove our confidentiality duties. We require appropriate safeguards and business associate agreements where required. Clinicians remain responsible for reviewing clinical documentation.',
        'This notice does not authorize recording a session. Recording or transcription consent is handled separately when required. You may decline or withdraw an optional recording consent and discuss alternative documentation with your clinician. You may also request restrictions relating to other technology uses; we evaluate those requests under the rights described above.',
        'Ordinary email and SMS carry privacy risks, including access through shared devices and carrier systems. Ask us for an appropriate way to exchange sensitive information. Choosing to receive texts does not authorize disclosure to another practice or permission for unrelated marketing.',
        'Health records, consent evidence, and associated records are retained according to applicable professional and legal requirements. Exporting information or deleting a working draft does not guarantee immediate removal of all copies, logs, or backups. Replacing a name with initials is not necessarily de-identification under HIPAA.'
      ]),
      section('complaints', '9. Questions and complaints', [
        'Contact the ITSCO Privacy Officer listed below if you have a question, want to exercise a right, or believe your privacy rights were violated. You may also file a complaint with the U.S. Department of Health and Human Services Office for Civil Rights. We will not retaliate against you for filing a complaint.',
        'HHS Office for Civil Rights: 200 Independence Avenue SW, Washington, DC 20201. The HHS complaint website explains how to file electronically or by mail.'
      ], [], [{ label: 'File a privacy complaint with HHS', href: 'https://www.hhs.gov/hipaa/filing-a-complaint/index.html' }]),
      section('changes', '10. Copies, acknowledgment, and changes', [
        'We make this notice available on our website and upon request. We may ask you to acknowledge receiving it. An acknowledgment is not consent to treatment, permission to disclose records, agreement to marketing, or a waiver of your rights. If an acknowledgment cannot be obtained, we document our efforts as required.',
        'We may change this notice as permitted by law and make the revised notice apply to information already held and information received in the future. A revised notice will show its effective date and be available on our website, at our service locations, and on request.'
      ]), contact
    ]
  }
};
