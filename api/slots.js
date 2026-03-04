
// api/slots.js
// GET /api/slots?date=2025-03-15
// Retourne les créneaux libres de 15 min pour un jour donné

const { google } = require('googleapis');
const { getAuthenticatedClient } = require('../lib/google');

const SLOT_DURATION = 15; // minutes
const DAY_START = 8;      // 08:00
const DAY_END   = 12;     // 12:00 (non inclus)

module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Paramètre date manquant ou invalide (format: YYYY-MM-DD)' });
  }

  try {
    const auth = getAuthenticatedClient();
    const calendar = google.calendar({ version: 'v3', auth });

    // Fenêtre de la journée
    const dayStart = new Date(`${date}T${String(DAY_START).padStart(2,'0')}:00:00`);
    const dayEnd   = new Date(`${date}T${String(DAY_END).padStart(2,'0')}:00:00`);

    // Récupère tous les événements du jour
    const eventsRes = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = eventsRes.data.items || [];

    // Génère tous les créneaux de 15 min
    const allSlots = [];
    let cursor = new Date(dayStart);
    while (cursor < dayEnd) {
      allSlots.push(new Date(cursor));
      cursor = new Date(cursor.getTime() + SLOT_DURATION * 60000);
    }

    // Filtre les créneaux qui chevauchent un événement existant
    const freeSlots = allSlots.filter(slot => {
      const slotEnd = new Date(slot.getTime() + SLOT_DURATION * 60000);
      return !events.some(ev => {
        const evStart = new Date(ev.start.dateTime || ev.start.date);
        const evEnd   = new Date(ev.end.dateTime   || ev.end.date);
        return slot < evEnd && slotEnd > evStart;
      });
    });

    // Formate en HH:MM
    const result = freeSlots.map(s =>
      `${String(s.getHours()).padStart(2,'0')}:${String(s.getMinutes()).padStart(2,'0')}`
    );

    return res.status(200).json({ date, slots: result });

  } catch (err) {
    console.error('Erreur slots:', err);
    return res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
};
