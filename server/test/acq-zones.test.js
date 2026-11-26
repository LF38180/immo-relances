// Mission Acquéreurs : localisation en communes ou en zones (quartiers de
// Grenoble), et ce que le report envoie à Exploration Modelo.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'acq-zones-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
const Z = require('../src/utils/acqZones');
const M = require('../src/utils/acqModelo');
const D = require('../src/data/zones-isere.json');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };
const vrai = (a, m) => { if (!a) throw new Error(m || 'attendu vrai'); };

const code = (nom) => Object.entries(D.quartiers).find(([, v]) => v.nom === nom)[0];
const VALLIER = code('Vallier'), BRUNO = code('Saint-Bruno'), JAURES = code('Jaures-Vallier'), ILE = code('Ile Verte-Saint Roch');
// Mètres entre un point [lat, lng] et un autre.
const metres = (a, b) => Math.hypot((a[0] - b[0]) * 110540, (a[1] - b[1]) * 111320 * Math.cos(45.18 * Math.PI / 180));
const dedans = ([lat, lng], pts) => { let d = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [yi, xi] = pts[i], [yj, xj] = pts[j];
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) d = !d; }
  return d; };

console.log('\nles données');
t('70 quartiers de Grenoble, 533 communes de l’Isère', () => { eq(Object.keys(D.quartiers).length, 70); eq(Object.keys(D.communes).length, 533); });
t('aucun contour ne répète son premier point', () => {
  for (const v of [...Object.values(D.quartiers), ...Object.values(D.communes)]) for (const a of v.zone)
    vrai(metres([a[0][1], a[0][0]], [a[a.length - 1][1], a[a.length - 1][0]]) > 0.5, v.nom); });
t('quartiers : 49 points au plus ; communes : 80', () => {
  vrai(Math.max(...Object.values(D.quartiers).map(v => v.zone[0].length)) <= 49);
  vrai(Math.max(...Object.values(D.communes).flatMap(v => v.zone.map(a => a.length))) <= 80); });

console.log('\ncas 1 : communes entières');
let l = Z.localisation({ secteurs: 'Grenoble, Meylan', quartiers: [] });
t('Tout Grenoble : communes par leur nom, aucune zone', () => { eq(l.mode, 'COMMUNES'); eq(l.zones.length, 0); eq(l.communes, 'Grenoble, Meylan'); eq(l.repli, null); });
l = Z.localisation({ secteurs: ['Meylan'], quartiers: [{ code: VALLIER, nom: 'Vallier' }] });
t('des quartiers sans « Grenoble » dans les secteurs sont ignorés', () => { eq(l.mode, 'COMMUNES'); eq(l.texte, 'Meylan'); });
l = Z.localisation({ secteurs: 'Une commune inconnue', quartiers: [] });
t('une commune inconnue ne gêne pas tant qu’il n’y a pas de zone', () => { eq(l.mode, 'COMMUNES'); eq(l.repli, null); });

console.log('\ncas 2 : quartiers de Grenoble');
l = Z.localisation({ secteurs: 'grenoble', quartiers: [VALLIER, BRUNO] });
t('deux quartiers séparés : deux zones', () => { eq(l.mode, 'ZONES'); eq(l.zones.length, 2); });
t('format : nom, type, commune, code_iris, points [lat, lng]', () => { const z = l.zones.find(x => x.nom === 'Vallier');
  eq(z.type, 'quartier'); eq(z.commune, 'Grenoble'); eq(z.code_iris, VALLIER);
  vrai(z.points.every(p => p.length === 2 && p[0] > 45 && p[0] < 46 && p[1] > 5 && p[1] < 6), 'ordre lat, lng'); });
t('premier point non répété', () => vrai(l.zones.every(z => metres(z.points[0], z.points[z.points.length - 1]) > 0.5)));
t('texte lisible', () => eq(l.texte, 'Grenoble (quartiers : Saint-Bruno, Vallier)'));
l = Z.localisation({ secteurs: 'Grenoble', quartiers: [VALLIER, JAURES, BRUNO] });
t('deux quartiers voisins fusionnent en une zone', () => { eq(l.zones.length, 2);
  vrai(l.zones.some(z => z.nom === 'Vallier + Jaures-Vallier' && z.code_iris === `${VALLIER}+${JAURES}`)); });
