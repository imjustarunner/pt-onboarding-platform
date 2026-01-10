import User from '../models/User.model.js';

/**
 * Service to process terminated and completed users automatically
 * Should be called periodically (e.g., via cron job or scheduled task)
 * 
 * - Marks terminated users as inactive after 7 days
 * - Archives terminated users after 14 days
 * - Marks completed users as inactive after 7 days
 * - Adds completed users to approved employee list after 7 days
 */
export async function processTerminatedUsers() {
  try {
    const result = await User.processTerminatedUsers();
    console.log(`Processed terminated users: ${result.markedInactive} marked inactive, ${result.archived} archived`);
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

