'use strict';

/**
 * scripts/test-sun.js
 * Quick smoke-test for sun.js.
 * Run:  node scripts/test-sun.js
 */

const { sunEvents, fireAt } = require('../sun');

// ── Location: Pune, India ─────────────────────────────────────────────────────
const LAT = 18.52;
const LON = 73.86;
const TZ  = 'Asia/Kolkata';      // UTC+5:30

// Tomorrow at local midnight (give suncalc a date that falls on the right day)
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(0, 0, 0, 0);

const events = sunEvents(LAT, LON, tomorrow);

// ── Pretty-print in IST ───────────────────────────────────────────────────────
const fmt = (d) =>
  d
    ? d.toLocaleTimeString('en-IN', { timeZone: TZ, hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'N/A';

const dateLabel = tomorrow.toLocaleDateString('en-IN', { timeZone: TZ, dateStyle: 'full' });

console.log(`\n🌅  Golden Hour — Sun Events for Pune (${LAT}°N, ${LON}°E)`);
console.log(`📅  Date : ${dateLabel}\n`);

console.log('MORNING');
console.log(`  Sunrise          : ${fmt(events.sunrise)}`);
console.log(`  Sunrise end      : ${fmt(events.sunriseEnd)}`);
console.log(`  Golden hour ends : ${fmt(events.goldenHourEnd)}`);
console.log(`  Notify at (-20m) : ${fmt(fireAt(events.sunrise, 20))}`);

console.log('\nMIDDAY');
console.log(`  Solar noon       : ${fmt(events.solarNoon)}`);

console.log('\nEVENING');
console.log(`  Golden hour start: ${fmt(events.goldenHour)}`);
console.log(`  Sunset start     : ${fmt(events.sunsetStart)}`);
console.log(`  Sunset           : ${fmt(events.sunset)}`);
console.log(`  Notify at (-20m) : ${fmt(fireAt(events.sunset, 20))}`);

// ── Sanity checks ─────────────────────────────────────────────────────────────
const issues = [];

const srH = events.sunrise.getUTCHours();   // In IST (UTC+5:30) Oct sunrise ~06:xx → UTC 00:xx-01:xx
if (srH < 0 || srH > 3) issues.push(`⚠  Sunrise UTC hour ${srH} seems off (expected 0–3 for Pune)`);

const ssH = events.sunset.getUTCHours();    // IST Oct sunset ~18:xx → UTC 12:xx-13:xx
if (ssH < 11 || ssH > 15) issues.push(`⚠  Sunset UTC hour ${ssH} seems off (expected 11–15 for Pune)`);

if (events.sunrise >= events.sunset) issues.push('⚠  Sunrise is not before sunset!');
if (events.goldenHourEnd >= events.goldenHour) issues.push('⚠  Morning golden-hour end is after evening golden-hour start!');

if (issues.length === 0) {
  console.log('\n✅  All sanity checks passed.\n');
} else {
  console.log('\n');
  issues.forEach((i) => console.warn(i));
  console.log();
  process.exit(1);
}
