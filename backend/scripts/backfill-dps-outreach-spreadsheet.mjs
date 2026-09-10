/**
 * One-shot backfill of the DPS school outreach spreadsheet into Outreach Hub.
 * Safe to re-run: merges missing notes (by fingerprint), contacts, and first visit.
 *
 * Usage: node backend/scripts/backfill-dps-outreach-spreadsheet.mjs [--dry-run] [--agency-id=2]
 */
import { importHistoricalOutreachRows } from '../src/services/outreachHub.service.js';

const AGENCY_ID = Number(
  (process.argv.find((a) => a.startsWith('--agency-id=')) || '').split('=')[1] || 2
);
const dryRun = process.argv.includes('--dry-run');
const USER_ID = 501; // Michael Mendez — historical import attribution

const ROWS = [
  {
    date: '9/9/2025',
    school: 'Howell Elementary',
    pocInfo: `Troy_Alexander@dpsk12.net -
Michelle_Link@dpsk12.net - Social Worker
Jenny_Honeycutt@dpsk12.net 
Eva_galindo@dpsk12.net`,
    notes: `Met with Principals during first visit and then
met with Michelle during the second visit.
Very interested.`,
    extraNotes: `Been a huge lag - they 
thought we only provided BA
level clinicians. When I spoke
with Michelle I let her know
we can provide Master's and 
licensed clinicians. She said she
had referrals to send.
10/23/25`,
    visitCount: 2,
    followUpEmail: true,
    meeting: true,
    servicesStarted: true
  },
  {
    date: '9/9/2025',
    school: 'Ashley Elementary',
    pocInfo: `Jestra1@dpsk12.net - Principal
Allison_Walsh@dpsk12.net - School Psych`,
    notes: `Met with Principal and School Psych
Very interested`,
    visitCount: 1,
    followUpEmail: true,
    meeting: true,
    servicesStarted: true
  },
  {
    date: '9/9/2025',
    school: 'Garden Place Academy',
    pocInfo: `Evelyn_rodriguez@dpsk12.net - Social Worker
Andrea_renteria@dpsk12.net - Principal
Jarrae_Newell@dpsk12.net - `,
    notes: 'Met with team - very interested',
    visitCount: 3,
    followUpEmail: true,
    meeting: true,
    servicesStarted: true
  },
  {
    date: '9/9/2025',
    school: 'Green Valley Elementary',
    pocInfo: `Jason Flores - School Psych
Jenacee Bradbury - School Counselor
Illiana IIama - School Social Worker`,
    notes: 'Met with team and very interested.',
    visitCount: 2,
    followUpEmail: true,
    meeting: true,
    servicesStarted: true
  },
  {
    date: '9/15/2025',
    school: 'McGlone Academy',
    pocInfo: `Abby Morrison - School Social Worker
Abby_Morrison@dpsk12.net
Julia Dunlap - 
Jula_dunlap@dpsk12.net
April Tate - School Psych
April_tate@dpsk12.net
Erica Haas - School Counselor
Erica_Haas@dpsk12.net`,
    notes: `Met with Abby and dropped off info. Very 
interested.`,
    visitCount: 2,
    followUpEmail: true,
    meeting: true,
    servicesStarted: true
  },
  {
    date: '9/30/2025',
    school: 'Cole Academy',
    pocInfo: `Office Manager - Rosa 
Email: r_patron-sepulveda@dpsk12.net 
Devin Rodriguez - School Social Worker
devin_rodriguez@dpsk12.net
Meredith Brown 
Meredith_brown@dpsk12.net`,
    notes: `Sent fliers!
Back to school event on Oct 23 4:30-6:30
Met with school on 10/14 - set up services`,
    visitCount: 1,
    followUpEmail: true,
    meeting: true,
    servicesStarted: true
  },
  {
    date: '10/21/2025',
    school: 'Lincoln Elementary',
    pocInfo: `Bess Aronaff - School Psych
Bess_aronaff@dpsk12.net `,
    notes: `Had meeting with Lincoln principal & school
psych to get services set up`,
    extraNotes: `Emailed (2x) and called Bess
to try to get services set up
and referral packets going,
no packets recieved yet
11/6 - spoke with Bess. sent referral
packets and getting started`,
    visitCount: 1,
    followUpEmail: true,
    meeting: true,
    servicesStarted: true
  },
  {
    date: '9/15/2025',
    school: 'John Amesse',
    pocInfo: `M_Torres-apri-pows@dpsk12.net - Social Worker
Suilong_Xiong@dpsk12.net - School Psych
Grant_Vanpelt@dpsk12.net - DPS Mental Health
coordinator
Michael_bateman@dpsk12.net - principal`,
    notes: `Met with the mental health Team. 
Very intested.
Emailed on 9/10/2025`,
    visitCount: 2,
    followUpEmail: true,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '9/15/2025',
    school: 'Montbello High School',
    pocInfo: `Sierra Dawkins - Social Worker
Emma Court - School Psych
Sierra_Dawkins@dpsk12.net
Emma_court@dpsk12.net`,
    notes: `Met with Social Worker & School Psych
Emailed on 9/23/2025`,
    extraNotes: `Reached back out to inquire 
about starting services for 
second semester on 10/22/25`,
    visitCount: 1,
    followUpEmail: true,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '9/15/2025',
    school: 'Montebello Middle School',
    pocInfo: `Roderick Tooson - AP
Roderick_Tooson@dpsk12.net
Jason Ortiz - Principal?
Jason_Ortiz@dpsk12.net`,
    notes: `Met with Assistant principal and is very 
interested
Emailed on 9/23/2025
(Spreadsheet listed as Montebello Middle School — mapped to DCIS at Montbello.)`,
    visitCount: 3,
    followUpEmail: true,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '9/24/2025',
    school: 'Park Hill Academy',
    pocInfo: '',
    notes: 'Dropped off info',
    visitCount: null,
    followUpEmail: false,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '9/24/2025',
    school: 'Palmer ECE (3-5yo)',
    pocInfo: '',
    notes: `Dropped off info - talked to office lady 
ECE School`,
    visitCount: 1,
    followUpEmail: false,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '9/24/2025',
    school: 'Hallet Academy',
    pocInfo: `Barbara Robinson - Social Worker
Barbara_Robinson@dpsk12.net
Beulah Morman - School Psych
Beulah_Morman@dpsk12.net
`,
    notes: `Met with Barbara for a while. Very interested
Dropped off info
Emailed on 10/10/2025`,
    visitCount: 1,
    followUpEmail: true,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '9/24/2025',
    school: 'Denver East High School',
    pocInfo: '',
    notes: `Dropped off info - spoke to one of the school
counselors`,
    visitCount: 1,
    followUpEmail: false,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '9/24/2025',
    school: 'Manuel High School',
    pocInfo: `John Gallagher John_gallagher@dpsk12.net
School Psych
Serina Montoya Serina_montoya@dpsk12.net
School Social Worker`,
    notes: `Spoke with School Social Worker & Psych? & 
dropped off information
Emailed on 10/13/2025`,
    visitCount: 1,
    followUpEmail: true,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '9/24/2025',
    school: 'Manuel Middle School',
    pocInfo: `Thalia Ortiz - School Counselor
Thalia_Ortiz@dpsk12.net`,
    notes: `Spoke with School Counselor & dropped off 
info 
Couldn't get a read on if she was interested
Emailed on 10/13/2025`,
    visitCount: 1,
    followUpEmail: true,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '9/30/2025',
    school: 'Wyatt Academy',
    pocInfo: `Social Worker, Amanda Owens: 720-935-3509
amanda.owens@wyattacademy.org`,
    notes: `Dropped off info
11/3: Phone call with Amanda Owens: Social
Worker and wants to get services started`,
    visitCount: 1,
    followUpEmail: true,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '9/30/2025',
    school: 'Swigert International',
    pocInfo: `Social Worker - Silvia Hernandez
Email: Silvia_hernandez@dpsk12.net`,
    notes: 'Emailed on 10/13/2025',
    visitCount: 1,
    followUpEmail: true,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '9/30/2025',
    school: 'Steele Elementary',
    pocInfo: '',
    notes: 'Dropped off info',
    visitCount: 1,
    followUpEmail: false,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '9/30/2025',
    school: 'DSST Cole',
    pocInfo: '',
    notes: `On the same campus as Cole Academy
and are holding the Oct 23rd`,
    visitCount: 1,
    followUpEmail: false,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '10/30/2025',
    school: 'Dora Moore ECE-8',
    pocInfo: `Joshua Konz - Social Worker
Joshua_konz@dpsk12.net
Sarah Cherabie - School Psych
Sarah_Cherabie@dpsk12.net`,
    notes: `10/30/25: Stopped by the school, dropped off 
info and got contact info to reach out
Email sent: 11/3`,
    visitCount: 1,
    followUpEmail: true,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '10/30/2025',
    school: 'Polaris Elementary',
    pocInfo: 'Sangeeta_singh@dpsk12.net',
    notes: `10/30/25: Stopped by the school, dropped off 
info and got contact info to reach out
Email sent: 11/3`,
    visitCount: 1,
    followUpEmail: true,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '10/30/2025',
    school: 'Escuela Valdez Elementary',
    pocInfo: `Bella Fornuto- School Psych
izabella_fornuto@dpsk12.net
720-424-3378`,
    notes: `10/30/25: Stopped by the school, dropped off 
info and got contact info to reach out
Email sent: 11/3`,
    visitCount: 1,
    followUpEmail: true,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '10/30/2025',
    school: 'Valverde Elementary',
    pocInfo: `Kris Poncek - School Counselor
Kris_poncek@dpsk12.net`,
    notes: `10/30/25: Stopped by the school, dropped off 
info, met with School counselor and got 
contact info to reach out
Email sent: 11/3`,
    visitCount: 1,
    followUpEmail: true,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '11/6/2025',
    school: 'Montview High School',
    pocInfo: `Kimberly Doscher - School Social Worker
Kimberly.doscher@scienceandtech.org`,
    notes: `Stopped in the school and talked with 
Kimberly, social worker. We dropped off info
and she said she was interested. Suggested
a meet and greet -having one of our 
counselors at the school for students to meet
Scheduled email to be sent 11/10/25`,
    visitCount: 1,
    followUpEmail: true,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '11/6/2025',
    school: 'Montview Middle School',
    pocInfo: `Sam Lapres oversees the DSST schools?
Sam.lapres@scienceandtech.org
303-802-4140`,
    notes: `Stopped in the school and asked if we could
talk to Mental health staff and was provided
with contact info for someone that oversees
DSST mental health
Scheduled email for 11/10/25`,
    visitCount: 1,
    followUpEmail: true,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '11/6/2025',
    school: 'Denver School of Arts',
    pocInfo: `Ari Umoja - Mental Health person?
Ari_Umoja@dpsk12.net`,
    notes: `Stopped in and dropped off info. School 
provided contact info
Scheduled email to be sent 11/10/25`,
    visitCount: 1,
    followUpEmail: true,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '11/6/2025',
    school: 'Odyssey School of Denver',
    pocInfo: `Pete@odysseydenver.org 
"Executive Director" - Prinicpal `,
    notes: `Stopped in and dropped off info. Talked to 
the front office secretary and she gave us 
the principal's email.
Scheduled email to be sent 11/10/25`,
    visitCount: 1,
    followUpEmail: true,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '11/6/2025',
    school: 'Carson Elementary',
    pocInfo: 'Brook?',
    notes: `Talked to a person named, Brook - not sure 
who she was and provided info`,
    visitCount: 1,
    followUpEmail: false,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '11/6/2025',
    school: 'Hill Campus of Arts & Science',
    pocInfo: `Joe Walden - School Social Worker
Joseph_walden@dpsk12.net
720-423-9690`,
    notes: `Met with School social worker. They are very
interested in our services, but currently have
an in school therapist, but once she is full, 
he would like to move forward with us.
Scheduled email for 11/10/25
Stopped back on 4/7/2026 - all social workers
were involved in CMAS testing
Sent another follow up email on 4/8/2026`,
    visitCount: 1,
    followUpEmail: true,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '12/10/2025',
    school: 'Brown Elementary School',
    pocInfo: `Leann Lovasz - School Psych
leann_lovasz@dpsk12.net`,
    notes: `Virtual meeting - Leann Lovaszv(school Psych) 
and she is going to meet w/ her principal to
get the final okay. Very intersted
I followed up with an email including our
Community Partner Certificate`,
    visitCount: null,
    followUpEmail: true
  },
  {
    date: '12/11/2025',
    school: 'Bear Valley Middle School',
    pocInfo: `lacresha_ffrench@dpsk12.net - School Social
Worker`,
    notes: `Virtual meeting - Met with School Social
Work, Lacresha. Very interested in the 
program and will meet with prinicipal to get 
the okay. I followed up the meeting with
and email with our Community Partner
Certificate`,
    visitCount: null,
    followUpEmail: true
  },
  {
    date: '4/7/2026',
    school: 'Palmer Elementary (ECE only)',
    pocInfo: `School Psychologist - Lauren Gallagher
Lauren_gallagher@dpsk12.net
Phone ext: 45013
This year is there on Wed, Thur, and Fri `,
    notes: `Spoke with principal and she is leaving after this 
year so she gave us the contact info for the 
school psych who is here this year and will also be
here next year. It's a very small school - 4 classes 
and will be 8 classes (120 students)
next year
Sent email on 4/8/2026
Lauren emailed back on 4/13 and said they
do not need services this year, but maybe 
next year - so email during 26/27 school year`,
    visitCount: 1,
    followUpEmail: true
  },
  {
    date: '4/7/2026',
    school: 'Steck Elementary',
    pocInfo: `School Psychologist - Juliann Moes
Juliann_Moes@dpsk12.net`,
    notes: `Talked to Juliann and she said there wasn't
much need due to hirer SES, but would check
with her prinicpal.
Sent an email on 4/8/2026`,
    visitCount: 1,
    followUpEmail: true
  },
  {
    date: '4/7/2026',
    school: 'Denver Green Southeast',
    pocInfo: `Anna Arnold- School Psychologist
Anna_arnold@denvergreenschool.org`,
    notes: `Met and spoke with the someone from mental
health and she was very interested, but will
not be here next year. Gave us School Psych
contact.
Sent an email on 4/10/2026`,
    visitCount: 1,
    followUpEmail: true
  },
  {
    date: '9/30/2025',
    school: 'Whittier Elementary',
    pocInfo: `hall3@dpsk12.net -prinicpal
jstewar@dpsk12.net - AP
amynothwehr@dpsk12.net`,
    notes: `Spoke with School Psych intern - interested
10/10/2025: Emailed school and they declined 
and said they already have mental health 
supports from another partner 
Responded to my email saying they have 
other community supports and do not need
us`,
    visitCount: 1,
    followUpEmail: true,
    meeting: false,
    servicesStarted: false
  },
  {
    date: '9/30/2025',
    school: 'McKinley Elementary',
    pocInfo: '',
    notes: `Principal wouldn't let us in - rude`,
    visitCount: 1,
    followUpEmail: false,
    meeting: false,
    servicesStarted: false
  }
];

const result = await importHistoricalOutreachRows(AGENCY_ID, ROWS, USER_ID, { dryRun });
console.log(JSON.stringify({
  agencyId: AGENCY_ID,
  dryRun,
  contactsAdded: result.contactsAdded,
  notesAdded: result.notesAdded,
  visitsAdded: result.visitsAdded,
  skipped: result.results.filter((r) => r.status === 'skip'),
  withActions: result.results.filter((r) => r.status === 'imported' && (
    (r.actions?.contacts || 0) + (r.actions?.notes || 0) + (r.actions?.visits || 0) > 0
  ))
}, null, 2));
process.exit(0);
