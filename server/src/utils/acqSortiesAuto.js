// Mission Acquéreurs : sorties d'office.
//
// Décisions de Loïck (25/11/2026) : sortent de la file acquéreurs, sans
// validation,
//   1. les personnes de la Mission Estimés (Chrystelle) ;
//   2. les personnes de l'opération anciens clients, quel que soit leur
//      conseiller, appelées ou non.
// Y compris celles déjà « appelées » ici : leurs appels partent quand même
// dans Modelo (reporter_appels = 1), sans réattribution.
//
// Garde-fous :
//  - lien par le numéro de contact Modelo, ou par le téléphone AVEC le même
//    nom. Un téléphone commun sous un autre nom n'est pas sorti d'office : il
//    est proposé à l'administration (« à vérifier ») ;
//  - une sortie levée à la main (« Remettre dans la file ») n'est jamais
//    reposée ;
//  - rien n'est effacé : c'est acq_hors_mission, comme la sortie par fichier.
const { db } = require('../database');
const { cleTel } = require('../blocs');
const E = require('./acqEstimes');
const { sortirPersonnes } = require('./acqSortie');

const MOTIFS = { ESTIMES: 'Dans la Mission Estimés (Chrystelle)', OPERATION: 'Dans l’opération anciens clients' };
const plier = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Réglage : une personne de la Mission Estimés que Chrystelle n'a jamais
// jointe sort-elle aussi ? (false : elle reste dans la file, avec le bandeau.)
const ESTIMES_JAMAIS_JOINTES = true;

// Active depuis le 25/11/2026 (33 personnes au lancement, nombre vu par Loïck
// avant). ACQ_SORTIES_AUTO=0 la coupe sans redéployer le code.
const ACTIVES = process.env.ACQ_SORTIES_AUTO ? process.env.ACQ_SORTIES_AUTO === '1' : true;

function operation() {
  const parId = new Map(), parTel = new Map();
  for (const o of db.prepare('SELECT id_modelo, nom, prenom, conseiller, tel_portable, tel_fixe FROM op_contacts').all()) {
    parId.set(String(o.id_modelo), o);
    for (const t of [cleTel(o.tel_portable), cleTel(o.tel_fixe)].filter(Boolean)) { if (!parTel.has(t)) parTel.set(t, []); parTel.get(t).push(o); }
  }
  return { parId, parTel };
}

// Toutes les personnes encore dans la file qui sont aussi ailleurs.
function candidats() {
  const levees = new Set(db.prepare('SELECT id_contact FROM acq_hors_mission WHERE leve_le IS NOT NULL').all().map(x => x.id_contact));
  const op = operation();
  const estimes = new Map(E.croisement().map(l => [l.id_contact, l]));
  const contacts = db.prepare(`SELECT c.id_contact, c.civilite, c.nom, c.prenom, c.tel_portable, c.tel_fixe, c.madame_fichier,
      (SELECT COUNT(*) FROM acq_appels a WHERE a.id_contact = c.id_contact) AS appels_acq,
      (SELECT GROUP_CONCAT(f.id_fiche) FROM acq_fiches f WHERE f.id_contact = c.id_contact) AS fiches
    FROM acq_contacts c WHERE c.exclu IS NULL AND COALESCE(c.exclu_leve, 0) = 0 ORDER BY c.nom, c.prenom`).all();
  const res = [];
  for (const c of contacts) {
    if (levees.has(c.id_contact)) continue;
    const base = { id_contact: c.id_contact, civilite: c.civilite, nom: c.nom, prenom: c.prenom, madame_fichier: c.madame_fichier,
      fiches: c.fiches ? String(c.fiches).split(',') : [], appels_acq: c.appels_acq };
    // 1. Opération anciens clients.
    const memeId = op.parId.get(String(c.id_contact));
    const parTel = [cleTel(c.tel_portable), cleTel(c.tel_fixe)].filter(Boolean).flatMap(t => op.parTel.get(t) || []);
    const memeNom = parTel.find(o => plier(o.nom) === plier(c.nom));
    const o = memeId || memeNom || parTel[0];
    if (o) {
      res.push({ ...base, origine: 'OPERATION', motif: MOTIFS.OPERATION, sur: !!(memeId || memeNom),
        detail: `fiche ${o.id_modelo}${o.conseiller ? `, ${o.conseiller}` : ', non attribuée'}`,
        doute: memeId || memeNom ? null : `même téléphone, mais la fiche de l’opération est au nom de ${o.nom || ''} ${o.prenom || ''}`.trim() });
      continue;
    }
    // 2. Mission Estimés.
    const l = estimes.get(c.id_contact);
    if (!l) continue;
    const e = l.estimes;
    if (e && (e.jointe || ESTIMES_JAMAIS_JOINTES)) {
      const a = e.dernier_appel;
      res.push({ ...base, origine: 'ESTIMES', motif: MOTIFS.ESTIMES, sur: !e.nom_different,
        detail: a ? `jointe le ${String(a.le).slice(0, 10).split('-').reverse().join('/')} : ${a.libelle}` : e.appels ? `${e.appels} appel${e.appels > 1 ? 's' : ''} sans réponse` : 'pas encore appelée par Chrystelle',
        doute: e.nom_different ? `même téléphone, mais la fiche de Chrystelle est au nom de ${e.nom_estimes}` : null });
    } else if (!e && l.note_modelo) {
      // Hors Mission Estimés, mais le dernier suivi Modelo est de Chrystelle.
      res.push({ ...base, origine: 'ESTIMES', motif: 'Dernier suivi Modelo fait par Chrystelle', sur: false,
        detail: `note du ${String(l.note_modelo.le || '').slice(0, 10).split('-').reverse().join('/')}`, doute: 'n’est pas dans la Mission Estimés : à vous de voir' });
    }
  }
  return res;
}

