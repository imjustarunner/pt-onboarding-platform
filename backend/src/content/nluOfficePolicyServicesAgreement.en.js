/**
 * Next Level Up in-office Policy and Services Agreement.
 * Used only for NLU office packets (paper + digital packet_policy_services).
 * Does not replace ITSCO school packet policy.
 */
function costRow(code, description, cost) {
  return `    <tr>
      <td>${code}</td>
      <td>${description}</td>
      <td>${cost}</td>
    </tr>`;
}

const COST_ROWS = [
  costRow(
    '90791',
    'This code delineates the intake appointment which involves a number of tasks associated with scheduling, clinical assessment, collection and verification of documentation, and treatment planning.',
    '$130'
  ),
  costRow(
    '90832',
    'Sessions in which their duration is 30 minutes or less will be billed as a 90832. Phone calls which last between 20 and 30 minutes will also be billed as a 90832. Sessions which last between 75 and 90 minutes and are not considered a crisis will be billed a 90832 in addition to the appropriate session code.',
    '$50'
  ),
  costRow(
    '90834, 90837, 90846, 90847',
    'Sessions in which their duration is greater than 30 minutes will be billed at the contracted Self Pay Rate*. Phone calls which last beyond 30 minutes will also be billed at the aforementioned rate. If a client attends a second session in a single day, this rate will be billed for the second session, regardless if it occurs at an alternative time or consecutively AND lasts greater than 90 total minutes.',
    '$100'
  ),
  costRow(
    '90839',
    'This code is utilized for emergency sessions with patients who are in high distress and under complex or life-threatening circumstances that demand immediate attention. Examples of this may include clients who display suicidal intent, disabling anxiety, or other overwhelming psychological symptoms.',
    '$130'
  ),
  costRow(
    '+90840',
    'This is an add-on code utilized in conjunction with the 90839 billable crisis code. Any crisis session which goes beyond 75 minutes billed as a 90839 will incur this code for each additional 30 minutes. Therefore, a session lasting two hours would bill as 90839 x 1 and 90840 x 2.',
    '$75'
  ),
  costRow(
    '+99051',
    'This is an add-on code utilized for any sessions outside of Monday through Friday between 8-5pm. Sessions outside of this timeframe will be assessed an additional 20% surcharge relative to the provider’s contracted Self-Pay Rate* and will be listed as an “add on code” in addition to the primary code listed above.',
    '$30'
  ),
  costRow(
    '+90785',
    'This add-on code is called “interactive complexity” and is added to sessions which cause specific challenges impeding the provider’s ability to deliver services and administer treatment. This includes but is not limited to additional individuals in the session, additional contact necessary for outside organizations such as lawyers or schools which does not satisfy another billable code, difficult communication with discordant or emotional family members, undeveloped or impaired patience, maladaptive communication such as high anxiety, high reactivity, or repeated questions.',
    '$15'
  ),
  costRow('99441', 'This code is utilized for phone calls and conversations lasting 5-10 minutes.', '$15'),
  costRow('99442', 'This code is utilized for phone calls and conversations lasting 11-20 minutes.', '$30'),
  costRow(
    'NOSHOW',
    'Clients will be billed 100% of their appointment cost if they do not show for their scheduled appointment.',
    '$100'
  ),
  costRow(
    'LTECNCL',
    'Clients will be billed 80% of their appointment if they cancel within 24 hours of their scheduled session.',
    '$80'
  ),
  costRow(
    'TS001',
    'Treatment summaries are provided at the request of the client or their guardians. They are often utilized in lieu of any statements filed with a court. Treatment summaries will be billed',
    '$150'
  ),
  costRow('CALF001', 'Court Action/Legal Fees — Preparation time (including submission of records)', '$150 per hour'),
  costRow('CALF002', 'Court Action/Legal Fees (Phone calls)', '$150 per hour'),
  costRow('CALF003', 'Court Action/Legal Fees (Depositions)', '$200 per hour'),
  costRow('CALF004', 'Court Action/Legal Fees (Time required in giving testimony)', '$200 per hour'),
  costRow('CALF005', 'Court Action/Legal Fees (Mileage)', '$0.53 per mile'),
  costRow(
    'CALF006',
    'Court Action/Legal Fees (Time away from office due to depositions or testimony)',
    '$150 per hour'
  ),
  costRow(
    'CALF007',
    'Court Action/Legal Fees (All attorney fees and costs incurred by the provider as a result of legal action)',
    'As incurred'
  ),
  costRow('CALF008', 'Court Action/Legal Fees (Filing a document with the court)', '$50'),
  costRow(
    'CALF009',
    'Court Action/Legal Fees (Minimum charge for court appearance due as a retainer)',
    '$1200'
  ),
  costRow(
    'CALF010',
    'Court Action/Legal Fees (Express charge due without 48 hours notice of subpoena or attorney meeting)',
    '$200'
  ),
  costRow(
    'CALF011',
    'Court Action/Legal Fees (Fee due if case is reset with less than 72 hours business time notice)',
    '$250'
  ),
  costRow(
    'Tutoring Services',
    'Academic support services tailored to the student\'s specific learning needs, curriculum, and educational goals.',
    '$40 - $65'
  ),
  costRow(
    'H0031',
    'Mental health assessment by non-physician, intake evaluation to determine the nature of the client\'s needs and establish a treatment plan.',
    '$110'
  ),
  costRow(
    'H0031',
    'Follow-up mental health assessment to monitor progress and adjust the treatment plan as necessary.',
    '$55'
  ),
  costRow('H0032', 'Mental health service plan development by non-physician', '$30 per half hour'),
  costRow(
    'H0002',
    'Behavioral health screening to determine the presence of a behavioral health condition.',
    '$30'
  ),
  costRow(
    'H2014',
    'Skills training and development to improve functioning in daily life activities, social interactions, and coping mechanisms.',
    '$60 per hour'
  )
].join('\n');

