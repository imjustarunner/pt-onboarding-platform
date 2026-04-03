-- Kudos system: limited weekly budget (2/week), intra-team cap (1), cross-team cap (2).
-- Emoji reactions: unlimited, one per emoji type per user per workout.

-- Kudos — one row per kudos given; enforces all business rules via app layer
CREATE TABLE IF NOT EXISTS challenge_workout_kudos (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  workout_id        INT          NOT NULL,
  learning_class_id INT          NOT NULL,
  week_start_date   DATE         NOT NULL,
  giver_user_id     INT          NOT NULL,
  giver_team_id     INT          NULL,
  receiver_user_id  INT          NOT NULL,
  receiver_team_id  INT          NULL,
  given_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- One kudos per user per workout (can't double-kudo the same workout)
  UNIQUE KEY uq_kudos_giver_workout (giver_user_id, workout_id),
  INDEX idx_kudos_workout        (workout_id),
  INDEX idx_kudos_receiver       (receiver_user_id),
  INDEX idx_kudos_giver          (giver_user_id),
  INDEX idx_kudos_class_week     (learning_class_id, week_start_date),
  INDEX idx_kudos_giver_week     (giver_user_id, learning_class_id, week_start_date)
);

-- Emoji reactions — unlimited, but one per emoji-type per user per workout
CREATE TABLE IF NOT EXISTS challenge_workout_reactions (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  workout_id        INT          NOT NULL,
  learning_class_id INT          NOT NULL,
  user_id           INT          NOT NULL,
  emoji             VARCHAR(16)  NOT NULL,
  reacted_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- One row per user + workout + emoji combination
  UNIQUE KEY uq_reaction_user_workout_emoji (user_id, workout_id, emoji),
  INDEX idx_reactions_workout (workout_id),
  INDEX idx_reactions_user    (user_id),
  INDEX idx_reactions_class   (learning_class_id)
);

-- Track per-club whether kudos is enabled (defaults to ON for this tenant)
ALTER TABLE agencies
  ADD COLUMN kudos_enabled TINYINT(1) NOT NULL DEFAULT 1;
