const assert = require('assert')

// Force une DB temporaire jetable AVANT de charger database.js
process.env.DB_PATH = '/tmp/immo-test-' + process.pid + '.db'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev'
const { db } = require('../src/database')

function test(nom, fn) {
  try { fn(); console.log('  OK  ' + nom) }
  catch (e) { console.error('  FAIL ' + nom + ' : ' + e.message); process.exitCode = 1 }
}

console.log('contacts-import.test.js')

test('migration ajoute date_estimation et photo_url', () => {
  const cols = db.prepare("PRAGMA table_info(contacts)").all().map(c => c.name)
  assert.ok(cols.includes('date_estimation'), 'date_estimation absente')
  assert.ok(cols.includes('photo_url'), 'photo_url absente')
})

test('migration ajoute suivi_par_origine', () => {
  const cols = db.prepare("PRAGMA table_info(contacts)").all().map(c => c.name)
  assert.ok(cols.includes('suivi_par_origine'), 'suivi_par_origine absente')
})

test('migration ajoute civilite', () => {
  const cols = db.prepare("PRAGMA table_info(contacts)").all().map(c => c.name)
  assert.ok(cols.includes('civilite'), 'civilite absente')
})

const { normaliserDate } = require('../src/utils/import-helpers')

test('normaliserDate ISO inchangée', () => {
  assert.strictEqual(normaliserDate('2026-01-15'), '2026-01-15')
})
test('normaliserDate jj/mm/aaaa', () => {
  assert.strictEqual(normaliserDate('15/01/2026'), '2026-01-15')
})
test('normaliserDate jj-mm-aaaa', () => {
  assert.strictEqual(normaliserDate('15-01-2026'), '2026-01-15')
})
test('normaliserDate serie Excel', () => {
  // 45000 = 2023-03-15 (epoch Excel 1899-12-30)
  assert.strictEqual(normaliserDate(45000), '2023-03-15')
  assert.strictEqual(normaliserDate('45000'), '2023-03-15')
})
test('normaliserDate illisible -> null', () => {
  assert.strictEqual(normaliserDate('pas une date'), null)
  assert.strictEqual(normaliserDate(''), null)
  assert.strictEqual(normaliserDate(null), null)
})
test('normaliserDate jour invalide -> null', () => {
  assert.strictEqual(normaliserDate('31/02/2026'), null)
  assert.strictEqual(normaliserDate('30/02/2026'), null)
  assert.strictEqual(normaliserDate('29/02/2026'), null) // 2026 pas bissextile
})

const { resoudreConseiller } = require('../src/utils/import-helpers')

const USERS = [
  { id: 1, nom: 'Dupont', prenom: 'Marie', email: 'marie@x.com' },
  { id: 2, nom: 'Martin', prenom: 'Pierre', email: 'pierre@x.com' },
]

test('resoudreConseiller prenom nom', () => {
  assert.strictEqual(resoudreConseiller('Marie Dupont', USERS), 1)
})
test('resoudreConseiller nom prenom', () => {
  assert.strictEqual(resoudreConseiller('Dupont Marie', USERS), 1)
})
test('resoudreConseiller insensible casse + accents', () => {
  assert.strictEqual(resoudreConseiller('  PÏERRE  martin ', USERS), 2)
})
test('resoudreConseiller par email', () => {
  assert.strictEqual(resoudreConseiller('marie@x.com', USERS), 1)
})
test('resoudreConseiller no-match -> null', () => {
  assert.strictEqual(resoudreConseiller('Inconnu Personne', USERS), null)
  assert.strictEqual(resoudreConseiller('', USERS), null)
})

const { importerContacts } = require('../src/routes/contactRoutes')

