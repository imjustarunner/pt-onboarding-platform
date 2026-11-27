# Plotline interview reminders · Vonage 10DLC registration draft

## Brand

| Vonage field | Entry |
| --- | --- |
| Display name | Plotline People Operations. Use this same name in your registration, verbal script, confirmation text, and samples. |
| Legal company name and tax ID | Enter the entity name and EIN exactly as they appear on the registrant’s IRS records. The public site identifies PlotTwistCo as the company behind Plotline. Confirm the legal name in the company records. |
| Company type, registered address, vertical, contact | Use the registrant’s records and authorized People Operations contact. |
| Website | https://plotlinepo.com |
| Privacy policy | https://plotlinepo.com/privacy |
| Terms & conditions | https://plotlinepo.com/terms |
| Live operator full script | https://plotlinepo.com/sms-consent · plain text https://plotlinepo.com/sms-consent.txt |
| Support | Support@plottwistco.com · 833-756-8894. Match these published contacts in the registered HELP response. |

[Vonage brand registration](https://developer.vonage.com/en/10-dlc/brand-overview)

## Campaign

**Name** · Plotline People Operations — Interview Reminders

**Proposed use case** · Transactional scheduling notifications for invited job candidates. Ask Vonage to confirm the dashboard category because candidates can join without a Plotline account.

**Description for the application**

> Plotline People Operations sends optional interview reminders to job candidates who have an interview scheduled with a named hiring organization. A recruiter confirms the candidate’s mobile number and records an explicit verbal opt-in. The first text confirms enrollment. Subsequent texts contain the scheduled interview time and a personal Plotline interview link. The default timing is seven days, 24 hours, one hour, and five minutes before the interview, when those times are still in the future. Frequency varies with the interview settings. The SMS program contains no promotional or unrelated messages. Email is available to candidates who decline texting.

**Content attributes** · Embedded links yes, using the Plotline-owned interview domain. Embedded phone numbers only if the final HELP message includes a phone number. Subscriber opt-in, opt-out, and help are enabled. Text-to-join is off for this verbal program. Confirm that the registrant can send on behalf of the hiring organizations shown in these reminders. Use an approved brand and campaign for each sender arrangement required by Vonage.

**Message flow for the application**

> During an interview scheduling call, the recruiter identifies Plotline People Operations and the hiring organization. The recruiter confirms the mobile number, reads the opt-in script below, and proceeds only when the candidate explicitly agrees. The recruiter records the confirmed number, their own account, the time, and the script used against that interview. A confirmation text is sent before any reminders. A candidate who declines receives the interview information by email. STOP suppresses further texts on this campaign. HELP returns the program name and public support contact. The interview itself remains scheduled when a candidate opts out of SMS.

### Verbal opt-in script

> May Plotline People Operations text this mobile number about your interview, including reminders? Message and data rates may apply. Message frequency varies. Text HELP for help. Text STOP to opt-out. Terms are at https://plotlinepo.com/terms. Privacy details are at https://plotlinepo.com/privacy. Texts are optional, and you can receive interview details by email. Do you agree?

Use https://plotlinepo.com/sms-consent as the full-script URL in the live operator section. The same complete script is available at https://plotlinepo.com/sms-consent.txt. Both pages are public and contain no candidate information. Attach the public privacy and terms URLs above in the application. [Vonage campaign registration guide](https://api.support.vonage.com/hc/en-us/articles/360053422591-10DLC-Campaign-registration-guide)

### Sample messages

**Opt-in confirmation**

> Plotline People Operations: You signed up for interview reminders. Message frequency varies. Message and data rates may apply. Reply HELP for help, STOP to opt-out.

**Reminder sample 1**

> Plotline People Operations: Interview reminder for Dec 3, 2026, 1:00 PM (America/Denver). Join: https://plotlinepo.com/interview/example/video/ExampleLinkForReview. Reply HELP for help, STOP to opt-out.

**Reminder sample 2**

> Plotline People Operations: Interview reminder for Dec 10, 2026, 9:30 AM (America/Denver). Join: https://plotlinepo.com/interview/example/video/ExampleLinkForReview. Reply HELP for help, STOP to opt-out.

**STOP confirmation**

> Plotline People Operations: You have opted out and will no longer receive texts from this interview reminder program.

**HELP response**

> Plotline People Operations: For interview text help, contact Support@plottwistco.com or 833-756-8894. Reply STOP to opt out.

Use the final approved help contact when configuring keyword replies. Decide whether Vonage Opt-Out Assist or the app will own STOP and HELP, then configure the sender registration to match. [Vonage campaign requirements](https://api.support.vonage.com/hc/en-us/articles/12132309081500-10DLC-Campaign-requirements) · [Vonage keyword management](https://api.support.vonage.com/hc/en-us/articles/4417194850964-How-do-I-manage-10-DLC-Opt-In-or-Opt-Out)

## App activation after approval

The verified Plotline brand is `BCGLCIL` and the interview reminder campaign is
`VCZOP4JO`. A dedicated sender, `+17197165766` (719-716-5766), was purchased on
November 26, 2026. Verify its current carrier state is `LINKED` before enabling
delivery. The campaign uses application-managed STOP and HELP, with
`support@plotlinepo.com` as its registered HELP contact.

Use `https://plottwisthq.com/api/vonage/inbound` for the number's SMS callback.
Its empty GET readiness check is public; message callbacks still require a valid
Vonage signature. Number linking alone does not enable the app's sender mapping
or establish consent for any recipient. Provision app records using an explicitly
authorized, scoped automation identity with automation audit attribution.

1. Apply the interview SMS consent migration.
2. Register the approved number once as a platform-owned `platform_contact` line with `agency_id=NULL`. Its registration must contain both `interviewOnly: true` and `platformInterviewSender: true`. The dedicated procedure-only identity and fixed registration are described in the [release handoff](releases/plotline-sms-activation-2026-11-26/README.md).
3. Set `PLOTLINE_INTERVIEW_SMS_CAMPAIGNS_JSON` to `{"platform":{"from":"+17197165766","brandId":"BCGLCIL","campaignId":"VCZOP4JO","scope":"all_agencies"}}`. This explicit platform scope enables the interview program across agencies. An explicit agency key overrides the shared default; setting an agency key to `null` disables it there. Existing per-agency configurations continue to require a sender owned by that agency.
4. Verify consent, the enrollment confirmation, a reminder with the join link, and HELP and STOP using a controlled test recipient. Check that the candidate’s RSVP and email still work after SMS opt-out.

The shared sender retains the actual interview agency in authorization and delivery attribution. It requires current consent for that interview, matches its recipient and campaign, checks the active appointment and agency, and applies the actual agency’s QA recipient restrictions. STOP remains scoped to the Plotline campaign. Ordinary workforce, clinical, and unrelated messages cannot use this interview-only number.
