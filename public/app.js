'use strict';

const CITY_DATA = {
  Pune: { lat: 18.5204, lon: 73.8567, tz: 'Asia/Kolkata' }, Mumbai: { lat: 19.076, lon: 72.8777, tz: 'Asia/Kolkata' }, Delhi: { lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata' }, Bengaluru: { lat: 12.9716, lon: 77.5946, tz: 'Asia/Kolkata' }, London: { lat: 51.5072, lon: -0.1276, tz: 'Europe/London' }, 'New York': { lat: 40.7128, lon: -74.006, tz: 'America/New_York' }, 'San Francisco': { lat: 37.7749, lon: -122.4194, tz: 'America/Los_Angeles' },
};
const DB_NAME = 'golden-hour-local';
let dbPromise;
let setup = JSON.parse(localStorage.getItem('golden-hour-setup') || 'null');
let currentEvent = null;
let selectedTreat = 'nothing';

const $ = (id) => document.getElementById(id);
const screens = ['home', 'setup', 'outside', 'done', 'gallery'];

function showScreen(name) { screens.forEach((screen) => $(`${screen}-screen`).classList.toggle('hidden', screen !== name)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function setStatus(text = '') { $('status').textContent = text; }
function formatTime(date, tz) { return new Intl.DateTimeFormat('en-IN', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(date); }
function localDate(date, tz) { const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).reduce((o, p) => { if (p.type !== 'literal') o[p.type] = p.value; return o; }, {}); return `${parts.year}-${parts.month}-${parts.day}`; }
function sunEvent(date, lat, lon, kind) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
  const n = (2451545.0 + (day - new Date(Date.UTC(2000, 0, 1, 12))) / 86400000 - 2451545.0) / 36525;
  const l = ((280.46646 + n * (36000.76983 + n * 0.0003032)) % 360) * Math.PI / 180;
  const g = (357.52911 + n * (35999.05029 - 0.0001537 * n)) * Math.PI / 180;
  const lambda = l + (1.914602 - n * (0.004817 + 0.000014 * n)) * Math.sin(g) + (0.019993 - 0.000101 * n) * Math.sin(2 * g) + 0.000289 * Math.sin(3 * g);
  const decl = Math.asin(Math.sin(23.4397 * Math.PI / 180) * Math.sin(lambda));
  const noon = 720 - 4 * lon - (l * 180 / Math.PI - Math.atan2(0.016708634 * Math.sin(g), Math.cos(g) - 0.016708634)) * 4;
  const hour = Math.acos((Math.cos(90.833 * Math.PI / 180) / (Math.cos(lat * Math.PI / 180) * Math.cos(decl)) - Math.tan(lat * Math.PI / 180) * Math.tan(decl))) * 180 / Math.PI / 15;
  return new Date(day.getTime() + (noon + (kind === 'sunrise' ? -hour * 60 : hour * 60)) * 60000);
}
function nextEvent() {
  if (!setup) return null;
  const now = new Date();
  for (let offset = 0; offset < 3; offset += 1) {
    const day = new Date(now.getTime() + offset * 86400000);
    const events = ['sunrise', 'sunset'].filter((kind) => setup[`want${kind[0].toUpperCase()}${kind.slice(1)}`]).map((kind) => ({ kind, time: sunEvent(day, setup.lat, setup.lon, kind) })).filter((event) => event.time > now).sort((a, b) => a.time - b.time);
    if (events[0]) return events[0];
  }
  return null;
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => request.result.createObjectStore('photos', { keyPath: 'id', autoIncrement: true }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  return dbPromise;
}
async function savePhoto(blob, kind, localDay) { const db = await openDb(); return new Promise((resolve, reject) => { const request = db.transaction('photos', 'readwrite').objectStore('photos').add({ blob, kind, localDay, createdAt: new Date().toISOString() }); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); }
async function getPhotos() { const db = await openDb(); return new Promise((resolve, reject) => { const request = db.transaction('photos').objectStore('photos').getAll(); request.onsuccess = () => resolve(request.result.reverse()); request.onerror = () => reject(request.error); }); }
async function renderGallery() { const photos = await getPhotos(); $('gallery-grid').replaceChildren(); $('empty-gallery').classList.toggle('hidden', photos.length > 0); photos.forEach((photo) => { const figure = document.createElement('figure'); const image = document.createElement('img'); image.src = URL.createObjectURL(photo.blob); image.alt = `${photo.kind} moment from ${photo.localDay}`; const caption = document.createElement('figcaption'); caption.textContent = `${photo.kind} · ${photo.localDay}`; figure.append(image, caption); $('gallery-grid').append(figure); }); }

function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone; }
function updateIOSNote() { $('ios-note').classList.toggle('hidden', !(isIOS() && !isStandalone())); }
function base64ToBytes(base64) { const padding = '='.repeat((4 - base64.length % 4) % 4); const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map((char) => char.charCodeAt(0))); }

async function allowNotifications() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return setStatus('Notifications are not available in this browser.');
  if (isIOS() && !isStandalone()) return setStatus('On iPhone, add Golden Hour to your Home Screen before allowing notifications.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return setStatus('Notifications are off. You can still use Golden Hour whenever you like.');
  const config = await fetch('/api/config').then((response) => response.json());
  if (!config.vapidPublicKey) return setStatus('Notifications need the server VAPID public key configured.');
  const registration = await navigator.serviceWorker.register('/sw.js');
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(config.vapidPublicKey) });
  if (setup) await sendSubscription(subscription);
  setStatus('Notifications are ready.');
}
async function sendSubscription(subscription) { setup.endpoint = subscription.endpoint; localStorage.setItem('golden-hour-setup', JSON.stringify(setup)); await fetch('/api/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: subscription.toJSON(), ...setup }) }); }
function getBrowserLocation() { return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition((position) => resolve({ lat: position.coords.latitude, lon: position.coords.longitude, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }), (error) => reject(error), { enableHighAccuracy: false, timeout: 10000 })); }

function refreshHome() {
  const event = nextEvent(); currentEvent = event;
  if (!event) { $('countdown').textContent = '--:--:--'; $('next-time').textContent = 'Set up your place to begin.'; return; }
  $('next-kind').textContent = `Next ${event.kind}`; $('next-time').textContent = formatTime(event.time, setup.tz);
  const tick = () => { const diff = Math.max(0, event.time - new Date()); const h = String(Math.floor(diff / 3600000)).padStart(2, '0'); const m = String(Math.floor(diff / 60000) % 60).padStart(2, '0'); const s = String(Math.floor(diff / 1000) % 60).padStart(2, '0'); $('countdown').textContent = `${h}:${m}:${s}`; }; tick(); window.clearInterval(refreshHome.timer); refreshHome.timer = window.setInterval(tick, 1000);
}
function showOutside() { currentEvent = nextEvent() || currentEvent || { kind: 'sunrise', time: new Date() }; $('outside-kind').textContent = `${currentEvent.kind.toUpperCase()} TIME`; $('outside-time').textContent = setup ? formatTime(currentEvent.time, setup.tz) : 'A little time under the sky'; showScreen('outside'); }
async function saveSetup() {
  if (!setup) return setStatus('Choose your place first.');
  setup.wantSunrise = $('sunrise-toggle').checked; setup.wantSunset = $('sunset-toggle').checked; setup.leadMinutes = Number($('lead-select').value); setup.tz = setup.tz || Intl.DateTimeFormat().resolvedOptions().timeZone; localStorage.setItem('golden-hour-setup', JSON.stringify(setup));
  try { const registration = await navigator.serviceWorker.getRegistration(); if (registration) { const subscription = await registration.pushManager.getSubscription(); if (subscription) await sendSubscription(subscription); } } catch { /* reminders can still be used locally */ }
  setStatus('Saved.'); refreshHome(); showScreen('home');
}
async function completeCheckin() {
  const photo = $('photo-input').files[0]; if (photo) await savePhoto(photo, currentEvent.kind, localDate(new Date(), setup?.tz || Intl.DateTimeFormat().resolvedOptions().timeZone));
  const payload = { endpoint: setup?.endpoint, kind: currentEvent.kind, localDate: localDate(new Date(), setup?.tz || Intl.DateTimeFormat().resolvedOptions().timeZone), treat: selectedTreat };
  let result = { streak: Number(localStorage.getItem('golden-hour-streak') || 0) + 1, message: 'You made a little space.', treatIdea: '' };
  try { const response = await fetch('/api/checkin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); if (response.ok) result = await response.json(); } catch { setStatus('Saved here. We’ll sync your check-in when you’re back online.'); }
  localStorage.setItem('golden-hour-streak', String(result.streak)); $('done-message').textContent = result.message; $('done-streak').textContent = `${result.streak}-day streak${result.treatIdea ? ` · ${result.treatIdea}` : ''}`; showScreen('done');
}

async function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  updateIOSNote(); refreshHome();
  $('notify-button').addEventListener('click', () => allowNotifications().catch(() => setStatus('Notifications could not be enabled yet.')));
  $('location-button').addEventListener('click', async () => { try { const location = await getBrowserLocation(); setup = { ...(setup || {}), ...location }; $('location-label').textContent = `Location ready · ${location.tz}`; setStatus('Location found.'); } catch { setStatus('Location was unavailable. Choose a city below instead.'); } });
  $('city-select').addEventListener('change', (event) => { if (!event.target.value) return; setup = { ...(setup || {}), ...CITY_DATA[event.target.value] }; $('location-label').textContent = `${event.target.value} · ${setup.tz}`; });
  $('save-setup').addEventListener('click', saveSetup); $('setup-back').addEventListener('click', () => { refreshHome(); showScreen('home'); }); $('settings-button').addEventListener('click', () => showScreen('setup')); $('setup-link').addEventListener('click', () => showScreen('setup')); $('outside-button').addEventListener('click', showOutside); $('outside-back').addEventListener('click', () => showScreen('home')); $('done-home').addEventListener('click', () => { refreshHome(); showScreen('home'); }); $('gallery-link').addEventListener('click', async () => { await renderGallery(); showScreen('gallery'); }); $('gallery-back').addEventListener('click', () => showScreen('home')); $('photo-input').addEventListener('change', () => { $('photo-label').textContent = $('photo-input').files[0] ? 'Photo ready to keep here' : 'Save a little piece of the sky'; }); $('done-button').addEventListener('click', () => completeCheckin().catch(() => setStatus('That check-in could not be saved yet.')));
  document.querySelectorAll('#treat-picker button').forEach((button) => button.addEventListener('click', () => { selectedTreat = button.dataset.treat; document.querySelectorAll('#treat-picker button').forEach((item) => item.classList.toggle('selected', item === button)); }));
  if (setup) { $('location-label').textContent = `Ready · ${setup.tz}`; $('sunrise-toggle').checked = setup.wantSunrise !== false; $('sunset-toggle').checked = setup.wantSunset !== false; $('lead-select').value = String(setup.leadMinutes || 20); }
  if (new URLSearchParams(location.search).get('go') === 'outside') showOutside(); else if (!setup) showScreen('setup');
}
document.addEventListener('DOMContentLoaded', init);
