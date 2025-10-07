import jwt from 'jsonwebtoken';

export function ensureAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

export function ensureAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Acesso negado (admin)' });
  next();
}