export const NLU_OFFICE_POLICY_SERVICES_HTML = `
  <h2>POLICY AND SERVICES AGREEMENT</h2>
  <h3>WELCOME TO NEXT LEVEL UP!</h3>
  <p>This document contains important information about our professional services and business policies. This agreement encompasses both "Therapy Services" and "Tutoring Services." While both are provided by Next Level Up, they are distinct professional services with different service parameters. When you sign this document, it will represent an agreement between you and Next Level Up. It is very important that you understand the concepts discussed below. Take your time reading it and discuss any questions you have with your provider. Please note that treatment for therapy is not the same as tutoring services, though this document covers both. They are distinct professional services with different service parameters.</p>

  <h3>Confidentiality</h3>
  <p>Your provider may live and work in the community in which treatment is being provided. If ever you should see your provider outside of a session, Next Level Up policy is that your provider will not acknowledge you unless you acknowledge your provider first. This is to protect your confidentiality. Lastly, if you (or your child/minor) attend couple, family, or group sessions, you hereby agree not to summon your provider to court as a witness for any purpose or involve your provider in any legal proceeding that would require him or her to compromise the duty of confidentiality, aside from a general records request.</p>

  <h3>Cessation of Services/Termination</h3>
  <p>By signing this document, you agree, understand, and acknowledge the following:</p>
  <ul>
    <li>You may terminate your or your child’s/minor’s therapy at any time for any reason.</li>
    <li>Cessation of services may occur for a variety of reasons, including but not limited to poor fit, lack of progress, repeated no shows (see our no show/cancellation policy below) and when a client’s issues are outside of a provider’s training.</li>
    <li>In the event of termination, Next Level Up will refer you, your family, or your child/minor to options for continued care.</li>
    <li>In the event of termination due to your child’s/minor’s provider leaving our organization, Next Level Up will do everything in its power to replace that clinician. Should Next Level Up not fulfill that goal, it will provide you with several referrals. Next Level Up cannot guarantee availability at those referrals.</li>
  </ul>

  <h3>Minors</h3>
  <p>Next Level Up requires consent for treatment from all required legal guardians and/or parents. If a custody agreement exists, you agree to provide the most recent version to your provider, and Next Level Up can obtain consent from all legal guardians. Next Level Up will also abide by any state laws that govern the consent to treatment of mental health for minors.</p>

  <h3>No Show/Cancellation</h3>
  <h4>Therapy Services No Show/Cancellation</h4>
  <p>Next Level Up has a company-wide no show and late cancellation policy in which the client will incur an $80 fee without notice of cancellation prior to 24 hours or for no-showing their appointment. Our providers will attempt to contact the client via their approved phone and/or email address between five and fifteen minutes of no show.</p>
  <h4>Tutoring Services No Show/Cancellation</h4>
  <p>Individuals who have purchased a tutoring package are exempt from no-show and cancellation fees for those specific sessions.</p>

  <h3>Insurance</h3>
  <p>I authorize Next Level Up, LLC to release information to the insurance companies provided on this form in order to submit insurance claims on my behalf. Insurance is not submitted for most tutoring services, with the exception of the "Tutoring Plus Therapy" program. Please note that even if certain services are typically covered by insurance companies (e.g., Medicaid), they may not be accepted by a specific provider.</p>
  <p>This authorization extends to the extent necessary to obtain payment for the services provided to me, and includes authorization to release information about mental health, substance use, or HIV diagnoses as required.</p>
  <p>In consideration of the services provided to me, I assign all benefits to Next Level Up, LLC if accepted, and authorize my insurance companies, Medicare, or other third-party payers to make payments directly to Next Level Up, LLC and its affiliates.</p>

  <h3>Surprise Billing Protection</h3>
  <p>The state of Colorado enacted the No Surprises Act for medical and healthcare professionals in 2022. If you waive your insurance due to coverage limitations or due to your provider being out of network, you will be provided two documents including the Self Pay Insurance Waiver and the Surprise Billing Protection Form. The aforementioned act and documentation have been put in place to protect you and your rights. Your provider will attempt to provide an estimate for all services, likely before they are able to determine a timeline for said services. Therefore, your estimate may be disproportionately projected. All our providers have been advised to utilize a baseline of one session per week for three months or 12 sessions.</p>
  <p>If you have insurance and your provider is in-network but are provided services that are NOT covered by your insurance, you may also be provided with the Surprise Billing Protection Form. This occurs in situations where your provider provides services outside of the 9-5pm as with the billing code 99051 or with providing client-requested Treatment Summaries, neither of which are covered by insurance companies. A list of possible additional services is listed below for your reference only. Acknowledgement of this document does not acknowledge the payment for such services. You will be provided the Surprise Billing Protection Form should you be required to pay for additional services.</p>

  <h3>Service Fees</h3>
  <p>You are responsible for paying your copayment, cost share, deductible, or fee at the time of your (or your child’s) session unless prior arrangements have been made. Payment must be made by credit card; we are not able to accept cash or checks. To change your method of payment, you may contact support@NextLevelUpLCC.com. If you refuse to pay your debt, we reserve the right to use an attorney or collection agency to secure payment. Your signature provides Next Level Up with permission to release information for transactions for benefits of claims, including, but not limited to, providing limited information about you and your treatment to a third party who is associated with your payment method, but that disclosure will be limited to the information necessary to resolve the applicable billing issue.</p>

  <h3>Court Action/Legal Fees</h3>
  <p>Clients are discouraged from having their therapist subpoenaed due to the limitations often associated with HIPAA protection laws, scope of practice, and your provider’s training and experience. Providers are significantly limited in their ability to make statements in court, generally including ONLY facts of the case and limited professional opinions. Therefore, even though you are responsible for the fees associated with testimony, it does not mean that the testimony will be in your favor. A fee of $1200 is due in advance of the court appearance as a retainer. If a subpoena or notice to meet attorney(s) is received without a minimum of 48-hour notice there will be an additional $200 "express" charge. If the case is reset with less than 72 hours of business time, there is a charge of $250 in addition to the retainer.</p>

  <h3>Law</h3>
  <p>Where this agreement differs from relevant state or federal laws, those laws will govern.</p>

  <p><strong>ACKNOWLEDGEMENT:</strong> I have read and fully understand and agree to the terms of this Policy and Services Agreement.</p>
  <div class="plain-fill-rows">
    <div class="plain-fill-row">
      <span class="inline-fill-label">Printed Client Name</span>
      <span class="inline-fill-line"></span>
    </div>
    <div class="plain-fill-row">
      <span class="inline-fill-label">Client’s or Responsible Party’s Signature</span>
      <span class="inline-fill-line"></span>
      <span class="inline-fill-label">Date</span>
      <span class="inline-fill-line"></span>
    </div>
    <div class="plain-fill-row">
      <span class="inline-fill-label">If Signed by a Responsible Party, relationship to the client and authority to consent</span>
      <span class="inline-fill-line"></span>
    </div>
  </div>

  <h3>Cost Estimates for Services</h3>
  <p><em>for reference only</em></p>
  <table class="packet-staff-table nlu-cost-table">
    <thead>
      <tr>
        <th>Service or Service Code</th>
        <th>Description</th>
        <th>Cost Analysis</th>
      </tr>
    </thead>
    <tbody>
${COST_ROWS}
    </tbody>
  </table>
`.trim();
