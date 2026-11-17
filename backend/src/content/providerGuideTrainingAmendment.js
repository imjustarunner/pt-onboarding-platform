// Bind the reviewed attendance question to this specific revised section.
// Retain the previous definition for published guides using the earlier text.
const attendanceSlug = 'medicaid-attendance-standards';
const oldHash = '3aae135344b0f2594bedb923e1aea21118cc539ed0c7464dc917d4f8558ed973';
const newHash = 'fff225c6ae4ec29e0305fedb37669e998e2081d321b832083175079669b4cfca';

export function applyProviderGuideTrainingAmendment(definition) {
  if (definition.documentKey !== 'provider-guide' || !definition.tenants?.includes('itsco')
    || definition.sectionHashes?.[attendanceSlug] !== oldHash) return definition;
  const { previousEditions = [], ...previous } = definition;
  return { ...definition,
    sectionHashes: { ...definition.sectionHashes, [attendanceSlug]: newHash },
    questions: definition.questions.map(question => question.id === 'missed' ? { ...question,
      prompt: 'A Medicaid-only client misses a session. Which action follows this guide?',
      explanation: 'Document the missed appointment accurately and do not charge Medicaid-only members a missed-appointment fee. Any potential exception involving other primary coverage requires documented billing review; staff cannot independently charge a fee or consume a credit.'
    } : question),
    previousEditions: [previous, ...previousEditions]
  };
}
