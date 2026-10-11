'use strict';

require('dotenv').config();
const { MongoClient } = require('mongodb');

let client;
let connectionPromise;

async function getDatabase() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required to connect to MongoDB.');
  }

  if (!connectionPromise) {
    try {
      client = new MongoClient(process.env.MONGODB_URI);
    } catch {
      throw new Error(
        'MongoDB connection failed. MONGODB_URI must be a valid MongoDB connection string.',
      );
    }

    const connectingClient = client;

    connectionPromise = connectingClient.connect()
      .then(() => {
        const database = connectingClient.db();
        return {
          database,
          subscribers: database.collection('subscribers'),
          reminders: database.collection('reminders'),
          checkins: database.collection('checkins'),
        };
      })
      .catch(() => {
        client = undefined;
        connectionPromise = undefined;
        throw new Error(
          'MongoDB connection failed. Check MONGODB_URI, Atlas network access, and database credentials.',
        );
      });
  }

  return connectionPromise;
}

async function closeDatabase() {
  if (client) {
    const connectedClient = client;
    client = undefined;
    connectionPromise = undefined;
    await connectedClient.close();
  }
}

module.exports = getDatabase;
module.exports.close = closeDatabase;
