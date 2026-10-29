const jwt = require('jsonwebtoken');

const isProd = process.env.NODE_ENV === 'production';
const SECRET = process.env.JWT_SECRET || (isProd ? null : 'immo-relances-dev-secret');
if (!SECRET) {
  throw new Error('JWT_SECRET est obligatoire en production. Définissez la variable d\'environnement JWT_SECRET.');
}

function signToken(user) {
  // Seize heures : une journée d'appels va de 9h à 20h, et le jeton de 8h
  // expirait à 17h — au clic « Enregistrer » d'un appel en cours, dont la
  // saisie était perdue. Seize heures couvrent un login à 9h jusqu'à 1h du
  // matin. Le compte est revérifié en base à chaque requête (voir
  // requireAuth), donc un jeton long ne prolonge pas un accès révoqué.
  return jwt.sign({ id: user.id, role: user.role, email: user.email }, SECRET, { expiresIn: '16h' });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

// Le compte est relu à chaque requête : un jeton signé reste valide seize
// heures, mais un compte désactivé ou dont le rôle a changé doit l'être tout
// de suite, pas au prochain login. Une lecture SQLite par clé primaire : sans
// coût mesurable.
const compteActif = require('./database').db.prepare('SELECT role FROM users WHERE id = ? AND actif = 1');

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié' });
  let jeton;
  try { jeton = verifyToken(auth.slice(7)); }
  catch { return res.status(401).json({ error: 'Token invalide' }); }
  const compte = compteActif.get(jeton.id);
  if (!compte) return res.status(401).json({ error: 'Compte désactivé' });
  // Le rôle en base fait foi, pas celui figé dans le jeton.
  req.user = { ...jeton, role: compte.role };
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Accès refusé' });
    next();
  };
}

module.exports = { signToken, verifyToken, requireAuth, requireRole };
