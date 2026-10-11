# MongoDB data model

The application uses the following collections. MongoDB adds an `_id` field to
each document automatically.

## `subscribers`

```js
{
  endpoint: String,                 // Unique push subscription endpoint
  keys: { p256dh: String, auth: String },
  lat: Number,
  lon: Number,
  tz: String,                       // IANA timezone, e.g. "Asia/Kolkata"
  wantSunrise: Boolean,             // Defaults to true
  wantSunset: Boolean,              // Defaults to true
  leadMinutes: Number,              // Defaults to 20
  createdAt: Date
}
```

## `reminders`

```js
{
  subscriberId: ObjectId,           // References subscribers._id
  kind: "sunrise" | "sunset",
  eventTime: Date,
  fireAt: Date,
  sentAt: Date | null
}
```

## `checkins`

```js
{
  subscriberId: ObjectId,           // References subscribers._id
  kind: "sunrise" | "sunset",
  localDate: String,                // YYYY-MM-DD in the subscriber's timezone
  treat: String,                    // Optional
  createdAt: Date
}
```

## Indexes

- `subscribers`: unique index on `endpoint`
- `reminders`: unique index on `(subscriberId, kind, eventTime)` and a regular
  index on `(sentAt, fireAt)`
- `checkins`: unique index on `(subscriberId, kind, localDate)`

Create the collections and indexes with `node scripts/init-db.js`.