t('contour élargi : la zone contient largement le quartier d’origine', () => {
  const brut = require('../../client/public/acquereurs/grenoble-quartiers.json')[BRUNO].zone[0].map(([x, y]) => [y, x]);
  const z = l.zones.find(x => x.nom === 'Saint-Bruno').points;
  vrai(brut.every(p => dedans(p, z)), 'tous les points d’origine dedans');
  vrai(brut.every(p => Math.min(...z.map(q => metres(p, q))) >= 30), 'marge d’au moins 30 m aux sommets'); });
l = Z.localisation({ secteurs: 'Grenoble', quartiers: Object.keys(D.quartiers) });
t('les 70 quartiers : une seule zone, 230 points au plus', () => { eq(l.zones.length, 1); vrai(l.zones[0].points.length <= 230); vrai(l.zones[0].nom.length <= 60); });

console.log('\ncas 3 : quartiers et autres communes');
l = Z.localisation({ secteurs: 'Grenoble, Meylan', quartiers: [VALLIER] });
t('tout part en zones, la commune aussi', () => { eq(l.mode, 'ZONES'); eq(l.zones.length, 2);
  const m = l.zones.find(z => z.type === 'commune'); eq(m.nom, 'Meylan'); eq(m.code_insee, '38229'); });
l = Z.localisation({ secteurs: 'Grenoble, La Tronche', quartiers: [ILE] });
t('un quartier collé à une commune : une seule zone « mixte »', () => { eq(l.zones.length, 1); eq(l.zones[0].type, 'mixte'); eq(l.zones[0].nom, 'Ile Verte-Saint Roch + La Tronche'); });
l = Z.localisation({ secteurs: 'Grenoble, St Egreve, SAINT-MARTIN-D\'HERES (38400)', quartiers: [VALLIER] });
t('les noms de communes sont reconnus malgré la graphie', () => { eq(l.mode, 'ZONES'); eq(l.inconnues.length, 0); });

console.log('\nles replis');
l = Z.localisation({ secteurs: 'Grenoble, Voiron, Vif, Crolles', quartiers: [VALLIER] });
t('plus de 3 zones : communes entières, signalé', () => { eq(l.mode, 'COMMUNES'); eq(l.repli, 'TROP_DE_ZONES'); eq(l.zones.length, 0);
  eq(Z.mentionRepli(l), 'plus de 3 zones : localisation simplifiée'); });
l = Z.localisation({ secteurs: 'Grenoble, Chambéry', quartiers: [VALLIER] });
t('commune sans contour : aucune zone, signalé', () => { eq(l.repli, 'SANS_CONTOUR'); eq(l.inconnues[0], 'Chambéry');
  eq(Z.mentionRepli(l), 'commune sans contour (Chambéry) : localisation non modifiée'); });

console.log('\nle fichier de report');
const contact = (id) => db.prepare(`INSERT INTO acq_contacts (id_contact, nom, prenom, tel_portable, madame_fichier, statut)
  VALUES (?, ?, 'Zoé', '0600000000', 'Lila Essai', 'REQUALIFIE')`).run(id, 'NOM' + id);
const fiche = (idf, idc, projet) => db.prepare(`INSERT INTO acq_fiches (id_fiche, id_contact, type_recherche, communes, decision, requalif)
  VALUES (?, ?, 'Achat', 'Grenoble', 'GARDER', ?)`).run(idf, idc, JSON.stringify({ etat_projet: 'ACTIF', budget_max: 300000, urgence: 8, mode_financement: 'Crédit', ...projet }));
const appel = (idc) => db.prepare(`INSERT INTO acq_appels (id_contact, madame_fichier, issue, statut_final, details)
  VALUES (?, 'Lila Essai', 'JOINT', 'REQUALIFIE', '{}')`).run(idc);
