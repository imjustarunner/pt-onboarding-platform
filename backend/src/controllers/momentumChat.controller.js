import { getFocusRecommendations, generateDigest } from '../services/momentumChat.service.js';

function ensureOwnUser(req, res, next) {
  const userId = parseInt(req.params.userId, 10);
  if (userId !== req.user?.id) {
    return res.status(403).json({ error: { message: 'You can only use Momentum Chat for your own account' } });
  }
  next();
}

export const chat = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { message, agencyId, programId } = req.body || {};

    const { items, suggestedTasks, suggestedUpdates, suggestedDeletes, rawText } = await getFocusRecommendations(
      userId,
      message || 'What should I focus on now?',
      {
        agencyId: agencyId ? parseInt(agencyId, 10) : null,
        programId: programId ? parseInt(programId, 10) : null
      }
    );

    res.json({
      items,
      suggestedTasks: suggestedTasks || [],
      suggestedUpdates: suggestedUpdates || [],
      suggestedDeletes: suggestedDeletes || [],
      rawText,
      message: message || 'What should I focus on now?'
    });
  } catch (err) {
    next(err);
  }
};

export const getDigest = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const programId = req.query.programId ? parseInt(req.query.programId, 10) : null;
    const payrollNotesCount = parseInt(req.query.payrollNotesCount, 10) || 0;
    const notesToSignCount = parseInt(req.query.notesToSignCount, 10) || 0;
    const delinquencyScore = parseInt(req.query.delinquencyScore, 10) || 0;

    const { topFocus, alsoOnRadar } = await generateDigest(userId, {
      agencyId,
      programId,
      payrollNotesCount,
      notesToSignCount,
      delinquencyScore
    });

    res.json({
      topFocus: topFocus || [],
      alsoOnRadar: alsoOnRadar || []
    });
  } catch (err) {
    next(err);
  }
};

export { ensureOwnUser };
