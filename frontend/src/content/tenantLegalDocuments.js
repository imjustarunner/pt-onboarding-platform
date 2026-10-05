import { itscoLegalDocuments } from './itscoLegalDocuments.js';

const section=(id,title,paragraphs=[],items=[],links=[])=>({id,title,paragraphs,items,links});
function contact(profile) {
  const methods=[profile.privacyEmail||profile.email,profile.privacyPhone||profile.phone].filter(Boolean);
  return section('contact','Questions, privacy requests, and help',[
    `${profile.name}${profile.legalName!==profile.name?` — ${profile.legalName}`:''}. ${profile.privacyOfficer?`Privacy contact: ${profile.privacyOfficer}. `:''}${methods.length?`For privacy requests and assistance: ${methods.join(' or ')}.`:'Use the contact page below to request privacy assistance or a record-access contact.'}`,
    'Please provide your contact information and the type of help you need. Do not include detailed medical records, passwords, or financial account information in an ordinary email or public inquiry. We can arrange an appropriate way to exchange sensitive information.'
  ],[],[
    ...((profile.privacyEmail||profile.email)?[{label:'Email privacy questions',href:`mailto:${profile.privacyEmail||profile.email}`}]:[]),
    ...((profile.privacyPhone||profile.phone)?[{label:'Call for assistance',href:`tel:+1${String(profile.privacyPhone||profile.phone).replace(/\D/g,'')}`}]:[]),
    {label:`Contact ${profile.name}`,href:profile.contactUrl}
  ]);
}

