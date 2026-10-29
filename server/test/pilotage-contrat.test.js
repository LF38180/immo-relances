// Le contrat entre /pilotage et l'écran de Suivi.
//
// Deux bugs trouvés le 29 octobre, tous deux invisibles tant qu'aucun appel
// n'avait été passé :
//
//  - la grande tuile lisait `actualisations`, le serveur renvoie `estimations` :
//    l'indicateur principal serait resté à zéro toute l'opération ;
//  - l'écran lisait `appels_par_jour.length` sur un champ retiré du serveur,
//    ce qui levait un TypeError et laissait l'onglet Suivi blanc.
//
// Ce test fige les noms de champs. Il échoue si l'un disparaît.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pil-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
let ok = 0, ko = 0;
const t = (n, f) => { try { f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const vrai = (a, m) => { if (!a) throw new Error(m || 'attendu vrai'); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };

db.prepare(`INSERT INTO users (email, password, prenom, nom, role, agence, actif)
  VALUES ('m@lequai-immobilier.com','x','Marie','Manager','manager','LE QUAI',1)
  ON CONFLICT(email) DO UPDATE SET role='manager', actif=1`).run();

const express = require('express'), jwt = require('jsonwebtoken');
const app = express(); app.use(express.json());
app.use('/operation', require('../src/routes/opRoutes.js'));
const req = async (url) => {
  const u = db.prepare("SELECT * FROM users WHERE email='m@lequai-immobilier.com'").get();
  const jeton = jwt.sign({ id: u.id, email: u.email, role: u.role }, process.env.JWT_SECRET);
  const srv = app.listen(0);
  const r = await fetch(`http://127.0.0.1:${srv.address().port}${url}`,
    { headers: { Authorization: `Bearer ${jeton}` } });
  const j = await r.json().catch(() => null);
  srv.close();
  return { statut: r.status, corps: j };
};

db.prepare(`INSERT INTO op_contacts (id_modelo,nom,prenom,conseiller,agence,script,courrier_etat,a_dispatcher)
  VALUES ('P-1','Durand','Paul','Marie Manager','LE QUAI',1,'ENVOYE',0)`).run();

(async () => {
  const { statut, corps } = await req('/operation/pilotage');
  t('le pilotage répond', () => eq(statut, 200, JSON.stringify(corps)?.slice(0, 150)));

  // Ce que l'écran lit comme tableau : un champ absent plante la page.
  console.log('\nles listes que l\'écran parcourt');
  for (const champ of ['avancement', 'rappels_du_jour', 'appels_par_jour', 'refus_recents', 'signaux']) {
    t(`${champ} est un tableau`, () => {
      vrai(Array.isArray(corps[champ]), `${champ} = ${JSON.stringify(corps[champ])}`);
    });
  }

  console.log('\nles compteurs que les tuiles affichent');
  for (const champ of ['estimations', 'soiree', 'panneau', 'adresses_maj',
                       'courriers_renvoyes', 'fiches_a_jour']) {
    t(`resultats.${champ} existe`, () => {
      vrai(corps.resultats && champ in corps.resultats,
        `absent de ${JSON.stringify(Object.keys(corps.resultats || {}))}`);
    });
  }

  t('la grande tuile ne lit pas un champ inexistant', () => {
    // `actualisations` n'existe pas : c'est `estimations`. Si quelqu'un
    // réintroduit le mauvais nom côté serveur, ce test le dira.
    vrai(!('actualisations' in corps.resultats),
      'le serveur renvoie maintenant `actualisations` — vérifier que l\'écran lit le bon champ');
  });

  console.log('\nla synthèse des courriers revenus');
  for (const champ of ['total', 'par_conseiller', 'par_jour', 'a_dispatcher']) {
    t(`npai.${champ} existe`, () => vrai(corps.npai && champ in corps.npai));
  }
  t('npai.par_conseiller et par_jour sont des tableaux', () => {
    vrai(Array.isArray(corps.npai.par_conseiller));
    vrai(Array.isArray(corps.npai.par_jour));
  });

  console.log(`\n${ok} ok, ${ko} ko`);
  process.exit(ko ? 1 : 0);
})();
