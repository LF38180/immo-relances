// Teste le moteur d'import du cahier des messages : normalisations, regles de
// categorisation, latence, puis la route HTTP (idempotence, doublons, liste noire,
// simulation, acces). FIXTURES FABRIQUEES — aucune donnee client reelle.
const { spawn } = require('child_process');
const L = require('../src/utils/courtageImport');

function test(n, ok, detail) { if (ok) console.log('  OK  ' + n); else { console.error('  FAIL ' + n + (detail ? ' : ' + detail : '')); process.exitCode = 1 } }

console.log('courtage-import.test.js');

// --- normaliserTexte -------------------------------------------------------
test('normaliserTexte : accents, casse, espaces', L.normaliserTexte('  Nôn   Qualifié ') === 'NON QUALIFIE', L.normaliserTexte('  Nôn   Qualifié '));
test('normaliserTexte : null -> chaine vide', L.normaliserTexte(null) === '');

// --- normaliserTelephone ---------------------------------------------------
test('tel : 33771027363 (number) -> 0771027363', L.normaliserTelephone(33771027363) === '0771027363', String(L.normaliserTelephone(33771027363)));
test('tel : "07 68 81 26 55" -> 0768812655', L.normaliserTelephone('07 68 81 26 55') === '0768812655', String(L.normaliserTelephone('07 68 81 26 55')));
test('tel : "06.13.51.67.06" -> 0613516706', L.normaliserTelephone('06.13.51.67.06') === '0613516706', String(L.normaliserTelephone('06.13.51.67.06')));
test('tel : "+33 6 12 34 56 78" -> 0612345678', L.normaliserTelephone('+33 6 12 34 56 78') === '0612345678', String(L.normaliserTelephone('+33 6 12 34 56 78')));
test('tel : "TEL" -> null', L.normaliserTelephone('TEL') === null, String(L.normaliserTelephone('TEL')));
test('tel : serie de date Excel (45870) implausible -> null', L.normaliserTelephone(45870) === null, String(L.normaliserTelephone(45870)));
test('tel : vide -> null', L.normaliserTelephone('') === null && L.normaliserTelephone(null) === null);
test('tel : 9 chiffres sans 0 initial -> 0 ajoute', L.normaliserTelephone(612345678) === '0612345678', String(L.normaliserTelephone(612345678)));

// --- causeFauxNumero : ecarter les numeros bidons sans jamais ecarter un vrai ---------
const faux = (n) => L.causeFauxNumero(L.normaliserTelephone(n));
test('faux : 0600000001 (remplissage) detecte', !!faux('0600000001'), String(faux('0600000001')));
test('faux : 0700000000 (remplissage) detecte', !!faux('0700000000'), String(faux('0700000000')));
test('faux : 0000000000 detecte', !!faux('0000000000'), String(faux('0000000000')));
test('faux : 1111111111 (chiffre repete) detecte', !!faux('1111111111'), String(faux('1111111111')));
test('faux : 0123456789 (suite) detecte', !!faux('0123456789'), String(faux('0123456789')));
test('faux : 0606060606 (repetitif) detecte', !!faux('0606060606'), String(faux('0606060606')));
test('faux : 0012345678 (indicatif 0) detecte', !!faux('0012345678'), String(faux('0012345678')));
// Aucun vrai numero ne doit etre ecarte : c'est le risque a eviter absolument.
test('vrai : 0612345678 conserve', faux('0612345678') === null, String(faux('0612345678')));
test('vrai : 0476123456 (fixe Grenoble) conserve', faux('0476123456') === null, String(faux('0476123456')));
test('vrai : 0755667788 conserve', faux('0755667788') === null, String(faux('0755667788')));
test('vrai : 0699887766 conserve', faux('0699887766') === null, String(faux('0699887766')));
test('vrai : +33 6 12 34 56 78 conserve', faux('+33 6 12 34 56 78') === null, String(faux('+33 6 12 34 56 78')));

// --- normaliserMail --------------------------------------------------------
test('mail : casse et espaces', L.normaliserMail('  Alice.Durand@Test.FR ') === 'alice.durand@test.fr', String(L.normaliserMail('  Alice.Durand@Test.FR ')));
test('mail : sans arobase -> null', L.normaliserMail('pas-un-mail') === null);
test('mail : vide -> null', L.normaliserMail('') === null);

// --- normaliserDate --------------------------------------------------------
const d45870 = L.normaliserDate(45870);
test('date : serie Excel 45870 -> ISO coherent', d45870 === '2025-08-01', String(d45870));
test('date : serie Excel 1 -> 1899-12-31', L.normaliserDate(1) === '1899-12-31', String(L.normaliserDate(1)));
test('date : "15/03/2026" -> 2026-03-15', L.normaliserDate('15/03/2026') === '2026-03-15', String(L.normaliserDate('15/03/2026')));
test('date : "15/03/26" -> 2026-03-15', L.normaliserDate('15/03/26') === '2026-03-15', String(L.normaliserDate('15/03/26')));
test('date : Date natif -> ISO', L.normaliserDate(new Date(2026, 2, 15)) === '2026-03-15', String(L.normaliserDate(new Date(2026, 2, 15))));
test('date : texte illisible -> null', L.normaliserDate('n/a') === null);
test('date : jour impossible -> null', L.normaliserDate('32/03/2026') === null);
test('date : vide -> null', L.normaliserDate('') === null && L.normaliserDate(null) === null);

