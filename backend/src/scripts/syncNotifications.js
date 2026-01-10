import NotificationService from '../services/notification.service.js';

async function syncNotifications() {
  try {
    console.log('Syncing notifications for all agencies...\n');
    const results = await NotificationService.syncNotifications();
    
    console.log('Sync results:');
    let total = 0;
    Object.entries(results).forEach(([agencyId, count]) => {
      if (typeof count === 'number') {
        console.log(`  Agency ${agencyId}: ${count} notifications generated`);
        total += count;
      } else {
        console.log(`  Agency ${agencyId}: Error - ${count.error || 'Unknown error'}`);
      }
    });
    
    console.log(`\n✅ Total notifications generated: ${total}`);
  } catch (error) {
    console.error('❌ Error syncing notifications:', error);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

syncNotifications();
