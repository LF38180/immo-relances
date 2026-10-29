// Sauvegarde de la base.
//
// Il n'y en avait aucune. Pendant l'opération anciens clients, la base porte
// 1 146 fiches et chaque appel de quinze conseillers : une corruption, une
// fausse manipulation ou un volume perdu effaçait tout sans recours.
//
// Deux filets, parce qu'ils ne couvrent pas la même panne :
//  - une copie toutes les six heures, à côté de la base, sur le même volume :
//    contre la corruption et l'erreur humaine. Six heures et pas un jour :
//    perdre une journée, c'est quinze agents fois vingt appels.
//  - une route admin qui livre une copie fraîche à télécharger : contre la
//    perte du volume lui-même. C'est celle-là qu'on range ailleurs, chaque soir.
//
// `db.backup()` copie un instantané cohérent, même en WAL et sous écriture :
// les agents ne sont jamais interrompus.
const path = require('path');
const fs = require('fs');
const { db, DB_PATH } = require('./database');

const DOSSIER = path.join(path.dirname(DB_PATH), 'sauvegardes');
const INTERVALLE_MS = 6 * 3600 * 1000;
const A_GARDER = 20;            // 20 × 6 h = cinq jours d'historique

// Horodatage lisible et triable dans un nom de fichier : 2026-11-03-1430.
const horodatage = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

// Écrit une copie cohérente de la base. Renvoie son chemin.
async function sauvegarder(dossier = DOSSIER) {
  fs.mkdirSync(dossier, { recursive: true });
  const cible = path.join(dossier, `immo-${horodatage()}.db`);
  await db.backup(cible);
  return cible;
}

// Ne garde que les plus récentes.
function nettoyer(dossier = DOSSIER, aGarder = A_GARDER) {
  if (!fs.existsSync(dossier)) return [];
  const fichiers = fs.readdirSync(dossier)
    .filter(f => /^immo-\d{4}-\d{2}-\d{2}-\d{4}\.db$/.test(f))
    .sort();                                    // le nom trie par date
  const aSupprimer = fichiers.slice(0, Math.max(0, fichiers.length - aGarder));
  for (const f of aSupprimer) fs.unlinkSync(path.join(dossier, f));
  return aSupprimer;
}

// Ce qui existe, pour l'écran d'administration.
function lister(dossier = DOSSIER) {
  if (!fs.existsSync(dossier)) return [];
  return fs.readdirSync(dossier)
    .filter(f => /^immo-.*\.db$/.test(f))
    .map(f => { const st = fs.statSync(path.join(dossier, f)); return { nom: f, octets: st.size, le: st.mtime.toISOString() }; })
    .sort((a, b) => b.nom.localeCompare(a.nom));
}

// Une sauvegarde peu après le démarrage, puis toutes les six heures.
// Un échec est journalisé, jamais fatal : la base de travail passe avant sa copie.
function planifier() {
  const tour = async () => {
    try {
      const f = await sauvegarder();
      const retirees = nettoyer();
      console.log(`[sauvegarde] ${path.basename(f)} écrite${retirees.length ? `, ${retirees.length} ancienne(s) retirée(s)` : ''}`);
    } catch (e) {
      console.error('[sauvegarde] ÉCHEC —', e);
    }
  };
  setTimeout(tour, 60 * 1000);
  setInterval(tour, INTERVALLE_MS).unref();
}

module.exports = { sauvegarder, nettoyer, lister, planifier, DOSSIER };
