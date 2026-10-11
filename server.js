'use strict';

require('dotenv').config();

const express = require('express');
const webpush = require('web-push');
const { ObjectId } = require('mongodb');
const path = require('path');
const getDatabase = require('./db');
const { randomLine } = require('./nudges');

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true });
});

const VALID_KINDS = new Set(['sunrise', 'sunset']);

app.get('/api/config', (req, res) => {
  res.json({ vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null });
});

function localDateForTimezone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function previousLocalDate(localDate) {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function streakFor(checkins, subscriberId, localDate) {
  const rows = await checkins.find({ subscriberId }).project({ localDate: 1 }).toArray();
  const dates = new Set(rows.map((row) => row.localDate));
  let cursor = localDate;
  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = previousLocalDate(cursor);
  }
  return streak;
}

function requireKind(kind) {
  if (!VALID_KINDS.has(kind)) {
    const error = new Error('kind must be sunrise or sunset.');
    error.statusCode = 400;
    throw error;
  }
}

function subscriptionFromBody(body) {
  const subscription = body.subscription || body;
  if (!subscription || typeof subscription.endpoint !== 'string' || !subscription.keys) {
    const error = new Error('A push subscription with endpoint and keys is required.');
    error.statusCode = 400;
    throw error;
  }
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  };
}

function subscriberFields(body, subscription) {
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || typeof body.tz !== 'string') {
    const error = new Error('lat, lon, and an IANA tz are required.');
    error.statusCode = 400;
    throw error;
  }
  return {
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    lat,
    lon,
    tz: body.tz,
    wantSunrise: body.wantSunrise !== false,
    wantSunset: body.wantSunset !== false,
    leadMinutes: Number.isFinite(Number(body.leadMinutes)) ? Number(body.leadMinutes) : 20,
  };
}

async function findSubscriber(subscribers, body) {
  if (typeof body.endpoint === 'string') return subscribers.findOne({ endpoint: body.endpoint });
  if (typeof body.subscriberId === 'string' && ObjectId.isValid(body.subscriberId)) {
    return subscribers.findOne({ _id: new ObjectId(body.subscriberId) });
  }
  return null;
}

app.post('/api/subscribe', async (req, res, next) => {
  try {
    const { subscribers } = await getDatabase();
    const subscription = subscriptionFromBody(req.body);
    const fields = subscriberFields(req.body, subscription);
    await subscribers.updateOne(
      { endpoint: fields.endpoint },
      { $set: fields, $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
    const saved = await subscribers.findOne({ endpoint: fields.endpoint });
    res.status(200).json({ ok: true, subscriberId: saved._id.toString() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/checkin', async (req, res, next) => {
  try {
    const { subscribers, checkins } = await getDatabase();
    const subscriber = await findSubscriber(subscribers, req.body);
    if (!subscriber) return res.status(404).json({ error: 'Subscriber not found.' });
    requireKind(req.body.kind);

    const localDate = typeof req.body.localDate === 'string'
      ? req.body.localDate
      : localDateForTimezone(new Date(), subscriber.tz);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
      return res.status(400).json({ error: 'localDate must be YYYY-MM-DD.' });
    }

    const document = {
      subscriberId: subscriber._id,
      kind: req.body.kind,
      localDate,
      createdAt: new Date(),
    };
    if (typeof req.body.treat === 'string' && req.body.treat.trim()) document.treat = req.body.treat.trim();
    await checkins.updateOne(
      { subscriberId: subscriber._id, kind: document.kind, localDate },
      { $setOnInsert: document },
      { upsert: true },
    );
    const streak = await streakFor(checkins, subscriber._id, localDate);
    res.json({
      ok: true,
      streak,
      message: randomLine('done_messages', { streak }),
      treatIdea: randomLine('treat_ideas'),
    });
  } catch (error) {
    next(error);
  }
});

function authorizeTick(req, res) {
  if (process.env.TICK_SECRET && req.get('x-tick-secret') !== process.env.TICK_SECRET) {
    res.status(401).json({ error: 'Unauthorized.' });
    return false;
  }
  return true;
}

app.post('/api/tick', async (req, res, next) => {
  if (!authorizeTick(req, res)) return;
  if (req.query.force === '1' && process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found.' });
  }
  try {
    const { subscribers, reminders } = await getDatabase();
    const now = new Date();
    if (req.query.force === '1') {
      const kind = VALID_KINDS.has(req.query.kind) ? req.query.kind : 'sunrise';
      const subscriber = await subscribers.findOne({}, { sort: { createdAt: -1 } });
      if (!subscriber) return res.status(400).json({ error: 'Subscribe a device before forcing a reminder.' });
      const eventTime = new Date(now.getTime() + 5 * 60 * 1000);
      await reminders.updateOne(
        { subscriberId: subscriber._id, kind, eventTime },
        { $set: { fireAt: now, sentAt: null }, $setOnInsert: { subscriberId: subscriber._id, kind, eventTime } },
        { upsert: true },
      );
    }
    const due = await reminders.find({
      fireAt: { $lte: now },
      $or: [{ sentAt: null }, { sentAt: { $exists: false } }],
    }).sort({ fireAt: 1 }).limit(100).toArray();

    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT) {
      webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    }

    const result = { ok: true, due: due.length, sent: 0, skipped: 0, failed: 0 };
    for (const reminder of due) {
      const subscriber = await subscribers.findOne({ _id: reminder.subscriberId });
      if (!subscriber || subscriber[reminder.kind === 'sunrise' ? 'wantSunrise' : 'wantSunset'] === false) {
        await reminders.updateOne({ _id: reminder._id, sentAt: null }, { $set: { sentAt: now } });
        result.skipped += 1;
        continue;
      }
      const minutes = Math.max(0, Math.round((reminder.eventTime - now) / 60000));
      try {
        await webpush.sendNotification(
          { endpoint: subscriber.endpoint, keys: subscriber.keys },
          JSON.stringify({ type: 'reminder', kind: reminder.kind, message: randomLine(`${reminder.kind}_reminder`, { minutes }) }),
        );
        await reminders.updateOne({ _id: reminder._id, sentAt: null }, { $set: { sentAt: new Date() } });
        result.sent += 1;
      } catch (error) {
        result.failed += 1;
        if (error.statusCode === 404 || error.statusCode === 410) {
          await subscribers.deleteOne({ _id: subscriber._id });
        }
      }
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.statusCode || 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error.' : error.message });
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => console.log(`Golden Hour listening on port ${port}`));
}

module.exports = { app, localDateForTimezone, streakFor };
