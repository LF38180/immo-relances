// La sauvegarde de la base : copie fidèle, lisible, et rotation.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sauv-'));
process.env.DB_PATH = path.join(tmp, 'immo.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
const S = require('../src/sauvegarde.js');
const Database = require('better-sqlite3');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };
const vrai = (a, m) => { if (!a) throw new Error(m || 'attendu vrai'); };

// Des données à retrouver dans la copie.
for (let i = 1; i <= 50; i++) {
  db.prepare(`INSERT INTO op_contacts (id_modelo,nom,prenom,conseiller,agence,script,courrier_etat,a_dispatcher)
    VALUES (?,?,'P','Alex Agent','LE QUAI',1,'ENVOYE',0)`).run('S-' + i, 'Nom' + i);
}

(async () => {
  console.log('\nla copie');
  const f = await S.sauvegarder();
  t('un fichier est produit', () => vrai(fs.existsSync(f), f));
  t('il est nommé par sa date', () => vrai(/immo-\d{4}-\d{2}-\d{2}-\d{4}\.db$/.test(f), f));
  t('il est dans le dossier des sauvegardes, à côté de la base', () => {
    eq(path.dirname(f), path.join(tmp, 'sauvegardes'));
  });

  console.log('\nla copie est une vraie base, complète');
  const copie = new Database(f, { readonly: true });
  t('elle s\'ouvre', () => vrai(copie));
  t('elle contient les 50 fiches', () => {
    eq(copie.prepare('SELECT COUNT(*) n FROM op_contacts').get().n, 50);
  });
  t('elle contient les comptes', () => {
    vrai(copie.prepare('SELECT COUNT(*) n FROM users').get().n >= 1);
  });
  t('son intégrité est bonne', () => {
    eq(copie.pragma('integrity_check', { simple: true }), 'ok');
  });
  copie.close();

  console.log('\nla base de travail n\'est pas gênée');
  t('on écrit toujours dans la base pendant et après', () => {
    db.prepare(`INSERT INTO op_contacts (id_modelo,nom,prenom,conseiller,agence,script,courrier_etat,a_dispatcher)
      VALUES ('S-51','Nom51','P','Alex Agent','LE QUAI',1,'ENVOYE',0)`).run();
    eq(db.prepare('SELECT COUNT(*) n FROM op_contacts').get().n, 51);
  });
  t('la copie, elle, n\'a pas bougé', () => {
    const c = new Database(f, { readonly: true });
    eq(c.prepare('SELECT COUNT(*) n FROM op_contacts').get().n, 50);
    c.close();
  });

  console.log('\nla rotation');
  const dossier = path.join(tmp, 'sauvegardes');
  // 25 fichiers factices aux bons noms, datés d'hier et avant.
  for (let i = 1; i <= 25; i++) {
    fs.writeFileSync(path.join(dossier, `immo-2026-10-${String(i).padStart(2, '0')}-0600.db`), 'x');
  }
  const avant = S.lister().length;
  const retirees = S.nettoyer();
  const apres = S.lister().length;
  t('les plus anciennes sont retirées', () => vrai(retirees.length > 0, 'rien retiré'));
  t('il en reste 20', () => eq(apres, 20, `avant ${avant}`));
  t('la copie fraîche d\'aujourd\'hui est gardée', () => vrai(fs.existsSync(f)));
  t('ce sont bien les plus anciennes qui partent', () => {
    vrai(retirees.every(n => n.startsWith('immo-2026-10-0')), retirees.join(','));
  });

  console.log('\nla liste');
  const liste = S.lister();
  t('la liste donne nom, taille et date', () => {
    vrai(liste.length > 0);
    vrai(liste[0].nom && liste[0].octets > 0 && liste[0].le);
  });
  t('la plus récente est en tête', () => vrai(liste[0].nom === path.basename(f), liste[0].nom));

  console.log('\nun fichier étranger dans le dossier est ignoré');
  fs.writeFileSync(path.join(dossier, 'notes.txt'), 'rien');
  t('nettoyer ne touche pas aux autres fichiers', () => {
    S.nettoyer();
    vrai(fs.existsSync(path.join(dossier, 'notes.txt')));
  });

  console.log(`\n${ok} ok, ${ko} ko`);
  process.exit(ko ? 1 : 0);
})();
