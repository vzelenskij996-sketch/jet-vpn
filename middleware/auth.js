const jwt = require('jsonwebtoken');
require('dotenv').config();

function requireAuth(role) {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Нет токена авторизации' });
    }
    const token = header.slice(7);
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (role && payload.role !== role) {
        return res.status(403).json({ error: 'Недостаточно прав' });
      }
      req.user = payload;
      next();
    } catch (e) {
      return res.status(401).json({ error: 'Недействительный или истёкший токен' });
    }
  };
}

function requireAdminLevel(level) {
  const ranks = { junior: 1, senior: 2, owner: 3 };
  return (req, res, next) => {
    requireAuth('admin')(req, res, () => {
      if ((ranks[req.user.adminRole] || 0) < (ranks[level] || 99)) {
        return res.status(403).json({ error: 'Недостаточно прав для этой операции' });
      }
      next();
    });
  };
}

module.exports = { requireAuth, requireAdminLevel };
