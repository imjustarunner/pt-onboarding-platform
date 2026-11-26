// Shared by the clause-library seed and the builder before new clauses are seeded.
export const STUDENT_TRAINING_CLAUSES = [
  {
    clause_key: 'INTRO_STUDENT_TRAINING',
    title: 'Student Training Agreement',
    paragraphs: [
      'This Student Training Agreement is entered into on {{EXECUTION_DATE}} by {{COMPANY_NAME}} (the “Practice”), with its principal place of business at {{COMPANY_ADDRESS}}, and {{CANDIDATE_NAME}} (the “Student”), enrolled at {{UNIVERSITY_NAME}}. The Student will serve as {{JOB_TITLE}} with a service focus of {{SERVICE_FOCUS}}.',
      'This single agreement covers the Student’s applicable practicum and internship phases with the Practice. The starting phase is {{TRAINING_START_PHASE_LABEL}}, beginning on {{START_DATE}}. The Student’s services, supervision, and training remain subject to applicable academic-program requirements, Practice policies, and this agreement.'
    ]
  },
  {
    clause_key: 'TERM_STUDENT_TRAINING',
    title: 'Training Phases, Continuation, and Review',
    paragraphs: [
      'Practicum-to-internship continuation: When the Student begins in practicum, this agreement is set to continue into internship upon completion of the applicable practicum requirements, unless either party gives the other written notice before the internship begins that the placement will not continue. A replacement agreement or separate phase-transition addendum is not required. Internship services may begin only after required academic-program approvals and supervision arrangements are in place.',
      'End-of-practicum review: Before the internship phase begins, the Practice will review the Student’s performance, attendance and reliability, documentation, professional conduct, responsiveness to supervision, readiness for internship responsibilities, client-care standards, and fit with the training placement. Based on that review, the Practice may determine that the placement will end after practicum and provide written notice of non-continuation. The Student may also elect not to continue by providing written notice. Completion of practicum does not remove either party’s right to decline continuation.',
      'Direct-entry internship: A Student whose starting phase is internship enters directly into the internship phase under this same agreement. Completing a practicum at the Practice is not required when the academic program does not require practicum or when applicable practicum prerequisites have already been satisfied elsewhere. Required academic-program approvals and supervision arrangements still apply.',
      'Duration and ending the placement: This agreement continues through the applicable training phases until completion of the placement or earlier termination. Either party may end the placement by written notice, subject to applicable law and any applicable written academic-program affiliation agreement. The Practice may end the placement earlier for performance, conduct, safety, or training-placement concerns, subject to those same requirements. The parties will coordinate required academic notifications, completion of records, and an appropriate transition of client care.',
      'Continuing compensation: The selected compensation category and level apply during both practicum and internship and do not change automatically at the phase transition. Any approved compensation change must be documented as provided in this agreement. This training agreement does not promise a position with the Practice after the training placement ends.'
    ]
  }
].map(clause => ({
  ...clause,
  body_md: clause.paragraphs.join('\n\n'),
  body_html: `<h2>${clause.title}</h2>\n${clause.paragraphs.map(paragraph => `<p>${paragraph}</p>`).join('\n')}`
}));

/** Select the applicable training terms from both saved library clauses and
 * built-in defaults. Preserve agency additions and the original stored clause. */
export function studentTrainingClauseForPhase(clause, phase) {
  if (!['practicum', 'internship'].includes(phase)
    || !['INTRO_STUDENT_TRAINING', 'TERM_STUDENT_TRAINING'].includes(clause.clause_key)) return clause;
  const directEntry = phase === 'internship';
  let html = String(clause.body_html || '').replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi, paragraph => {
    const text = paragraph.replace(/<[^>]*>/g, '').trim();
    if (directEntry && /^(Practicum-to-internship continuation|End-of-practicum review):/.test(text)) return '';
    if (!directEntry && /^Direct-entry internship:/.test(text)) return '';
    if (!directEntry) return paragraph;
    return paragraph
      .replace('covers the Student’s applicable practicum and internship phases', 'covers the Student’s direct-entry internship')
      .replace('continues through the applicable training phases', 'continues through the internship placement')
      .replace('apply during both practicum and internship and do not change automatically at the phase transition', 'apply during the internship and do not change automatically with elapsed time');
  });
  const title = directEntry && clause.title === 'Training Phases, Continuation, and Review' ? 'Direct-entry Internship' : clause.title;
  if (title !== clause.title) html = html.replace('Training Phases, Continuation, and Review', title);
  return { ...clause, title, body_html: html };
}
