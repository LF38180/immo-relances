// Import de l'opération anciens clients.
//
// Deux choses comptent ici : ne perdre aucune fiche, et ne jamais abîmer un
// compte existant. La seconde est la plus coûteuse — écraser le mot de passe
// de Marine ou de Chrystelle, c'est leur bloquer l'accès un matin de lancement.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Base jetable : on ne teste pas sur la vraie.
const tmp = path.join(require('os').tmpdir(), 'op-import-test-' + Date.now() + '.db');
process.env.DB_PATH = tmp;

const { db } = require('../src/database');
const I = require('../src/utils/opImport');
const bcrypt = require('bcryptjs');

console.log('op-import.test.js');
const t = (n, fn) => { try { fn(); console.log('  OK  ' + n) } catch (e) { console.error('  FAIL ' + n + ' : ' + e.message); process.exitCode = 1 } };

const CSV = '/Users/loickferrucci/Downloads/anciens_clients_import.csv';
const dispo = fs.existsSync(CSV);
const texte = dispo ? fs.readFileSync(CSV, 'utf8') : null;

// --- Lecture du fichier ----------------------------------------------------
t('un champ contenant un saut de ligne ne coupe pas l enregistrement', () => {
  const brut = 'a;b;c\n1;"deux\nlignes";3\n4;cinq;6';
  const l = I.lignesDe(brut);
  assert.strictEqual(l.length, 3, 'attendu 3 lignes logiques, reçu ' + l.length);
  assert.deepStrictEqual(I.decouper(l[1]), ['1', 'deux\nlignes', '3']);
});

t('un guillemet doublé est un guillemet littéral', () => {
  const l = I.lignesDe('a;b\n1;"il a dit ""oui"""');
  assert.deepStrictEqual(I.decouper(l[1]), ['1', 'il a dit "oui"']);
});

t('un point-virgule entre guillemets ne découpe pas', () => {
  assert.deepStrictEqual(I.decouper('1;"a;b";3'), ['1', 'a;b', '3']);
});

t('le BOM Excel est ignoré', () => {
  const l = I.lignesDe('﻿id_modelo;nom\n1;DUPONT');
  assert.strictEqual(I.decouper(l[0])[0], 'id_modelo');
});

t('un fichier sans les bonnes colonnes est refusé', () => {
  const v = I.verifier('nom;prenom\nDUPONT;Jean');
  assert.ok(!v.ok); assert.ok(/[Cc]olonnes manquantes/.test(v.erreur));
});

t('« Tara ZOPPAS » se sépare en prénom et nom', () => {
  assert.deepStrictEqual(I.separerNom('Tara ZOPPAS'), { prenom: 'Tara', nom: 'ZOPPAS' });
  assert.deepStrictEqual(I.separerNom('Marie-Claire DE LA TOUR'), { prenom: 'Marie-Claire', nom: 'DE LA TOUR' });
});