// --- normaliserSource ------------------------------------------------------
test('source : leboncoin -> LeBonCoin', L.normaliserSource('leboncoin') === 'LeBonCoin', String(L.normaliserSource('leboncoin')));
test('source : LE BON COIN -> LeBonCoin', L.normaliserSource('LE BON COIN') === 'LeBonCoin', String(L.normaliserSource('LE BON COIN')));
test('source : seloger -> SeLoger', L.normaliserSource('SeLoger ') === 'SeLoger', String(L.normaliserSource('SeLoger ')));
test('source : selo -> SeLoger', L.normaliserSource('selo') === 'SeLoger', String(L.normaliserSource('selo')));
test('source : pap -> PAP', L.normaliserSource('Pap') === 'PAP', String(L.normaliserSource('Pap')));
test('source : bienici -> BienIci', L.normaliserSource('bien ici') === 'BienIci', String(L.normaliserSource('bien ici')));
test('source : autre -> texte nettoye', L.normaliserSource('  Vitrine   agence ') === 'Vitrine agence', String(L.normaliserSource('  Vitrine   agence ')));
test('source : vide -> null', L.normaliserSource('') === null);

// --- estAgentExclu ---------------------------------------------------------
const LISTE = 'POITEVIN Lyes,BARRETO Nolan';
test('exclu : POITEVIN LYES', L.estAgentExclu('POITEVIN LYES', LISTE) === true);
test('exclu : LYES P (prenom + initiale)', L.estAgentExclu('LYES P', LISTE) === true);
test('exclu : BARRETO Nolan', L.estAgentExclu('BARRETO Nolan', LISTE) === true);
test('exclu : barreto nolan (minuscules)', L.estAgentExclu('barreto nolan', LISTE) === true);
test('exclu : lyes poitevin (ordre inverse)', L.estAgentExclu('lyes poitevin', LISTE) === true);
test('non exclu : ZOPPAS TARA', L.estAgentExclu('ZOPPAS TARA', LISTE) === false);
test('non exclu : TINE JEREMY (accent)', L.estAgentExclu('TINE JÉRÉMY', LISTE) === false);
test('non exclu : cellule vide', L.estAgentExclu('', LISTE) === false);

// --- categoriser -----------------------------------------------------------
// Construit une ligne (tableau par position) a partir d'un objet lisible.
function ligne({ date, source, cr, nom, prenom, tel, mail, ref, com, m, suivi, capacite, p, s }) {
  const v = new Array(21).fill('');
  v[L.COL.date] = date !== undefined ? date : '';
  v[L.COL.source] = source || '';
  v[L.COL.attribution_cr] = cr || '';
  v[L.COL.nom] = nom || '';
  v[L.COL.prenom] = prenom || '';
  v[L.COL.telephone] = tel !== undefined ? tel : '';
  v[L.COL.mail] = mail || '';
  v[L.COL.reference_bien] = ref || '';
  v[L.COL.commentaire] = com || '';
  v[L.COL.interesse] = m || '';
  v[L.COL.suivi_lead] = suivi || '';
  v[L.COL.capacite_emprunt] = capacite || '';
  v[L.COL.potentiel_location] = p || '';
  v[L.COL.potentiel_neuf] = s || '';
  return v;
}
const OPTS = { exclusionAgents: LISTE, heuristiqueGabby: 'PS_OUI' };

let c = L.categoriser(ligne({ cr: 'POITEVIN Lyes', nom: 'A', m: 'OUI' }), OPTS);
test('categoriser 1 : agent exclu prime sur OUI', c.action === 'exclu', JSON.stringify(c));
c = L.categoriser(ligne({ cr: 'ZOPPAS TARA', nom: 'B', m: 'NON' }), OPTS);
test('categoriser 2 : M=NON -> blackliste', c.action === 'blackliste', JSON.stringify(c));
c = L.categoriser(ligne({ nom: 'C', m: 'OUI' }), OPTS);
test('categoriser 3 : M=OUI, P/S vides -> oui_agent prio 2', c.action === 'cree' && c.categorie === 'oui_agent' && c.priorite === 2, JSON.stringify(c));
c = L.categoriser(ligne({ nom: 'D', m: 'OUI', p: 'OUI' }), OPTS);
test('categoriser 3b : M=OUI, P=OUI -> oui_gabby prio 3', c.categorie === 'oui_gabby' && c.priorite === 3, JSON.stringify(c));
c = L.categoriser(ligne({ nom: 'D2', m: 'OUI', s: 'oui' }), OPTS);
test('categoriser 3c : M=OUI, S=oui -> oui_gabby', c.categorie === 'oui_gabby', JSON.stringify(c));
c = L.categoriser(ligne({ nom: 'D3', m: 'OUI', p: 'NON QUALIFIE', s: 'NON' }), OPTS);
test('categoriser 3d : P/S pre-remplies non OUI -> oui_agent (PS_OUI)', c.categorie === 'oui_agent', JSON.stringify(c));
c = L.categoriser(ligne({ nom: 'E', m: 'NON QUALIFIÉ' }), OPTS);
test('categoriser 4 : M=NON QUALIFIÉ (accent) -> a_qualifier prio 4', c.action === 'cree' && c.categorie === 'a_qualifier' && c.priorite === 4, JSON.stringify(c));
c = L.categoriser(ligne({ nom: 'E2', m: 'NON QUALIFIE' }), OPTS);
test('categoriser 4b : M=NON QUALIFIE (sans accent) -> a_qualifier', c.categorie === 'a_qualifier', JSON.stringify(c));
c = L.categoriser(ligne({ nom: 'F', m: '' }), OPTS);
test('categoriser 5 : M vide -> ignore', c.action === 'ignore', JSON.stringify(c));
c = L.categoriser(ligne({ nom: 'G', m: 'PROSPECT INTERESSE?' }), OPTS);
test('categoriser 5b : en-tete repete -> ignore', c.action === 'ignore', JSON.stringify(c));
c = L.categoriser(ligne({ nom: 'H', m: 'PEUT ETRE' }), OPTS);
test('categoriser 5c : valeur inconnue -> ignore', c.action === 'ignore', JSON.stringify(c));

