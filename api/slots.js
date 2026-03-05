// api/slots.js
const { google } = require('googleapis');
const { getAuthenticatedClient } = require('../lib/google');

const SLOT_DURATION = 15;
const DAY_START = 8;
const DAY_END   = 12;

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://jaac.io');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Paramètre date manquant ou invalide (format: YYYY-MM-DD)' });
  }

  try {
    const auth = getAuthenticatedClient();
    const calendar = google.calendar({ version: 'v3', auth });

    const dayStart = new Date(`${date}T${String(DAY_START).padStart(2,'0')}:00:00`);
    const dayEnd   = new Date(`${date}T${String(DAY_END).padStart(2,'0')}:00:00`);

    const eventsRes = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = eventsRes.data.items || [];

    const allSlots = [];
    let cursor = new Date(dayStart);
    while (cursor < dayEnd) {
      allSlots.push(new Date(cursor));
      cursor = new Date(cursor.getTime() + SLOT_DURATION * 60000);
    }

    const freeSlots = allSlots.filter(slot => {
      const slotEnd = new Date(slot.getTime() + SLOT_DURATION * 60000);
      return !events.some(ev => {
        const evStart = new Date(ev.start.dateTime || ev.start.date);
        const evEnd   = new Date(ev.end.dateTime   || ev.end.date);
        return slot < evEnd && slotEnd > evStart;
      });
    });

    const result = freeSlots.map(s =>
      `${String(s.getHours()).padStart(2,'0')}:${String(s.getMinutes()).padStart(2,'0')}`
    );

    return res.status(200).json({ date, slots: result });

  } catch (err) {
    console.error('Erreur slots:', err);
    return res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
};
