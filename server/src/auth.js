const jwt = require('jsonwebtoken');

const isProd = process.env.NODE_ENV === 'production';
const SECRET = process.env.JWT_SECRET || (isProd ? null : 'immo-relances-dev-secret');
if (!SECRET) {
  throw new Error('JWT_SECRET est obligatoire en production. Définissez la variable d\'environnement JWT_SECRET.');
}

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, email: user.email }, SECRET, { expiresIn: '8h' });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié' });
  try {
    req.user = verifyToken(auth.slice(7));
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Accès refusé' });
    next();
  };
}

module.exports = { signToken, verifyToken, requireAuth, requireRole };
