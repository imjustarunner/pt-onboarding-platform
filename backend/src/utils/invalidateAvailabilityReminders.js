// Use the writer's connection so publication changes and invalidation commit
// together. Other agencies may reuse this provider's published schedule.
export async function invalidateAvailabilityReminders(database, providerId) {
  await database.execute(
    'UPDATE provider_availability_reminders SET checked_at=NULL WHERE provider_id=?',
    [providerId]
  );
}
