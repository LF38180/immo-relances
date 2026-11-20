// Localisation d'une recherche acquéreur : communes par leur nom, ou zones
// tracées sur la carte de Modelo.
//
// Règles fixées avec Exploration Modelo le 20/11/2026 (essais sur ZZTEST) :
//  - une recherche Modelo n'a qu'UN mode de localisation : communes, ou zones ;
//  - Grenoble peut être précisée en quartiers IRIS ; dès qu'il y a un quartier,
//    toute la recherche part en zones, autres communes comprises ;
//  - 3 zones au plus par recherche (au-delà, le pare-feu de Modelo rejette
//    l'enregistrement) : les zones qui se touchent sont donc fusionnées ;
//  - contours élargis d'au moins 40 m, premier point non répété, [lat, lng].
// Les contours (server/src/data/zones-isere.json) sont déjà élargis : deux
// quartiers voisins se chevauchent, leur réunion donne un seul contour.
const pc = require('polygon-clipping');

const MAX_ZONES = 3;
const MAX_POINTS = 230;

let _d = null;
function donnees() {
  if (_d) return _d;
  const brut = require('../data/zones-isere.json');
  const parNom = new Map();
  for (const [code, c] of Object.entries(brut.communes)) parNom.set(cle(c.nom), { code, ...c });
  _d = { ...brut, parNom };
  return _d;
}

// « St-Égrève », « SAINT EGREVE », « Saint-Égrève (38120) » : la même commune.
function cle(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\(.*?\)/g, ' ').replace(/\b\d{5}\b/g, ' ').replace(/\btous\s+cp\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/\bste\b/g, 'sainte').replace(/\bst\b/g, 'saint');
}
const estGrenoble = (nom) => cle(nom) === 'grenoble';
const liste = (s) => (Array.isArray(s) ? s : String(s || '').split(',')).map(x => String(x).trim()).filter(Boolean);

function dansAnneau([x, y], a) {
  let d = false;
  for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
    const [xi, yi] = a[i], [xj, yj] = a[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) d = !d;
  }
  return d;
}
// Un point sûrement à l'intérieur d'un contour, même tordu : le milieu d'une
// corde horizontale à mi-hauteur.
function pointInterieur(a) {
  const ys = a.map(p => p[1]); const y = (Math.min(...ys) + Math.max(...ys)) / 2 + 1e-7;
  const xs = [];
  for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
    const [xi, yi] = a[i], [xj, yj] = a[j];
    if ((yi > y) !== (yj > y)) xs.push((xj - xi) * (y - yi) / (yj - yi) + xi);
  }
  xs.sort((p, q) => p - q);
  return [(xs[0] + xs[1]) / 2, y];
}

// Douglas-Peucker sur un contour fermé, tolérance en mètres.
function simplifier(a, tolM) {
  const kx = 111320 * Math.cos(45.18 * Math.PI / 180), ky = 110540;
  const P = a.map(([x, y]) => [x * kx, y * ky]);
  const garder = new Array(P.length).fill(false);
  // Deux points d'ancrage éloignés, pour traiter le contour comme deux lignes.
  let loin = 0, dmax = -1;
  for (let i = 1; i < P.length; i++) { const d = (P[i][0] - P[0][0]) ** 2 + (P[i][1] - P[0][1]) ** 2; if (d > dmax) { dmax = d; loin = i; } }
  garder[0] = garder[loin] = true;
  const dist = (p, u, v) => { const dx = v[0] - u[0], dy = v[1] - u[1], n = dx * dx + dy * dy;
    const t = n ? Math.max(0, Math.min(1, ((p[0] - u[0]) * dx + (p[1] - u[1]) * dy) / n)) : 0;
    return Math.hypot(p[0] - u[0] - t * dx, p[1] - u[1] - t * dy); };
  const dp = (i, j, idx) => { let m = -1, k = -1;
    for (let q = i + 1; q < j; q++) { const d = dist(P[idx(q)], P[idx(i)], P[idx(j)]); if (d > m) { m = d; k = q; } }
    if (m > tolM) { garder[idx(k)] = true; dp(i, k, idx); dp(k, j, idx); } };
  dp(0, loin, (q) => q);
  dp(loin, P.length, (q) => q % P.length);
  return a.filter((_, i) => garder[i]);
}

