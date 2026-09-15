const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db = require('../data/db');
const { requireAuth, requireAdminLevel } = require('../middleware/auth');
const xui = require('../data/xui');

const router = express.Router();

function normalizeSubscription(item = {}, index = 0) {
  const currency = String(item.currency || 'RUB').toUpperCase();
  const days = Number(item.days || item.durationDays || item.months * 30 || 30);
  const months = Number(item.months || Math.max(1, Math.round(days / 30)) || 1);
  const devices = Number(item.devices || item.deviceLimit || 1);
  const price = Number(item.price || 0);
  const order = Number(item.order ?? index + 1);
  const active = item.active !== false && item.enabled !== false;
  const discount = Number(item.discount || 0);
  const badge = String(item.badge || '').trim();
  const name = String(item.name || item.title || item.period || `${months} ${months === 1 ? 'месяц' : months < 5 ? 'месяца' : 'месяцев'}`).trim();
  const period = String(item.period || (days >= 365 ? '12 месяцев' : days >= 180 ? '6 месяцев' : days >= 90 ? '3 месяца' : '1 месяц')).trim();
  return {
    id: String(item.id || `plan-${index + 1}`),
    name,
    price,
    currency,
    days,
    months,
    devices,
    discount,
    badge,
    order,
    active,
    period
  };
}

function normalizeSubscriptions(items = []) {
  return (Array.isArray(items) ? items : []).map((item, index) => normalizeSubscription(item, index)).filter(item => item && item.id).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || Number(a.days) - Number(b.days));
}

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const admin = db.get('admins').find({ email }).value();
  if (!admin || !bcrypt.compareSync(password, admin.passwordHash)) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }
  const token = jwt.sign({ id: admin.id, email, role: 'admin', name: admin.name, adminRole: admin.role || 'junior' }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, admin: { email, name: admin.name, role: admin.role || 'junior' } });
});

// Список пользователей
router.get('/users', requireAuth('admin'), (req, res) => {
  const users = db.get('users').value().map(u => ({
    id: u.id, email: u.email, plan: u.plan, trialUntil: u.trialUntil, xuiClientId: u.xuiClientId, createdAt: u.createdAt
  }));
  res.json({ users });
});

// Все тикеты поддержки
router.get('/tickets', requireAuth('admin'), (req, res) => {
  res.json({ tickets: db.get('tickets').value() });
});

// Создать репорт (например, сводка по инцидентам/статистике)
router.post('/reports', requireAuth('admin'), (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Укажите title и body' });
  const report = {
    id: uuid(),
    adminId: req.user.id,
    adminName: req.user.name,
    title,
    body,
    createdAt: new Date().toISOString()
  };
  db.get('reports').push(report).write();
  res.json({ report });
});

router.get('/reports', requireAuth('admin'), (req, res) => {
  res.json({ reports: db.get('reports').value() });
});

router.get('/settings', requireAuth('admin'), (req, res) => {
  res.json({ settings: db.get('settings').value() });
});

router.get('/subscriptions', requireAuth('admin'), (req, res) => {
  res.json({ subscriptions: normalizeSubscriptions(db.get('settings.subscriptions').value()) });
});

router.post('/subscriptions', requireAuth('admin'), (req, res) => {
  const current = normalizeSubscriptions(db.get('settings.subscriptions').value());
  const next = normalizeSubscription({ ...req.body, id: req.body.id || uuid() }, current.length);
  const list = normalizeSubscriptions([...current, next]);
  db.get('settings').assign({ subscriptions: list }).write();
  res.status(201).json({ subscription: next });
});

