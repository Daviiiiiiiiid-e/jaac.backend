// api/book.js
const { google } = require('googleapis');
const { getAuthenticatedClient } = require('../lib/google');

const SLOT_DURATION = 15;

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { date, slot, prenom, email, tel, type } = req.body || {};
  if (!date || !slot || !prenom || !email) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  try {
    const auth = getAuthenticatedClient();
    const calendar = google.calendar({ version: 'v3', auth });

    const [h, m] = slot.split(':').map(Number);
    const startDT = new Date(`${date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
    const endDT   = new Date(startDT.getTime() + SLOT_DURATION * 60000);

    // ── 1. Vérifier que le créneau est encore libre ────────
    const existing = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      timeMin: startDT.toISOString(),
      timeMax: endDT.toISOString(),
      singleEvents: true
    });

    const conflict = (existing.data.items || []).some(ev => {
      const evStart = new Date(ev.start.dateTime || ev.start.date);
      const evEnd   = new Date(ev.end.dateTime   || ev.end.date);
      return startDT < evEnd && endDT > evStart;
    });

    if (conflict) {
      return res.status(409).json({
        error: 'Ce créneau vient d\'être réservé. Veuillez en choisir un autre.'
      });
    }

    // ── 2. Créer l'événement Google Calendar ──────────────
    const event = {
      summary: `${type === 'visio' ? '💻 Visio' : '📞 Appel'} découverte — ${prenom}`,
      description: `Type : ${type === 'visio' ? 'Visioconférence' : 'Téléphone'}\nTéléphone : ${tel || 'non renseigné'}\nEmail : ${email}`,
      start: { dateTime: startDT.toISOString(), timeZone: 'Europe/Paris' },
      end:   { dateTime: endDT.toISOString(),   timeZone: 'Europe/Paris' },
      attendees: [{ email }],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 15 }
        ]
      }
    };

    const created = await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      resource: event,
      sendUpdates: 'all'
    });

    const joursLong = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
    const moisLong  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    const d = new Date(`${date}T12:00:00`);
    const dateLabel = `${joursLong[d.getDay()]} ${d.getDate()} ${moisLong[d.getMonth()]} à ${slot}`;

    // ── 3. Envoyer l'email — erreur non bloquante ─────────
    try {
      const gmail = google.gmail({ version: 'v1', auth });
      const emailContent = [
        `To: ${email}`,
        `From: jaac <hello@jaac.io>`,
        `Subject: =?UTF-8?Q?=E2=9C=85_Votre_cr=C3=A9neau_est_confirm=C3=A9_=E2=80=94_${dateLabel}?=`,
        `MIME-Version: 1.0`,
        `Content-Type: text/html; charset=utf-8`,
        ``,
        `<html><body style="font-family:-apple-system,sans-serif;background:#EEEEEE;padding:40px">`,
        `<div style="max-width:500px;margin:0 auto;background:#fff;border-radius:20px;padding:40px">`,
        `<h2 style="font-size:24px;font-weight:700;margin-bottom:8px">Bonjour ${prenom} 👋</h2>`,
        `<p style="color:#444;line-height:1.6;margin-bottom:24px">Votre créneau est bien confirmé :<br>`,
        `<strong style="font-size:18px;color:#191919">${dateLabel}</strong></p>`,
        `<p style="color:#444;line-height:1.6">Nous vous appellerons au <strong>${tel || 'numéro fourni'}</strong>.<br>`,
        `Si vous avez une question, répondez simplement à cet email.</p>`,
        `<div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee;font-size:13px;color:#999">`,
        `jaac — Design par abonnement · <a href="https://jaac.io" style="color:#999">jaac.io</a>`,
        `</div></div></body></html>`
      ].join('\n');

      const encoded = Buffer.from(emailContent).toString('base64url');
      await gmail.users.messages.send({ userId: 'me', resource: { raw: encoded } });
    } catch (mailErr) {
      console.error('Email non envoyé (non bloquant):', mailErr.message);
    }

    // ── 4. Retourner succès ───────────────────────────────
    return res.status(200).json({
      success: true,
      eventId: created.data.id,
      message: `Créneau réservé : ${dateLabel}`
    });

  } catch (err) {
    console.error('Erreur book:', err);
    return res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
};
