// Mission Estimés : import du rapprochement avec Modelo (contact et biens).
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'est-rappr-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };

db.prepare("DELETE FROM users").run();
db.prepare(`INSERT INTO users (email, password, prenom, nom, role, actif) VALUES
  ('adm@t.fr','x','Ada','Admin','admin',1), ('m@t.fr','x','Marie','Manager','manager',1)`).run();
const fiche = (nom, extra = {}) => { const c = { nom, prenom: 'Zoé', telephone: '0600000000', ...extra }; const k = Object.keys(c);
  return db.prepare(`INSERT INTO contacts (${k.join(',')}) VALUES (${k.map(x => '@' + x).join(',')})`).run(c).lastInsertRowid; };
const A = fiche('ALPHA'), B = fiche('BÊTA & Cie'), C = fiche('GAMMA'), D = fiche('DELTA'), E = fiche('EPSILON');
const autre = db.prepare("INSERT INTO blocs (code, libelle) VALUES ('acquereurs', 'Autre fichier')").run().lastInsertRowid;
const HORS = fiche('HORS', { bloc_id: autre });
const SUPPR = fiche('SUPPRIMEE', { supprime_le: '2026-01-01' });
const avant = db.prepare('SELECT COUNT(*) n FROM contacts').get().n;

const express = require('express'), jwt = require('jsonwebtoken');
const app = express(); app.use(express.json({ limit: '5mb' }));
app.use('/admin', require('../src/routes/adminRoutes.js'));
const req = async (email, methode, url, corps) => {
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const jeton = jwt.sign({ id: u.id, email: u.email, role: u.role }, process.env.JWT_SECRET);
  const srv = app.listen(0);
  const r = await fetch(`http://127.0.0.1:${srv.address().port}${url}`, { method: methode,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` }, body: corps ? JSON.stringify(corps) : undefined });
  const j = await r.json().catch(() => null); srv.close();
  return { statut: r.status, corps: j };
};

const COLS = ['id', 'nom', 'prenom', 'telephone', 'notes', 'id_contact', 'id_bien', 'adresse_bien', 'date_estimation', 'statut_bien', 'bien_archive',
  'conseiller_bien', 'suivi_par_contact', 'contact_archive', 'stop_tel', 'stop_mail', 'rapprochement', 'methode', 'remarque', 'ref_ancienne',
  'proprietaire', 'agence_bien', 'prix_estime', 'id_bien_interne'];
const cel = (v) => { const x = String(v ?? ''); return /[,"\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
const L = (o) => COLS.map(k => cel({ prenom: 'Zoé', bien_archive: 'Non', contact_archive: 'Non', stop_tel: 'Non', stop_mail: 'Non',
  conseiller_bien: 'Loick FERRUCCI', suivi_par_contact: '(aucun) - ancien : X', statut_bien: 'Estimation · actif', rapprochement: 'sûr',
  agence_bien: 'Meylan', proprietaire: 'principal', ...o }[k])).join(',');
const csv = (...l) => '﻿' + [COLS.join(','), ...l].join('\n');
const FICHIER = csv(
  L({ id: A, nom: 'ALPHA', id_contact: '9001', id_bien: 'EA100', ref_ancienne: '2589- LOT 1', prix_estime: '250000', date_estimation: '2021-03-04', notes: 'Réf 2589, "lot" 1\nsuite' }),
  L({ id: B, nom: 'beta & cie', id_contact: '9002', id_bien: 'EM200', prix_estime: '99999999.99', remarque: 'doublon contact : autre contact n° 9003' }),
  L({ id: B, nom: 'BÊTA & Cie', id_contact: '9003', id_bien: 'EA201', rapprochement: 'probable', statut_bien: 'Prospection · actif', remarque: 'doublon contact : autre contact n° 9002' }),
  L({ id: C, nom: 'GAMMA', id_contact: '', id_bien: '', rapprochement: 'introuvable', statut_bien: '', bien_archive: '', contact_archive: '' }),
  L({ id: D, nom: 'UN AUTRE NOM', id_contact: '9004', id_bien: 'EA300' }),
  L({ id: HORS, nom: 'HORS', id_contact: '9005', id_bien: 'EA400' }),
  L({ id: SUPPR, nom: 'SUPPRIMEE', id_contact: '9006', id_bien: 'EA500' }),
  L({ id: 999999, nom: 'INCONNUE', id_contact: '9007', id_bien: 'EA600' }),
  L({ id: E, nom: 'EPSILON', id_contact: '', id_bien: 'EA700' }),
  L({ id: A, nom: 'ALPHA', id_contact: '9001', id_bien: 'EA100' }),
);

(async () => {
  let r = await req('m@t.fr', 'POST', '/admin/estimes/rapprochement', { csv: FICHIER });
  t('réservé à l’admin', () => eq(r.statut, 403));
  r = await req('adm@t.fr', 'POST', '/admin/estimes/rapprochement', { csv: 'nom,prenom\nA,B' });
  t('fichier sans les colonnes attendues : refusé', () => eq(r.statut, 400));

  r = await req('adm@t.fr', 'POST', '/admin/estimes/rapprochement', { csv: FICHIER });
  t('vérification : rien n’est écrit', () => { eq(r.corps.simulation, true); eq(db.prepare('SELECT COUNT(*) n FROM est_modelo_liens').get().n, 0); });
  t('10 lignes lues, 4 retenues, 6 refusées', () => { eq(r.corps.lignes_lues, 10); eq(r.corps.lignes, 4); eq(r.corps.rejets.length, 6); });
  t('3 fiches, 3 biens : 2 sûrs, 1 probable, 1 introuvable', () => { eq(r.corps.fiches, 3); eq(r.corps.biens, 3); eq(r.corps.surs, 2); eq(r.corps.probables, 1); eq(r.corps.introuvables, 1); });
  t('une fiche à 1 bien, une à plusieurs, une sans bien', () => { eq(r.corps.fiches_un_bien, 1); eq(r.corps.fiches_plusieurs_biens, 1); eq(r.corps.fiches_sans_bien, 1); });
  t('une fiche reliée à deux contacts Modelo', () => eq(r.corps.fiches_deux_contacts, 1));
  t('motifs de refus lisibles', () => { const m = r.corps.rejets.map(x => x.motif).join(' | ');
    for (const mot of ['nom ne correspond pas', 'hors de la Mission', 'inconnue', 'manquant', 'double']) if (!m.includes(mot)) throw new Error('manque « ' + mot + ' » : ' + m); });
  t('un nom qui ne diffère que par la casse ou les accents passe', () => eq(r.corps.rejets.some(x => String(x.id) === String(B)), false));

  r = await req('adm@t.fr', 'POST', '/admin/estimes/rapprochement', { csv: FICHIER, ecrire: true, fichier: 'rapprochement.csv' });
  t('enregistré : 4 lignes nouvelles', () => { eq(r.corps.simulation, false); eq(r.corps.nouvelles, 4); eq(db.prepare('SELECT COUNT(*) n FROM est_modelo_liens').get().n, 4); });
  const l = (id, bien) => db.prepare("SELECT * FROM est_modelo_liens WHERE contact_id = ? AND COALESCE(id_bien,'') = ?").get(id, bien || '');
  t('le bien, son contact et ses champs sont gardés', () => { const x = l(A, 'EA100'); eq(x.id_contact, '9001'); eq(x.rapprochement, 'SUR');
    eq(x.ref_ancienne, '2589- LOT 1'); eq(x.prix_estime, 250000); eq(x.date_estimation, '2021-03-04'); eq(x.bien_archive, 0); eq(x.importe_par, 'Ada Admin'); });
  t('l’introuvable garde une ligne sans bien', () => { const x = l(C); eq(x.rapprochement, 'INTROUVABLE'); eq(x.id_bien, null); });
  t('la table des contacts n’a pas bougé', () => eq(db.prepare('SELECT COUNT(*) n FROM contacts').get().n, avant));
  t('la fiche au nom différent n’a aucun lien', () => eq(db.prepare('SELECT COUNT(*) n FROM est_modelo_liens WHERE contact_id = ?').get(D).n, 0));

  r = await req('adm@t.fr', 'GET', '/admin/estimes/rapprochement');
  t('état : 5 fiches dans la mission, 3 liées, 2 sans lien', () => { eq(r.corps.fiches_mission, 5); eq(r.corps.fiches_liees, 3); eq(r.corps.fiches_sans_lien, 2);
    eq(r.corps.biens, 3); eq(r.corps.probables, 1); eq(r.corps.introuvables, 1); eq(r.corps.fiches_plusieurs_biens, 1); eq(r.corps.fiches_deux_contacts, 1); });

  // Second fichier : un bien confirmé, un bien retiré, un nouveau.
  const V2 = csv(
    L({ id: B, nom: 'BÊTA & Cie', id_contact: '9002', id_bien: 'EM200' }),
    L({ id: B, nom: 'BÊTA & Cie', id_contact: '9002', id_bien: 'EA202' }),
    L({ id: C, nom: 'GAMMA', id_contact: '9010', id_bien: 'EA900' }),
  );
  r = await req('adm@t.fr', 'POST', '/admin/estimes/rapprochement', { csv: V2 });
  t('réimport vérifié : 2 nouvelles, 1 mise à jour, 2 retirées', () => { eq(r.corps.nouvelles, 2); eq(r.corps.mises_a_jour, 1); eq(r.corps.retirees, 2); });
  r = await req('adm@t.fr', 'POST', '/admin/estimes/rapprochement', { csv: V2, ecrire: true });
  t('rien n’est supprimé : les lignes retirées restent, marquées', () => { eq(db.prepare('SELECT COUNT(*) n FROM est_modelo_liens').get().n, 6);
    eq(!!l(B, 'EA201').retire_le, true); eq(!!l(C).retire_le, true); eq(l(B, 'EM200').retire_le, null); });
  t('une fiche absente du second fichier garde ses liens', () => eq(l(A, 'EA100').retire_le, null));
  t('état après réimport', () => { eq(r.corps.etat.biens, 4); eq(r.corps.etat.introuvables, 0); eq(r.corps.etat.fiches_liees, 3); });
  r = await req('adm@t.fr', 'POST', '/admin/estimes/rapprochement', { csv: csv(L({ id: B, nom: 'BÊTA & Cie', id_contact: '9003', id_bien: 'EA201', rapprochement: 'sûr' })), ecrire: true });
  t('un bien retiré revient s’il réapparaît', () => { eq(l(B, 'EA201').retire_le, null); eq(l(B, 'EA201').rapprochement, 'SUR'); });

  console.log(`\n${ok} OK, ${ko} KO`);
  process.exit(ko ? 1 : 0);
})();