router.put('/subscriptions/:id', requireAuth('admin'), (req, res) => {
  const list = normalizeSubscriptions(db.get('settings.subscriptions').value());
  const idx = list.findIndex(item => item.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Тариф не найден' });
  const updated = normalizeSubscription({ ...list[idx], ...req.body, id: req.params.id }, idx);
  const next = normalizeSubscriptions(list.map((item, index) => index === idx ? updated : item));
  db.get('settings').assign({ subscriptions: next }).write();
  res.json({ subscription: next[idx] });
});

router.delete('/subscriptions/:id', requireAuth('admin'), (req, res) => {
  const next = normalizeSubscriptions(db.get('settings.subscriptions').value()).filter(item => item.id !== req.params.id);
  db.get('settings').assign({ subscriptions: next }).write();
  res.json({ ok: true });
});

router.get('/network', requireAuth('admin'), async (req, res) => {
  try { res.json({ overview: await xui.getOverview() }); }
  catch (error) { res.json({ overview: { connected: false, ping: null, servers: [], error: error.message } }); }
});

router.get('/promos', requireAuth('admin'), (req, res) => res.json({ promos: db.get('promos').value() }));
router.post('/promos', requireAdminLevel('senior'), (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const type = ['trial_days', 'plan', 'discount_percent'].includes(req.body.type) ? req.body.type : 'trial_days';
  const value = String(req.body.value || '').trim();
  if (!code || !value) return res.status(400).json({ error: 'Укажите код и значение акции' });
  if (db.get('promos').find({ code }).value()) return res.status(409).json({ error: 'Такой промокод уже существует' });
  const promo = { id: uuid(), code, type, value, maxUses: Number(req.body.maxUses) || 0, uses: 0, expiresAt: req.body.expiresAt || null, createdAt: new Date().toISOString() };
  db.get('promos').push(promo).write();
  res.status(201).json({ promo });
});
router.delete('/promos/:id', requireAdminLevel('senior'), (req, res) => {
  db.get('promos').remove({ id: req.params.id }).write();
  res.json({ ok: true });
});

router.put('/settings', requireAuth('admin'), (req, res) => {
  const current = db.get('settings').value();
  const next = { ...current, ...req.body };
  if (!Number.isInteger(Number(next.trialDays)) || Number(next.trialDays) < 1 || Number(next.trialDays) > 90) {
    return res.status(400).json({ error: 'Тестовый период должен быть от 1 до 90 дней' });
  }
  next.subscriptions = normalizeSubscriptions(next.subscriptions);
  if (!Array.isArray(next.subscriptions) || next.subscriptions.length < 1 || next.subscriptions.length > 50) {
    return res.status(400).json({ error: 'Добавьте от 1 до 50 подписок' });
  }
  next.trialDays = Number(next.trialDays);
  db.set('settings', next).write();
  res.json({ settings: next });
});

router.put('/users/:id', requireAuth('admin'), (req, res) => {
  const user = db.get('users').find({ id: req.params.id });
  if (!user.value()) return res.status(404).json({ error: 'Пользователь не найден' });
  const allowed = {};
  if (req.body.plan !== undefined) allowed.plan = String(req.body.plan).slice(0, 80);
  if (req.body.trialUntil !== undefined) allowed.trialUntil = req.body.trialUntil || null;
  user.assign(allowed).write();
  res.json({ user: user.value() });
});

router.get('/admins', requireAdminLevel('owner'), (req, res) => {
  res.json({ admins: db.get('admins').value().map(({ passwordHash, ...admin }) => admin) });
});

router.post('/admins', requireAdminLevel('owner'), (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = ['junior', 'senior'].includes(req.body.role) ? req.body.role : 'junior';
  if (!email || password.length < 6) return res.status(400).json({ error: 'Нужны email и пароль от 6 символов' });
  if (db.get('admins').find({ email }).value()) return res.status(409).json({ error: 'Такой администратор уже существует' });
  const admin = { id: uuid(), email, name: String(req.body.name || email).slice(0, 80), role, passwordHash: bcrypt.hashSync(password, 10), createdAt: new Date().toISOString() };
  db.get('admins').push(admin).write();
  const { passwordHash, ...safeAdmin } = admin;
  res.status(201).json({ admin: safeAdmin });
});

router.put('/admins/:id', requireAdminLevel('owner'), (req, res) => {
  const admin = db.get('admins').find({ id: req.params.id });
  if (!admin.value()) return res.status(404).json({ error: 'Администратор не найден' });
  const changes = {};
  if (req.body.name) changes.name = String(req.body.name).slice(0, 80);
  if (['junior', 'senior', 'owner'].includes(req.body.role)) changes.role = req.body.role;
  if (req.body.password) changes.passwordHash = bcrypt.hashSync(String(req.body.password), 10);
  admin.assign(changes).write();
  const { passwordHash, ...safeAdmin } = admin.value();
  res.json({ admin: safeAdmin });
});

module.exports = router;
