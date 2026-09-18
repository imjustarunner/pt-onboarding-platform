import User from '../models/User.model.js';

/**
 * Service to process terminated and completed users automatically
 * Should be called periodically (e.g., via cron job or scheduled task)
 * 
 * - Archives TERMINATED_PENDING users after 7 days
 * - Completed-user processing is retained as a compatibility no-op
 */
export async function processTerminatedUsers() {
  try {
    const result = await User.processTerminatedUsers();
    console.log(`Processed terminated users: ${result.archived} archived`);
    return result;
  } catch (error) {
    console.error('Error processing terminated users:', error);
    throw error;
  }
}

export async function processCompletedUsers() {
  try {
    const result = await User.processCompletedUsers();
    console.log(`Processed completed users: ${result.markedInactive} marked inactive, ${result.addedToApproved} added to approved list`);
    return result;
  } catch (error) {
    console.error('Error processing completed users:', error);
    throw error;
  }
}

export async function processAllUserStatuses() {
  try {
    const terminatedResult = await processTerminatedUsers();
    const completedResult = await processCompletedUsers();
    return {
      terminated: terminatedResult,
      completed: completedResult
    };
  } catch (error) {
    console.error('Error processing user statuses:', error);
    throw error;
  }
}
