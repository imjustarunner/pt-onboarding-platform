-- Widen challenge_workout_reactions.emoji to support icon:<id> references
-- alongside standard Unicode emoji (was VARCHAR(16), now VARCHAR(64))
ALTER TABLE challenge_workout_reactions
  MODIFY COLUMN emoji VARCHAR(64) NOT NULL;
