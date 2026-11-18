// Fictional layout samples only. No database, application identity or external AI.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

process.env.NODE_ENV = 'test';
process.env.SKIP_DB_CONNECT = '1';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'frontend/package.json'));
const puppeteer = createRequire(path.join(root, 'backend/package.json'))('puppeteer');
const canvas = require('@napi-rs/canvas');
Object.assign(globalThis, { DOMMatrix: canvas.DOMMatrix, ImageData: canvas.ImageData, Path2D: canvas.Path2D });
const { getDocument } = await import('../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const { generateClinicalRecordPdf } = await import('../backend/src/services/clinicalRecordPdf.service.js');
const { assembleLearningSession } = await import('../frontend/src/navigation/tutoringSessionDocumentation.js');
const { bundle: learningBundle, planChecklist } = await import('../frontend/previews/learning-session/fixture.js');
const { resolvePacketBrandChrome } = await import('../backend/src/services/packetBrandChrome.service.js');

const destination = path.resolve(process.argv[2] || path.join(root, 'artifacts/agency-note-samples'));
await fs.mkdir(destination, { recursive: true });
const signed = '2026-11-18T17:05:00Z';
const mse = {
  appearance: 'Appropriate hygiene and dress', behavior: 'Cooperative and engaged', speech: 'Clear; normal rate and volume',
  mood: 'Mildly anxious', affect: 'Congruent, appropriate range', thoughtProcess: 'Linear and goal directed',
  thoughtContent: 'No delusions or unusual content reported', orientation: 'Oriented to person, place, time and situation',
  attention: 'Sustained throughout the encounter', memory: 'Grossly intact in conversation', insight: 'Good', judgment: 'Intact'
};
function note({ title, sections, chart = {}, context = {}, code, start, end, duration, participants = 'Client only', location = 'Private office', author = 70001, signedAt = signed, recordedAt = null }) {
  return { note: { title, created_by_user_id: author, provider_signed_by_user_id: author, provider_signed_at: recordedAt ? null : signedAt, ...(recordedAt ? { saved_at: recordedAt, saved_by_user_id: author } : {}),
    note_payload: JSON.stringify({ sections }), metadata_json: { dateOfService: '2026-11-18', serviceCode: code,
      sessionContext: { startTimeLocal: start, endTimeLocal: end, durationMinutes: duration, participants, locationLabel: location },
      structuredChart: chart, ...context } }, addenda: [], revisions: [] };
}
const samples = [
  {
    filename: 'itsco-90837-psychotherapy', recordTitle: 'Psychotherapy Progress Note',
    agency: { id: 2, slug: 'itsco', name: 'ITSCO', official_name: 'In the School Counselors of Colorado', timezone: 'America/Denver', color_palette: { primary: '#386d38', accent: '#69a35b' } },
    client: { full_name: 'Example Client · fictional', identifier_code: 'DEMO-1001', date_of_birth: '1992-04-12', pronouns: 'they/them', preferred_language: 'English', address_street: '100 Example Lane', address_city: 'Denver', address_state: 'CO', address_zip: '80200', contact_phone: '(303) 555-0100', email: 'client@example.test' }, names: { 70001: 'Example Clinician, LPC' },
    notes: [note({ title: 'Psychotherapy Progress Note', code: '90837', start: '09:00', end: '09:55', duration: 55,
      sections: {
        'Subjective / current symptoms': 'Client reported continued worry about work demands and difficulty settling to sleep on three nights this week. Client used the agreed breathing exercise twice and described a shorter period of physical tension afterward. Worry continues to interfere with concentration and completion of routine tasks.',
        'Objective / interventions and response': 'Client consented to participate in person in a private office. Provider reviewed the coping objective, used cognitive restructuring to examine a prediction about making mistakes, and guided two rounds of paced breathing. Client identified an alternative interpretation with one prompt and completed the second breathing round independently. Client described reduced shoulder tension and remained engaged throughout the session.',
        'Interventions used': 'Cognitive restructuring; guided coping practice; psychoeducation; review of treatment-plan progress.',
        'Treatment goal / progress': 'Goal: improve management of anxiety during daily responsibilities. Objective: use an agreed coping strategy on four days per week. Client reported use on two days, compared with one day at the prior session. Progress is emerging; the objective is not yet met.',
        'Plan': 'Continue weekly individual psychotherapy. Client will practice paced breathing on four days and record one alternative response to a worry prediction. Next session will review practice frequency, sleep disruption and barriers to using the skill.'
      }, chart: {
        presentingProblem: 'Persistent worry about daily responsibilities, muscle tension and disrupted sleep affecting concentration and routine tasks.',
        diagnoses: [{ code: 'F41.1', description: 'Generalized anxiety disorder' }],
        diagnosticJustification: 'Persistent worry, tension, sleep disruption and impaired concentration continue to affect daily functioning.',
        mentalStatusExam: mse,
        riskAssessment: { currentSelfHarm: 'Denied', currentHarmToOthers: 'Denied', observation: 'No acute safety concern identified in this fictional encounter.' }
      } })]
  },
  {
    filename: 'nlu-tutoring', recordTitle: 'Tutoring Session Note', recordType: 'tutoring',
    agency: { id: 90002, slug: 'nlu', name: 'Next Level Up', official_name: 'Next Level Up, LLC', timezone: 'America/Denver', color_palette: { primary: '#243454', accent: '#68beb2' } },
    client: { full_name: 'Example Student · fictional', identifier_code: 'DEMO-2001', date_of_birth: '2015-06-10', preferred_language: 'English', recordGuardians: [{ name: 'Example Parent · fictional', relationship: 'Parent', phone: '(303) 555-0110', email: 'parent@example.test' }] }, names: { 70002: 'Example Tutor · fictional' },
    notes: [note({ title: 'Tutoring Session Note', code: 'Tutoring · Mathematics', start: '15:30', end: '16:15', duration: 45, author: 70002, recordedAt: '2026-11-18T23:20:00Z', participants: 'Student and tutor', location: 'Private tutoring room',
      sections: { 'Session summary': assembleLearningSession(learningBundle, planChecklist).summary },
      chart: { learningPlan: 'Mathematics · Grade 5 (approved Nov 1, 2026)' } })]
  },
  {
    filename: 'inner-strength-90791-intake', recordTitle: 'Psychotherapy Intake Evaluation',
    agency: { id: 90003, slug: 'tisi', name: 'The Inner Strength Institute', timezone: 'America/Denver', color_palette: { primary: '#12394f', accent: '#6b8798' } },
    client: { full_name: 'Example Client · fictional', identifier_code: 'DEMO-3001', date_of_birth: '1988-09-14', pronouns: 'she/her', preferred_language: 'English', address_street: '200 Example Avenue', address_city: 'Denver', address_state: 'CO', address_zip: '80200', contact_phone: '(303) 555-0120', email: 'intake@example.test' }, names: { 70003: 'Example Evaluator, LPC' },
    notes: [note({ title: 'Psychotherapy Intake Evaluation', code: '90791', start: '10:30', end: '11:40', duration: 70, author: 70003, signedAt: '2026-11-18T18:45:00Z',
      sections: {
        'Consent / information sources': 'Client consented to an in-person diagnostic interview in a private office. Provider reviewed the purpose of the evaluation, confidentiality and its limits, and the opportunity to ask questions. Information below was obtained from the client’s report and observations during this fictional encounter. No collateral records or independent assessment results were available.',
        'Presenting problem / functional impact': 'Client sought help for approximately seven months of frequent worry about work performance, household responsibilities and the possibility of disappointing others. Client described difficulty stopping the worry, muscle tension, irritability, fatigue and delayed sleep onset. Symptoms occur across several situations rather than only during a single event. Client reported spending additional time rechecking routine work, postponing decisions and withdrawing from some social plans. The client’s stated priority is to respond to worry more effectively and return to a consistent sleep routine.',
        'History of the current concern': 'Client described a gradual increase in symptoms after a change in work responsibilities. Occasional worry was present previously, but the current pattern is more persistent and interferes with daily functioning. Symptoms are most noticeable before deadlines and at bedtime. Brief walks and conversations with a trusted support person sometimes help. Client has not previously received structured treatment for this concern and did not report episodes of sudden, unexpected panic during this interview.',
        'Behavioral-health / treatment history': 'Client reported a brief course of supportive counseling several years ago during a relationship transition. No prior psychiatric hospitalization, suicide attempt or self-injury was reported. Client denied a history of sustained elevated mood, markedly decreased need for sleep with increased energy, hallucinations or fixed unusual beliefs. Previous diagnoses and medication records were not independently verified. Provider documented these statements as client report, without treating unavailable records as confirmed findings.',
        'Medical / medication / substance context': 'Client reported no current psychiatric medication and no recent change in prescribed medication. Client described regular caffeine use and occasional social alcohol use, denied current nonprescribed substance use, and did not describe intoxication or withdrawal symptoms. Medical contributors to sleep and fatigue have not been independently evaluated in this encounter; coordination with primary care was discussed with the client. No medication recommendation was made.',
        'Family / developmental / social context': 'Client reported stable housing and identified a partner and one friend as available supports. Client described increased responsibility at work and difficulty setting limits on additional tasks. No current legal concern or unmet basic need was disclosed. Developmental and educational history was reviewed at a general level without a reported concern requiring immediate follow-up. More detailed family history and previous treatment records may be reviewed later with appropriate authorization.',
        'Trauma / safety assessment': 'Client was offered the opportunity to discuss potentially relevant adverse experiences and preferred to revisit that history as rapport develops. Provider respected that preference and did not infer an undisclosed trauma history. Client denied current suicidal or homicidal thoughts, intent, plan or preparatory behavior, denied recent self-harm, and identified supportive relationships and future commitments. No acute safety concern was identified from the information available in this fictional interview. Routine reassessment and discussion of support options remain part of follow-up care.',
        'Clinical formulation / diagnostic justification': 'The reported pattern includes persistent, difficult-to-control worry across multiple areas with associated tension, irritability, fatigue, sleep disruption and concentration difficulty. Client described meaningful interference with work efficiency, decision-making and social participation. The duration and breadth of the reported symptoms support the documented diagnosis in this fictional example. No diagnosis is inferred from a screening score. Relevant medical, substance-related and other diagnostic explanations will continue to be considered as additional history becomes available.',
        'Initial recommendations / plan': 'Provider and client discussed individual psychotherapy focused on understanding the worry cycle, practicing coping skills, improving sleep-related routines and monitoring functional change. Client expressed interest in weekly sessions and identified a consistent bedtime routine as an initial priority. A separate treatment plan will be developed with measurable goals and the required review and signatures; this intake does not represent an approved treatment plan. Client may authorize coordination with primary care and release of prior counseling records.',
        'Client response / disposition': 'Client participated actively, asked questions about the proposed approach and accurately summarized the next steps. Client agreed to return for follow-up and to note situations in which worry affects sleep or decision-making. The session ended with an opportunity for questions and confirmation of the follow-up process.'
      }, chart: {
        presentingProblem: 'Frequent, difficult-to-control worry for seven months with muscle tension, fatigue and sleep disruption affecting work and social participation.',
        diagnosticJustification: 'Reported worry spans several life areas, has persisted for seven months and is associated with tension, irritability, fatigue, impaired concentration and sleep disruption, with meaningful functional interference. Other explanations remain under assessment.',
        diagnoses: [{ code: 'F41.1', description: 'Generalized anxiety disorder', status: 'Documented in this fictional evaluation' }],
        mentalStatusExam: { ...mse, motorActivity: 'No unusual movement observed', eyeContact: 'Appropriate', perception: 'No perceptual disturbance reported', thoughtAssociation: 'Intact', affect: 'Anxious but reactive and congruent', fundOfKnowledge: 'Appropriate to conversation', impulseControl: 'No difficulty observed', reliability: 'Client report; collateral not yet obtained' },
        riskAssessment: { ideation: 'Current suicidal and homicidal ideation denied', intentAndPlan: 'Denied', recentBehavior: 'No recent self-harm reported', protectiveFactors: 'Supportive relationships; future commitments', clinicalAction: 'Routine reassessment and follow-up; no acute intervention indicated by the fictional source' }
      } })]
  }
];

let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
if (!executablePath) {
  for (const candidate of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']) {
    try { await fs.access(candidate); executablePath = candidate; break; } catch { /* Use Puppeteer's managed browser when no system Chromium is installed. */ }
  }
}
const browser = await puppeteer.launch({ headless: 'new', ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-background-networking'], userDataDir: path.join(destination, '.chromium-profile') });
const results = [];
try {
  for (const sample of samples) {
    for (const file of await fs.readdir(destination)) {
      if (file.startsWith(sample.filename + '-page-') && /-page-\d+\.png$/.test(file)) await fs.unlink(path.join(destination, file));
    }
    const input = { ...sample, singleDocument: true, sample: true, exportedAt: '2026-11-18 04:25 PM MST' };
    const pdf = await generateClinicalRecordPdf(input, { resolveBrand: resolvePacketBrandChrome, renderHtml: async (html, options) => {
      const page = await browser.newPage();
      try {
        await page.setRequestInterception(true);
        page.on('request', request => /^(?:data:|about:|blob:)/.test(request.url()) ? request.continue() : request.abort());
        await page.setContent(html, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        return await page.pdf(options);
      } finally { await page.close(); }
    } });
    await fs.writeFile(path.join(destination, sample.filename + '.pdf'), pdf);
    const document = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, isEvalSupported: false }).promise;
    const targetPages = sample.filename === 'inner-strength-90791-intake' ? 2 : 1;
    const text = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number), viewport = page.getViewport({ scale: 1.3 });
      const image = canvas.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: image.getContext('2d'), viewport }).promise;
      await fs.writeFile(path.join(destination, `${sample.filename}-page-${number}.png`), image.toBuffer('image/png'));
      text.push((await page.getTextContent()).items.map(item => item.str).join(' '));
    }
    if (document.numPages !== targetPages) throw new Error(`Unexpected sample pagination: ${sample.filename} (${document.numPages} pages)`);
    const combined = text.join('\n');
    if (/Narriva|AuricWell/i.test(combined)) throw new Error('Unexpected generator branding in a sample PDF.');
    if (!combined.includes(sample.agency.official_name || sample.agency.name)) throw new Error('Agency identity missing in sample PDF.');
    for (const heading of Object.keys(JSON.parse(sample.notes[0].note.note_payload).sections)) {
      if (!combined.includes(heading)) throw new Error('A source section is missing from a sample PDF: ' + heading);
    }
    await document.destroy();
    results.push({ file: sample.filename + '.pdf', pages: text.length, bytes: pdf.length, agency: sample.agency.name, source: 'Fictional sample only' });
  }
} finally {
  await browser.close();
  await fs.rm(path.join(destination, '.chromium-profile'), { recursive: true, force: true });
}
await fs.writeFile(path.join(destination, 'samples.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify({ destination, samples: results }));
// Shared application imports own timers; this standalone preview has finished
// after closing its browser and PDF workers and must not keep them alive.
process.exit(0);
