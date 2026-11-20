// Mission Acquéreurs : sortir des personnes de la mission à partir d'un fichier.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'acq-sortie-'));
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
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const j = await r.json().catch(() => null); srv.close();
  return { statut: r.status, corps: j };
};

const ENTETE = 'id_fiche;id_contact;civilite;nom;prenom;tel_portable;stop_tel;stop_mail;type_contact;suivi_par_contact;type_recherche;type_bien;alertes_a_verifier';
const L = (idf, idc, extra = {}) => { const o = { id_fiche: idf, id_contact: idc, civilite: 'Mme', nom: 'NOM' + idc, prenom: 'Zoé',
  tel_portable: '06000000' + idc, stop_tel: 'NON', stop_mail: 'NON', type_contact: 'Acquéreur', type_recherche: 'Achat', type_bien: 'Maison', ...extra };
  return ENTETE.split(';').map(k => o[k] ?? '').join(';'); };
const IMPORT = [ENTETE, L('101', '11'), L('102', '11'), L('103', '12'), L('104', '13'), L('105', '14'), L('106', '15', { stop_tel: 'OUI' }), L('107', '16')].join('\n');
const importer = (csv = IMPORT) => I.importer(csv, { madameFichier: 'Lila Essai', simulation: false });
const appel = (idc) => db.prepare("INSERT INTO acq_appels (id_contact, madame_fichier, issue, statut_final) VALUES (?, 'Lila Essai', 'JOINT', 'REQUALIFIE')").run(idc);

const SORTIE = ['id_contact;id_fiche;nom;prenom;statut_mission;motif;action_modelo;nouveau_suivi;ancien_conseiller_fiche',
  '11;101;NOM11;Zoé;sortie;Plus de projet d\'achat;archivé;;X',
  '11;102;NOM11;Zoé;sortie;Plus de projet d\'achat;archivé;;X',
  '12;103;nom12;Zoe;sortie;Repris en suivi;réattribué;Autre Conseillère;X',
  '13;104;AUTRE;Zoé;sortie;Plus de projet;archivé;;X',
  '15;106;NOM15;Zoé;sortie;Plus de projet;archivé;;X',
  '99;900;ABSENT;Luc;sortie;Plus de projet;archivé;;X'].join('\n');

(async () => {
  const b = importer();
  t('import de départ : 5 dans la file, 1 stop téléphone', () => { eq(b.dans_la_file, 5); eq(b.exclus.STOP_TEL, 1); });
  appel('11'); appel('12'); appel('14');
  t('3 personnes à reporter dans Modelo avant la sortie', () => eq(M.aReporter().length, 3));

  let r = await req('l@t.fr', 'POST', '/acquereurs/admin/sortir', { csv: SORTIE });
  t('réservé à l’admin', () => eq(r.statut, 403));
  r = await req('adm@t.fr', 'POST', '/acquereurs/admin/sortir', { csv: 'nom;prenom\nA;B' });
  t('fichier sans id_contact refusé', () => eq(r.statut, 400));

  r = await req('adm@t.fr', 'POST', '/acquereurs/admin/sortir', { csv: SORTIE });
  t('vérification : rien n’est écrit', () => { eq(r.corps.simulation, true);
    eq(db.prepare('SELECT COUNT(*) n FROM acq_hors_mission').get().n, 0);
    eq(db.prepare("SELECT COUNT(*) n FROM acq_contacts WHERE exclu = 'HORS_MISSION'").get().n, 0); });
  t('5 personnes lues pour 6 lignes', () => { eq(r.corps.lignes, 6); eq(r.corps.contacts, 5); });
  t('3 à sortir, 1 inconnue, 1 refusée sur le nom', () => { eq(r.corps.sortis.length, 3); eq(r.corps.inconnus.length, 1); eq(r.corps.rejetes.length, 1); eq(r.corps.rejetes[0].id_contact, '13'); });
  t('casse et accents du nom ignorés', () => eq(r.corps.sortis.some(s => s.id_contact === '12'), true));
  t('périmètre annoncé : 5 → 3', () => { eq(r.corps.avant.dans_la_file, 5); eq(r.corps.apres.dans_la_file, 3); });
  t('les appels pas encore reportés sont signalés', () => eq(r.corps.sortis.filter(s => s.a_reporter > 0).length, 2));

  r = await req('adm@t.fr', 'POST', '/acquereurs/admin/sortir', { csv: SORTIE, ecrire: true, fichier: 'sortie.csv' });
  t('enregistré : périmètre 5 → 3', () => { eq(r.corps.simulation, false); eq(r.corps.apres.dans_la_file, 3); });
  const c = (id) => db.prepare('SELECT exclu FROM acq_contacts WHERE id_contact = ?').get(id);
  t('les sortis sont hors de la file', () => { eq(c('11').exclu, 'HORS_MISSION'); eq(c('12').exclu, 'HORS_MISSION'); });
  t('un stop téléphone garde son motif', () => eq(c('15').exclu, 'STOP_TEL'));
  t('la refusée n’est pas touchée', () => eq(c('13').exclu, null));
  t('l’inconnue est notée pour le prochain import', () => eq(db.prepare("SELECT motif FROM acq_hors_mission WHERE id_contact = '99'").get().motif, 'Plus de projet'));
  t('rien n’est effacé', () => { eq(db.prepare('SELECT COUNT(*) n FROM acq_fiches').get().n, 7); eq(db.prepare('SELECT COUNT(*) n FROM acq_appels').get().n, 3); });
  t('plus de ligne de report pour les sortis', () => { const a = M.aReporter().map(x => x.id_contact); eq(a.join(','), '14'); });
  r = await req('l@t.fr', 'GET', '/acquereurs/file');
  t('la file de la conseillère ne les propose plus', () => {
    const ids = JSON.stringify(r.corps); eq(/"id_contact":"11"/.test(ids), false); eq(/"id_contact":"14"/.test(ids), true); });

  r = await req('adm@t.fr', 'POST', '/acquereurs/admin/sortir', { csv: SORTIE, ecrire: true });
  t('deuxième passage : rien de plus', () => { eq(r.corps.sortis.length, 0); eq(r.corps.deja.length, 4); });

  const b2 = importer([IMPORT, L('900', '99'), L('108', '11')].join('\n'));
  t('réimport : les sortis ne reviennent pas, même avec une fiche nouvelle', () => { eq(c('11').exclu, 'HORS_MISSION'); eq(c('12').exclu, 'HORS_MISSION'); });
  t('réimport : l’inconnue arrive déjà hors mission', () => eq(c('99').exclu, 'HORS_MISSION'));
  t('le bilan d’import le dit', () => eq(b2.exclus.HORS_MISSION, 3));

  r = await req('adm@t.fr', 'GET', '/acquereurs/admin/contacts');
  t('le motif s’affiche dans les personnes hors de la file', () => {
    eq(r.corps.contacts.find(x => x.id_contact === '11').sorti_motif, 'Plus de projet d\'achat'); eq(r.corps.libelles.HORS_MISSION, 'Sorti hors mission'); });

  r = await req('adm@t.fr', 'POST', '/acquereurs/admin/contacts/12/reintegrer', {});
  t('remise dans la file', () => { eq(r.statut, 200); eq(c('12').exclu, null); });
  importer();
  t('et elle y reste au prochain import', () => eq(c('12').exclu, null));
  t('la sortie levée garde sa ligne', () => eq(!!db.prepare("SELECT leve_le FROM acq_hors_mission WHERE id_contact = '12'").get().leve_le, true));

  console.log(`\n${ok} OK, ${ko} KO`);
  process.exit(ko ? 1 : 0);
})();
