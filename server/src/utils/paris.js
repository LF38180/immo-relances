// Dates en heure de Paris.
//
// Les horodatages sont stockés en UTC (datetime('now')). Une « journée » ou une
// « période » vue par l'utilisateur est en heure de Paris : ses bornes doivent
// être converties en UTC avant d'interroger la base, sinon un appel passé le
// soir tombe sur le mauvais jour.

// Décalage Paris -> UTC en minutes pour une date donnée (60 en hiver, 120 en été).
function parisOffsetMinutes(dateYmd) {
  const midi = new Date(`${dateYmd}T12:00:00Z`);
  const heure = parseInt(midi.toLocaleString('en-US', { timeZone: 'Europe/Paris', hour12: false, hour: '2-digit' }), 10);
  return (heure - 12) * 60;
}

// Minuit, heure de Paris, du jour donné -> « AAAA-MM-JJ HH:MM:SS » en UTC.
function debutJourUtc(dateYmd) {
  const [Y, M, D] = dateYmd.split('-').map(Number);
  return new Date(Date.UTC(Y, M - 1, D, 0, 0, 0) - parisOffsetMinutes(dateYmd) * 60000).toISOString().slice(0, 19).replace('T', ' ');
}

const aujourdhuiParis = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });

// Ajoute n jours à une date AAAA-MM-JJ (calcul en UTC à midi : aucun piège d'heure d'été).
function plusJours(dateYmd, n) {
  const [Y, M, D] = dateYmd.split('-').map(Number);
  return new Date(Date.UTC(Y, M - 1, D + n, 12)).toISOString().slice(0, 10);
}

// Une vraie date AAAA-MM-JJ (le 45 du 13e mois est refusé).
function dateValide(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

const nbJours = (du, au) => Math.round((Date.parse(au + 'T12:00:00Z') - Date.parse(du + 'T12:00:00Z')) / 86400000) + 1;

module.exports = { parisOffsetMinutes, debutJourUtc, aujourdhuiParis, plusJours, dateValide, nbJours };
