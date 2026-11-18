// Fichier Acquéreurs (18/11/2026) : import, file, tentatives, clôture,
// règles bloquantes, opposition commune, report Modelo. Données fictives.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');

const tmp = path.join(os.tmpdir(), 'acq-test-' + Date.now() + '.db');
const PORT = 4891, SECRET = 'dev';
process.env.DB_PATH = tmp;

const ENTETE = 'id_fiche;id_contact;civilite;nom;prenom;societe;email;tel_portable;tel_fixe;adresse_contact;cp_contact;commune_contact;stop_tel;stop_mail;type_contact;suivi_par_contact;agence_contact;contact_cree_le;contact_modifie_le;nb_fiches_actives_contact;ancien_conseiller_fiche;type_recherche;type_bien;budget_min;budget_max;surface_min;surface_max;pieces_min;pieces_max;chambres_min;chambres_max;terrain_min;terrain_max;localisation_mode;communes;codes_postaux;secteur;departements;rayon_km;balcon;terrasse;jardin;ascenseur;dernier_etage;cave;piscine;pmr;etat;priorite;apport;revenu;alerte_mail;fiche_modifiee_periode;precisions;observations;nb_notes_contact;derniere_note_date;derniere_note_auteur;derniere_note_extrait;alertes_a_verifier';
const ligne = (o) => ENTETE.split(';').map(k => o[k] ?? (['balcon','terrasse','jardin','ascenseur','dernier_etage','cave','piscine','pmr'].includes(k) ? 'Indifférent' : '')).join(';');
const C = (id, extra = {}) => ({ id_contact: id, civilite: 'Mme', nom: 'TEST' + id, prenom: 'Alice', tel_portable: '06000000' + id, stop_tel: 'NON', stop_mail: 'NON',
  type_contact: 'Acquéreur', type_recherche: 'Achat', type_bien: 'Appartement', budget_max: '300000', alerte_mail: 'Oui', fiche_modifiee_periode: '2024', ...extra });
const CSV = [ENTETE,
  ligne(C('11', { id_fiche: '101', precisions: 'T3 lumineux' })),
  ligne(C('11', { id_fiche: '102', type_bien: 'Maison', fiche_modifiee_periode: '2022' })),
  ligne(C('12', { id_fiche: '103', derniere_note_date: '2026-01-10' })),
  ligne(C('13', { id_fiche: '104', tel_portable: '' })),
  ligne(C('14', { id_fiche: '105', stop_tel: 'OUI' })),
  ligne(C('15', { id_fiche: '106', suivi_par_contact: 'Nathalie ALBIN' })),
  ligne(C('16', { id_fiche: '107', type_recherche: 'Location' })),
  ligne(C('17', { id_fiche: '108', stop_tel: '' })),
  ligne(C('18', { id_fiche: '109', suivi_par_contact: 'Loick FERRUCCI' })),
].join('\n');

{
  const { db } = require('../src/database');
  const bcrypt = require('bcryptjs');
  const h = bcrypt.hashSync('x', 4);
  db.prepare("INSERT INTO users (email, password, nom, prenom, role, actif) VALUES ('lilas@test.fr', ?, 'FERKOUS', 'Lilas', 'conseiller', 1)").run(h);
  db.prepare("INSERT INTO users (email, password, nom, prenom, role, actif) VALUES ('chef@test.fr', ?, 'CHEF', 'Admin', 'admin', 1)").run(h);
  db.prepare("INSERT INTO users (email, password, nom, prenom, role, actif) VALUES ('autre@test.fr', ?, 'AUTRE', 'Paul', 'conseiller', 1)").run(h);
  db.close();
}

