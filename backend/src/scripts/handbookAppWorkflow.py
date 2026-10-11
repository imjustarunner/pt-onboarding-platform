"""Approved October 10 app-only handbook instructions; no operational/database writes."""
import re

APP_POLICY = '<p>The app is the workplace system of record. Complete internal forms, requests, scheduling, clinical documentation, supervision records, evaluations, timekeeping and payroll submissions in the app. Use the appropriate record or assigned workflow; do not submit parallel Google Forms, external time logs, spreadsheets or emailed timesheets.</p><p>Record actual service and work time, review tracked entries, and submit missing time or corrections through the app. A missing tracking option does not make work unpaid. If a needed workflow is unavailable, report the issue through in-app support so the record can be completed or corrected.</p><p>Use authorized in-app communication and respect notification and texting preferences. Protect confidential information and use only approved recipient and access settings. Quick View access requires an individual protected code and a secure device. Emergency calls and required external reports must not be delayed while completing an app record; document the actions in the app as soon as it is safe.</p>'

def app_workflow(body):
    # Remove the obsolete future cutover paragraph, including from update prose.
    body = re.sub(r'<p>TherapyNotes transition is planned.*?</p>', APP_POLICY, body, flags=re.S)
    body = body.replace('Digital workplace and transition procedures', 'App records, forms and timekeeping')
    body = body.replace('Standard Professional Rate: H-code units, encounters and the EHR transition', 'Standard Professional Rate: H-code units and encounters in the app')
    body = body.replace('<strong>Current method while using the external EHR.</strong> Payroll tabulates the documented services from the external record.', '<strong>Current app workflow.</strong> Payroll uses the services documented in the app.')
    body = body.replace('During the external-EHR period, 15-minute-unit services', 'For the approved service mappings, 15-minute-unit services')
    body = body.replace('During the external-EHR period, follow the designated supervision code and record instructions;', 'Follow the app’s supervision record and approved payroll mapping;')
    body = re.sub(r'Use the authorized supervision meeting platform and designated record system communicated by (?:ITSCO|Next Level Up)\. Continue the designated systems until the applicable go-live notice; follow ', 'Use the app for supervision meetings, attendance, reviewed summaries and time records; follow ', body)
    body = body.replace('Keep required clinical documentation in the designated record system until the applicable go-live notice;', 'Complete required clinical documentation in the app;')
    body = body.replace('for the current record system and transition notices', 'for app records and timekeeping')
    body = body.replace('for the current communication and transition procedures', 'for app communication and record procedures')
    body = body.replace('Use the authorized records, secure communication and transition procedures', 'Use the app records and secure communication procedures')
    body = body.replace('Record clinical service documentation and actual service time in the designated EHR. Record Indirect Service, Support Activities, supervision, corrections, and other compensable work through the designated app and payroll workflows.', 'Record clinical service documentation and actual service time in the app. Record Indirect Service, Support Activities, supervision, corrections and other compensable work in the app’s timekeeping and payroll workflows.')
    body = re.sub(r'submit accurate time records by midnight on the Friday ending the pay period to payroll@itsco\.health', 'submit accurate time records in the app by midnight on the Friday ending the pay period', body, flags=re.I)
    body = body.replace('the designated supervision record', 'the app’s supervision record')
    body = body.replace('the designated activity record', 'the app’s activity record')
    body = body.replace('the designated supervision/app payroll workflow', 'the app’s supervision and payroll workflow')
    body = body.replace('the designated workflow', 'the app workflow')
    body = body.replace('Require manual submission for review', 'Require a correction submission in the app for review')
    body = body.replace('by submitting the appropriate forms to HR', 'by completing the appropriate forms for HR in the app')
    body = body.replace('Employees will fill out and sign the Employee Daycare Consent Form.', 'Employees will complete and sign the Employee Daycare Consent Form in the app.')
    body = body.replace('Ask the benefits department for forms that you need to file a claim or contact your state agency for workers’ compensation. (Send requests to PO@ITSCO.health).', 'Request assistance and the required claim forms from People Operations through the app. Complete the internal record in the app; required insurer or state-agency filings remain subject to their submission requirements.')
    body = body.replace('via letter or email', 'through the app')
    body = body.replace('send/s a Notification of Remediation email or letter officially initiating the process', 'issues a Notification of Remediation through the app to initiate the process')
    body = body.replace('Please email PO@ITSCO.health to obtain a copy of your certificate of insurance.', 'Request a copy of your certificate of insurance from People Operations through the app.')
    body = body.replace('in the intake paperwork and client profile', 'in the app’s intake record and client profile')
    body = body.replace('to the people operations team at PO@ITSCO.health', 'to People Operations in the app')
    body = re.sub(r'by sending a copy of the resignation letter and any other pertinent information \(i\.e\., employee\x27s reason for leaving, last day of work\) to <a href="mailto:PO@ITSCO.health">PO@ITSCO.health</a> \.', 'by submitting the resignation record and relevant details, including the reason for leaving and last day of work, through the app.', body)
    body = body.replace('complete a Supervisory Termination Summary and deliver the completed form to PO', 'complete and submit the Supervisory Termination Summary to People Operations in the app')
    body = body.replace('complete an Employee Change Form and notify PO and payroll of the last day worked by the employee', 'complete the Employee Change Form in the app and notify People Operations and Payroll through the app of the last day worked')
    body = body.replace("ensure that the payroll office receives the deceased employee's timecard", "ensure that Payroll can review the deceased employee’s completed time records in the app")
    body = body.replace('send a copy of their caseload to management', 'provide management with the caseload handoff in the app')
    body = body.replace('The employee should provide a written resignation notification to his or her manager.', 'The employee should submit a written resignation notification to the manager through the app.')
    body = body.replace('as per the Termination Payout clause of the workplace handbook', 'under the <a href="#handbook-paid-time-off-pto-and-sick-personal-care-leave-policy">Termination Payout provisions of the leave policy</a>')
    # EHR references describe records now maintained inside the app, not a
    # separate system. Preserve all service rules, deadlines and actual-time pay.
    body = body.replace('within the Practice’s EHR system', 'within the app’s clinical record')
    body = body.replace('in the EHR system', 'in the app’s clinical record')
    body = body.replace('the designated EHR', 'the app’s clinical record')
    body = body.replace('EHR-documented services', 'services documented in the app')
    body = body.replace('EHR-based assessments', 'assessments in the app')
    body = body.replace('the EHR', 'the app').replace('EHR Logging', 'App supervision records').replace('EHR activity', 'app activity').replace('EHR timestamps', 'app timestamps')
    return body

