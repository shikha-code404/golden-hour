'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'gemma3:1b';
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'nudges.json');
const CATEGORIES = ['sunrise_reminder', 'sunset_reminder', 'treat_ideas', 'done_messages'];
const MAX_LINES = 40;
const MAX_LENGTH = 90;

const fallback = {
  sunrise_reminder: [
    'Sunrise is in {minutes} minutes. A quiet moment outside is waiting.',
    'The morning light arrives in {minutes} minutes. No pressure—just an invitation.',
  ],
  sunset_reminder: [
    'Sunset is in {minutes} minutes. You might enjoy a little fresh air outside.',
    'The evening light arrives in {minutes} minutes. Take a gentle pause if you can.',
  ],
  treat_ideas: ['Take a warm chai outside.', 'Bring a coffee outside.', 'Pack a small snack.'],
  done_messages: [
    'Lovely—you made space for yourself today. Streak: {streak}.',
    'That was a good little pause. You’re on a {streak}-day streak.',
  ],
};

function generatedFallback(category) {
  if (category === 'sunrise_reminder') {
    const starts = [
      'Sunrise is in {minutes} minutes.',
      'Morning light arrives in {minutes} minutes.',
      'The day begins in {minutes} minutes.',
      'The sky will brighten in {minutes} minutes.',
    ];
    const ends = [
      ' Step outside if you’d like.',
      ' A quiet moment outside is waiting.',
      ' You can take a gentle pause outside.',
      ' There is no need to hurry.',
      ' A little fresh air may feel nice.',
      ' Let the morning meet you softly.',
      ' Your balcony is there whenever you are ready.',
      ' Take only the time that feels good.',
      ' You might enjoy seeing it from outside.',
      ' A small pause is enough.',
    ];
    return starts.flatMap((start) => ends.map((end) => start + end));
  }
  if (category === 'sunset_reminder') {
    const starts = [
      'Sunset is in {minutes} minutes.',
      'Evening light arrives in {minutes} minutes.',
      'The sky will soften in {minutes} minutes.',
      'The day will turn golden in {minutes} minutes.',
    ];
    const ends = [
      ' Step outside if you’d like.',
      ' A quiet moment outside is waiting.',
      ' You can take a gentle pause outside.',
      ' There is no need to hurry.',
      ' A little fresh air may feel nice.',
      ' Let the evening meet you softly.',
      ' Your balcony is there whenever you are ready.',
      ' Take only the time that feels good.',
      ' You might enjoy seeing it from outside.',
      ' A small pause is enough.',
    ];
    return starts.flatMap((start) => ends.map((end) => start + end));
  }
  if (category === 'treat_ideas') {
    const things = ['chai', 'coffee', 'tea', 'a small snack', 'fruit', 'biscuits', 'nuts', 'water'];
    const endings = [' to enjoy outside.', ' for a quiet balcony pause.', ' for a little fresh air.', ' and take it outdoors.', ' to make the moment feel special.'];
    return things.flatMap((thing) => endings.map((ending) => `Bring ${thing}${ending}`));
  }
  const starts = [
    'Lovely—you made space for yourself today.',
    'That was a good little pause.',
    'Nice work showing up for the sky.',
    'You gave yourself a gentle moment.',
    'It was kind of you to step away for a while.',
  ];
  const endings = [
    ' Streak: {streak}.',
    ' You’re on a {streak}-day streak.',
    ' Today makes {streak} days in a row.',
    ' Your quiet streak is {streak} days.',
    ' That makes {streak} days of showing up.',
    ' Streak count: {streak}.',
    ' You have kept this going for {streak} days.',
    ' {streak} days of small, good pauses.',
  ];
  return starts.flatMap((start) => endings.map((ending) => start + ending));
}

function schema() {
  return {
    type: 'object',
    properties: Object.fromEntries(CATEGORIES.map((category) => [category, {
      type: 'array', items: { type: 'string' }, minItems: 8, maxItems: 20,
    }])),
    required: CATEGORIES,
    additionalProperties: false,
  };
}

function cleanLine(value, category) {
  if (typeof value !== 'string') return null;
  const line = value.replace(/^[-*\d.)\s]+/, '').replace(/\s+/g, ' ').trim();
  if (!line || line.length > MAX_LENGTH) return null;
  if (category === 'sunrise_reminder' || category === 'sunset_reminder') {
    if (!line.includes('{minutes}')) return null;
  }
  if (category === 'done_messages' && !line.includes('{streak}')) return null;
  if (category === 'treat_ideas' && /\{(minutes|streak)\}/.test(line)) return null;
  return line;
}

function exactlyForty(values, category) {
  const unique = [];
  const seen = new Set();
  for (const value of [...(values || []), ...fallback[category], ...generatedFallback(category)]) {
    const line = cleanLine(value, category);
    if (line && !seen.has(line)) {
      seen.add(line);
      unique.push(line);
    }
  }
  if (unique.length < MAX_LINES) throw new Error(`Ollama returned fewer than 40 usable ${category} lines.`);
  return unique.slice(0, MAX_LINES);
}

async function generate() {
  const prompt = `Generate calm, friendly, no-pressure copy for a sunrise/sunset reminder app. Return only JSON matching the supplied schema. Provide 10 distinct candidates for each category. Reminder lines must include the exact placeholder {minutes}; done_messages must include the exact placeholder {streak}. Keep every line under 90 characters. treat_ideas should suggest chai, coffee, or a small snack to take outside. Do not use emojis, guilt, urgency, or exclamation marks.`;
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt, format: schema(), stream: false, options: { temperature: 0.8 } }),
  });
  if (!response.ok) throw new Error(`Ollama request failed with HTTP ${response.status}.`);
  const payload = await response.json();
  let parsed;
  try {
    parsed = JSON.parse(payload.response);
  } catch {
    throw new Error('Ollama returned invalid JSON.');
  }
  return Object.fromEntries(CATEGORIES.map((category) => [category, exactlyForty(parsed[category], category)]));
}

async function main() {
  const nudges = await generate();
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(nudges, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${OUTPUT_PATH}`);
  for (const category of CATEGORIES) console.log(`${category}: ${nudges[category].length} lines`);
}

main().catch((error) => {
  console.error(`[make_nudges] ${error.message}`);
  process.exitCode = 1;
});