export function legalDocumentsForProfile(profile) {
  if(profile.slug==='itsco') return itscoLegalDocuments;
  const replace = value => String(value)
    .replaceAll('https://www.itsco.health',profile.origin)
    .replaceAll('www.itsco.health',new URL(profile.origin).host)
    .replaceAll('/itsco/',`/${profile.slug}/`)
    .replaceAll('support@itsco.health',profile.email || profile.phone || profile.contactUrl)
    .replaceAll('ITSCO, LLC',profile.legalName)
    .replaceAll('ITSCO',profile.name);
  const copied=JSON.parse(JSON.stringify(itscoLegalDocuments),(_key,value)=>typeof value==='string'?replace(value):value);
  for(const doc of Object.values(copied)) doc.sections=doc.sections.map(s=>s.id==='contact'?contact(profile):s);
  // Use a complete provider notice only for the clinical practices identified in the app.
  if(profile.kind==='healthcare') {
    copied.platformhipaa.sections[0].paragraphs[0]=`This notice applies to ${profile.legalName} and its workforce when providing health care through ${profile.name}. It covers protected health information in any form. Tutoring, coaching, or other nonclinical services are not automatically covered by HIPAA. This is not a joint notice for other practices, schools, or the technology platform operator.`;
    const sms=copied.terms.sections.find(s=>s.id==='sms');
    sms.paragraphs=sms.paragraphs.map(p=>p.startsWith('Help:')?`Help: reply HELP, or contact ${profile.email||profile.phone||profile.contactUrl}. To re-enroll after opting out, contact support or complete a new consent. Where offered, START or UNSTOP restores only previously authorized subscriptions; it does not enroll a new purpose or another brand.`:p);
    return copied;
  }
  const {name,legalName,slug,kind}=profile;
  const platform=kind==='platform';
  const role=kind==='prelaunch'
    ? `${name} is preparing its public services. This notice covers website inquiries and digital information handling. Before clinical enrollment, the treating practice must provide its applicable Notice of Privacy Practices and a working privacy contact. This page does not replace that clinical notice.`
    : platform
    ? `${name} is operated by ${legalName}. We provide technology and operational services. Participating organizations are responsible for the professional services they provide, their users’ access, their instructions to us, and their own privacy notices and consents. We do not become your treating provider by hosting an account, form, or message.`
    : `${name}${legalName!==name?`, a service of ${legalName},`:''} provides the services described on its website and in your specific service agreement. It may use technology operated by Plot Twist Co. Affiliated or participating organizations remain responsible for their own services and privacy obligations.`;
  const smsContact=profile.email||profile.phone||profile.contactUrl;
  const privacy={title:`${name} Privacy Policy`,shortTitle:'Privacy Policy',intro:`How ${name} handles information on its website, forms, accounts, and communications.`,sections:[
    section('scope','1. Who this policy covers',[role,`This policy applies to ${name}'s own services and its use of the platform. It does not combine the privacy practices of independent participating organizations or authorize them to contact you. A treating provider’s HIPAA notice governs its protected health information. Reading a policy does not authorize a medical-record disclosure or enroll you in SMS.`]),
    section('information','2. Information processed',[],[
      'Information you provide, such as name, contact details, account details, service requests, forms, messages, representative information, signatures, payment-related information, and communication choices.',
      'Information provided by an organization or an authorized person to administer services, accounts, employment, enrollment, or participation. Depending on the service, this may include sensitive information, education records, or health information.',
      'Technical information such as IP address, browser and device information, sign-in and security events, timestamps, pages or features used, and diagnostic logs. Communication data includes message contents, delivery status, consent choices, withdrawals, and related audit evidence.',
      'Information from integrations you or your organization authorize. The available integration, account permissions, and your choices determine which information is received.'
    ]),
    section('uses','3. How information is used',[
      'We use information to respond to requests; operate accounts and services; support scheduling, enrollment, communications, billing, and administration; verify identity and authority; maintain records; provide support; detect misuse; and satisfy legal obligations.',
      platform?'When processing records on behalf of an organization, we act under its authorized instructions and applicable agreements. We may also process information for our own account administration, security, support, and other disclosed operational purposes. An organization’s records are not permission for our independent advertising.':'Our authorized team and service providers may process information needed for the service. Service-specific consents, confidentiality rules, and contracts continue to apply.',
      'Optional promotional messages require the consent applicable to that communication. Agreement to reminders, support, or workforce communications does not authorize promotions.'
    ]),
    section('sharing','4. Access and disclosure',[
      'Authorized staff, administrators, and service providers may access information needed for their work. Support requests and messages may be handled by an authorized team, rather than a single named person.',
      'Vendors may process information for functions such as hosting, messaging, payment processing, security, or support. Appropriate contractual limits and a business associate agreement are required where HIPAA requires them. A vendor’s access does not authorize its independent marketing.',
      'We may disclose information with your authorization, to provide the requested service, or as permitted or required by applicable law. We evaluate legal requests and applicable confidentiality restrictions. A referral, shared technology platform, or affiliation is not blanket permission to share confidential records with every organization.',
      'We do not sell personal information or share mobile information or SMS opt-in data and consent with third parties or affiliates for their marketing or promotional purposes. Messaging vendors and carriers may process what is needed to deliver messages and honor opt-outs on behalf of the sender. Consent is not transferred between brands.',
      'A change of ownership or service provider remains subject to privacy obligations and does not convert existing consent into permission for unrelated marketing.'
    ]),
    section('sms-privacy','5. Text messages and your choices',[
      'A program’s consent form identifies its sender, purpose, and choices. Choosing Yes or No may be required, but Yes is never required to obtain services or make a purchase. Where we use a Yes/No form, neither choice is preselected. You can decline every optional SMS purpose.',
      'Providing a phone number, accepting website terms, signing an unrelated waiver, or acknowledging a privacy notice does not itself enroll you in recurring SMS. Marketing requires a separate affirmative choice. Reply STOP to opt out of the sending program, or HELP for assistance. Contact the organization to request broader withdrawal or another way to communicate.',
      'Ordinary text messages can be visible on lock screens, shared devices, and carrier systems. Do not use them to send sensitive records. Stopping texts does not necessarily erase records we must retain, including evidence needed to honor your opt-out.'
    ],[],[{label:'SMS terms',href:`/${slug}/terms#sms`}]),
    section('cookies','6. Browser storage and other services',[
      'Cookies, local storage, and similar technology support sign-in, preferences, security, and site operation. Technical logs help diagnose performance or reliability problems. Blocking browser storage may prevent features from working.',
      'External links, maps, videos, payment services, and integrations have their own terms and privacy practices. Connecting to an external service may disclose technical information to it. We do not authorize advertising vendors to independently market using patient information or SMS consent.'
    ]),
    section('safeguards','7. Safeguards, retention, and automated tools',[
      'We use administrative, technical, and physical safeguards appropriate to the service and information. No system is completely secure. Protect your account and notify the organization of suspected unauthorized access.',
      'Retention depends on the record, service, legal and professional obligations, contracts, and any legal hold. Closing an account or deleting a working copy does not guarantee immediate removal from every record, log, or backup. Requests are evaluated under the law that applies.',
      'Automation or AI-assisted functions may support administrative or documentation workflows. Authorized people remain responsible for reviewing outputs and making professional decisions. This policy does not authorize session recording, unrestricted AI use, or training a general-purpose AI model on health information. Recording and other sensitive uses require the notices, consents, and safeguards applicable to them.'
    ]),
    section('rights','8. Privacy requests and representatives',[
      'Contact us to request access, correction, or deletion where applicable; withdraw optional consent; ask about retention; or raise a privacy concern. We may verify identity and authority. Some records must be retained, and some rights are exercised through the organization that controls the record. We explain a denial and any applicable appeal or review process.',
      'Parents, guardians, and other representatives may act only within their authority. Confidential services for minors and different categories of health or education records may have different access rules. We do not assume a parent may access every record.',
      'Where we process records on behalf of another organization, we assist or direct your request to that organization as appropriate. A complaint or valid privacy request does not waive other rights.'
    ]),
    section('updates','9. Policy updates',['Revisions are posted with their effective date. Additional notice or consent will be provided when required. An update does not retroactively expand a prior messaging consent or authorization.']), contact(profile)
  ]};
  if(kind==='fitness') privacy.sections.splice(3,0,section('activity','Activity connections and team participation',[
    'When you connect an activity service, we process the activity and account data allowed by the connection to provide the features you choose, such as scoring, participation, and progress. Team or leaderboard features can display participation or results to their configured audience. Review the audience before sharing information and avoid including sensitive details in public posts.',
    'You can revoke an integration through its account settings and request help or deletion through our support page. Revoking a connection stops future authorized access but may not remove previously submitted results or records that must be retained. Integration providers, including Strava where enabled, have their own privacy settings and policies.'
  ]));
  if(kind==='coaching') privacy.sections.splice(1,0,section('coaching','Coaching and separately provided counseling',[
    'Life coaching does not by itself create a healthcare relationship or make every coaching record subject to HIPAA. Counseling or tutoring offered through Next Level Up uses that organization’s enrollment, consent, and privacy processes. A coaching inquiry does not authorize transfer of clinical records.'
  ]));
  const terms={title:`${name} Terms of Service & SMS Terms`,shortTitle:'Terms of Service',intro:`Terms for ${name}'s website, accounts, forms, and optional communications.`,sections:[
    section('scope','1. Service and scope',[role,'These terms govern use of our digital services. Specific service, employment, clinical, billing, subscription, or event agreements apply to their respective activities. Where agreement or an electronic signature is required, the relevant workflow requests it. A privacy acknowledgment does not replace a separate consent or authorization.']),
    section('safety','2. Safety and service limits',['The website, portal, email, and SMS are not emergency services and are not continuously monitored. In an immediate emergency call 911. In the United States, call or text 988 for the Suicide & Crisis Lifeline. Do not wait for a message reply when urgent assistance is needed.','General website information is not individualized medical, legal, or financial advice. A submission or automated response does not by itself confirm an appointment, establish a clinical relationship, or guarantee an outcome. Coaching, tutoring, and professional care have different service agreements.']),
    section('accounts','3. Accounts and acceptable use',[],['Provide accurate information, protect credentials and verification codes, and report unauthorized access. Use only accounts and records you are permitted to access.','Do not impersonate another person, bypass access controls, interfere with service, introduce malicious software, or unlawfully collect, disclose, threaten, or harass.','Representatives must have authority for actions they take. Organizations are responsible for appropriate user permissions and lawful instructions. Confidentiality restrictions apply even when information is technically visible.']),
    section('agreements','4. Payments, signatures, and records',['Fees, cancellations, refunds, subscription renewals, and participation requirements must be described in the agreement or checkout applicable to the service. These terms do not create an undisclosed fee or renewal. A reminder does not change your separate appointment or payment obligations.','An electronic signature applies to the document and choices presented. You can request a copy or assistance with an available alternative. Signing one document is not consent to unrelated disclosures or marketing.']),
    section('sms','5. Optional SMS program terms',[
      `Program sender: ${name}. Programs may include requested support conversations, service or appointment reminders, account notifications, staff operational messages, and separately selected announcements or promotions, according to the enrollment disclosure. A tenant’s messages identify that tenant; its consent does not permit another brand to send messages.`,
      'Enrollment requires an affirmative choice for the disclosed purposes. A required Yes/No choice does not require Yes, and neither choice is preselected. You can decline every optional purpose. Supplying a phone number, signing a waiver, accepting these terms, or acknowledging a privacy notice is not enrollment in recurring texts. Marketing requires a separate affirmative opt-in. Consent is not a condition of purchase or treatment.',
      'Message frequency varies. Message and data rates may apply. Automated technology may be used. Carriers are not liable for delayed or undelivered messages.',
      'Reply STOP to opt out of the sending program. END, QUIT, CANCEL, UNSUBSCRIBE, REVOKE, and OPT OUT are also supported. One confirmation may be sent. An opt-out stops all purposes sharing that program; separate programs may use different numbers. Contact support to stop all messaging or make another valid withdrawal request. We honor withdrawals as required by law.',
      `Reply HELP for assistance, or contact ${smsContact}. To resume messages, complete the applicable consent or contact support. Where offered, START or UNSTOP restores only a previously authorized subscription and does not enroll a new purpose or another brand.`,
      'An incoming text permits a response about the request you made; it does not enroll you in ongoing reminders or promotions. Authorized staff may handle or route messages. Ordinary SMS is not end-to-end encrypted clinical messaging. Do not send sensitive records through it; request an appropriate channel.',
      'Keep your phone number current and notify us when you no longer control it. Declining texts does not prevent you from requesting services; arrange another communication method.'
    ],[],[{label:'Privacy and mobile information',href:`/${slug}/privacypolicy#sms-privacy`}]),
    section('availability','6. Availability, content, and third parties',['Service may be interrupted for maintenance, failures, or circumstances outside our control. We do not guarantee uninterrupted availability or message delivery. Use another available channel for time-sensitive matters.','External services have their own terms. You retain rights in information you submit, subject to the permissions needed to provide the service and applicable law. Our software, design, and licensed content remain protected. You may save or print policies and material provided for your own lawful use; other reuse requires permission unless allowed by law.']),
    section('access','7. Access and legal rights',['Access may be restricted to address misuse, security, or legal requirements. Restrictions do not eliminate applicable record-access or complaint rights. Clinical transitions, where relevant, are governed by professional obligations separately from account access.','These terms do not waive rights that cannot lawfully be waived, remove professional duties, or exclude liability where exclusion is unlawful. Applicable service agreements and federal and state law govern the services.']),
    section('updates','8. Updates',['Updated terms will show their effective date. We give additional notice or obtain agreement when required. Updates do not expand earlier messaging consents or record-release authorizations.']),contact(profile)
  ]};
  const hipaa={title:`${name}: Health Information & Privacy`,shortTitle:'Health Information & Privacy',intro:'How this service relates to healthcare privacy, education records, and your treating organization.',sections:[
    section('role','1. The role of this service',[role,platform?'The platform can support organizations that process protected health information. When acting as a business associate, the operator’s handling of that information is governed by applicable law and the relevant business associate agreement. This page is not a provider’s Notice of Privacy Practices or a certification that every feature or communication is HIPAA compliant.':'Healthcare privacy rules depend on who provides the service and who maintains the record. Participation in a network, coaching program, school coordination service, or fitness application does not make every record protected health information under HIPAA. This page does not create a clinical relationship or substitute for a treating provider’s Notice of Privacy Practices.']),
    section('provider','2. Your provider’s notice and rights',['The healthcare organization treating you must provide its applicable privacy notice. It explains access, amendment, confidential communications, restrictions, disclosure accountings, authorized representatives, breach notifications, and complaints. Ask that organization for a paper copy and its privacy contact. We will help direct requests relating to records processed through this service.','A network relationship or shared platform does not grant every member access to health records. Disclosures require an appropriate legal basis and any required authorization. More protective rules, including state confidentiality requirements and 42 CFR Part 2 where applicable, still apply.']),
    section('schools','3. Schools and nonclinical services',['School-maintained education records may be subject to FERPA rather than HIPAA. A school relationship, referral, parent account, or program enrollment is not blanket permission to share confidential counseling records. Representative authority and minor confidentiality depend on the particular service and applicable law.','Coaching, tutoring, network participation, and fitness services have their own scope and agreements. Where a separate provider delivers clinical care, its clinical consent and privacy notice govern that care.']),
    section('technology','4. Technology and communications',['Ordinary SMS and email carry privacy risks. Use the designated channel for sensitive records. A phone number or privacy acknowledgment does not authorize recurring texts, promotions, recording, or a release of health information.','Health information processed through vendors requires applicable safeguards and agreements. Automated or AI-assisted tools do not remove those obligations. Human professionals remain responsible for clinical decisions. Deleting a working copy does not promise immediate deletion from every log, backup, or required record.']),
    section('complaints','5. Requests and concerns',['Contact the organization responsible for the record or use the contact below for routing help. You can raise a privacy concern without retaliation. For a potential HIPAA violation, you may file a complaint with the U.S. Department of Health and Human Services Office for Civil Rights.'],[],[{label:'HHS privacy complaints',href:'https://www.hhs.gov/hipaa/filing-a-complaint/index.html'}]), contact(profile)
  ]};
  if (slug === 'schoolcarebridge') {
    terms.sections.splice(1, 0, section('school-use', 'School and agency users: authority and record boundaries', [
      'SchoolCareBridge is a program of MH4Kidz. Plot Twist Co manages the technology. School personnel, practices and families retain their separate roles. The organization agreements identify the contracting legal entities and their instructions; a program name is not a separate contracting entity.',
      'Your account is individual. Your school or organization must authorize your access and confirm your current role. Access only assigned students and information necessary for your authorized work; do not browse unrelated records, share logins, forward personal session links, download unneeded rosters or use information for independent marketing or fundraising.',
      'A school may disclose education records only with valid consent or an applicable FERPA exception and its required conditions. Where a school-official exception is used, the school must retain the required control and define legitimate educational interests. A vendor contract or BAA does not itself create that exception. A practice must separately evaluate HIPAA and any more protective law before releasing clinical information.',
      'Use coordination tools for authorized referrals, scheduling and permitted status information. Do not assume that a school may read clinical notes or that a parent may access every record. Confirm the sender, recipient, authority and data scope before a release. Access or a completed referral is not a general release authorization.',
      'Do not record, transcribe, export or upload records to an external AI or other service unless your organization has approved that feature and the required notices, agreements and permissions are in place. Optional SMS and session recording use separate consent processes.',
      'Report mistaken access or disclosure promptly to support@mh4kidz.org and your organization’s privacy contact. Provide a safe description without sending student records in ordinary email. Access may be limited during an investigation. Record requests, corrections and deletion requests are routed to the organization responsible for the relevant record.',
      'A school employee’s use of the portal does not execute a BAA, data-sharing contract or organization service agreement. Those documents require authorized organizational signers. Ending access does not erase lawful record-retention duties or individual rights.'
    ]));
    privacy.sections.splice(1, 0, section('school-records', 'School records and clinical records', [
      'SchoolCareBridge supports coordination among schools, families and service organizations. A school’s education record and a provider’s clinical record may be subject to different rules; we do not label every student-related record as HIPAA-protected or treat school access as clinical-record access.',
      'Information is processed for the contracted coordination service under the applicable school and practice instructions. Referral records are not available to donors, sponsors or other affiliates merely because they support MH4Kidz. Service information is not permission to contact a family for fundraising or independent advertising.',
      'Sharing, retention, exports and deletion depend on the responsible organization, the record category, applicable law and the executed agreements. We route requests to the responsible school or practice and assist as required. A business associate agreement does not replace consent or other authority for an education-record disclosure.'
    ]));
  }
  if (platform) {
    terms.sections.splice(1, 0, section('platform-use', 'Platform accounts, integrations and organization agreements', [
      'Use your own authorized account and keep credentials and personal session links private. Your organization controls your assigned role and may remove access when your work ends. Do not access unrelated records, disable protections or export records beyond your authority.',
      'AuricWell is a technology service, including when embedded in a practice website or EHR. A practice remains responsible for its professional care, clinical decisions, notices and authorized disclosures. A school coordination feature may additionally be governed by SchoolCareBridge terms and the school’s data agreement.',
      'Only an authorized organizational representative may execute a service agreement or BAA for the organization. Reading these terms does not execute either document, authorize a release of records, enroll someone in SMS, or consent to recording or transcription.',
      'Only enable integrations and processing features authorized by your organization’s instructions, applicable agreements and required consents. Report suspected account or data misuse promptly through the support contact. Do not include health records in an unsecured support email.'
    ], [], [
      { label: 'SchoolCareBridge terms where that service is used', href: 'https://mh4kidz.org/schoolcarebridge/terms' }
    ]));
  }
  return {privacypolicy:privacy,terms,platformhipaa:hipaa};
}