function enPersonnes(liste) {
  return liste.map(p => ({ id_contact: p.id_contact, nom: p.nom, prenom: p.prenom, motif: p.motif, fiches: p.fiches, origine: p.origine, reporter_appels: 1 }));
}

// Sortie d'office de tout ce qui est sûr. Sans effet s'il n'y a rien à sortir.
function appliquer({ par = 'Sortie d’office' } = {}) {
  if (!ACTIVES) return { sortis: 0, par_origine: {}, inactif: true };
  const surs = candidats().filter(p => p.sur);
  if (!surs.length) return { sortis: 0, par_origine: {} };
  const r = sortirPersonnes(enPersonnes(surs), { simulation: false, par, fichier: 'Sortie d’office' });
  const par_origine = {};
  for (const p of surs) par_origine[p.origine] = (par_origine[p.origine] || 0) + 1;
  return { sortis: r.ok ? r.sortis.length : 0, par_origine, dont_deja_appelees: surs.filter(p => p.appels_acq > 0).length };
}

// Sortie des « à vérifier » que l'administration a cochées.
function sortirChoisies(ids, { par = null } = {}) {
  const voulues = new Set((ids || []).map(String));
  const liste = candidats().filter(p => !p.sur && voulues.has(String(p.id_contact)));
  if (!liste.length) return { ok: false, error: 'Aucune de ces personnes n’est à sortir.' };
  return sortirPersonnes(enPersonnes(liste), { simulation: false, par, fichier: 'Sortie validée (à vérifier)' });
}

function etat() {
  const c = candidats();
  const sorties = db.prepare(`SELECT COALESCE(origine, 'FICHIER') AS origine, COUNT(*) AS n, SUM(reporter_appels) AS avec_report
    FROM acq_hors_mission WHERE leve_le IS NULL GROUP BY 1`).all();
  return { actives: ACTIVES, en_attente: c.filter(p => p.sur).length,
    en_attente_deja_appelees: c.filter(p => p.sur && p.appels_acq > 0).length,
    en_attente_estimes_jamais_jointes: c.filter(p => p.sur && p.origine === 'ESTIMES' && /sans réponse|pas encore/.test(p.detail)).length, a_verifier: c.filter(p => !p.sur).length,
    en_attente_par_origine: c.filter(p => p.sur).reduce((m, p) => ({ ...m, [p.origine]: (m[p.origine] || 0) + 1 }), {}),
    sorties: Object.fromEntries(sorties.map(x => [x.origine, x.n])),
    levees: db.prepare('SELECT COUNT(*) n FROM acq_hors_mission WHERE leve_le IS NOT NULL').get().n };
}

module.exports = { candidats, appliquer, sortirChoisies, etat, MOTIFS, ESTIMES_JAMAIS_JOINTES };
