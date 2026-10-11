'use strict';

const SunCalc = require('suncalc');

/**
 * sunEvents(lat, lon, date)
 *
 * Returns key solar times for a given location and calendar date.
 * All returned values are native JS Date objects (UTC).
 *
 * @param {number} lat   – Latitude  (decimal degrees, + = North)
 * @param {number} lon   – Longitude (decimal degrees, + = East)
 * @param {Date}   date  – Any moment on the desired local date (midnight is fine)
 * @returns {{
 *   sunrise:          Date,   // upper limb of sun crosses horizon (morning)
 *   sunriseEnd:       Date,   // upper limb fully above horizon
 *   goldenHourEnd:    Date,   // morning golden hour ends
 *   goldenHour:       Date,   // evening golden hour starts
 *   sunsetStart:      Date,   // upper limb starts touching horizon
 *   sunset:           Date,   // upper limb disappears (evening)
 *   solarNoon:        Date,   // sun at highest point
 * }}
 */
function sunEvents(lat, lon, date) {
  const times = SunCalc.getTimes(date, lat, lon);

  return {
    // ── Morning ──────────────────────────────────────────────────────────
    sunrise:       times.sunrise,       // classic "sunrise" moment
    sunriseEnd:    times.sunriseEnd,    // disc fully clear of horizon
    goldenHourEnd: times.goldenHourEnd, // end of morning golden hour

    // ── Midday ───────────────────────────────────────────────────────────
    solarNoon:     times.solarNoon,

    // ── Evening ──────────────────────────────────────────────────────────
    goldenHour:    times.goldenHour,    // start of evening golden hour
    sunsetStart:   times.sunsetStart,   // disc starts touching horizon
    sunset:        times.sunset,        // classic "sunset" moment
  };
}

/**
 * fireAt(eventDate, leadMinutes)
 *
 * Returns the UTC time at which a push notification should be sent,
 * i.e. `leadMinutes` before the solar event.
 *
 * @param {Date}   eventDate   – The sunrise or sunset Date
 * @param {number} leadMinutes – Minutes before the event (default 20)
 * @returns {Date}
 */
function fireAt(eventDate, leadMinutes = 20) {
  return new Date(eventDate.getTime() - leadMinutes * 60 * 1000);
}

module.exports = { sunEvents, fireAt };
