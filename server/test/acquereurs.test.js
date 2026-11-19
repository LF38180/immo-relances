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

  r = await call('GET', '/acquereurs/accueil', tLilas);
  t('accueil : contacts, projets, à appeler', () => {
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.contacts, 3); assert.strictEqual(r.body.projets, 4);
    assert.strictEqual(r.body.a_reporter, undefined);
  });
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
    mandat: { etat: 'ACCEPTE', type: 'EXCLUSIF', date_acceptation: '2026-11-20' }, prochaine_action: 'Rendez-vous de signature', date_prochaine_action: '2026-11-27T10:00',
    fiches: { '101': { decision: 'GARDER', projet }, '102': { decision: 'FUSIONNER', fusion_dans: '101' } } });
  {
    const refus = await call('POST', '/acquereurs/contacts/11/cloture', tLilas, { statut_final: 'REQUALIFIE', mandat: { etat: 'ACCEPTE' },
      fiches: { '101': { decision: 'GARDER', projet }, '102': { decision: 'FUSIONNER', fusion_dans: '101' } } });
    t('mandat accepté sans date d acceptation : refusé', () => { assert.strictEqual(refus.status, 400); assert.ok(/date d’acceptation/.test(refus.body.error)); });
  }
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
    assert.ok(g.commentaire.startsWith('[MADAME FICHIER ACQ 2026]')); assert.strictEqual(f.commentaire, '');
    assert.strictEqual(g.budget_max_apres, '352000'); assert.strictEqual(g.priorite_apres, 'Court terme');
    assert.strictEqual(g.nego_contact_cible, 'Lilas FERKOUS'); assert.strictEqual(g.nego_fiche_cible, 'Lilas FERKOUS'); assert.strictEqual(g.alerte_mail, 'oui');
    assert.ok(g.precisions_apres.includes('━━━ LE PROJET ━━━') && g.precisions_apres.includes('T3 lumineux'));
    assert.strictEqual(f.archiver_fiche, 'oui'); assert.ok(f.commentaire_fiche.includes('doublon de la recherche n° 101'));
    assert.strictEqual(g.tel_portable_avant, '0600000011'); assert.strictEqual(g.tel_portable_apres, '0611111111');
    assert.strictEqual(g.type_contact_ajout, 'Vendeur');
    assert.ok(g.commentaire.includes('Mandat de recherche accepté le 20/11 (exclusif)'));
    assert.ok(g.precisions_apres.includes('MANDAT DE RECHERCHE : accepté le 20/11 (exclusif)'));
    const n = r.body.lignes.find(x => x.id_contact === '12');
    assert.ok(n.commentaire.includes('Non joint') && n.commentaire.includes('SMS envoyé le') && n.commentaire.includes('« Bonjour, Lilas du Quai. »'));
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
  t('suivi : requalifiés, vendeurs, estimations', () => { assert.strictEqual(r.body.requalifies, 1); assert.strictEqual(r.body.mandats_proposes, 1); assert.strictEqual(r.body.mandats_acceptes, 1); assert.strictEqual(r.body.vendeurs, 1); assert.strictEqual(r.body.estimations_acceptees, 1); });

  r = await call('GET', '/acquereurs/admin/listing', tAdmin);
  t('listing : requalifié, vendeur, estimation, reporté', () => {
    const c = r.body.contacts.find(x => x.id_contact === '11');
    assert.strictEqual(c.statut, 'REQUALIFIE'); assert.strictEqual(c.vendeur, 1); assert.strictEqual(c.estimation_acceptee, 1);
    assert.ok(c.modelo_reporte_le); assert.strictEqual(c.a_reporter, 0);
  });
  r = await call('GET', '/acquereurs/admin/listing', tLilas);
  t('listing réservé à l admin', () => assert.strictEqual(r.status, 403));
  r = await call('GET', '/admin/activite', tAdmin);
  t('activité : les appels du Fichier Acquéreurs y figurent, avec le nom', () => {
    const l = r.body.lignes.find(x => x.type === 'APPEL_ACQUEREUR');
    assert.ok(l); assert.strictEqual(l.auteur, 'Lilas FERKOUS'); assert.ok(l.nom);
  });

  r = await call('GET', '/admin/missions', tAdmin);
  t('accueil des missions : trois missions, trois chiffres chacune, noms des personnes', () => {
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.missions.map(m => m.id), ['estimes', 'acquereurs', 'courtage']);
    assert.ok(r.body.missions.every(m => m.chiffres.length === 3 && m.chiffres.every(c => Number.isInteger(c.n))));
    assert.deepStrictEqual(r.body.missions[1].qui, ['Lilas FERKOUS']);
    assert.strictEqual(r.body.missions[1].chiffres[2].n, 1);
  });
  r = await call('GET', '/admin/missions', tLilas);
  t('accueil des missions : réservé à l admin', () => assert.strictEqual(r.status, 403));

  // --- Défauts trouvés à la relecture du 18/11, un test chacun ---
  {
    // 1. Une tentative sur un contact requalifié déjà reporté : le report ne plante plus.
    db.prepare("UPDATE acq_appels SET horodatage = datetime('now','-40 days') WHERE id_contact = '11'").run();
    db.prepare("UPDATE acq_contacts SET modelo_reporte_le = datetime('now','-39 days') WHERE id_contact = '11'").run();
    let x = await call('POST', '/acquereurs/contacts/11/tentative', tLilas, { issue: 'REPONDEUR', cle: 'rev-1' });
    t('tentative sur un contact requalifié : son statut ne bouge pas', () => { assert.strictEqual(x.status, 201); assert.strictEqual(x.body.statut, 'REQUALIFIE'); });
    // (l'opposition du contact 18 a proposé un archivage : on le valide d'abord)
    const valider = async () => { const av = await call('GET', '/acquereurs/admin/a-valider', tAdmin);
      await call('POST', '/acquereurs/admin/valider', tAdmin, { fiches: av.body.fiches.map(f => ({ id_fiche: f.id_fiche, accepte: true })) }); };
    await valider();
    x = await call('GET', '/acquereurs/admin/report', tAdmin);
    t('report après une simple tentative sur un requalifié : pas d erreur, note seule, pas de réattribution', () => {
      assert.strictEqual(x.status, 200);
      const l = x.body.lignes.filter(y => y.id_contact === '11');
      assert.ok(l[0].commentaire.includes('Non joint')); assert.strictEqual(l[0].nego_contact_cible, ''); assert.strictEqual(l[0].precisions_apres, '');
    });

    // 2. « Joint, à rappeler » sans décision renvoyée : rien n'est effacé.
    x = await call('POST', '/acquereurs/contacts/11/cloture', tLilas, { statut_final: 'A_RAPPELER', date_prochaine_action: '2030-01-10T10:00', joint: true,
      fiches: { '101': { decision: null }, '102': { decision: null } } });
    t('à rappeler sans décision : la décision et la requalification déjà saisies sont gardées', () => {
      assert.strictEqual(x.status, 201);
      const f = db.prepare("SELECT decision, requalif FROM acq_fiches WHERE id_fiche = '101'").get();
      assert.strictEqual(f.decision, 'GARDER'); assert.ok(JSON.parse(f.requalif).budget_max);
      assert.strictEqual(db.prepare("SELECT decision FROM acq_fiches WHERE id_fiche = '102'").get().decision, 'FUSIONNER');
    });

    // 6. Un rappel convenu resté sans réponse repart dans le circuit des sans-réponse.
    db.prepare("UPDATE acq_contacts SET rappel_le = '2020-01-01T10:00' WHERE id_contact = '11'").run();
    db.prepare("UPDATE acq_appels SET horodatage = datetime('now','-40 days') WHERE id_contact = '11'").run();
    x = await call('POST', '/acquereurs/contacts/11/tentative', tLilas, { issue: 'PAS_DE_REPONSE', cle: 'rev-6' });
    const f6 = (await call('GET', '/acquereurs/file', tLilas)).body;
    t('rappel convenu sans réponse : il quitte la tête de file et attend 48 h', () => {
      assert.strictEqual(x.body.statut, null); assert.ok(!f6.file.some(c => c.id_contact === '11')); assert.ok(f6.groupes.en_attente >= 1);
    });

    // 9. Validation : date illisible, archivage sans motif, décision inconnue.
    x = await call('POST', '/acquereurs/contacts/11/cloture', tLilas, { statut_final: 'A_RAPPELER', date_prochaine_action: 'bientôt' });
    t('date de rappel illisible : refusée', () => assert.strictEqual(x.status, 400));
    x = await call('POST', '/acquereurs/contacts/11/cloture', tLilas, { statut_final: 'A_RAPPELER', date_prochaine_action: '2030-01-10T10:00', fiches: { '102': { decision: 'ARCHIVER' } } });
    t('archivage sans motif : refusé même sur un rappel', () => { assert.strictEqual(x.status, 400); assert.ok(/motif/.test(x.body.error)); });
    x = await call('POST', '/acquereurs/contacts/11/cloture', tLilas, { statut_final: 'A_RAPPELER', date_prochaine_action: '2030-01-10T10:00', fiches: { '102': { decision: 'SUPPRIMER' } } });
    t('décision inconnue : refusée proprement', () => assert.strictEqual(x.status, 400));

    // 8. Les mails : hors plafond, et jamais après une opposition.
    for (const k of ['m1', 'm2', 'm3', 'm4', 'm5']) await call('POST', '/acquereurs/contacts/11/tentative', tLilas, { issue: 'PAS_DE_REPONSE', canal: 'MAIL', cle: 'rev-' + k });
    x = await call('GET', '/acquereurs/contacts/11', tLilas);
    t('cinq mails ne remplissent pas le plafond d appels', () => assert.ok(!x.body.blocages.some(b => /Plafond/.test(b)), JSON.stringify(x.body.blocages)));
    x = await call('POST', '/acquereurs/contacts/18/tentative', tLilas, { issue: 'PAS_DE_REPONSE', canal: 'MAIL', cle: 'rev-m18' });
    t('pas de mail à qui a demandé à ne plus être contacté', () => assert.strictEqual(x.status, 409));

    // 7. Un faux numéro corrigé et remis dans la file y revient vraiment.
    db.prepare("UPDATE acq_contacts SET exclu = NULL, tel_portable = '0600000013' WHERE id_contact = '13'").run();
    await call('POST', '/acquereurs/contacts/13/tentative', tLilas, { issue: 'FAUX_NUMERO', cle: 'rev-7' });
    await call('POST', '/acquereurs/admin/contacts/13/reintegrer', tAdmin, { tel_portable: '0611112222' });
    const f7 = (await call('GET', '/acquereurs/file', tLilas)).body;
    t('faux numéro corrigé : la personne est de nouveau proposée à l appel', () => assert.ok(f7.file.some(c => c.id_contact === '13')));

    // 5. Retour Modelo sans date exploitable : on ne marque pas « reporté ».
    await valider();
    const r5 = await call('GET', '/acquereurs/admin/report', tAdmin);
    const ids5 = [...new Set(r5.body.lignes.map(l => l.id_contact))];
    x = await call('POST', '/acquereurs/admin/report/retour', tAdmin, { csv: ['id_contact;id_fiche;statut;motif_echec;jusqu_a', ...r5.body.lignes.map(l => [l.id_contact, l.id_fiche, 'reporté', '', ''].join(';'))].join('\n') });
    t('retour sans date « jusqu_a » : rien n est marqué reporté, et on le dit', () => { assert.strictEqual(x.body.reportes, 0); assert.strictEqual(x.body.sans_date.length, ids5.length); });
    x = await call('POST', '/acquereurs/admin/report/retour', tAdmin, { csv: ['id_contact;id_fiche;statut;motif_echec;jusqu_a', ...r5.body.lignes.map(l => [l.id_contact, l.id_fiche, 'reporté', '', '18/11/2030 10:00'].join(';'))].join('\n') });
    t('retour daté dans le futur : refusé, rien n est marqué reporté', () => { assert.strictEqual(x.body.reportes, 0); assert.strictEqual(x.body.date_future.length, ids5.length); });
    const j5 = r5.body.jusqu_a, fr5 = `${j5.slice(8, 10)}/${j5.slice(5, 7)}/${j5.slice(0, 4)} ${j5.slice(11, 16)}`;
    const csv5 = ['id_contact;id_fiche;statut;motif_echec;jusqu_a', ...r5.body.lignes.map(l => [l.id_contact, l.id_fiche, 'reporté', '', fr5].join(';'))].join('\n');
    x = await call('POST', '/acquereurs/admin/report/retour', tAdmin, { csv: csv5 });
    t('retour avec une date reformatée par un tableur : comprise', () => assert.strictEqual(x.body.reportes, ids5.length));
    x = await call('POST', '/acquereurs/admin/report/retour', tAdmin, { csv: csv5 });
    t('le même fichier de retour chargé deux fois : refusé', () => assert.strictEqual(x.status, 409));
    // Un ancien fichier (date antérieure) ne fait pas reculer la date de report.
    const avant5 = db.prepare('SELECT modelo_reporte_le d FROM acq_contacts WHERE id_contact = ?').get(ids5[0]).d;
    x = await call('POST', '/acquereurs/admin/report/retour', tAdmin, { csv: ['id_contact;id_fiche;statut;motif_echec;jusqu_a', [ids5[0], '', 'reporté', '', '2026-01-05 10:00:00'].join(';')].join('\n') });
    t('un ancien fichier de retour ne fait pas reculer la date de report', () => assert.strictEqual(db.prepare('SELECT modelo_reporte_le d FROM acq_contacts WHERE id_contact = ?').get(ids5[0]).d, avant5));
  }

  // Réimport : le travail de Lilas n'est pas écrasé.
  await call('POST', '/acquereurs/admin/import', tAdmin, { csv: CSV, madame_fichier: 'Lilas FERKOUS', ecrire: true });
  t('réimport : décisions et coordonnées corrigées conservées', () => {
    assert.strictEqual(db.prepare("SELECT decision FROM acq_fiches WHERE id_fiche = '102'").get().decision, 'FUSIONNER');
    // Le téléphone et l'adresse corrigés pendant l'appel ne reviennent pas à ceux du fichier.
    const c11 = db.prepare("SELECT tel_portable, commune FROM acq_contacts WHERE id_contact = '11'").get();
    assert.strictEqual(c11.tel_portable, '0611111111'); assert.strictEqual(c11.commune, 'Meylan');
    assert.strictEqual(db.prepare("SELECT tel_portable FROM acq_contacts WHERE id_contact = '13'").get().tel_portable, '0611112222');
  });

  // ---- Table ronde du 18/11 au soir ---------------------------------------
  {
    let x;
    const valider = async () => { const av = await call('GET', '/acquereurs/admin/a-valider', tAdmin);
      await call('POST', '/acquereurs/admin/valider', tAdmin, { fiches: av.body.fiches.map(f => ({ id_fiche: f.id_fiche, accepte: true })) }); };
    // Trois personnes neuves, importées à part.
    const CSV2 = [ENTETE,
      ligne(C('21', { id_fiche: '201', tel_fixe: '0476000021' })),
      ligne(C('22', { id_fiche: '202', alertes_a_verifier: 'Décès signalé' })),
      ligne(C('23', { id_fiche: '203', budget_max: '300 000,00' })),
    ].join('\n');
    x = await call('POST', '/acquereurs/admin/import', tAdmin, { csv: CSV2, madame_fichier: 'Lilas FERKOUS', ecrire: true });
    t('import : « 300 000,00 » vaut 300 000', () => assert.strictEqual(db.prepare("SELECT budget_max b FROM acq_fiches WHERE id_fiche = '203'").get().b, 300000));

    // La plage horaire n'interdit plus : elle avertit seulement.
    x = await call('GET', '/acquereurs/contacts/21', tLilas);
    t('la fiche donne les blocages ET les alertes, à part', () => { assert.ok(Array.isArray(x.body.alertes)); assert.ok(!x.body.blocages.some(b => /plage/i.test(b))); });

    // Un contact exclu ne s'appelle pas depuis la recherche.
    x = await call('POST', '/acquereurs/contacts/22/tentative', tLilas, { issue: 'REPONDEUR', cle: 'tr-exclu' });
    t('contact hors file (décès possible) : appel refusé', () => assert.strictEqual(x.status, 409));
    x = await call('POST', '/acquereurs/contacts/22/cloture', tLilas, { statut_final: 'A_RAPPELER', date_prochaine_action: '2027-01-12T10:00', entrant: true, cle: 'tr-exclu-e' });
    t('… sauf si c est la personne qui rappelle', () => assert.strictEqual(x.status, 201));

    // Report : tout ce que les appels aboutis du lot ont appris, pas seulement le dernier.
    x = await call('POST', '/acquereurs/contacts/21/cloture', tLilas, { cle: 'tr-1', statut_final: 'A_RAPPELER', date_prochaine_action: '2027-01-11T15:30', joint: true,
      notes: 'Préfère le soir.', stop_mail: true,
      coordonnees: { tel_portable: { etat: 'MODIFIE', avant: '0600000021', apres: '0699999921' } },
      vendre: { statut_logement: 'PROPRIETAIRE', doit_vendre: 'OUI', etat_revente: 'PAS_SORTIE', adresse_bien_a_vendre: '3 rue des Lilas 38240 Meylan', estimation_proposee: true, estimation_acceptee: true, date_rdv_estimation: '2027-01-14T09:15' },
      marine: { proposee: true, accord: true } });
    t('joint, à rappeler, avec une saisie complète : enregistré', () => assert.strictEqual(x.status, 201));
    x = await call('GET', '/acquereurs/contacts/21', tLilas);
    t('au rappel, l écran retrouve la situation de logement', () => assert.strictEqual(x.body.memoire.vendre.doit_vendre, 'OUI'));
    db.prepare("UPDATE acq_appels SET horodatage = datetime('now', '-2 days') WHERE cle = 'tr-1'").run();
    x = await call('POST', '/acquereurs/contacts/21/cloture', tLilas, { cle: 'tr-2', statut_final: 'REQUALIFIE', joint: true, notes: 'Requalifiée.',
      prochaine_action: 'Rendez-vous de signature',
      mandat: { etat: 'ACCEPTE', type: 'SIMPLE', date_acceptation: '2026-11-20' },
      coordonnees: { tel_portable: { etat: 'CONFIRME', avant: '0699999921' } }, vendre: { statut_logement: 'PROPRIETAIRE', doit_vendre: 'OUI' },
      fiches: { 201: { decision: 'GARDER', projet: { etat_projet: 'ACTIF', budget_max: '300000', secteurs: ['Meylan'], urgence: 8, mode_financement: 'Comptant', financement_valide: 'COMPTANT',
        origine_fonds: 'vente d un terrain', recherche_depuis: 'six mois', criteres_libre: 'Étage élevé\nvue dégagée' } } } });
    t('mandat accepté sans date de signature : accepté (« à fixer »)', () => assert.strictEqual(x.status, 201));
    await valider();
    x = await call('GET', '/acquereurs/admin/report', tAdmin);
    const l21 = x.body.lignes.find(l => l.id_contact === '21');
    t('report : le numéro corrigé au PREMIER appel du lot est bien là', () => { assert.strictEqual(l21.tel_portable_avant, '0600000021'); assert.strictEqual(l21.tel_portable_apres, '0699999921'); });
    t('report : stop mail, vendeur, estimation avec son heure, courtage, note du premier appel', () => {
      assert.strictEqual(l21.stop_mail, 'OUI'); assert.strictEqual(l21.type_contact_ajout, 'Vendeur');
      assert.ok(l21.commentaire.includes('rdv le 14/01/2027 à 09 h 15'), l21.commentaire);
      assert.ok(l21.commentaire.includes('Rendez-vous courtage proposé, client d’accord'));
      assert.ok(l21.commentaire.includes('Préfère le soir.') && l21.commentaire.includes('Requalifiée.'));
      assert.ok(l21.commentaire.includes('rendez-vous de signature à fixer'));
    });
    t('report : les champs qui se perdaient sont dans les Précisions', () => {
      for (const m of ['cherche depuis six mois', 'origine des fonds : vente d un terrain', 'bien à vendre : 3 rue des Lilas 38240 Meylan', 'AUTRES CRITÈRES : Étage élevé ; vue dégagée']) assert.ok(l21.precisions_apres.includes(m), m);
    });
    t('report : secteurs et priorité avec leur « avant »', () => { assert.strictEqual(l21.secteurs_apres, 'Meylan'); assert.strictEqual(l21.priorite_apres, 'Court terme'); });
    t('report : la liste des réattributions est donnée à relire', () => assert.ok(x.body.reattributions.some(r => r.id_contact === '21' && r.vers === 'Lilas FERKOUS')));

    // Budget simplement pré-rempli (non requalifié, même montant) : pas de + 10 %.
    x = await call('POST', '/acquereurs/contacts/23/cloture', tLilas, { cle: 'tr-3', statut_final: 'EN_PAUSE', joint: true,
      fiches: { 203: { decision: 'GARDER', projet: { etat_projet: 'EN_PAUSE', budget_max: '300000' } } } });
    x = await call('GET', '/acquereurs/admin/report', tAdmin);
    t('report : un budget non rediscuté n est pas majoré', () => assert.strictEqual(x.body.lignes.find(l => l.id_contact === '23').budget_max_apres, ''));

    // Une coordonnée « modifiée » sans nouvelle valeur est refusée.
    x = await call('POST', '/acquereurs/contacts/23/cloture', tLilas, { cle: 'tr-4', statut_final: 'A_RAPPELER', date_prochaine_action: '2027-01-12', joint: true,
      coordonnees: { email: { etat: 'MODIFIE', avant: 'a@b.fr', apres: '' } } });
    t('coordonnée « modifiée » sans nouvelle valeur : refusée', () => assert.strictEqual(x.status, 400));
    x = await call('POST', '/acquereurs/contacts/23/cloture', tLilas, { cle: 'tr-5', statut_final: 'A_RAPPELER', date_prochaine_action: '2026-13-45' });
    t('date de rappel impossible : refusée', () => assert.strictEqual(x.status, 400));

    // Répondeur + SMS dans la foulée : une seule tentative.
    const avant = db.prepare("SELECT COUNT(*) n FROM acq_appels WHERE id_contact = '23'").get().n;
    x = await call('POST', '/acquereurs/contacts/23/tentative', tLilas, { issue: 'REPONDEUR', sms: true, texte: 'Bonjour, Lilas.', cle: 'tr-6' });
    t('répondeur + SMS dans la foulée : un seul appel compté, texte gardé', () => {
      assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM acq_appels WHERE id_contact = '23'").get().n, avant + 1);
      assert.ok(JSON.parse(db.prepare("SELECT details FROM acq_appels WHERE cle = 'tr-6'").get().details).sms);
    });

    // Transmissions : la ligne sort de la liste une fois transmise.
    x = await call('GET', '/acquereurs/admin/transmettre', tAdmin);
    t('à transmettre : le rendez-vous courtage et l estimation de la personne 21', () => {
      assert.ok(x.body.marine.some(l => l.id_contact === '21' && l.pret && !l.transmis_le));
      assert.ok(x.body.estimations.some(l => l.id_contact === '21' && l.pret && !l.transmis_le));
    });
    await call('POST', '/acquereurs/admin/transmettre', tAdmin, { id_contact: '21', type: 'MARINE' });
    x = await call('GET', '/acquereurs/admin/transmettre', tAdmin);
    t('une fois transmis, c est noté', () => assert.ok(x.body.marine.find(l => l.id_contact === '21').transmis_le));
    x = await call('POST', '/acquereurs/admin/transmettre', tLilas, { id_contact: '21', type: 'MARINE' });
    t('transmettre : réservé à l administration', () => assert.strictEqual(x.status, 403));

    // Opposition : la même personne dans l'opération reçoit son stop.
    db.prepare("INSERT INTO op_contacts (id_modelo, nom, script, tel_portable) VALUES ('OP-99', 'MEME', 1, '06 00 00 00 23')").run();
    await call('POST', '/acquereurs/contacts/23/cloture', tLilas, { cle: 'tr-7', statut_final: 'NE_PLUS_CONTACTER' });
    t('ne plus contacter : stop téléphone posé dans l opération (même numéro)', () => assert.strictEqual(db.prepare("SELECT stop_telephone s FROM op_contacts WHERE id_modelo = 'OP-99'").get().s, 1));

    // Import : fichiers abîmés refusés.
    x = await call('POST', '/acquereurs/admin/import', tAdmin, { csv: CSV2.replace('Décès signalé', 'D�c�s signal�'), madame_fichier: 'Lilas FERKOUS' });
    t('import : fichier mal encodé refusé', () => assert.strictEqual(x.status, 400));
    x = await call('POST', '/acquereurs/admin/import', tAdmin, { csv: [ENTETE, ligne(C('31', { id_fiche: '301', precisions: '"guillemet ouvert' })), ligne(C('32', { id_fiche: '302' }))].join('\n'), madame_fichier: 'Lilas FERKOUS' });
    t('import : guillemet non fermé refusé', () => assert.strictEqual(x.status, 400));
    x = await call('POST', '/acquereurs/admin/import', tAdmin, { csv: [ENTETE, ligne(C('33', { id_fiche: '303', stop_tel: 'X' }))].join('\n'), madame_fichier: 'Lilas FERKOUS' });
    t('import : stop_tel illisible refusé', () => assert.strictEqual(x.status, 400));
    x = await call('POST', '/acquereurs/admin/import', tAdmin, { csv: [ENTETE, ligne(C('21', { id_fiche: '201', suivi_par_contact: 'Nathalie ALBIN' }))].join('\n'), madame_fichier: 'Lilas FERKOUS' });
    t('import : un contact déjà travaillé qui sort de la file est annoncé', () => assert.ok(x.body.sortis_de_la_file.some(c => c.id_contact === '21')));

    // Suivi : indicateurs de pilotage.
    x = await call('GET', '/acquereurs/suivi', tAdmin);
    t('suivi : taux de joints, issues, par personne', () => { assert.ok(x.body.taux_joints > 0); assert.ok(x.body.issues.JOINT > 0); assert.ok(x.body.par_personne.some(p => p.qui === 'Lilas FERKOUS')); });
    x = await call('GET', '/acquereurs/admin/report/etat', tAdmin);
    t('état du report : lisible', () => assert.ok('echecs' in x.body && 'en_attente_de_retour' in x.body));

    // Contacts d'essai : les seuls effaçables, par l'administration seulement.
    x = await call('POST', '/acquereurs/admin/import', tAdmin, { ecrire: true, madame_fichier: 'Lilas FERKOUS', csv: [ENTETE,
      ligne(C('9001', { id_fiche: '90010', nom: 'ZZTEST', prenom: 'Archive' })),
      ligne(C('9002', { id_fiche: '90020', nom: 'zztest', prenom: 'Fusion' })), ligne(C('9002', { id_fiche: '90021', nom: 'zztest', prenom: 'Fusion' }))].join('\n') });
    await call('POST', '/acquereurs/contacts/9001/tentative', tLilas, { issue: 'PAS_DE_REPONSE', cle: 'essai-1' });
    const nbAvantEssais = db.prepare('SELECT COUNT(*) n FROM acq_contacts').get().n;
    x = await call('GET', '/acquereurs/admin/essais', tAdmin);
    t('contacts d essai : listés (2 contacts, dont un avec 2 recherches)', () => { assert.strictEqual(x.body.contacts.length, 2); assert.ok(x.body.contacts.some(c => c.fiches === 2)); });
    x = await call('GET', '/acquereurs/admin/essais', tLilas);
    t('liste refusée à Lilas', () => assert.strictEqual(x.status, 403));
    x = await call('DELETE', '/acquereurs/admin/essais', tLilas, { confirmer: 'ZZTEST' });
    t('effacement refusé à Lilas', () => assert.strictEqual(x.status, 403));
    x = await call('DELETE', '/acquereurs/admin/essais', tAdmin, { confirmer: 'oui' });
    t('effacement refusé sans le mot ZZTEST', () => { assert.strictEqual(x.status, 400); assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM acq_contacts').get().n, nbAvantEssais); });
    // Un report téléchargé pour eux, jamais revenu : l'effacement doit vider le report.
    await call('POST', '/acquereurs/contacts/9002/cloture', tLilas, { cle: 'essai-2', statut_final: 'A_RAPPELER', rappel_le: '2031-01-10', fiches: {} });
    const pret = (await call('GET', '/acquereurs/admin/report', tAdmin)).body;
    await call('GET', '/acquereurs/admin/report?format=csv', tAdmin);
    x = await call('POST', '/acquereurs/admin/essais/effacer', tAdmin, { confirmer: 'zztest' });
    t('effacement par l admin : 2 contacts, leurs recherches et leurs appels', () => {
      assert.strictEqual(x.body.retires, 2);
      assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM acq_contacts').get().n, nbAvantEssais - 2);
      assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM acq_fiches WHERE id_contact IN ('9001','9002')").get().n, 0);
      assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM acq_appels WHERE id_contact IN ('9001','9002')").get().n, 0);
    });
    const etat = (await call('GET', '/acquereurs/admin/report/etat', tAdmin)).body;
    const apresReport = (await call('GET', '/acquereurs/admin/report', tAdmin)).body;
    t('report Modelo : plus aucune ligne des contacts d essai, plus rien en attente de retour', () => {
      assert.ok(!(apresReport.lignes || apresReport.fiches || []).some(l => ['9001', '9002'].includes(String(l.id_contact))), 'lignes restantes');
      if (!apresReport.contacts) assert.strictEqual(etat.en_attente_de_retour, false);
    });
    t('aucun vrai contact touché', () => assert.ok(db.prepare("SELECT 1 FROM acq_contacts WHERE id_contact = '11'").get()));
    x = await call('DELETE', '/acquereurs/admin/essais', tAdmin, { confirmer: 'ZZTEST' });
    t('rejoué : plus rien à effacer', () => assert.strictEqual(x.body.retires, 0));

    // Vider les données de la mission : EFFACER, sauvegarde, corbeille, remise.
    const nb = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
    const avantVidage = { contacts: nb('acq_contacts'), fiches: nb('acq_fiches'), appels: nb('acq_appels'), scripts: nb('acq_scripts') };
    x = await call('POST', '/acquereurs/admin/vider', tLilas, { confirmation: 'EFFACER' });
    t('vider : refusé à Lilas', () => assert.strictEqual(x.status, 403));
    x = await call('POST', '/acquereurs/admin/vider', tAdmin, { confirmation: 'oui' });
    t('vider : refusé sans le mot EFFACER', () => { assert.strictEqual(x.status, 400); assert.strictEqual(nb('acq_contacts'), avantVidage.contacts); });
    x = await call('POST', '/acquereurs/admin/vider', tAdmin, { confirmation: 'EFFACER' });
    t('vider : sauvegarde écrite, tout part en corbeille, la mission est vide', () => {
      assert.strictEqual(x.status, 200); assert.ok(x.body.sauvegarde, 'sauvegarde'); assert.strictEqual(x.body.contacts, avantVidage.contacts);
      assert.strictEqual(nb('acq_contacts'), 0); assert.strictEqual(nb('acq_fiches'), 0); assert.strictEqual(nb('acq_appels'), 0);
    });
    t('vider : les scripts ne sont pas touchés', () => assert.strictEqual(nb('acq_scripts'), avantVidage.scripts));
    const lot = x.body.lot;
    x = await call('GET', '/acquereurs/file', tLilas);
    t('après vidage : la file de Lilas est vide, sans erreur', () => { assert.strictEqual(x.status, 200); assert.strictEqual((x.body.file || []).length, 0); });
    x = await call('GET', '/acquereurs/admin/report', tAdmin);
    t('après vidage : plus rien à reporter', () => assert.strictEqual(x.body.fiches, 0));
    x = await call('GET', '/acquereurs/admin/corbeille', tAdmin);
    t('corbeille : le lot y est, avec ses nombres', () => { assert.strictEqual(x.body.lots.length, 1); assert.strictEqual(x.body.lots[0].contacts, avantVidage.contacts); });
    x = await call('POST', '/acquereurs/admin/corbeille/restaurer', tAdmin, { lot });
    t('remettre le lot : tout revient à l identique', () => {
      assert.strictEqual(x.status, 200);
      assert.strictEqual(nb('acq_contacts'), avantVidage.contacts); assert.strictEqual(nb('acq_fiches'), avantVidage.fiches); assert.strictEqual(nb('acq_appels'), avantVidage.appels);
      assert.strictEqual(nb('acq_corbeille'), 0);
    });
    x = await call('GET', '/acquereurs/contacts/11', tLilas);
    t('après remise : une fiche se rouvre', () => assert.strictEqual(x.status, 200));
  }

  db.close(); srv.kill();
  for (const s of ['', '-wal', '-shm']) fs.rmSync(tmp + s, { force: true });
  process.exit(echecs ? 1 : 0);
})().catch(e => { console.error('  ERREUR ' + e.stack); srv.kill(); process.exit(1) });
