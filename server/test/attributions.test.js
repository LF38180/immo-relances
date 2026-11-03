// Journal des attributions : qui a reçu quelle fiche, de qui, par qui, quand.
//
// Avant lui, un lot de 51 fiches réparties un dimanche ne se retrouvait qu'en
// comparant deux exports CSV à la main. Le test fige : l'écriture dans les deux
// routes (lot et correction), la synthèse du suivi, la trace sur la fiche.
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'attrib-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'dev';

const { db } = require('../src/database.js');
let ok = 0, ko = 0;
const t = async (n, f) => { try { await f(); console.log('  ok  ', n); ok++; }
  catch (e) { console.log('  KO  ', n, '→', e.message); ko++; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };
const vrai = (a, m) => { if (!a) throw new Error(m || 'attendu vrai'); };

db.prepare(`INSERT INTO users (email, password, prenom, nom, role, agence, actif) VALUES
  ('l@t.fr','x','Loïck','Ferrucci','admin',NULL,1),
  ('g@t.fr','x','Gilles','Manager','manager','SAINT-EGREVE',1),
  ('a@t.fr','x','Alex','Agent','conseiller','LE QUAI',1),
  ('b@t.fr','x','Bea','Agent','conseiller','SAINT-EGREVE',1)`).run();
const express = require('express'), jwt = require('jsonwebtoken');
const app = express(); app.use(express.json());
app.use('/operation', require('../src/routes/opRoutes.js'));
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
const fiche = (id, extra = {}) => {
  const c = { id_modelo: id, nom: 'N' + id, prenom: 'P', conseiller: null, agence: 'LE QUAI',
    script: 3, courrier_etat: 'ENVOYE', a_dispatcher: 1, tel_portable: '0639980001',
    conseiller_precedent: 'Charlotte Partie', ...extra };
  const cols = Object.keys(c);
  db.prepare(`INSERT INTO op_contacts (${cols.join(',')}) VALUES (${cols.map(k => '@' + k).join(',')})`).run(c);
};
fiche('O-1'); fiche('O-2'); fiche('O-3');
fiche('S-1', { conseiller: 'Alex Agent', a_dispatcher: 0, conseiller_precedent: null });

(async () => {
  await t('la table op_attributions existe', () => {
    vrai(db.prepare("SELECT name FROM sqlite_master WHERE name = 'op_attributions'").get());
  });

  // --- lot --------------------------------------------------------------
  const lot = await req('l@t.fr', 'POST', '/operation/dispatch', { ids: ['O-1', 'O-2'], conseiller: 'Alex Agent' });
  await t('le lot est attribué', () => { eq(lot.statut, 200); eq(lot.corps.attribuees, 2); });
  await t('deux lignes de journal, source REPARTITION, auteur Loïck', () => {
    const l = db.prepare("SELECT * FROM op_attributions ORDER BY id").all();
    eq(l.length, 2);
    eq(l[0].vers, 'Alex Agent'); eq(l[0].de, null); eq(l[0].par, 'Loïck Ferrucci');
    eq(l[0].source, 'REPARTITION'); vrai(l[0].le);
  });
  await t('un lot rejoué ne journalise rien (fiches déjà attribuées)', async () => {
    const r = await req('l@t.fr', 'POST', '/operation/dispatch', { ids: ['O-1'], conseiller: 'Bea Agent' });
    eq(r.corps.attribuees, 0);
    eq(db.prepare('SELECT COUNT(*) n FROM op_attributions').get().n, 2);
  });

  // --- correction -------------------------------------------------------
  const corr = await req('l@t.fr', 'PUT', '/operation/contacts/O-1/attribution', { conseiller: 'Bea Agent' });
  await t('la correction réattribue et journalise de → vers', () => {
    eq(corr.statut, 200);
    const l = db.prepare("SELECT * FROM op_attributions WHERE id_modelo = 'O-1' ORDER BY id DESC").get();
    eq(l.de, 'Alex Agent'); eq(l.vers, 'Bea Agent'); eq(l.source, 'CORRECTION');
  });
  await t('corriger le script sans toucher au conseiller ne journalise pas', async () => {
    const avant = db.prepare('SELECT COUNT(*) n FROM op_attributions').get().n;
    await req('l@t.fr', 'PUT', '/operation/contacts/O-1/attribution', { script: 4 });
    eq(db.prepare('SELECT COUNT(*) n FROM op_attributions').get().n, avant);
  });
  await t('remettre la même personne ne journalise pas', async () => {
    const avant = db.prepare('SELECT COUNT(*) n FROM op_attributions').get().n;
    await req('l@t.fr', 'PUT', '/operation/contacts/O-1/attribution', { conseiller: 'Bea Agent' });
    eq(db.prepare('SELECT COUNT(*) n FROM op_attributions').get().n, avant);
  });
  await t('renvoyer au pot commun journalise vers = null', async () => {
    await req('l@t.fr', 'PUT', '/operation/contacts/O-2/attribution', { conseiller: '' });
    const l = db.prepare("SELECT * FROM op_attributions WHERE id_modelo = 'O-2' ORDER BY id DESC").get();
    eq(l.de, 'Alex Agent'); eq(l.vers, null);
  });

  // --- synthèse ---------------------------------------------------------
  const s = await req('l@t.fr', 'GET', '/operation/attributions');
  await t('la synthèse regroupe par jour', () => {
    eq(s.statut, 200);
    eq(s.corps.jours.length, 1);
    const j = s.corps.jours[0];
    vrai(j.le); eq(j.total, 4);
  });
  await t('par jour, le détail par conseiller et par auteur', () => {
    const j = s.corps.jours[0];
    const alex = j.par_conseiller.find(x => x.conseiller === 'Alex Agent');
    eq(alex.attribuees, 2, 'Alex reçoit 2 par lot'); eq(alex.retirees, 2, 'puis perd 2');
    const bea = j.par_conseiller.find(x => x.conseiller === 'Bea Agent');
    eq(bea.reattribuees, 1);
    eq(j.par_auteur[0].par, 'Loïck Ferrucci'); eq(j.par_auteur[0].n, 4);
  });
  await t('le détail nominatif d’un jour', async () => {
    const d = await req('l@t.fr', 'GET', `/operation/attributions?jour=${s.corps.jours[0].le}`);
    eq(d.corps.lignes.length, 4);
    vrai(d.corps.lignes.every(l => l.nom && 'de' in l && 'vers' in l && l.par));
  });
  await t('un manager d’agence ne voit que les mouvements de son périmètre', async () => {
    // O-1 est passée à Bea (Saint-Égrève) : l'agence de la fiche a suivi.
    const r = await req('g@t.fr', 'GET', '/operation/attributions');
    eq(r.statut, 200);
    // Deux mouvements sur O-1 (lot puis correction), rien sur O-2 (LE QUAI).
    eq(r.corps.jours[0].total, 2);
  });
  await t('un conseiller n’a pas accès à la synthèse', async () => {
    eq((await req('a@t.fr', 'GET', '/operation/attributions')).statut, 403);
  });

  // --- trace sur la fiche ------------------------------------------------
  await t('le listing porte la dernière attribution', async () => {
    const r = await req('l@t.fr', 'GET', '/operation/listing');
    const o1 = r.corps.lignes.find(l => l.id_modelo === 'O-1');
    eq(o1.attribuee_le?.slice(0, 10), new Date().toISOString().slice(0, 10));
    eq(o1.attribuee_par, 'Loïck Ferrucci'); eq(o1.attribuee_de, 'Alex Agent');
    const s1 = r.corps.lignes.find(l => l.id_modelo === 'S-1');
    eq(s1.attribuee_le, null, 'fiche jamais réattribuée');
  });
  await t('la fiche ouverte porte attribuee_le (écran d’appel)', async () => {
    const r = await req('b@t.fr', 'GET', '/operation/contacts/O-1');
    eq(r.statut, 200);
    vrai(r.corps.contact.attribuee_le);
    eq(r.corps.contact.attribuee_par, undefined, 'le conseiller ne voit pas l’auteur');
  });
  await t('le conseiller ne voit pas attribuee_par dans sa file', async () => {
    const r = await req('b@t.fr', 'GET', '/operation/file');
    const f = r.corps.file.find(x => x.id_modelo === 'O-1');
    vrai(f, 'O-1 dans la file de Bea'); vrai(f.attribuee_le); eq(f.attribuee_par, undefined);
  });

  // --- reprise d'un lot passé -------------------------------------------
  await t('la reprise insère des mouvements datés, marqués reprise', async () => {
    const r = await req('l@t.fr', 'POST', '/operation/attributions/reprise',
      { le: '2026-11-02', lignes: [{ id_modelo: 'O-3', vers: 'Alex Agent' }, { id_modelo: 'ZZZ', vers: 'Alex Agent' }] });
    eq(r.statut, 200); eq(r.corps.inserees, 1); eq(r.corps.inconnues, 1);
    const l = db.prepare("SELECT * FROM op_attributions WHERE id_modelo = 'O-3'").get();
    eq(l.reprise, 1); eq(l.source, 'REPRISE'); eq(l.le, '2026-11-02 12:00:00'); eq(l.par, 'Loïck Ferrucci');
  });
  await t('rejouer la reprise n’insère rien', async () => {
    const r = await req('l@t.fr', 'POST', '/operation/attributions/reprise',
      { le: '2026-11-02', lignes: [{ id_modelo: 'O-3', vers: 'Alex Agent' }] });
    eq(r.corps.inserees, 0); eq(r.corps.deja, 1);
  });
  await t('la reprise apparaît dans la synthèse au 2 novembre', async () => {
    const r = await req('l@t.fr', 'GET', '/operation/attributions');
    const j = r.corps.jours.find(x => x.le === '2026-11-02');
    vrai(j); eq(j.total, 1); eq(j.reprise, 1);
  });
  await t('un manager ne peut pas lancer une reprise', async () => {
    eq((await req('g@t.fr', 'POST', '/operation/attributions/reprise', { le: '2026-11-02', lignes: [] })).statut, 403);
  });

  console.log(`\n${ok} ok, ${ko} ko`);
  process.exit(ko ? 1 : 0);
})();