// Ce que le report envoie à Modelo pour une recherche.
//   secteurs  : les communes saisies (texte « a, b » ou tableau)
//   quartiers : les quartiers de Grenoble cochés ([{ code, nom }] ou codes)
// Rend { mode: 'COMMUNES' | 'ZONES', zones, texte, repli, inconnues, ... }.
function localisation({ secteurs, quartiers } = {}) {
  const d = donnees();
  const noms = liste(secteurs);
  const grenoble = noms.some(estGrenoble);
  const q = (grenoble ? (quartiers || []) : []).map(x => (typeof x === 'string' ? x : x.code))
    .filter(c => d.quartiers[c]).filter((c, i, t) => t.indexOf(c) === i);
  const nomsQ = q.map(c => d.quartiers[c].nom).sort((a, b) => a.localeCompare(b, 'fr'));
  const autres = noms.filter(n => !estGrenoble(n));
  // Le texte lisible, pour les Précisions et pour secteurs_apres en mode zones.
  const texte = noms.map(n => estGrenoble(n) && q.length ? `Grenoble (quartiers : ${nomsQ.join(', ')})` : n).join(', ');
  const communes = noms.join(', ');
  const base = { mode: 'COMMUNES', zones: [], texte, communes, quartiers: nomsQ, inconnues: [], repli: null, englobes: [] };
  if (!q.length) return base;

  const inconnues = autres.filter(n => !d.parNom.has(cle(n)));
  if (inconnues.length) return { ...base, inconnues, repli: 'SANS_CONTOUR' };

  const pieces = [
    ...q.map(c => ({ type: 'quartier', nom: d.quartiers[c].nom, code: c, zone: d.quartiers[c].zone })),
    ...autres.map(n => d.parNom.get(cle(n))).filter((c, i, t) => t.findIndex(x => x.code === c.code) === i)
      .map(c => ({ type: 'commune', nom: c.nom, code: c.code, zone: c.zone })),
  ];
  const reunion = pc.union(...pieces.map(p => p.zone.map(a => [a])));
  const zones = reunion.map((poly) => {
    let a = poly[0].slice(0, -1);
    // Un contour trop lourd est allégé, sans jamais rogner plus de 10 m sur
    // les 40 m de marge.
    for (const tol of [2, 4, 7, 10]) { if (a.length <= MAX_POINTS) break; a = simplifier(poly[0].slice(0, -1), tol); }
    const dedans = pieces.filter(p => p.zone.some(z => dansAnneau(pointInterieur(z), poly[0])));
    const qs = dedans.filter(p => p.type === 'quartier'), cs = dedans.filter(p => p.type === 'commune');
    const nom = [...qs, ...cs].map(p => p.nom).join(' + ');
    return {
      nom: nom.length > 60 ? nom.slice(0, 57).trimEnd() + '...' : nom,
      type: qs.length && cs.length ? 'mixte' : qs.length ? 'quartier' : 'commune',
      commune: cs.length ? (qs.length ? 'Grenoble + ' : '') + cs.map(p => p.nom).join(' + ') : 'Grenoble',
      ...(qs.length ? { code_iris: qs.map(p => p.code).join('+') } : {}),
      ...(cs.length ? { code_insee: cs.map(p => p.code).join('+') } : {}),
      points: a.map(([x, y]) => [Math.round(y * 1e6) / 1e6, Math.round(x * 1e6) / 1e6]),
    };
  });
  // Une zone Modelo n'a pas de trou : un quartier non coché, entouré de
  // quartiers cochés, se retrouve dedans. On le dit.
  const trous = reunion.flatMap(poly => poly.slice(1));
  const englobes = Object.entries(d.quartiers).filter(([c]) => !q.includes(c))
    .filter(([, v]) => trous.some(t => dansAnneau(pointInterieur(v.zone[0]), t)))
    .map(([, v]) => v.nom);
  if (zones.length > MAX_ZONES || zones.some(z => z.points.length > MAX_POINTS))
    return { ...base, repli: 'TROP_DE_ZONES', nb_zones: zones.length };
  return { ...base, mode: 'ZONES', zones, englobes };
}

// La mention portée dans a_proposer_a_loick quand la localisation est repliée.
function mentionRepli(l) {
  if (l.repli === 'TROP_DE_ZONES') return 'plus de 3 zones : localisation simplifiée';
  if (l.repli === 'SANS_CONTOUR') return `commune sans contour (${l.inconnues.join(', ')}) : localisation non modifiée`;
  return '';
}

module.exports = { localisation, mentionRepli, cle, MAX_ZONES, MAX_POINTS };