// Modes d'heuristique.
const lgOuiPRempli = ligne({ nom: 'I', m: 'OUI', p: 'NON QUALIFIE' });
test('heuristique PS_OUI : P remplie non OUI -> oui_agent', L.categoriser(lgOuiPRempli, { exclusionAgents: LISTE, heuristiqueGabby: 'PS_OUI' }).categorie === 'oui_agent');
test('heuristique PS_REMPLI : P remplie -> oui_gabby', L.categoriser(lgOuiPRempli, { exclusionAgents: LISTE, heuristiqueGabby: 'PS_REMPLI' }).categorie === 'oui_gabby');
test('heuristique off : toujours oui_agent', L.categoriser(ligne({ nom: 'J', m: 'OUI', p: 'OUI', s: 'OUI' }), { exclusionAgents: LISTE, heuristiqueGabby: 'off' }).categorie === 'oui_agent');
test('heuristique par defaut = PS_OUI', L.categoriser(ligne({ nom: 'K', m: 'OUI', p: 'OUI' }), { exclusionAgents: LISTE }).categorie === 'oui_gabby');

// --- hashLigne -------------------------------------------------------------
const lgH = ligne({ date: 45870, nom: 'Dupont', prenom: 'Jean', tel: '0611223344', mail: 'j@d.fr', ref: 'R1' });
const h1 = L.hashLigne('AOUT 2026', 3, lgH);
test('hash : stable pour la meme ligne', h1 === L.hashLigne('AOUT 2026', 3, lgH));
test('hash : differe si onglet different', h1 !== L.hashLigne('JUILLET 2026', 3, lgH));
test('hash : differe si numero de ligne different', h1 !== L.hashLigne('AOUT 2026', 4, lgH));
test('hash : differe si telephone different', h1 !== L.hashLigne('AOUT 2026', 3, ligne({ date: 45870, nom: 'Dupont', prenom: 'Jean', tel: '0611223355', mail: 'j@d.fr', ref: 'R1' })));
test('hash : SHA-1 (40 hex)', /^[0-9a-f]{40}$/.test(h1), h1);

// --- latencePour -----------------------------------------------------------
const PARAMS = { courtage_latence_oui_agent: '0', courtage_latence_oui_gabby: '3', courtage_latence_a_qualifier: '7' };
test('latence : oui_agent = 0', L.latencePour('oui_agent', PARAMS) === 0);
test('latence : oui_gabby = 3', L.latencePour('oui_gabby', PARAMS) === 3);
test('latence : a_qualifier = 7', L.latencePour('a_qualifier', PARAMS) === 7);
test('latence : defauts sans parametres', L.latencePour('oui_gabby', {}) === 3 && L.latencePour('a_qualifier', {}) === 7 && L.latencePour('oui_agent', {}) === 0);
test('latence : parametre personnalise respecte', L.latencePour('oui_gabby', { courtage_latence_oui_gabby: '10' }) === 10);
test('ajouterJours : date + latence', L.ajouterJours('2026-03-15', 3) === '2026-03-18', String(L.ajouterJours('2026-03-15', 3)));
test('ajouterJours : passage de mois', L.ajouterJours('2026-03-30', 7) === '2026-04-06', String(L.ajouterJours('2026-03-30', 7)));