test('importerContacts : source colonne, conseiller, date normalisée', () => {
  const users = db.prepare('SELECT id, nom, prenom, email FROM users').all()
  const r = importerContacts([
    { nom: 'Test1', source: 'site web', conseiller: 'Marie Dupont', date_estimation: '15/01/2026' },
    { nom: 'Test2' }, // pas de source -> fallback import_csv
    { nom: 'Test3', conseiller: 'Inconnu Personne', date_estimation: 'nimporte' },
  ], users, { id: 1, role: 'admin' }, null)

  assert.strictEqual(r.importes, 3)
  assert.strictEqual(r.dates_ignorees, 1)

  const c1 = db.prepare("SELECT * FROM contacts WHERE nom='Test1'").get()
  assert.strictEqual(c1.source_import, 'site web')
  assert.strictEqual(c1.assigned_to, 1)
  assert.strictEqual(c1.date_estimation, '2026-01-15')

  const c2 = db.prepare("SELECT * FROM contacts WHERE nom='Test2'").get()
  assert.strictEqual(c2.source_import, 'import_csv')
})

test('importerContacts agent : assigned_to force a importeur', () => {
  const users = db.prepare('SELECT id, nom, prenom, email FROM users').all()
  const r = importerContacts([{ nom: 'AgentImport', suivi_par_origine: 'Tara ZOPPAS' }], users, { id: 2, role: 'agent' }, 999)
  assert.strictEqual(r.importes, 1)
  const c = db.prepare("SELECT * FROM contacts WHERE nom='AgentImport'").get()
  assert.strictEqual(c.assigned_to, 2)
  assert.strictEqual(c.suivi_par_origine, 'Tara ZOPPAS')
})
test('importerContacts manager : assigned_to = choix', () => {
  const users = db.prepare('SELECT id, nom, prenom, email FROM users').all()
  const r = importerContacts([{ nom: 'MgrImport' }], users, { id: 3, role: 'manager' }, 2)
  const c = db.prepare("SELECT * FROM contacts WHERE nom='MgrImport'").get()
  assert.strictEqual(c.assigned_to, 2)
})
test('importerContacts manager sans choix : defaut = lui-meme', () => {
  const users = db.prepare('SELECT id, nom, prenom, email FROM users').all()
  const r = importerContacts([{ nom: 'MgrDefaut' }], users, { id: 3, role: 'manager' }, null)
  const c = db.prepare("SELECT * FROM contacts WHERE nom='MgrDefaut'").get()
  assert.strictEqual(c.assigned_to, 3)
})

test('PUT champs : assigned_to, date_estimation, photo_url, source_import dans CHAMPS_UPDATE', () => {
  const CHAMPS = require('../src/routes/contactRoutes').CHAMPS_UPDATE
  assert.ok(CHAMPS.includes('source_import'))
  assert.ok(CHAMPS.includes('assigned_to'))
  assert.ok(CHAMPS.includes('date_estimation'))
  assert.ok(CHAMPS.includes('photo_url'))
})

test('GET détail renvoie le nom du conseiller (join users)', () => {
  const c = db.prepare(`
    SELECT contacts.*, u.nom AS assigned_nom, u.prenom AS assigned_prenom
    FROM contacts LEFT JOIN users u ON u.id = contacts.assigned_to
    WHERE contacts.nom = 'Test1'
  `).get()
  assert.ok(c.assigned_prenom, 'assigned_prenom manquant')
})

test('POST create : INSERT accepte assigned_to/date_estimation/photo_url', () => {
  // Réplique l'INSERT du POST / (16 colonnes) pour valider le schéma
  const r = db.prepare(`
    INSERT INTO contacts (nom, prenom, telephone, telephone2, email, adresse, code_postal, ville, categorie, tags, notes, potentiel, source_import, assigned_to, date_estimation, photo_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('CreateTest', 'P', '', '', '', '', '', '', 'autre', '[]', '', 3, 'manuel', 2, '2026-03-01', 'https://x/p.jpg')
  const c = db.prepare("SELECT * FROM contacts WHERE id = ?").get(r.lastInsertRowid)
  assert.strictEqual(c.assigned_to, 2)
  assert.strictEqual(c.date_estimation, '2026-03-01')
  assert.strictEqual(c.photo_url, 'https://x/p.jpg')
  assert.strictEqual(c.source_import, 'manuel')
})