const Q = (c) => ({ code: c, nom: D.quartiers[c].nom });
contact('1'); fiche('11', '1', { secteurs: ['Grenoble', 'Meylan'] }); appel('1');
contact('2'); fiche('21', '2', { secteurs: ['Grenoble'], quartiers_grenoble: [Q(VALLIER), Q(BRUNO)] }); appel('2');
contact('3'); fiche('31', '3', { secteurs: ['Grenoble', 'Meylan'], quartiers_grenoble: [Q(VALLIER)] }); appel('3');
contact('4'); fiche('41', '4', { secteurs: ['Grenoble', 'Voiron', 'Vif', 'Crolles'], quartiers_grenoble: [Q(VALLIER)] }); appel('4');
contact('5'); fiche('51', '5', { secteurs: ['Grenoble', 'Chambéry'], quartiers_grenoble: [Q(VALLIER)] }); appel('5');
const L = Object.fromEntries(M.lignesReport('9999-12-31 23:59:59').map(x => [x.id_fiche, x]));
// Depuis le 26/11/2026, deux colonnes de création la suivent : aucune colonne d'avant n'a changé de place.
t('zones_apres garde sa place, suivie des deux colonnes de création', () => { eq(M.COLONNES.slice(-3).join(','), 'zones_apres,creer_fiche,ref_creation'); eq(M.COLONNES.indexOf('motif_echec'), M.COLONNES.indexOf('zones_apres') - 1); });
t('cas 1 : communes, pas de zone', () => { eq(L['11'].secteurs_apres, 'Grenoble, Meylan'); eq(L['11'].zones_apres, ''); eq(L['11'].a_proposer_a_loick, ''); });
t('cas 2 : zones en JSON, secteurs en texte', () => { eq(L['21'].secteurs_apres, 'Grenoble (quartiers : Saint-Bruno, Vallier)');
  const z = JSON.parse(L['21'].zones_apres); eq(z.length, 2); eq(Object.keys(z[0]).join(','), 'nom,type,commune,code_iris,points'); });
t('cas 2 : les quartiers sont dans les Précisions', () => vrai(L['21'].precisions_apres.includes('SECTEURS : Grenoble (quartiers : Saint-Bruno, Vallier)')));
t('cas 3 : la commune part en zone aussi', () => { eq(JSON.parse(L['31'].zones_apres).length, 2); eq(L['31'].secteurs_apres, 'Grenoble (quartiers : Vallier), Meylan'); });
t('repli plus de 3 zones : communes entières, quartiers en Précisions, signalé', () => { eq(L['41'].zones_apres, '');
  eq(L['41'].secteurs_apres, 'Grenoble, Voiron, Vif, Crolles'); eq(L['41'].a_proposer_a_loick, 'plus de 3 zones : localisation simplifiée');
  vrai(L['41'].precisions_apres.includes('Grenoble (quartiers : Vallier)')); });
t('repli sans contour : aucune localisation envoyée, signalé', () => { eq(L['51'].zones_apres, ''); eq(L['51'].secteurs_apres, ''); eq(L['51'].secteurs_avant, '');
  eq(L['51'].a_proposer_a_loick, 'commune sans contour (Chambéry) : localisation non modifiée'); vrai(L['51'].precisions_apres.includes('Chambéry')); });
t('le CSV se relit : le JSON des zones survit aux guillemets', () => {
  const Papa = require('papaparse'); const r = Papa.parse(M.enCsv(Object.values(L)).replace(/^﻿/, ''), { header: true, delimiter: ';' });
  eq(JSON.parse(r.data.find(x => x.id_fiche === '21').zones_apres).length, 2); });

