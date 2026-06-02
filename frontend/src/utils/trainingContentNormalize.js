/**
 * Normalize AI-generated or API quiz/page shapes for QuizBuilder and ModuleView.
 */
export function normalizeQuizDataForEditor(quizData = {}) {
  const data = {
    title: quizData.title || '',
    description: quizData.description || '',
    minimumScore: quizData.minimumScore ?? 80,
    allowRetake: quizData.allowRetake !== false,
    randomizeAnswers: quizData.randomizeAnswers || false,
    questions: []
  };

  let qId = 0;
  let oId = 0;
  const questionsIn = Array.isArray(quizData.questions) ? quizData.questions : [];

  data.questions = questionsIn.map((q) => {
    const type = ['multiple_choice', 'true_false', 'text'].includes(q?.type) ? q.type : 'multiple_choice';
    const question = {
      id: q?.id || `q-${qId++}`,
      question: String(q?.question || '').trim(),
      type,
      correctAnswer: q?.correctAnswer ?? ''
    };

    if (type === 'multiple_choice') {
      const optionTexts = (Array.isArray(q?.options) ? q.options : [])
        .map((o) => (typeof o === 'string' ? o : o?.text || ''))
        .map((s) => String(s).trim())
        .filter(Boolean);
      while (optionTexts.length < 2) {
        optionTexts.push(`Option ${optionTexts.length + 1}`);
      }
      let correctText = optionTexts[0];
      const ca = q?.correctAnswer;
      if (typeof ca === 'number' || (typeof ca === 'string' && /^\d+$/.test(ca))) {
        const idx = Number.parseInt(ca, 10);
        if (optionTexts[idx]) correctText = optionTexts[idx];
      } else if (typeof ca === 'string' && ca.trim()) {
        const match = optionTexts.find((o) => o.toLowerCase() === ca.toLowerCase());
        correctText = match || ca;
      }
      const reordered = [correctText, ...optionTexts.filter((o) => o !== correctText)];
      question.options = reordered.map((text) => ({ id: `opt-${oId++}`, text }));
      question.correctAnswer = reordered[0];
    }

    return question;
  });

  return data;
}

/** Learner QuizForm expects multiple_choice options as plain strings. */
export function normalizeQuizDataForLearner(quizData = {}) {
  const editor = normalizeQuizDataForEditor(quizData);
  return {
    ...editor,
    questions: editor.questions.map((q) => {
      if (q.type !== 'multiple_choice') return q;
      const options = (q.options || []).map((o) =>
        typeof o === 'string' ? o : String(o?.text ?? '').trim()
      ).filter(Boolean);
      const correctAnswer =
        typeof q.correctAnswer === 'string'
          ? q.correctAnswer
          : options[0] || '';
      return { ...q, options, correctAnswer };
    })
  };
}

export function optionDisplayText(opt) {
  if (opt == null) return '';
  if (typeof opt === 'string') return opt;
  if (typeof opt === 'object') return String(opt.text ?? opt.label ?? '').trim();
  return String(opt);
}

export function parseModuleContentData(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && raw !== null) return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return {};
}

export function isIntroTextContent(data) {
  const d = data || {};
  if (d.fileUrl || d.prompt || d.formUrl) return false;
  const body = String(d.content || d.textContent || '').trim();
  if (body) return false;
  return Boolean(String(d.title || '').trim() || String(d.description || '').trim());
}

export function getTextBodyHtml(data) {
  const d = data || {};
  return String(d.content || d.textContent || '').trim();
}

export function isQuizOptionCorrect(question, option, optionIndex) {
  const optText = typeof option === 'object' ? option?.text ?? option : option;
  const ca = question?.correctAnswer;
  if (ca === optionIndex || ca === String(optionIndex)) return true;
  if (typeof ca === 'string' && optText != null) {
    return String(ca).trim().toLowerCase() === String(optText).trim().toLowerCase();
  }
  return false;
}