// --- Import réel -----------------------------------------------------------
if (!dispo) {
  console.log('  -- fichier source absent, import réel non testé');
} else {
  t('la simulation n écrit rien', () => {
    const avant = db.prepare('SELECT COUNT(*) n FROM op_contacts').get().n;
    I.importer(texte, { simulation: true });
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM op_contacts').get().n, avant);
  });

  t('les 1088 contacts sont importés sans rejet', () => {
    const r = I.importer(texte, { motDePasseProvisoire: 'Provisoire2026' });
    assert.strictEqual(r.lignes_lues, 1088, 'lignes lues : ' + r.lignes_lues);
    assert.strictEqual(r.retenues, 1088, 'retenues : ' + r.retenues);
    assert.strictEqual(r.rejets.length, 0, 'rejets : ' + JSON.stringify(r.rejets));
    assert.strictEqual(r.doublons.length, 0);
  });

  t('les compteurs métier correspondent au fichier', () => {
    const n = (s) => db.prepare(s).get().n;
    assert.strictEqual(n('SELECT COUNT(*) n FROM op_contacts'), 1088);
    assert.strictEqual(n('SELECT COUNT(*) n FROM op_contacts WHERE a_dispatcher=1'), 363);
    assert.strictEqual(n('SELECT COUNT(*) n FROM op_contacts WHERE stop_telephone=1'), 11);
    assert.strictEqual(n("SELECT COUNT(*) n FROM op_contacts WHERE objectif_principal='ADRESSE'"), 307);
    assert.strictEqual(n('SELECT COUNT(*) n FROM op_contacts WHERE script=1'), 513);
    assert.strictEqual(n('SELECT COUNT(*) n FROM op_contacts WHERE script IN (3,4)'), 341);
  });

  t('les personnes morales sont retenues via leur raison sociale', () => {
    // Quatre fiches sans nom de famille : une association et trois sociétés.
    const r = db.prepare("SELECT nom FROM op_contacts WHERE id_modelo IN ('155538','158983','160948','156006')").all();
    assert.strictEqual(r.length, 4, 'les 4 personnes morales doivent être en base');
    r.forEach(x => assert.ok(x.nom && x.nom.trim(), 'une personne morale est sans nom'));
  });

  t('tous les conseillers du fichier ont un compte', () => {
    const sans = db.prepare(`
      SELECT DISTINCT conseiller FROM op_contacts
      WHERE conseiller IS NOT NULL
        AND LOWER(TRIM(conseiller)) NOT IN (SELECT LOWER(TRIM(prenom || ' ' || nom)) FROM users)`).all();
    assert.strictEqual(sans.length, 0, 'sans compte : ' + JSON.stringify(sans));
  });

  // --- La protection des comptes existants --------------------------------
  t('un compte existant garde son mot de passe et son rôle', () => {
    // On simule Marine : compte courtage avec son propre mot de passe.
    db.prepare(`UPDATE users SET role='courtage', password=?, must_change_password=0
                WHERE LOWER(email)='marine.rosain@lequai-immobilier.com'`)
      .run(bcrypt.hashSync('MotDePasseDeMarine', 10));

    I.importer(texte, { motDePasseProvisoire: 'Provisoire2026' });

    const m = db.prepare("SELECT role, password, must_change_password FROM users WHERE LOWER(email)='marine.rosain@lequai-immobilier.com'").get();
    assert.ok(bcrypt.compareSync('MotDePasseDeMarine', m.password), 'le mot de passe de Marine a été écrasé');
    assert.strictEqual(m.role, 'courtage', 'le rôle courtage de Marine a été changé');
    assert.strictEqual(m.must_change_password, 0, 'on force Marine à changer son mot de passe');
  });

  t('le réimport ne crée aucun doublon', () => {
    const avant = db.prepare('SELECT COUNT(*) n FROM op_contacts').get().n;
    const users = db.prepare('SELECT COUNT(*) n FROM users').get().n;
    const r = I.importer(texte, { motDePasseProvisoire: 'Provisoire2026' });
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM op_contacts').get().n, avant);
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM users').get().n, users);
    assert.strictEqual(r.creees, 0, 'un réimport ne doit rien créer');
    assert.strictEqual(r.majs, 1088);
  });

  t('une opposition saisie dans l application survit au réimport', () => {
    // Le fichier dit 0, l'application dit 1 : on garde le plus restrictif.
    const id = db.prepare('SELECT id_modelo FROM op_contacts WHERE stop_telephone=0 LIMIT 1').get().id_modelo;
    db.prepare('UPDATE op_contacts SET stop_telephone=1 WHERE id_modelo=?').run(id);
    I.importer(texte, {});
    const apres = db.prepare('SELECT stop_telephone FROM op_contacts WHERE id_modelo=?').get(id);
    assert.strictEqual(apres.stop_telephone, 1, 'le réimport a effacé une opposition');
  });

  t('l attribution faite dans l application survit au réimport', () => {
    const id = db.prepare('SELECT id_modelo FROM op_contacts WHERE a_dispatcher=1 LIMIT 1').get().id_modelo;
    db.prepare("UPDATE op_contacts SET conseiller='Tara ZOPPAS', a_dispatcher=0 WHERE id_modelo=?").run(id);
    I.importer(texte, {});
    const apres = db.prepare('SELECT conseiller, a_dispatcher FROM op_contacts WHERE id_modelo=?').get(id);
    assert.strictEqual(apres.conseiller, 'Tara ZOPPAS', 'le réimport a défait une attribution');
    assert.strictEqual(apres.a_dispatcher, 0);
  });
}

db.close();
fs.rmSync(tmp, { force: true });
fs.rmSync(tmp + '-wal', { force: true });
fs.rmSync(tmp + '-shm', { force: true });
