// Mission Acquéreurs → Mission Courtage : l'accord du client envoie la fiche chez Marine.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'acq-courtage-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
const I = require('../src/utils/acqImport');
const M = require('../src/utils/acqModelo');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };

db.prepare(`INSERT INTO users (email, password, prenom, nom, role, actif, acces_acquereurs) VALUES
  ('adm@t.fr','x','Ada','Admin','admin',1,0), ('l@t.fr','x','Lila','Essai','conseiller',1,1), ('ma@t.fr','x','Marine','Test','courtage',1,0)`).run();
const express = require('express'), jwt = require('jsonwebtoken');
const app = express(); app.use(express.json({ limit: '5mb' }));
app.use('/acquereurs', require('../src/routes/acqRoutes.js'));
app.use('/courtage', require('../src/routes/courtageRoutes.js'));
const req = async (email, methode, url, corps) => {
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const jeton = jwt.sign({ id: u.id, email: u.email, role: u.role }, process.env.JWT_SECRET);
  const srv = app.listen(0);
  const r = await fetch(`http://127.0.0.1:${srv.address().port}${url}`, {
    method: methode, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const j = await r.json().catch(() => null); srv.close();
  return { statut: r.status, corps: j };
};

const ENTETE = 'id_fiche;id_contact;civilite;nom;prenom;tel_portable;stop_tel;stop_mail;type_contact;suivi_par_contact;type_recherche;type_bien;alertes_a_verifier';
const L = (idf, idc, extra = {}) => { const o = { id_fiche: idf, id_contact: idc, civilite: 'Mme', nom: 'NOM' + idc, prenom: 'Zoé',
  tel_portable: '06000000' + idc, stop_tel: 'NON', stop_mail: 'NON', type_contact: 'Acquéreur', type_recherche: 'Achat', type_bien: 'Maison', ...extra };
  return ENTETE.split(';').map(k => o[k] ?? '').join(';'); };

const C = require('../src/utils/acqCourtage');
// 41 accord, inconnue de Marine · 42 accord, déjà une fiche « perdu » chez Marine · 43 liste noire courtage
// 44 proposé sans accord · 45 accord donné avant le 25/11, jamais transmis · 46 fiche « ne plus contacter » chez Marine
I.importer([ENTETE, L('401', '41'), L('402', '42'), L('403', '43'), L('404', '44'), L('405', '45'), L('406', '46')].join('\n'), { madameFichier: 'Lila Essai', simulation: false });
db.prepare("UPDATE acq_contacts SET email = 'client41@ex.fr' WHERE id_contact = '41'").run();
const tn = (t) => require('../src/utils/courtageImport').normaliserTelephone(t);
const fm = (nom, tel, statut, cat = 'oui_agent', prio = 2) => db.prepare(`INSERT INTO courtage_fiches (nom, telephone, telephone_norm, categorie, priorite, statut, prochaine_relance)
  VALUES (?, ?, ?, ?, ?, ?, '2027-01-01')`).run(nom, tel, tn(tel), cat, prio, statut).lastInsertRowid;
const f42 = fm('NOM42', '06 00 00 00 42', 'perdu'); const f46 = fm('NOM46', '0600000046', 'ne_plus_contacter');
db.prepare("INSERT INTO courtage_blacklist (telephone_norm, motif) VALUES (?, 'demande')").run(tn('0600000043'));
fm('AUTRE', '0611111111', 'en_relance', 'manuel', 1);
db.prepare("INSERT INTO acq_appels (id_contact, madame_fichier, issue, statut_final, details) VALUES ('45', 'Lila Essai', 'JOINT', 'REQUALIFIE', ?)").run(JSON.stringify({ marine: { proposee: true, accord: true } }));
const projet = { etat_projet: 'ACTIF', type_bien: 'Appartement/Maison', budget_max: 320000, secteurs: 'Meylan, Corenc', mode_financement: 'Crédit', apport: 40000 };
const clore = (idc, idf, marine, extra = {}) => req('l@t.fr', 'POST', `/acquereurs/contacts/${idc}/cloture`,
  { cle: 'k' + idc + (extra.n || ''), statut_final: 'EN_PAUSE', joint: true, marine, notes: extra.notes, fiches: { [idf]: { decision: 'GARDER', projet: { ...projet, etat_projet: 'EN_PAUSE' } } } });

(async () => {
  console.log('\naccord enregistré : la fiche part chez Marine');
  let r = await clore('41', '401', { proposee: true, accord: true }, { notes: 'Premier achat, pas encore vu sa banque' });
  t('l’appel est enregistré, la transmission est faite', () => { eq(r.statut, 201); eq(r.corps.courtage.ok, true); eq(!!r.corps.courtage.existait, false); });
  const f41 = db.prepare('SELECT * FROM courtage_fiches WHERE id = ?').get(r.corps.courtage.fiche_id);
  t('fiche créée, en tête de file', () => { eq(f41.categorie, 'acquereurs'); eq(f41.priorite, 0); eq(f41.statut, 'en_relance'); eq(f41.source, 'Mission Acquéreurs'); });
  t('elle porte les coordonnées et le budget', () => { eq(f41.nom, 'NOM41'); eq(f41.mail, 'client41@ex.fr'); eq(f41.montant_projet, '320000'); });
  t('et le projet en clair, avec la note', () => { eq(/Transmis par Lila Essai \(Mission Acquéreurs\)/.test(f41.commentaire), true);
    eq(/maison ou appartement, budget 320 000 €, secteur Meylan, Corenc, financement crédit, apport 40 000 €/.test(f41.commentaire), true); eq(/Premier achat/.test(f41.commentaire), true); });
  t('à relancer aujourd’hui', () => eq(f41.prochaine_relance <= new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' }), true));
  t('avant toutes les autres fiches de Marine', () => eq(db.prepare("SELECT id FROM courtage_fiches WHERE statut = 'en_relance' ORDER BY priorite ASC LIMIT 1").get().id, f41.id));
  r = await clore('41', '401', { proposee: true, accord: true }, { n: 'b' });
  t('un deuxième appel ne crée pas de doublon', () => { eq(r.corps.courtage.deja, true); eq(db.prepare("SELECT COUNT(*) n FROM courtage_fiches WHERE nom = 'NOM41'").get().n, 1); });

  console.log('\ncas particuliers');
  r = await clore('42', '402', { proposee: true, accord: true });
  t('déjà une fiche chez Marine : remontée, pas doublée', () => { eq(r.corps.courtage.existait, true); eq(r.corps.courtage.fiche_id, f42);
    const f = db.prepare('SELECT * FROM courtage_fiches WHERE id = ?').get(f42); eq(f.priorite, 0); eq(f.categorie, 'acquereurs'); eq(f.statut, 'en_relance');
    eq(db.prepare("SELECT COUNT(*) n FROM courtage_fiches WHERE nom = 'NOM42'").get().n, 1); });
  t('une ligne d’historique le dit', () => eq(db.prepare("SELECT statut_avant, statut_apres FROM courtage_actions WHERE fiche_id = ? ORDER BY id DESC LIMIT 1").get(f42).statut_avant, 'perdu'));
  r = await clore('43', '403', { proposee: true, accord: true });
  t('liste noire du courtage : appel gardé, rien de créé, motif rendu', () => { eq(r.statut, 201); eq(r.corps.courtage.ok, false);
    eq(db.prepare("SELECT COUNT(*) n FROM courtage_fiches WHERE nom = 'NOM43'").get().n, 0); eq(db.prepare("SELECT COUNT(*) n FROM acq_appels WHERE id_contact = '43'").get().n, 1); });
  r = await clore('46', '406', { proposee: true, accord: true });
  t('« ne plus contacter » chez Marine : l’appel lui-même est déjà bloqué', () => eq(r.statut, 409));
  t('et l’envoi direct est refusé aussi', () => { const x = C.transmettre('46', { par: 'Ada Admin' }); eq(x.ok, false);
    eq(db.prepare('SELECT priorite FROM courtage_fiches WHERE id = ?').get(f46).priorite, 2); });
  r = await clore('44', '404', { proposee: true, accord: false });
  t('proposé sans accord : rien ne part', () => { eq(r.corps.courtage, null); eq(db.prepare("SELECT COUNT(*) n FROM courtage_fiches WHERE nom = 'NOM44'").get().n, 0); });

  console.log('\nla série dédiée chez Marine');
  r = await req('ma@t.fr', 'GET', '/courtage/fiches/boites');
  t('deux fiches transmises à traiter, comptées à part', () => { eq(r.corps.transmises, 2); eq(r.corps.relancesPrevues, 0); });
  r = await req('ma@t.fr', 'GET', '/courtage/fiches/relances-jour?boite=acquereurs');
  t('la série ne contient qu’elles', () => { eq(r.corps.length, 2); eq(r.corps.every(f => f.categorie === 'acquereurs'), true); });
  const mois = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' }).slice(0, 7);
  r = await req('ma@t.fr', 'GET', `/courtage/fiches/relances-jour?boite=${mois}`);
  t('elles ne sont pas en double dans le mois en cours', () => eq(r.corps.some(f => f.categorie === 'acquereurs'), false));
  db.prepare("INSERT INTO courtage_actions (fiche_id, type, commentaire) VALUES (?, 'pas_de_reponse', null)").run(f42);
  r = await req('ma@t.fr', 'GET', '/courtage/fiches/boites');
  t('dès que Marine agit, la fiche passe dans ses relances', () => { eq(r.corps.transmises, 1); eq(r.corps.relancesPrevues, 1); });

  console.log('\nretour pour l’appelante');
  r = await req('l@t.fr', 'GET', '/acquereurs/contacts/41');
  t('transmise, pas encore traitée', () => { eq(r.corps.courtage.statut, 'en_relance'); eq(r.corps.courtage.derniere_action, null); });
  r = await req('ma@t.fr', 'PUT', `/courtage/fiches/${f41.id}/categorie`, { categorie: 'acquereurs' });
  t('la catégorie est connue de l’écran de Marine', () => eq(r.statut, 200));
  db.prepare("INSERT INTO courtage_actions (fiche_id, type, commentaire) VALUES (?, 'relance', 'Rappelée')").run(f41.id);
  db.prepare("UPDATE courtage_fiches SET statut = 'simulation_faite' WHERE id = ?").run(f41.id);
  r = await req('l@t.fr', 'GET', '/acquereurs/contacts/41');
  t('après une action de Marine', () => { eq(r.corps.courtage.statut_libelle, 'simulation faite'); eq(r.corps.courtage.derniere_action.libelle, 'relance'); });
  r = await req('l@t.fr', 'GET', '/acquereurs/contacts/44');
  t('jamais transmise : rien', () => eq(r.corps.courtage, null));

  console.log('\nespace admin');
  r = await req('adm@t.fr', 'GET', '/acquereurs/admin/transmettre');
  const M41 = r.corps.marine.find(x => x.id_contact === '41'), M45 = r.corps.marine.find(x => x.id_contact === '45'), M43 = r.corps.marine.find(x => x.id_contact === '43');
  t('transmise d’office : marquée faite, avec l’état chez Marine', () => { eq(!!M41.transmis_le, true); eq(M41.courtage.statut_libelle, 'simulation faite'); });
  t('accord d’avant : encore à envoyer', () => { eq(M45.pret, true); eq(M45.transmis_le, null); });
  t('refusée : reste à traiter', () => eq(M43.transmis_le, null));
  r = await req('adm@t.fr', 'POST', '/acquereurs/admin/transmettre', { id_contact: '45', type: 'MARINE' });
  t('le bouton envoie vraiment la fiche', () => { eq(r.statut, 200); eq(db.prepare("SELECT priorite FROM courtage_fiches WHERE nom = 'NOM45'").get().priorite, 0); });
  r = await req('adm@t.fr', 'POST', '/acquereurs/admin/transmettre', { id_contact: '43', type: 'MARINE' });
  t('et dit pourquoi quand c’est refusé', () => { eq(r.statut, 409); eq(/ne plus être contactée/.test(r.corps.error), true); });
  r = await req('l@t.fr', 'POST', '/acquereurs/admin/transmettre', { id_contact: '44', type: 'MARINE' });
  t('réservé à l’administration', () => eq(r.statut, 403));

  console.log(`\n${ok} OK, ${ko} KO`);
  process.exit(ko ? 1 : 0);
})();
