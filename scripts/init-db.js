'use strict';

const getDatabase = require('../db');

async function initializeDatabase() {
  const { database, subscribers, reminders, checkins } = await getDatabase();

  await Promise.all([
    subscribers.createIndex(
      { endpoint: 1 },
      { unique: true, name: 'subscribers_endpoint_unique' },
    ),
    reminders.createIndex(
      { subscriberId: 1, kind: 1, eventTime: 1 },
      { unique: true, name: 'reminders_subscriber_kind_event_unique' },
    ),
    reminders.createIndex(
      { sentAt: 1, fireAt: 1 },
      { name: 'reminders_sent_fire' },
    ),
    checkins.createIndex(
      { subscriberId: 1, kind: 1, localDate: 1 },
      { unique: true, name: 'checkins_subscriber_kind_date_unique' },
    ),
  ]);

  const collectionNames = ['subscribers', 'reminders', 'checkins'];
  const collections = await Promise.all(collectionNames.map(async (name) => ({
    name,
    indexes: await database.collection(name).listIndexes().toArray(),
  })));

  console.log('MongoDB collections and indexes initialized:');
  console.log(JSON.stringify({ collections }, null, 2));
}

async function main() {
  try {
    await initializeDatabase();
  } catch {
    console.error(
      '[init-db] Initialization failed. Check MongoDB connection settings and database privileges.',
    );
    process.exitCode = 1;
  } finally {
    try {
      await getDatabase.close();
    } catch {
      console.error('[init-db] Failed to close the MongoDB connection.');
      process.exitCode = 1;
    }
  }
}

main();
