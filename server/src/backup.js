const fs = require('fs');
const zlib = require('zlib');
const { db, DB_PATH } = require('./database');

// Config via variables d'environnement (Railway) :
//   GITHUB_BACKUP_TOKEN : Personal Access Token (droits Contents:write sur le dépôt)
//   GITHUB_BACKUP_REPO  : "LF38180/immo-relances" (défaut)
//   GITHUB_BACKUP_BRANCH: "backups" (défaut)
const TOKEN = process.env.GITHUB_BACKUP_TOKEN;
const REPO = process.env.GITHUB_BACKUP_REPO || 'LF38180/immo-relances';
const BRANCH = process.env.GITHUB_BACKUP_BRANCH || 'backups';

const API = 'https://api.github.com';

function headers() {
  return {
    'Authorization': `Bearer ${TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'immo-relances-backup',
  };
}

// Récupère le SHA d'un fichier existant (nécessaire pour l'écraser), null si absent.
async function getSha(chemin) {
  const r = await fetch(`${API}/repos/${REPO}/contents/${chemin}?ref=${BRANCH}`, { headers: headers() });
  if (r.status === 200) { const j = await r.json(); return j.sha; }
  return null;
}

// S'assure que la branche backups existe (sinon la crée depuis le dernier commit de main).
async function ensureBranch() {
  const r = await fetch(`${API}/repos/${REPO}/branches/${BRANCH}`, { headers: headers() });
  if (r.status === 200) return true;
  // Récupère le SHA de main et crée la branche
  const main = await fetch(`${API}/repos/${REPO}/git/ref/heads/main`, { headers: headers() });
  if (main.status !== 200) throw new Error('impossible de lire main pour créer la branche backups');
  const sha = (await main.json()).object.sha;
  const create = await fetch(`${API}/repos/${REPO}/git/refs`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha }),
  });
  if (create.status !== 201) throw new Error('création branche backups échouée: ' + create.status);
  return true;
}

// Produit le contenu gzip de la DB (base64) après checkpoint WAL pour cohérence.
function dumpDbBase64() {
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* non bloquant */ }
  const buf = fs.readFileSync(DB_PATH);
  return zlib.gzipSync(buf, { level: 9 }).toString('base64');
}

// Effectue une sauvegarde. dateStr fournie par l'appelant (Date interdit dans certains contextes).
async function sauvegarder(dateStr) {
  if (!TOKEN) return { ok: false, raison: 'GITHUB_BACKUP_TOKEN absent' };
  await ensureBranch();
  const contentB64 = dumpDbBase64();
  const chemin = `backups/immo-${dateStr}.db.gz`;
  const sha = await getSha(chemin); // écrase si déjà fait aujourd'hui
  const r = await fetch(`${API}/repos/${REPO}/contents/${chemin}`, {
    method: 'PUT', headers: headers(),
    body: JSON.stringify({
      message: `backup DB ${dateStr}`,
      content: contentB64,
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if (r.status !== 200 && r.status !== 201) {
    const t = await r.text();
    throw new Error(`push backup échoué (${r.status}): ${t.slice(0, 200)}`);
  }
  const tailleKo = Math.round(Buffer.from(contentB64, 'base64').length / 1024);
  return { ok: true, fichier: chemin, tailleKo };
}

// Planificateur : 1 sauvegarde/jour. Vérifie toutes les heures si on a déjà sauvegardé aujourd'hui.
function demarrerPlanificateur() {
  if (!TOKEN) { console.log('[backup] désactivé (GITHUB_BACKUP_TOKEN absent)'); return; }
  let dernierJour = null;
  const tick = async () => {
    const jour = new Date().toISOString().slice(0, 10); // AAAA-MM-JJ
    if (jour === dernierJour) return;
    try {
      const res = await sauvegarder(jour);
      if (res.ok) { dernierJour = jour; console.log(`[backup] OK ${res.fichier} (${res.tailleKo} Ko)`); }
      else console.log(`[backup] ignoré : ${res.raison}`);
    } catch (e) { console.error('[backup] échec : ' + e.message); }
  };
  tick(); // au démarrage
  setInterval(tick, 60 * 60 * 1000); // toutes les heures
  console.log('[backup] planificateur actif (quotidien)');
}

module.exports = { sauvegarder, demarrerPlanificateur };