def app_section(slug, body):
    if slug == 'digital-workplace-and-transition-procedures':
        return APP_POLICY
    body = app_workflow(body)
    # The former EHR used people as pseudo-clients for supervision logging.
    # The app has actual supervision sessions and separate payroll mappings.
    if slug in ['supervision-procedures', 'responsibilities-of-the-supervisee']:
        body = re.sub(r'<p>Individual/Triadic Supervision: Logged in the app using 99414\.</p>', '<p>Record individual/triadic supervision in the app’s supervision session, identifying the supervisor, supervisee, actual attendance and duration.</p>', body)
        body = re.sub(r'<p>Group Supervision: Logged in the app using 99416\.</p>', '<p>Record group supervision in the app’s group supervision session, identifying the supervisor, attendees and actual duration.</p>', body)
        body = re.sub(r'<p>(?:Individual/Triadic supervision|Group supervision) must be logged under 9941[46],.*?</p>', '<p>Use the corresponding supervision session in the app. Record the actual participants, supervision type, attendance and duration. Payroll applies the approved mapping for each person’s role.</p>', body)
        body = re.sub(r'<p>(?:“Client” field|For the supervisee/participant:|For the supervisor:).*?</p>', '', body)
        body = body.replace('Supervisees are responsible for tracking their supervision and clinical hours for licensure or academic purposes.', 'Supervisees are responsible for maintaining and reviewing their supervision and clinical hours in the app for licensure or academic purposes. Required university or licensing-board verification does not replace the app record.')
    if slug == 'legal-and-ethical-compliance':
        body = body.replace('All evaluations and rubrics will be documented in the app.', 'Complete evaluations and rubrics in the app’s Evaluations workflow; keep employee and intern evaluation records separate from client clinical records.')
    if slug == 'attendance-providers-and-facilitators':
        body = re.sub(r'<p>In case of an emergency or unforeseen circumstance.*?</p>\s*<ul>.*?</ul>', '<p>Record an absence in the app and notify the supervisor and Support Team through the app so client notification and coverage can be coordinated. For a school assignment, use the app’s authorized school communication workflow to notify the assigned school contact. Urgent calls must not be delayed while completing the absence record; document the notification and follow-up in the app.</p>', body, flags=re.S)
    if slug == 'client-policies-and-attendance':
        body = body.replace('communicate via phone or email', 'use the app’s approved communication tools')
        body = re.sub(r'<p>Providers and Facilitators who indicated “appointment missed”.*?</p>', '<p>Record the appointment as a no-show in the app and document the attendance outcome. The standard no-show fee is $100 for an eligible non-Medicaid client when applicable under the client’s agreement. Submit any fee adjustment through the app’s billing workflow.</p>', body)
        body = re.sub(r'<p>Providers and Facilitators who indicate “Cancel Appt”.*?</p>', '<p>Record the cancellation and notice time in the app. The standard late-cancellation fee is $80 for an eligible non-Medicaid client who cancels less than 24 hours before the appointment, subject to the client’s agreement.</p>', body)
        body = body.replace('For clients with Medicaid, the box indicating “Charge a Fee for this Missed Appointment” should never be checked.', 'Do not create a missed-appointment charge for a Medicaid client in the app.')
        body = body.replace('Providers and Facilitators are responsible for documenting all instances', 'Providers and Facilitators are responsible for documenting in the app all instances')
    return body
