// Moteur d'import du cahier des messages (courtage V2).
// Fonctions PURES : aucune dependance a la base, testables isolement.
// Le client parse le .xlsx et envoie les lignes brutes ; ces helpers normalisent
// les donnees sales observees sur le fichier reel (voir le spec du 2026-08-07).
const crypto = require('crypto');

// Colonnes par position (index 0 = colonne A).
const COL = {
  date: 0, heure: 1, canal: 2, source: 3, attribution_cr: 4,
  nom: 5, prenom: 6, telephone: 7, mail: 8, reference_bien: 9,
  commentaire: 10, interesse: 12, suivi_lead: 13, capacite_emprunt: 14,
  potentiel_location: 15, potentiel_neuf: 18,
};

// Trim, espaces multiples reduits, MAJUSCULES, accents retires.
function normaliserTexte(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Chiffres uniquement ; 33XXXXXXXXX / +33... -> 0X... ; null si non plausible.
function normaliserTelephone(v) {
  if (v === null || v === undefined) return null;
  let brut = typeof v === 'number' ? String(v) : String(v);
  let d = brut.replace(/\D/g, '');
  if (!d) return null;
  // Format international francais.
  if (d.length === 11 && d.startsWith('33')) d = '0' + d.slice(2);
  else if (d.length === 12 && d.startsWith('0033')) d = '0' + d.slice(4);
  // Numero francais sans le 0 initial (ex. cellule numerique 612345678).
  if (d.length === 9 && /^[1-9]/.test(d)) d = '0' + d;
  if (d.length < 9) return null;      // trop court : parasite ("TEL" -> '', deja sorti)
  if (d.length > 15) return null;     // hors plage E.164
  // Serie de date Excel (5 chiffres) : deja rejetee par la longueur minimale de 9.
  return d;
}

// Numero manifestement faux (saisi pour remplir la case) : Marine perdrait son temps.
// Prudent volontairement : on n'ecarte que l'evident, un vrai numero ne doit jamais sortir.
// Renvoie la cause (string) si faux, null si le numero est plausible.
function causeFauxNumero(tel) {
  if (!tel) return null;                                    // pas de numero : traite ailleurs
  const d = String(tel).replace(/\D/g, '');
  if (!d) return null;
  if (/^0+$/.test(d)) return 'que des zeros';
  if (new Set(d.split('')).size === 1) return 'chiffre repete';           // 1111111111
  const sansZero = d.startsWith('0') ? d.slice(1) : d;
  if (new Set(sansZero.split('')).size === 1) return 'chiffre repete';    // 0111111111
  if (/^0?(123456789|1234567890|0123456789|987654321)/.test(d)) return 'suite de chiffres';
  // Indicatif suivi d'une longue serie de zeros : 0600000001, 0700000000, 0100000042...
  if (/^0[1-9]0{5,}/.test(d)) return 'numero de remplissage';
  // Moins de 3 chiffres distincts sur 10 positions : 0606060606, 0612121212...
  if (d.length === 10 && new Set(d.split('')).size <= 2) return 'chiffres repetitifs';
  // Numero francais : 10 chiffres commencant par 0, indicatif 1-9 (le 0 n'existe pas).
  if (d.length === 10 && !/^0[1-9]/.test(d)) return 'indicatif invalide';
  if (d.length !== 10 && !(d.length > 10 && !d.startsWith('0'))) return 'longueur invalide (' + d.length + ')';
  return null;
}

function normaliserMail(v) {
  if (v === null || v === undefined) return null;
  const m = String(v).trim().toLowerCase();
  if (!m || !m.includes('@')) return null;
  return m;
}

// Serie Excel (base 1899-12-30), JJ/MM/AAAA, JJ/MM/AA, Date -> YYYY-MM-DD.
function normaliserDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return isoDepuisUTC(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  }
  if (typeof v === 'number' && isFinite(v)) return depuisSerieExcel(v);
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return depuisSerieExcel(parseFloat(s));
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
  if (m) {
    const jour = parseInt(m[1], 10);
    const mois = parseInt(m[2], 10);
    let annee = parseInt(m[3], 10);
    if (m[3].length === 2) annee += annee < 70 ? 2000 : 1900;
    return validerYMD(annee, mois, jour);
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return validerYMD(+m[1], +m[2], +m[3]);
  return null;
}

function validerYMD(annee, mois, jour) {
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  if (d.getUTCFullYear() !== annee || d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== jour) return null;
  return isoDepuisUTC(d.getTime());
}

function depuisSerieExcel(n) {
  if (!isFinite(n) || n <= 0 || n > 2958465) return null; // au-dela de 9999-12-31
  const jours = Math.floor(n);
  const base = Date.UTC(1899, 11, 30);
  return isoDepuisUTC(base + jours * 86400000);
}

function isoDepuisUTC(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// leboncoin -> LeBonCoin, seloger/selo -> SeLoger, pap -> PAP, bienici -> BienIci.
function normaliserSource(v) {
  const brut = String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim();
  if (!brut) return null;
  const cle = normaliserTexte(brut).replace(/[^A-Z0-9]/g, '');
  if (cle.includes('LEBONCOIN') || cle === 'LBC') return 'LeBonCoin';
  if (cle.startsWith('SELOGER') || cle === 'SELO' || cle.startsWith('SELO')) return 'SeLoger';
  if (cle === 'PAP') return 'PAP';
  if (cle.includes('BIENICI')) return 'BienIci';
  return brut;
}

// listeParam : "POITEVIN Lyes,BARRETO Nolan". Vrai si la cellule contient le nom
// de famille OU le prenom d'un agent exclu (couvre « LYES P », « barreto nolan »).
function estAgentExclu(cellule, listeParam) {
  const cible = normaliserTexte(cellule);
  if (!cible) return false;
  const motsCible = new Set(cible.split(/[^A-Z0-9]+/).filter(Boolean));
  if (!motsCible.size) return false;
  const agents = String(listeParam || '').split(',').map((a) => normaliserTexte(a)).filter(Boolean);
  for (const agent of agents) {
    const parties = agent.split(/[^A-Z0-9]+/).filter((p) => p.length > 1);
    if (parties.some((p) => motsCible.has(p))) return true;
  }
  return false;
}

const CATEGORIES = { oui_agent: 2, oui_gabby: 3, a_qualifier: 4 };
const EN_TETES_REPETES = new Set(['PROSPECT INTERESSE?', 'PROSPECT INTERESSE ?', 'PROSPECT INTERESSE']);

function estOui(v) {
  return normaliserTexte(v) === 'OUI';
}

// Applique les regles du spec dans l'ordre strict.
// opts : { exclusionAgents, heuristiqueGabby: 'PS_OUI'|'PS_REMPLI'|'off' }
function categoriser(ligne, opts = {}) {
  const valeurs = Array.isArray(ligne) ? ligne : (ligne && ligne.valeurs) || [];
  const heuristique = opts.heuristiqueGabby || 'PS_OUI';

  // 1. Agent exclu (location).
  if (estAgentExclu(valeurs[COL.attribution_cr], opts.exclusionAgents)) {
    return { action: 'exclu', categorie: null, priorite: null };
  }

  const m = normaliserTexte(valeurs[COL.interesse]);

  // 2. NON -> liste noire.
  if (m === 'NON') return { action: 'blackliste', categorie: null, priorite: null };

  // 3. OUI -> oui_agent / oui_gabby selon l'heuristique.
  if (m === 'OUI') {
    const p = valeurs[COL.potentiel_location];
    const s = valeurs[COL.potentiel_neuf];
    let gabby = false;
    if (heuristique === 'PS_OUI') gabby = estOui(p) || estOui(s);
    else if (heuristique === 'PS_REMPLI') gabby = !!normaliserTexte(p) || !!normaliserTexte(s);
    const categorie = gabby ? 'oui_gabby' : 'oui_agent';
    return { action: 'cree', categorie, priorite: CATEGORIES[categorie] };
  }

  // 4. NON QUALIFIE (avec ou sans accent, normalise).
  if (m === 'NON QUALIFIE') {
    return { action: 'cree', categorie: 'a_qualifier', priorite: CATEGORIES.a_qualifier };
  }

  // 5. Autre / vide / en-tete repete.
  return { action: 'ignore', categorie: null, priorite: null };
}

// SHA-1 stable : onglet + numero de ligne + valeurs cles.
function hashLigne(onglet, ligne, valeurs = []) {
  const cles = [
    normaliserTexte(onglet),
    String(ligne),
    String(valeurs[COL.date] === undefined || valeurs[COL.date] === null ? '' : valeurs[COL.date]),
    normaliserTexte(valeurs[COL.nom]),
    normaliserTexte(valeurs[COL.prenom]),
    normaliserTelephone(valeurs[COL.telephone]) || '',
    normaliserMail(valeurs[COL.mail]) || '',
    normaliserTexte(valeurs[COL.reference_bien]),
  ];
  return crypto.createHash('sha1').update(cles.join('|')).digest('hex');
}

// Latence en jours selon la categorie et les parametres.
function latencePour(categorie, params = {}) {
  const lire = (v, defaut) => {
    const n = parseInt(v, 10);
    return isNaN(n) ? defaut : n;
  };
  if (categorie === 'oui_agent') return lire(params.courtage_latence_oui_agent, 0);
  if (categorie === 'oui_gabby') return lire(params.courtage_latence_oui_gabby, 3);
  if (categorie === 'a_qualifier') return lire(params.courtage_latence_a_qualifier, 7);
  return 0;
}

// Ajoute n jours a une date ISO (YYYY-MM-DD). Renvoie null si date invalide.
function ajouterJours(iso, n) {
  if (!iso) return null;
  const t = Date.parse(iso + 'T00:00:00Z');
  if (isNaN(t)) return null;
  return isoDepuisUTC(t + n * 86400000);
}

module.exports = {
  COL, CATEGORIES, EN_TETES_REPETES,
  normaliserTexte, normaliserTelephone, causeFauxNumero, normaliserMail, normaliserDate,
  normaliserSource, estAgentExclu, categoriser, hashLigne, latencePour, ajouterJours,
};