// --- Import HTTP -----------------------------------------------------------
const env = { ...process.env, DB_PATH: '/tmp/immo-courtage-import-' + process.pid + '.db', JWT_SECRET: 'dev', PORT: '3015' };
const srv = spawn('node', ['server/src/index.js'], { env, stdio: 'ignore' });
const B = 'http://localhost:3015';
async function login(email, password) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return (await r.json()).token;
}
async function req(method, path, token, body) {
  const r = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

const auj = new Date().toISOString().slice(0, 10);
const ajJ = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

setTimeout(async () => {
  try {
    const marine = await login('marine.rosain@lequai-immobilier.com', 'MarineLeQuai');
    const admin = await login('admin@lequai-immobilier.com', 'admin123');
    const agent = await login('agent@lequai-immobilier.com', 'agent123');

    // Lot de 10 lignes fabriquees couvrant toutes les branches.
    const lot = [
      { onglet: 'MARS 2026', ligne: 3, valeurs: ligne({ date: '01/03/2026', source: 'leboncoin', cr: 'ZOPPAS TARA', nom: 'Alpha', prenom: 'Anne', tel: '0611110001', mail: 'anne@ex.fr', ref: 'REF-A', m: 'OUI', com: 'chaud', suivi: 'rappel fait', capacite: '250000' }) },
      { onglet: 'MARS 2026', ligne: 4, valeurs: ligne({ date: '02/03/2026', cr: 'ZOPPAS TARA', nom: 'Beta', tel: '0611110002', m: 'OUI', p: 'OUI' }) },
      { onglet: 'MARS 2026', ligne: 5, valeurs: ligne({ date: '03/03/2026', cr: 'TINE JEREMY', nom: 'Gamma', tel: '0611110003', m: 'NON QUALIFIÉ' }) },
      { onglet: 'MARS 2026', ligne: 6, valeurs: ligne({ date: '04/03/2026', cr: 'POITEVIN Lyes', nom: 'Delta', tel: '0611110004', m: 'OUI' }) },
      { onglet: 'MARS 2026', ligne: 7, valeurs: ligne({ date: '05/03/2026', cr: 'LYES P', nom: 'Epsilon', tel: '0611110005', m: 'NON QUALIFIE' }) },
      { onglet: 'MARS 2026', ligne: 8, valeurs: ligne({ date: '06/03/2026', cr: 'BARRETO Nolan', nom: 'Zeta', tel: '0611110006', m: 'OUI' }) },
      { onglet: 'MARS 2026', ligne: 9, valeurs: ligne({ date: '07/03/2026', nom: 'Eta', tel: '0611110007', mail: 'eta@ex.fr', m: 'NON' }) },
      { onglet: 'MARS 2026', ligne: 10, valeurs: ligne({ date: '08/03/2026', nom: 'Theta', tel: '0611110008', m: '' }) },
      { onglet: 'MARS 2026', ligne: 11, valeurs: ligne({ nom: 'PROSPECT', m: 'PROSPECT INTERESSE?' }) },
      { onglet: 'MARS 2026', ligne: 12, valeurs: ligne({ date: 45870, source: 'selo', nom: 'Iota', tel: 33771027363, mail: 'iota@ex.fr', ref: 'REF-I', m: 'NON QUALIFIE', s: 'OUI' }) },
    ];

    // 1) SIMULATION d'abord : rapport complet, aucune ecriture.
    const sim = await req('POST', '/api/courtage/import', marine, { fichier: 'cahier.xlsx', simulation: true, lignes: lot });
    test('simulation 200', sim.status === 200, sim.status + ' ' + JSON.stringify(sim.body));
    test('simulation : 10 lignes lues', sim.body.lignes_lues === 10, JSON.stringify(sim.body));
    test('simulation : 4 creees', sim.body.creees === 4, JSON.stringify(sim.body));
    test('simulation : 3 exclues (agents location)', sim.body.exclues === 3, JSON.stringify(sim.body));
    test('simulation : 1 blacklistee', sim.body.blacklistees === 1, JSON.stringify(sim.body));
    test('simulation : 2 ignorees', sim.body.ignorees === 2, JSON.stringify(sim.body));
    test('simulation : par categorie', sim.body.parCategorie.oui_agent === 1 && sim.body.parCategorie.oui_gabby === 1 && sim.body.parCategorie.a_qualifier === 2, JSON.stringify(sim.body.parCategorie));
    const apresSim = await req('GET', '/api/courtage/fiches', marine);
    test('simulation : AUCUNE fiche creee en base', apresSim.body.length === 0, JSON.stringify(apresSim.body.map(f => f.nom)));

    // 2) IMPORT REEL : memes compteurs que la simulation.
    const imp = await req('POST', '/api/courtage/import', marine, { fichier: 'cahier.xlsx', simulation: false, lignes: lot });
    test('import 200', imp.status === 200, imp.status + ' ' + JSON.stringify(imp.body));
    test('import : compteurs identiques a la simulation',
      imp.body.creees === sim.body.creees && imp.body.exclues === sim.body.exclues &&
      imp.body.blacklistees === sim.body.blacklistees && imp.body.ignorees === sim.body.ignorees,
      JSON.stringify(imp.body));
    const fiches = (await req('GET', '/api/courtage/fiches', marine)).body;
    test('import : 4 fiches en base', fiches.length === 4, JSON.stringify(fiches.map(f => f.nom)));

    const alpha = fiches.find(f => f.nom === 'Alpha');
    test('fiche Alpha : categorie oui_agent prio 2', alpha && alpha.categorie === 'oui_agent' && alpha.priorite === 2, JSON.stringify(alpha));
    test('fiche Alpha : statut en_relance', alpha.statut === 'en_relance', alpha.statut);
    test('fiche Alpha : date_contact ISO', alpha.date_contact === '2026-03-01', alpha.date_contact);
    test('fiche Alpha : latence 0 -> relance = date_contact', alpha.prochaine_relance === '2026-03-01', alpha.prochaine_relance);
    test('fiche Alpha : source normalisee LeBonCoin', alpha.source === 'LeBonCoin', alpha.source);
    test('fiche Alpha : attribution_cr conservee', alpha.attribution_cr === 'ZOPPAS TARA', alpha.attribution_cr);
    test('fiche Alpha : capacite_emprunt lue (col. O)', alpha.capacite_emprunt === '250000', alpha.capacite_emprunt);
    test('fiche Alpha : commentaire lu (col. K)', alpha.commentaire === 'chaud', alpha.commentaire);
    test('fiche Alpha : suivi_lead lu (col. N)', alpha.suivi_lead === 'rappel fait', alpha.suivi_lead);
    test('fiche Alpha : origine tracee', alpha.source_onglet === 'MARS 2026' && alpha.source_ligne === 3, alpha.source_onglet + '/' + alpha.source_ligne);
    test('fiche Alpha : date passee -> disponible immediatement', alpha.prochaine_relance <= auj, alpha.prochaine_relance);

    const beta = fiches.find(f => f.nom === 'Beta');
    test('fiche Beta : oui_gabby prio 3', beta.categorie === 'oui_gabby' && beta.priorite === 3, JSON.stringify(beta));
    test('fiche Beta : latence 3 jours appliquee', beta.prochaine_relance === '2026-03-05', beta.prochaine_relance);
    const gamma = fiches.find(f => f.nom === 'Gamma');
    test('fiche Gamma : a_qualifier prio 4', gamma.categorie === 'a_qualifier' && gamma.priorite === 4, JSON.stringify(gamma));
    test('fiche Gamma : latence 7 jours appliquee', gamma.prochaine_relance === '2026-03-10', gamma.prochaine_relance);
    const iota = fiches.find(f => f.nom === 'Iota');
    test('fiche Iota : tel numerique 33... normalise', iota.telephone_norm === '0771027363', iota.telephone_norm);
    test('fiche Iota : date serie Excel convertie', iota.date_contact === '2025-08-01', iota.date_contact);
    test('fiche Iota : source selo -> SeLoger', iota.source === 'SeLoger', iota.source);
    test('aucune fiche pour les agents exclus', !fiches.some(f => ['Delta', 'Epsilon', 'Zeta'].includes(f.nom)), JSON.stringify(fiches.map(f => f.nom)));

    const detAlpha = await req('GET', '/api/courtage/fiches/' + alpha.id, marine);
    test('import : demande creee depuis reference_bien', detAlpha.body.demandes.length === 1 && detAlpha.body.demandes[0].reference_bien === 'REF-A', JSON.stringify(detAlpha.body.demandes));
    test('import : action creation historisee', detAlpha.body.actions.some(a => a.type === 'creation'), JSON.stringify(detAlpha.body.actions));

    // 3) IDEMPOTENCE : reimporter le meme lot ne cree rien.
    const re = await req('POST', '/api/courtage/import', marine, { fichier: 'cahier.xlsx', simulation: false, lignes: lot });
    test('idempotence : 0 creee', re.body.creees === 0, JSON.stringify(re.body));
    test('idempotence : 10 deja_importees', re.body.deja_importees === 10, JSON.stringify(re.body));
    const fiches2 = (await req('GET', '/api/courtage/fiches', marine)).body;
    test('idempotence : toujours 4 fiches', fiches2.length === 4, String(fiches2.length));

    // 4) DOUBLON : meme telephone, autre reference bien -> demande ajoutee, pas de fiche.
    const lotDoublon = [{ onglet: 'AVRIL 2026', ligne: 3, valeurs: ligne({ date: '10/04/2026', nom: 'Alpha', prenom: 'Anne', tel: '0611110001', ref: 'REF-A2', m: 'OUI' }) }];
    const dbl = await req('POST', '/api/courtage/import', marine, { fichier: 'cahier2.xlsx', simulation: false, lignes: lotDoublon });
    test('doublon : compte 1 doublon, 0 creee', dbl.body.doublons === 1 && dbl.body.creees === 0, JSON.stringify(dbl.body));
    const fiches3 = (await req('GET', '/api/courtage/fiches', marine)).body;
    test('doublon : aucune nouvelle fiche', fiches3.length === 4, String(fiches3.length));
    const detAlpha2 = await req('GET', '/api/courtage/fiches/' + alpha.id, marine);
    test('doublon : demande ajoutee dans courtage_demandes', detAlpha2.body.demandes.length === 2 && detAlpha2.body.demandes.some(d => d.reference_bien === 'REF-A2'), JSON.stringify(detAlpha2.body.demandes));

    // Champs vides completes sur la fiche existante (Beta n'avait pas de mail).
    const lotComplete = [{ onglet: 'AVRIL 2026', ligne: 4, valeurs: ligne({ date: '11/04/2026', nom: 'Beta', tel: '0611110002', mail: 'beta@ex.fr', capacite: '180000', m: 'OUI' }) }];
    await req('POST', '/api/courtage/import', marine, { fichier: 'cahier2.xlsx', simulation: false, lignes: lotComplete });
    const betaMaj = (await req('GET', '/api/courtage/fiches/' + beta.id, marine)).body;
    test('doublon : champs vides completes (mail, capacite)', betaMaj.mail_norm === 'beta@ex.fr' && betaMaj.capacite_emprunt === '180000', JSON.stringify({ m: betaMaj.mail_norm, c: betaMaj.capacite_emprunt }));
    test('doublon : categorie d origine preservee', betaMaj.categorie === 'oui_gabby', betaMaj.categorie);

    // 5) LISTE NOIRE : Eta (M=NON) ne doit jamais etre cree, meme avec M=OUI ensuite.
    const lotNoire = [{ onglet: 'AVRIL 2026', ligne: 5, valeurs: ligne({ date: '12/04/2026', nom: 'Eta', tel: '0611110007', mail: 'eta@ex.fr', m: 'OUI' }) }];
    const bl = await req('POST', '/api/courtage/import', marine, { fichier: 'cahier2.xlsx', simulation: false, lignes: lotNoire });
    test('liste noire : contact NON jamais recree', bl.body.creees === 0 && bl.body.blacklistees === 1, JSON.stringify(bl.body));
    const fiches4 = (await req('GET', '/api/courtage/fiches', marine)).body;
    test('liste noire : aucune fiche Eta', !fiches4.some(f => f.nom === 'Eta'), JSON.stringify(fiches4.map(f => f.nom)));

    // Fiche existante rencontree avec M=NON -> passe en ne_plus_contacter.
    const lotNonSurExistante = [{ onglet: 'AVRIL 2026', ligne: 6, valeurs: ligne({ date: '13/04/2026', nom: 'Gamma', tel: '0611110003', m: 'NON' }) }];
    await req('POST', '/api/courtage/import', marine, { fichier: 'cahier2.xlsx', simulation: false, lignes: lotNonSurExistante });
    const gammaMaj = (await req('GET', '/api/courtage/fiches/' + gamma.id, marine)).body;
    test('M=NON sur fiche existante : statut ne_plus_contacter', gammaMaj.statut === 'ne_plus_contacter', gammaMaj.statut);
    test('M=NON sur fiche existante : prochaine_relance NULL', gammaMaj.prochaine_relance === null, String(gammaMaj.prochaine_relance));

    // 6) Date future -> latence appliquee sans rattrapage.
    const futur = ajJ(2);
    const jjmmaaaa = futur.slice(8, 10) + '/' + futur.slice(5, 7) + '/' + futur.slice(0, 4);
    const lotFutur = [{ onglet: 'MAI 2026', ligne: 3, valeurs: ligne({ date: jjmmaaaa, nom: 'Kappa', tel: '0611110009', m: 'OUI', p: 'OUI' }) }];
    await req('POST', '/api/courtage/import', marine, { fichier: 'cahier3.xlsx', simulation: false, lignes: lotFutur });
    const kappa = (await req('GET', '/api/courtage/fiches', marine)).body.find(f => f.nom === 'Kappa');
    test('latence : date recente + 3 jours (oui_gabby)', kappa.prochaine_relance === ajJ(5), kappa.prochaine_relance + ' attendu ' + ajJ(5));

    // 7) ACCES : admin 200, agent 403.
    const adm = await req('POST', '/api/courtage/import', admin, { fichier: 'x.xlsx', simulation: true, lignes: [] });
    test('acces : admin POST /import 200', adm.status === 200, adm.status);
    const ag = await req('POST', '/api/courtage/import', agent, { fichier: 'x.xlsx', simulation: true, lignes: [] });
    test('acces : agent POST /import 403', ag.status === 403, ag.status);
    const badBody = await req('POST', '/api/courtage/import', marine, { fichier: 'x.xlsx' });
    test('import sans tableau lignes -> 400', badBody.status === 400, badBody.status);

    // 7bis) SIMULATION MULTI-LOTS : le client envoie ~13 lots avec le meme session_id.
    // Un contact present dans deux lots (deux mois) ne doit etre compte "cree" qu'une fois.
    const contactDeuxMois = (onglet, ligne, ref, tel) => ({
      onglet, ligne,
      valeurs: ['15/06/2026', '10h', 'Appel', 'leboncoin', 'ZOPPAS TARA', 'MULTILOT', 'Paul',
        tel, 'multilot@test.fr', ref, 'commentaire', null, 'OUI', null, null, 'NON', null, null, 'NON'],
    });
    const sid = 'session-test-multilots';
    const s1 = await req('POST', '/api/courtage/import', marine,
      { fichier: 'multi.xlsx', simulation: true, session_id: sid, lignes: [contactDeuxMois('JUIN 2026', 90, 'REF-A', '06 55 44 33 22')] });
    const s2 = await req('POST', '/api/courtage/import', marine,
      { fichier: 'multi.xlsx', simulation: true, session_id: sid, lignes: [contactDeuxMois('JUILLET 2026', 91, 'REF-B', '06.55.44.33.22')] });
    test('simulation multi-lots : 1 seule creation cumulee',
      s1.body.creees + s2.body.creees === 1, `creees ${s1.body.creees}+${s2.body.creees}`);
    test('simulation multi-lots : le 2e lot compte un doublon',
      s1.body.doublons + s2.body.doublons === 1, `doublons ${s1.body.doublons}+${s2.body.doublons}`);
    const fichesMultilot = (await req('GET', '/api/courtage/fiches', marine)).body.filter(f => f.nom === 'MULTILOT');
    test('simulation multi-lots : aucune ecriture en base', fichesMultilot.length === 0, String(fichesMultilot.length));

    // 7ter) SANS TELEPHONE / FAUX NUMERO -> onglet "a contacter par mail", hors file d'appel.
    const ligneMail = (l, nom, tel, mail) => ({
      onglet: 'AOUT 2026', ligne: l,
      valeurs: ['05/08/2026', '10h', 'Appel', 'leboncoin', 'ZOPPAS TARA', nom, 'T',
        tel, mail, 'REF', 'com', null, 'OUI', null, null, 'NON', null, null, 'NON'],
    });
    await req('POST', '/api/courtage/import', marine, { fichier: 'mail.xlsx', simulation: false, lignes: [
      ligneMail(200, 'MAILAVECTEL', '06 12 34 56 78', 'avectel@t.fr'),
      ligneMail(201, 'MAILSANSTEL', '', 'sanstel@t.fr'),
      ligneMail(202, 'MAILFAUXNUM', '0600000001', 'fauxnum@t.fr'),
      ligneMail(203, 'MAILRIEN', '', ''),
    ] });
    const parNom = (liste, nom) => liste.find(f => f.nom === nom);
    const toutes = (await req('GET', '/api/courtage/fiches', marine)).body;
    test('sans telephone + mail -> statut injoignable',
      parNom(toutes, 'MAILSANSTEL')?.statut === 'injoignable', parNom(toutes, 'MAILSANSTEL')?.statut);
    test('sans telephone ni mail -> statut perdu',
      parNom(toutes, 'MAILRIEN')?.statut === 'perdu', parNom(toutes, 'MAILRIEN')?.statut);
    test('avec telephone valide -> reste en relance',
      parNom(toutes, 'MAILAVECTEL')?.statut === 'en_relance', parNom(toutes, 'MAILAVECTEL')?.statut);
    const fileJour = (await req('GET', '/api/courtage/fiches/relances-jour', marine)).body.map(f => f.nom);
    test('file d appel : seul le contact joignable par telephone',
      fileJour.includes('MAILAVECTEL') && !fileJour.includes('MAILSANSTEL') && !fileJour.includes('MAILFAUXNUM'),
      fileJour.join(','));
    const aMailer = (await req('GET', '/api/courtage/fiches/a-mailer', marine)).body.map(f => f.nom);
    test('liste mail : sans telephone et faux numero presents',
      aMailer.includes('MAILSANSTEL') && aMailer.includes('MAILFAUXNUM'), aMailer.join(','));
    test('liste mail : le joignable par telephone absent', !aMailer.includes('MAILAVECTEL'), aMailer.join(','));
    test('liste mail : celui sans aucun canal absent', !aMailer.includes('MAILRIEN'), aMailer.join(','));
    const cibleMail = (await req('GET', '/api/courtage/fiches/a-mailer', marine)).body.find(f => f.nom === 'MAILSANSTEL');
    await req('POST', `/api/courtage/fiches/${cibleMail.id}/mail-propose`, marine, {});
    const apresMail = (await req('GET', '/api/courtage/fiches/a-mailer', marine)).body.map(f => f.nom);
    test('liste mail : la fiche sort apres envoi du mail', !apresMail.includes('MAILSANSTEL'), apresMail.join(','));
    const accesAgent = await req('GET', '/api/courtage/fiches/a-mailer', agent);
    test('liste mail : agent (Chrystelle) 403', accesAgent.status === 403, accesAgent.status);

    // 7quater) MODELE DE MAIL editable par Marine (et par elle seule).
    const modeleInit = await req('GET', '/api/courtage/modele-mail', marine);
    test('modele mail : lecture 200 avec objet et corps',
      modeleInit.status === 200 && !!modeleInit.body.objet && !!modeleInit.body.corps, JSON.stringify(modeleInit.body).slice(0, 80));
    const maj = await req('PUT', '/api/courtage/modele-mail', marine, {
      objet: 'Nouvel objet test', corps: 'Bonjour [Prénom], bien [BIEN], tel [TEL_MARINE].', telephone: '06 44 55 66 77',
    });
    test('modele mail : Marine peut modifier', maj.status === 200 && maj.body.objet === 'Nouvel objet test', maj.status);
    const cibleModele = (await req('GET', '/api/courtage/fiches', marine)).body.find(f => f.mail);
    const genere = await req('GET', `/api/courtage/mail-modele/${cibleModele.id}`, marine);
    const decode = decodeURIComponent(genere.body.mailto || '');
    test('modele mail : le nouvel objet est utilise', decode.includes('Nouvel objet test'), decode.slice(0, 70));
    test('modele mail : le telephone est injecte', decode.includes('06 44 55 66 77'), decode.slice(0, 120));
    test('modele mail : plus de variables non remplacees',
      !decode.includes('[Prénom]') && !decode.includes('[TEL_MARINE]') && !decode.includes('[BIEN]'), decode.slice(0, 120));
    const videObjet = await req('PUT', '/api/courtage/modele-mail', marine, { objet: '   ' });
    test('modele mail : objet vide refuse (400)', videObjet.status === 400, videObjet.status);
    const agentModele = await req('PUT', '/api/courtage/modele-mail', agent, { objet: 'pirate' });
    test('modele mail : agent (Chrystelle) 403', agentModele.status === 403, agentModele.status);

    // 7quinquies) TOUTES les variables du modele de mail sont remplacees.
    const ficheVar = (await req('POST', '/api/courtage/fiches', marine, {
      nom: 'durand', prenom: 'Sophie', telephone: '0612345678', mail: 's.durand@test.fr',
      date_contact: '2026-08-05', reference_bien: 'REF-042', montant_projet: '250000', source: 'LeBonCoin',
    })).body;
    const listeVars = (await req('GET', '/api/courtage/modele-mail', marine)).body.variables;
    test('modele mail : la liste des variables est exposee',
      Array.isArray(listeVars) && listeVars.length >= 9, String(listeVars && listeVars.length));
    await req('PUT', '/api/courtage/modele-mail', marine, {
      objet: 'Projet de [Prénom] [NOM]',
      corps: 'Bonjour [Prénom]. Contact du [DATE_CONTACT] via [SOURCE] pour [BIEN] ref [REFERENCE]. '
        + 'Montant [MONTANT]. Complet : [Nom complet]. Tel [TEL_MARINE].',
      telephone: '06 44 55 66 77',
    });
    const genVar = decodeURIComponent((await req('GET', `/api/courtage/mail-modele/${ficheVar.id}`, marine)).body.mailto || '');
    test('variable [Prénom] remplacee', genVar.includes('Bonjour Sophie'), genVar.slice(0, 90));
    test('variable [NOM] en majuscules', genVar.includes('DURAND'), genVar.slice(0, 60));
    test('variable [DATE_CONTACT] au format francais', genVar.includes('05/08/2026'), genVar.slice(0, 140));
    test('variable [SOURCE] remplacee', genVar.includes('LeBonCoin'), genVar.slice(0, 140));
    test('variable [REFERENCE] remplacee', genVar.includes('REF-042'), genVar.slice(0, 160));
    test('variable [MONTANT] remplacee', genVar.includes('250000'), genVar.slice(0, 180));
    test('variable [Nom complet] remplacee', genVar.includes('Sophie DURAND'), genVar.slice(0, 200));
    test('aucune variable non remplacee ne subsiste',
      !/\[(Prénom|Prenom|NOM|Nom complet|BIEN|REFERENCE|SOURCE|DATE_CONTACT|MONTANT|TEL_MARINE)\]/.test(genVar), genVar.slice(0, 200));

    // 7sexies) NUMEROS INEXPLOITABLES ("/" , fragment) : meme regle a la saisie manuelle
    // qu'a l'import, et maintenance qui sort de la file les fiches heritees.
    const aujMaint = new Date().toISOString().slice(0, 10);
    for (const f of [
      { nom: 'MT_SLASH', telephone: '/', mail: 'mtslash@t.fr', prochaine_relance: aujMaint },
      { nom: 'MT_FRAGMENT', telephone: '336', mail: 'mtfrag@t.fr', prochaine_relance: aujMaint },
      { nom: 'MT_SANSRIEN', telephone: '/', prochaine_relance: aujMaint },
      { nom: 'MT_VALIDE', telephone: '06 12 34 56 79', mail: 'mtok@t.fr', prochaine_relance: aujMaint },
    ]) await req('POST', '/api/courtage/fiches', marine, f);
    const apresCrea = (await req('GET', '/api/courtage/fiches', marine)).body;
    const trouve = (n) => apresCrea.find(f => f.nom === n);
    test('saisie manuelle : "/" non retenu comme numero', !trouve('MT_SLASH').telephone_norm, String(trouve('MT_SLASH').telephone_norm));
    test('saisie manuelle : fragment "336" non retenu', !trouve('MT_FRAGMENT').telephone_norm, String(trouve('MT_FRAGMENT').telephone_norm));
    test('saisie manuelle : numero avec espaces normalise', trouve('MT_VALIDE').telephone_norm === '0612345679', String(trouve('MT_VALIDE').telephone_norm));
    const maint = await req('POST', '/api/courtage/fiches/sortir-sans-telephone', marine, {});
    test('maintenance : traite les fiches sans numero exploitable', maint.body.traitees >= 3, JSON.stringify(maint.body));
    const fileApres = (await req('GET', '/api/courtage/fiches/relances-jour', marine)).body.map(f => f.nom);
    test('maintenance : les inexploitables sortent de la file',
      !fileApres.includes('MT_SLASH') && !fileApres.includes('MT_FRAGMENT') && !fileApres.includes('MT_SANSRIEN'), fileApres.join(','));
    test('maintenance : le numero valide reste en file', fileApres.includes('MT_VALIDE'), fileApres.join(','));
    const mailApres = (await req('GET', '/api/courtage/fiches/a-mailer', marine)).body.map(f => f.nom);
    test('maintenance : avec mail -> onglet mail',
      mailApres.includes('MT_SLASH') && mailApres.includes('MT_FRAGMENT'), mailApres.join(','));
    test('maintenance : sans mail -> perdu, hors onglet mail', !mailApres.includes('MT_SANSRIEN'), mailApres.join(','));
    const maint2 = await req('POST', '/api/courtage/fiches/sortir-sans-telephone', marine, {});
    test('maintenance : idempotente (0 au second passage)', maint2.body.traitees === 0, JSON.stringify(maint2.body));
    const maintAgent = await req('POST', '/api/courtage/fiches/sortir-sans-telephone', agent, {});
    test('maintenance : agent (Chrystelle) 403', maintAgent.status === 403, maintAgent.status);

    // 7septies) MAIL EN DEUX TEMPS : consulter le modele ne doit rien enregistrer ;
    // seule la confirmation explicite fait sortir la fiche (anti fausse manipulation).
    await req('POST', '/api/courtage/fiches', marine, { nom: 'MAIL2TEMPS', prenom: 'Anne', telephone: '/', mail: 'anne2t@test.fr' });
    const avantOuverture = (await req('GET', '/api/courtage/fiches/a-mailer', marine)).body;
    const fiche2t = avantOuverture.find(f => f.nom === 'MAIL2TEMPS');
    test('mail 2 temps : la fiche est bien dans la liste', !!fiche2t, avantOuverture.map(f => f.nom).join(','));
    await req('GET', `/api/courtage/mail-modele/${fiche2t.id}`, marine);   // etape 1 : ouverture Outlook
    const apresOuverture = (await req('GET', '/api/courtage/fiches/a-mailer', marine)).body.map(f => f.nom);
    test('mail 2 temps : consulter le modele ne sort pas la fiche', apresOuverture.includes('MAIL2TEMPS'), apresOuverture.join(','));
    const ficheApresConsult = (await req('GET', `/api/courtage/fiches/${fiche2t.id}`, marine)).body;
    test('mail 2 temps : mail_propose_le reste vide sans confirmation', !ficheApresConsult.mail_propose_le, String(ficheApresConsult.mail_propose_le));
    await req('POST', `/api/courtage/fiches/${fiche2t.id}/mail-propose`, marine, {});   // etape 2 : confirmation
    const apresConfirm = (await req('GET', '/api/courtage/fiches/a-mailer', marine)).body.map(f => f.nom);
    test('mail 2 temps : la confirmation sort la fiche', !apresConfirm.includes('MAIL2TEMPS'), apresConfirm.join(','));

    // 8) Journal des imports.
    const jr = await req('GET', '/api/courtage/imports', admin);
    test('journal : admin GET /imports 200', jr.status === 200, jr.status);
    test('journal : imports enregistres (<= 20)', Array.isArray(jr.body) && jr.body.length > 0 && jr.body.length <= 20, String(jr.body && jr.body.length));
    test('journal : la simulation est tracee avec simulation=1', jr.body.some(i => i.simulation === 1), JSON.stringify(jr.body.map(i => i.simulation)));
    test('journal : nom du fichier conserve', jr.body.some(i => i.fichier === 'cahier.xlsx'), JSON.stringify(jr.body.map(i => i.fichier)));
    const jrM = await req('GET', '/api/courtage/imports', marine);
    test('journal : Marine GET /imports 200', jrM.status === 200, jrM.status);
    const jrA = await req('GET', '/api/courtage/imports', agent);
    test('journal : agent GET /imports 403', jrA.status === 403, jrA.status);

    // 9) REMISE A ZERO (admin) — en dernier : elle vide fiches, liste noire et journal.
    const sansConf = await req('DELETE', '/api/courtage/donnees', admin, {});
    test('remise a zero : refusee sans confirmation', sansConf.status === 400, sansConf.status);
    const parMarine = await req('DELETE', '/api/courtage/donnees', marine, { confirmation: 'EFFACER' });
    test('remise a zero : refusee a Marine (non admin)', parMarine.status === 403, parMarine.status);
    const parAgent = await req('DELETE', '/api/courtage/donnees', agent, { confirmation: 'EFFACER' });
    test('remise a zero : refusee a l agent', parAgent.status === 403, parAgent.status);
    const avantRaz = (await req('GET', '/api/courtage/fiches', marine)).body.length;
    const raz = await req('DELETE', '/api/courtage/donnees', admin, { confirmation: 'EFFACER' });
    test('remise a zero : admin autorise', raz.status === 200, raz.status);
    test('remise a zero : compte les fiches supprimees', raz.body.supprime.fiches === avantRaz,
      `${raz.body.supprime.fiches} vs ${avantRaz}`);
    const apresRaz = (await req('GET', '/api/courtage/fiches', marine)).body;
    test('remise a zero : plus aucune fiche', apresRaz.length === 0, String(apresRaz.length));
    const modeleApresRaz = (await req('GET', '/api/courtage/modele-mail', marine)).body;
    test('remise a zero : le modele de mail est conserve', !!modeleApresRaz.objet, String(modeleApresRaz.objet));

  } catch (e) {
    console.error('  FAIL exception : ' + e.message + '\n' + e.stack); process.exitCode = 1;
  } finally { srv.kill(); }
}, 2500);