// De l'écran d'appel au fichier de retour, par les routes.
(async () => {
  console.log('\nde bout en bout : appel, report, retour');
  db.prepare(`INSERT INTO users (email, password, prenom, nom, role, actif, acces_acquereurs) VALUES
    ('adm@t.fr','x','Ada','Admin','admin',1,0), ('l@t.fr','x','Lila','Essai','conseiller',1,1)`).run();
  const express = require('express'), jwt = require('jsonwebtoken');
  const app = express(); app.use(express.json({ limit: '5mb' }));
  app.use('/acquereurs', require('../src/routes/acqRoutes.js'));
  const req = async (email, methode, url, corps) => {
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const jeton = jwt.sign({ id: u.id, email: u.email, role: u.role }, process.env.JWT_SECRET);
    const srv = app.listen(0);
    const r = await fetch(`http://127.0.0.1:${srv.address().port}${url}`, {
      method: methode, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
      body: corps ? JSON.stringify(corps) : undefined });
    const j = await r.json().catch(() => null); srv.close();
    return { statut: r.status, corps: j };
  };
  db.prepare(`INSERT INTO acq_contacts (id_contact, nom, prenom, tel_portable, madame_fichier) VALUES ('7', 'BOUT', 'Zoé', '0600000007', 'Lila Essai')`).run();
  db.prepare(`INSERT INTO acq_fiches (id_fiche, id_contact, type_recherche, communes) VALUES ('71', '7', 'Achat', 'Grenoble')`).run();

  let r = await req('l@t.fr', 'POST', '/acquereurs/zones/apercu', { secteurs: 'Grenoble, Meylan', quartiers: [VALLIER, BRUNO] });
  t('aperçu à l’écran : 3 zones', () => { eq(r.statut, 200); eq(r.corps.mode, 'ZONES'); eq(r.corps.nb_zones, 3); });
  r = await req('l@t.fr', 'POST', '/acquereurs/zones/apercu', { secteurs: 'Grenoble, Voiron, Vif', quartiers: [VALLIER, BRUNO] });
  t('aperçu à l’écran : trop de zones, annoncé avant d’enregistrer', () => { eq(r.corps.repli, 'TROP_DE_ZONES'); eq(r.corps.nb_zones, 4); });

  r = await req('l@t.fr', 'POST', '/acquereurs/contacts/7/cloture', { cle: 'bout-1', statut_final: 'REQUALIFIE', joint: true, notes: 'Requalifiée.',
    coordonnees: { tel_portable: { etat: 'CONFIRME', avant: '0600000007' } }, vendre: { statut_logement: 'LOCATAIRE', doit_vendre: 'NON' },
    fiches: { 71: { decision: 'GARDER', projet: { etat_projet: 'ACTIF', budget_max: '300000', secteurs: ['Grenoble', 'Meylan'],
      quartiers_grenoble: [Q(VALLIER), Q(BRUNO)], urgence: 8, mode_financement: 'Comptant', financement_valide: 'COMPTANT' } } } });
  t('l’appel s’enregistre avec ses quartiers', () => eq(r.statut, 201, JSON.stringify(r.corps)));
  r = await req('l@t.fr', 'GET', '/acquereurs/contacts/7');
  t('à la réouverture, les quartiers sont toujours là', () => eq(r.corps.fiches[0].requalif.quartiers_grenoble.length, 2));

  r = await req('adm@t.fr', 'GET', '/acquereurs/admin/report');
  const ligne = r.corps.lignes.find(x => x.id_fiche === '71');
  t('le report porte 3 zones', () => { eq(JSON.parse(ligne.zones_apres).length, 3); eq(ligne.secteurs_apres, 'Grenoble (quartiers : Saint-Bruno, Vallier), Meylan'); });
  const pts = JSON.parse(ligne.zones_apres).map(z => z.points.length);
  const retour = (enreg, cle) => { const o = { ...ligne, statut: 'reporté', zones_enregistrees: enreg, jusqu_a: '2020-01-01 00:00:00', cle };
    const cols = [...M.COLONNES, 'zones_enregistrees', 'cle'];
    const c = (v) => { const x = String(v ?? ''); return /[;"\n\r]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
    return [cols.join(';'), cols.map(k => c(o[k])).join(';')].join('\r\n'); };
  r = await req('adm@t.fr', 'POST', '/acquereurs/admin/report/retour', { csv: retour(`3 (${pts.slice(0, 2).join(' / ')} / 5)`, 'a') });
  t('retour avec des zones incomplètes : la ligne reste à reporter', () => { eq(r.corps.reportes, 0); eq(r.corps.echecs, 1); vrai(/zones : 3 \(/.test(r.corps.motifs[0].motif), r.corps.motifs[0].motif); });
  r = await req('adm@t.fr', 'POST', '/acquereurs/admin/report/retour', { csv: retour('', 'b') });
  t('retour sans contrôle des zones : refusé aussi', () => eq(r.corps.echecs, 1));
  r = await req('adm@t.fr', 'POST', '/acquereurs/admin/report/retour', { csv: retour(`3 (${pts.join(' / ')})`, 'c') });
  t('retour conforme : accepté', () => { eq(r.corps.echecs, 0); eq(r.corps.sans_date.length + r.corps.date_future.length + r.corps.reportes, 1); });

  console.log(`\n${ok} OK, ${ko} KO`);
  process.exit(ko ? 1 : 0);
})();