const srv = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
  env: { ...process.env, PORT: String(PORT), JWT_SECRET: SECRET, DB_PATH: tmp, NODE_ENV: 'test', ACQ_IGNORER_PLAGE: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
srv.stderr.on('data', d => process.stderr.write('[srv] ' + d));
const base = `http://127.0.0.1:${PORT}/api`;
const call = (m, p, tok, body) => fetch(base + p, { method: m, headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined }).then(async r => ({ status: r.status, body: await r.json().catch(() => null), text: null }));

console.log('acquereurs.test.js');
let echecs = 0;
const t = (n, fn) => { try { fn(); console.log('  OK  ' + n) } catch (e) { console.error('  FAIL ' + n + ' : ' + e.message); echecs++ } };

(async () => {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(base + '/health')).ok) break } catch {} await new Promise(r => setTimeout(r, 150)); }
  const Database = require('better-sqlite3');
  const db = new Database(tmp);
  const u = (e) => db.prepare('SELECT id, role, email FROM users WHERE email = ?').get(e);
  const tok = (x) => jwt.sign({ id: x.id, role: x.role, email: x.email }, SECRET, { expiresIn: '1h' });
  const lilas = u('lilas@test.fr'), tLilas = tok(lilas), tAdmin = tok(u('chef@test.fr')), tAutre = tok(u('autre@test.fr'));

  let r = await call('GET', '/acquereurs/file', tLilas);
  t('sans le droit coché : accès refusé', () => assert.strictEqual(r.status, 403));
  r = await call('PUT', `/acquereurs/admin/acces/${lilas.id}`, tAutre, { acces: true });
  t('un conseiller ne peut pas donner le droit', () => assert.strictEqual(r.status, 403));
  await call('PUT', `/acquereurs/admin/acces/${lilas.id}`, tAdmin, { acces: true });

  r = await call('POST', '/acquereurs/admin/import', tAdmin, { csv: CSV, madame_fichier: 'Lilas FERKOUS' });
  t('import en simulation : rien d écrit', () => {
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.contacts, 8);
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM acq_contacts').get().n, 0);
  });
  r = await call('POST', '/acquereurs/admin/import', tAdmin, { csv: CSV, madame_fichier: 'Lilas FERKOUS', ecrire: true });
  t('import : exclusions par motif, contacts suivis par Loïck repris', () => {
    assert.deepStrictEqual(r.body.exclus, { SANS_TELEPHONE: 1, STOP_TEL: 1, SUIVI_PAR_AGENT: 1, LOCATION_SEULE: 1, CONTACT_ARCHIVE: 1 });
    assert.strictEqual(r.body.dans_la_file, 3);
  });
  r = await call('POST', '/acquereurs/admin/import', tAdmin, { csv: 'a;b\n1;2', madame_fichier: 'Lilas FERKOUS', ecrire: true });
  t('import d un mauvais fichier : refusé, colonnes nommées', () => { assert.strictEqual(r.status, 400); assert.ok(/id_fiche/.test(r.body.error)); });

  r = await call('GET', '/acquereurs/file', tLilas);
  t('file : une ligne par personne, la note la plus récente d abord', () => {
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.file.map(c => c.id_contact), ['12', '11', '18']);
    assert.strictEqual(r.body.file.find(c => c.id_contact === '11').nb_fiches, 2);
  });
  r = await call('GET', '/acquereurs/file', tAutre);
  t('un autre conseiller sans droit ne voit rien', () => assert.strictEqual(r.status, 403));

  r = await call('GET', '/acquereurs/contacts/11', tLilas);
  t('contact : ses deux fiches', () => { assert.strictEqual(r.body.fiches.length, 2); assert.deepStrictEqual(r.body.blocages, []); });

  // Tentatives : 48 h, puis 7 jours ; quatrième tentative = sort de la file.
  r = await call('POST', '/acquereurs/contacts/12/tentative', tLilas, { issue: 'PAS_DE_REPONSE', cle: 'k1' });
  const r2 = await call('POST', '/acquereurs/contacts/12/tentative', tLilas, { issue: 'PAS_DE_REPONSE', cle: 'k1' });
  t('tentative : enregistrée une fois même envoyée deux fois', () => { assert.strictEqual(r.status, 201); assert.strictEqual(r2.body.deja, true); });
  r = await call('GET', '/acquereurs/file', tLilas);
  t('sans-réponse : hors de la file pendant 48 h', () => { assert.ok(!r.body.file.some(c => c.id_contact === '12')); assert.strictEqual(r.body.groupes.en_attente, 1); });
  db.prepare("UPDATE acq_appels SET horodatage = datetime('now','-3 days') WHERE id_contact = '12'").run();
  r = await call('GET', '/acquereurs/file', tLilas);
  t('sans-réponse : revient après 48 h', () => assert.strictEqual(r.body.file.find(c => c.id_contact === '12')?.groupe, 'RELANCE'));
  for (const k of ['k2', 'k3']) await call('POST', '/acquereurs/contacts/12/tentative', tLilas, { issue: 'REPONDEUR', cle: k });
  r = await call('POST', '/acquereurs/contacts/12/tentative', tLilas, { issue: 'PAS_DE_REPONSE', canal: 'SMS', cle: 'k4', texte: 'Bonjour, Lilas du Quai.' });
  t('quatrième tentative : SANS_REPONSE', () => assert.strictEqual(r.body.statut, 'SANS_REPONSE'));
  r = await call('POST', '/acquereurs/contacts/12/tentative', tLilas, { issue: 'PAS_DE_REPONSE', cle: 'k5' });
  t('plafond de 4 par mois : cinquième appel refusé', () => { assert.strictEqual(r.status, 409); assert.ok(/Plafond/.test(r.body.error)); });

  r = await call('GET', '/acquereurs/mes-contacts', tLilas);
  t('mes contacts : tout le portefeuille, fiches hors file comprises avec leur motif', () => {
    assert.strictEqual(r.body.length, 8);
    assert.strictEqual(r.body.find(c => c.id_contact === '13').exclu_libelle, 'Sans téléphone');
  });
  r = await call('GET', '/acquereurs/effectues', tLilas);
  t('effectués : les tentatives du jour, avec le texte du SMS', () => {
    assert.ok(r.body.length >= 3); assert.ok(r.body.some(a => a.texte === 'Bonjour, Lilas du Quai.'));
  });

  // Clôture : décision sur chaque fiche, requalification complète.
  const projet = { etat_projet: 'ACTIF', budget_max: 320000, secteurs: ['Meylan'], urgence: 8, mode_financement: 'Crédit', financement_valide: 'ACCORD', type_bien: 'Appartement' };
  r = await call('POST', '/acquereurs/contacts/11/cloture', tLilas, { statut_final: 'REQUALIFIE', fiches: { '101': { decision: 'GARDER', projet } } });
  t('clôture refusée si une fiche n a pas de décision', () => { assert.strictEqual(r.status, 400); assert.ok(/Décision manquante/.test(r.body.error)); });
  r = await call('POST', '/acquereurs/contacts/11/cloture', tLilas, { statut_final: 'REQUALIFIE',
    fiches: { '101': { decision: 'GARDER', projet: { ...projet, secteurs: [] } }, '102': { decision: 'FUSIONNER', fusion_dans: '101' } } });
  t('requalifié refusé, dit ce qui manque', () => { assert.strictEqual(r.status, 400); assert.deepStrictEqual(r.body.manques, ['secteur']); });
  r = await call('POST', '/acquereurs/contacts/11/cloture', tLilas, { statut_final: 'REQUALIFIE', cle: 'c1',
    coordonnees: { tel_portable: { etat: 'MODIFIE', avant: '0600000011', apres: '0611111111' }, adresse: { etat: 'AJOUTE', apres: { adresse: '1 rue Test', code_postal: '38240', commune: 'Meylan' } } },
    vendre: { statut_logement: 'PROPRIETAIRE', doit_vendre: 'OUI', estimation_proposee: true, estimation_acceptee: true },
    marine: { proposee: false }, consentement_rappel: true,
    fiches: { '101': { decision: 'GARDER', projet }, '102': { decision: 'FUSIONNER', fusion_dans: '101' } } });
  t('clôture requalifiée : coordonnées à jour', () => {
    assert.strictEqual(r.status, 201);
    const c = db.prepare("SELECT * FROM acq_contacts WHERE id_contact = '11'").get();
    assert.strictEqual(c.statut, 'REQUALIFIE'); assert.strictEqual(c.tel_portable, '0611111111'); assert.strictEqual(c.commune, 'Meylan');
  });

  r = await call('GET', '/acquereurs/admin/report', tAdmin);
  t('report bloqué tant que la fusion n est pas validée', () => { assert.strictEqual(r.status, 409); assert.strictEqual(r.body.attente, 1); });
  r = await call('GET', '/acquereurs/admin/a-valider', tAdmin);
  await call('POST', '/acquereurs/admin/valider', tAdmin, { fiches: r.body.fiches.map(f => ({ id_fiche: f.id_fiche, accepte: true })) });
  r = await call('GET', '/acquereurs/admin/report', tAdmin);
  t('report : une ligne par fiche, note une seule fois, budget +10 %, Lilas suiveuse', () => {
    assert.strictEqual(r.status, 200);
    const l = r.body.lignes.filter(x => x.id_contact === '11');
    assert.strictEqual(l.length, 2);
    const g = l.find(x => x.id_fiche === '101'), f = l.find(x => x.id_fiche === '102');
    assert.ok(g.note_contact.startsWith('[MADAME FICHIER ACQ 2026]')); assert.strictEqual(f.note_contact, '');
    assert.strictEqual(g.budget_max_apres, '352000'); assert.strictEqual(g.priorite_apres, 'Court terme');
    assert.strictEqual(g.nego_contact_cible, 'Lilas FERKOUS'); assert.strictEqual(g.nego_fiche_cible, 'Lilas FERKOUS'); assert.strictEqual(g.alerte_mail, 'oui');
    assert.ok(g.precisions_apres.includes('━━━ LE PROJET ━━━') && g.precisions_apres.includes('T3 lumineux'));
    assert.strictEqual(f.archiver_fiche, 'oui'); assert.ok(f.commentaire_fiche.includes('doublon de la recherche n° 101'));
    assert.strictEqual(g.tel_portable_avant, '0600000011'); assert.strictEqual(g.tel_portable_apres, '0611111111');
    assert.strictEqual(g.type_contact_ajout, 'Vendeur');
    const n = r.body.lignes.find(x => x.id_contact === '12');
    assert.ok(n.note_contact.includes('Non joint') && n.note_contact.includes('SMS envoyé le') && n.note_contact.includes('« Bonjour, Lilas du Quai. »'));
  });
  // Retour d'Exploration Modelo : le fichier, plus « statut ». Un échec
  // laisse le contact à reporter, avec son motif.
  const retour = (ok12) => ['id_contact;id_fiche;statut;motif_echec;jusqu_a',
    ...r.body.lignes.map(l => [l.id_contact, l.id_fiche, l.id_contact === '12' && !ok12 ? 'échec' : 'reporté', l.id_contact === '12' && !ok12 ? 'fiche introuvable' : '', l.jusqu_a].join(';'))].join('\n');
  let rr = await call('POST', '/acquereurs/admin/report/retour', tAdmin, { csv: 'a;b\n1;2' });
  t('retour : mauvais fichier refusé, colonnes attendues dites', () => { assert.strictEqual(rr.status, 400); assert.ok(/id_contact/.test(rr.body.error)); });
  rr = await call('POST', '/acquereurs/admin/report/retour', tAdmin, { csv: retour(false) });
  t('retour : 1 reporté, 1 en échec avec son motif', () => {
    assert.strictEqual(rr.body.reportes, 1); assert.strictEqual(rr.body.echecs, 1);
    assert.strictEqual(rr.body.motifs[0].motif, 'fiche introuvable');
  });
  let r3 = await call('GET', '/acquereurs/admin/report', tAdmin);
  t('le contact en échec reste à reporter', () => assert.deepStrictEqual([...new Set(r3.body.lignes.map(l => l.id_contact))], ['12']));
  rr = await call('POST', '/acquereurs/admin/report/retour', tAdmin, { csv: retour(true) });
  r = await call('GET', '/acquereurs/admin/report', tAdmin);
  t('après le retour complet : plus rien à reporter', () => assert.strictEqual(r.body.lignes.length, 0));

  // Ne plus contacter : journal commun des oppositions.
  r = await call('POST', '/acquereurs/contacts/18/cloture', tLilas, { statut_final: 'NE_PLUS_CONTACTER' });
  t('ne plus contacter : écrit dans le journal commun, sort de la file', () => {
    assert.strictEqual(r.status, 201);
    assert.strictEqual(db.prepare("SELECT origine FROM op_journal_opposition WHERE id_modelo = '18'").get().origine, 'FICHIER_ACQUEREURS');
  });
  r = await call('GET', '/acquereurs/file', tLilas);
  t('file vide une fois tout traité', () => assert.strictEqual(r.body.file.length, 0));
  r = await call('GET', '/acquereurs/suivi', tLilas);
  t('suivi : requalifiés, vendeurs, estimations', () => { assert.strictEqual(r.body.requalifies, 1); assert.strictEqual(r.body.vendeurs, 1); assert.strictEqual(r.body.estimations_acceptees, 1); });

  // Réimport : le travail de Lilas n'est pas écrasé.
  await call('POST', '/acquereurs/admin/import', tAdmin, { csv: CSV, madame_fichier: 'Lilas FERKOUS', ecrire: true });
  t('réimport : statut, décisions et téléphone corrigé conservés', () => {
    const c = db.prepare("SELECT statut FROM acq_contacts WHERE id_contact = '11'").get();
    assert.strictEqual(c.statut, 'REQUALIFIE');
    assert.strictEqual(db.prepare("SELECT decision FROM acq_fiches WHERE id_fiche = '102'").get().decision, 'FUSIONNER');
  });

  db.close(); srv.kill();
  for (const s of ['', '-wal', '-shm']) fs.rmSync(tmp + s, { force: true });
  process.exit(echecs ? 1 : 0);
})().catch(e => { console.error('  ERREUR ' + e.stack); srv.kill(); process.exit(1) });
