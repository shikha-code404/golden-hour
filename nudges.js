'use strict';

const fs = require('fs');
const path = require('path');

const NUDGES_PATH = path.join(__dirname, 'data', 'nudges.json');

const BUILT_IN = {
  sunrise_reminder: [
    'Sunrise is in {minutes} minutes. A quiet moment outside is waiting.',
    'The morning light arrives in {minutes} minutes. No pressure—just an invitation.',
    'In {minutes} minutes, the sky will begin to brighten. Step out if it feels good.',
  ],
  sunset_reminder: [
    'Sunset is in {minutes} minutes. You might enjoy a little fresh air outside.',
    'The evening light arrives in {minutes} minutes. Take a gentle pause if you can.',
    'In {minutes} minutes, the sky will soften. A balcony moment is yours if you want it.',
  ],
  treat_ideas: [
    'Take a warm chai outside.',
    'Bring a coffee and sit for a few quiet minutes.',
    'Pack a small snack to enjoy in the open air.',
  ],
  done_messages: [
    'Lovely—you made space for yourself today. Streak: {streak}.',
    'That was a good little pause. You’re on a {streak}-day streak.',
    'Nice work showing up for the sky. Streak: {streak}.',
  ],
};

function loadNudges() {
  try {
    const parsed = JSON.parse(fs.readFileSync(NUDGES_PATH, 'utf8'));
    return { ...BUILT_IN, ...parsed };
  } catch {
    return BUILT_IN;
  }
}

function randomLine(category, values = {}) {
  const lines = loadNudges()[category] || BUILT_IN[category] || [];
  const line = lines[Math.floor(Math.random() * lines.length)] || '';
  return line.replace(/\{(minutes|streak)\}/g, (_, key) => String(values[key] ?? `{${key}}`));
}

module.exports = { randomLine, loadNudges, NUDGES_PATH };
