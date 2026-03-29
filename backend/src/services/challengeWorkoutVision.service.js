import pool from '../config/database.js';

export const enqueueWorkoutVision = async ({
  workoutId,
  learningClassId,
  userId,
  screenshotFilePath = null,
  workoutNotes = null
}) => {
  const enabled = String(process.env.GOOGLE_VISION_ENABLED || '').trim() === '1';
  const requestPayload = {
    screenshotFilePath: screenshotFilePath || null,
    workoutNotes: workoutNotes || null
  };
  const status = enabled ? 'queued' : 'skipped';
  const errorMessage = enabled ? null : 'GOOGLE_VISION_ENABLED is not set; job recorded as skipped';
  await pool.execute(
    `INSERT INTO challenge_workout_vision_jobs
     (workout_id, learning_class_id, user_id, status, provider, request_json, error_message)
     VALUES (?, ?, ?, ?, 'google_vision', ?, ?)`,
    [
      Number(workoutId),
      Number(learningClassId),
      Number(userId),
      status,
      JSON.stringify(requestPayload),
      errorMessage
    ]
  );
  return { queued: enabled };
};
