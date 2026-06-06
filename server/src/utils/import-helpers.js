// Normalise une date de tableur vers ISO AAAA-MM-JJ. null si illisible.
function normaliserDate(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!s) return null;

  // Série Excel (nombre de jours depuis 1899-12-30)
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = parseFloat(s);
    if (n > 0 && n < 100000) {
      const ms = Math.round((n - 25569) * 86400 * 1000); // 25569 = jours entre 1899-12-30 et 1970-01-01
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }

  // ISO AAAA-MM-JJ (éventuellement avec heure)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // jj/mm/aaaa ou jj-mm-aaaa
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const jj = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    if (+mm >= 1 && +mm <= 12 && +jj >= 1 && +jj <= 31) return `${m[3]}-${mm}-${jj}`;
  }

  return null;
}

function norm(s) {
  // ̀-ͯ = combining diacritical marks (accents)
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Résout un nom de conseiller vers users.id. null si pas de match.
function resoudreConseiller(valeur, users) {
  const v = norm(valeur);
  if (!v) return null;
  for (const u of users) {
    const prenomNom = norm(`${u.prenom} ${u.nom}`);
    const nomPrenom = norm(`${u.nom} ${u.prenom}`);
    const email = norm(u.email);
    if (v === prenomNom || v === nomPrenom || v === email) return u.id;
  }
  return null;
}

module.exports = { normaliserDate, resoudreConseiller };
