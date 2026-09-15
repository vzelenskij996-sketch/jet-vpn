const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db = require('../data/db');
const xui = require('../data/xui');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function createAccountId() {
  let accountId;
  do {
    accountId = String(Math.floor(10000 + Math.random() * 90000));
  } while (db.get('users').find({ accountId }).value());
  return accountId;
}

function addActivity(user, type, text, meta = {}) {
  const activity = { id: uuid(), type, text, createdAt: new Date().toISOString(), ...meta };
  const current = Array.isArray(user.value().activity) ? user.value().activity : [];
  user.assign({ activity: [...current, activity].slice(-100) }).write();
  return activity;
}

function subscriptionUntilFor(subscription, from = new Date()) {
  return new Date(from.getTime() + Number(subscription.days || subscription.months * 30 || 30) * 86400000).toISOString();
}

router.post('/register', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const subscriptionId = String(req.body.subscriptionId || '').trim();

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Введите корректный email' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
  }
  if (db.get('users').find({ email }).value()) {
    return res.status(409).json({ error: 'Пользователь с таким email уже зарегистрирован' });
  }
  if (subscriptionId && !db.get('settings.subscriptions').find({ id: subscriptionId }).value()) {
    return res.status(400).json({ error: 'Выбранная подписка недоступна' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const user = {
    id: uuid(),
    accountId: createAccountId(),
    email,
    passwordHash,
    plan: null,
    subscriptionId: subscriptionId || null,
    trialUntil: null,
    xuiClientId: null,
    subscriptionUntil: null,
    subscriptionFrozen: false,
    usedGB: 0,
    devices: [],
    activity: [{ id: uuid(), type: 'account', text: 'Аккаунт создан', createdAt: new Date().toISOString() }],
    createdAt: new Date().toISOString()
  };

  try {
    db.get('users').push(user).write();
  } catch (e) {
    return res.status(500).json({ error: 'Не удалось сохранить пользователя, попробуйте ещё раз' });
  }

  const token = jwt.sign({ id: user.id, email, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.status(201).json({ token, user: { email, accountId: user.accountId, plan: user.plan, subscriptionId: user.subscriptionId, trialUntil: user.trialUntil } });
});

router.post('/login', (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Введите email и пароль' });
  }

  const user = db.get('users').find({ email }).value();
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }
  const token = jwt.sign({ id: user.id, email, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { email, accountId: user.accountId, plan: user.plan, subscriptionId: user.subscriptionId, trialUntil: user.trialUntil } });
});

// Запуск тестового периода — берём email из токена, а не из тела запроса,
// чтобы нельзя было запросить триал на чужой аккаунт
router.post('/trial', requireAuth('user'), async (req, res) => {
  const email = req.user.email;
  const user = db.get('users').find({ email }).value();
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (user.trialUntil) return res.status(400).json({ error: 'Тестовый период уже был использован' });

  try {
    const trialDays = Number(db.get('settings.trialDays').value()) || 3;
    const { uuid: clientId } = await xui.createClient({ email, expiryDays: trialDays, totalGB: 0 });
    const trialUntil = new Date(Date.now() + trialDays * 86400000).toISOString();
    db.get('users').find({ email }).assign({ trialUntil, xuiClientId: clientId }).write();
    res.json({ ok: true, trialUntil });
  } catch (e) {
    // Панель 3x-ui не настроена/недоступна — не роняем регистрацию целиком
    res.status(502).json({ error: 'Не удалось создать конфиг: панель 3x-ui недоступна', details: e.message });
  }
});

// Данные текущего пользователя — для личного кабинета
router.get('/me', requireAuth('user'), (req, res) => {
  const user = db.get('users').find({ email: req.user.email }).value();
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  const subscriptionInfo = user.subscriptionId ? db.get('settings.subscriptions').find({ id: user.subscriptionId }).value() : null;
  const expired = !user.subscriptionUntil || new Date(user.subscriptionUntil) <= new Date();
  const active = Boolean(subscriptionInfo && !expired && !user.subscriptionFrozen);
  const remainingDays = user.subscriptionUntil && !expired ? Math.max(0, Math.ceil((new Date(user.subscriptionUntil) - Date.now()) / 86400000)) : 0;
  res.json({ user: {
    email: user.email,
    accountId: user.accountId,
    plan: user.plan || (subscriptionInfo ? `${subscriptionInfo.period} / ${subscriptionInfo.devices} устройств` : 'Нет активного'),
    subscriptionId: user.subscriptionId,
    subscriptionUntil: user.subscriptionUntil,
    subscriptionFrozen: Boolean(user.subscriptionFrozen),
    subscriptionActive: active,
    remainingDays,
    trialUntil: user.trialUntil,
    remainingGB: subscriptionInfo ? (subscriptionInfo.devices >= 6 || subscriptionInfo.months >= 6 ? 'Безлимит' : `${Math.max(8, subscriptionInfo.devices * 10)} ГБ осталось`) : 'Нет подписки',
    usedGB: Number(user.usedGB || 0),
    devices: Array.isArray(user.devices) ? user.devices : [],
    activity: Array.isArray(user.activity) ? user.activity.slice().reverse() : []
  } });
});

router.post('/subscription', requireAuth('user'), (req, res) => {
  const subscriptionId = String(req.body.subscriptionId || '').trim();
  const subscription = db.get('settings.subscriptions').find({ id: subscriptionId }).value();
  if (!subscription) return res.status(400).json({ error: 'Подписка не найдена' });

  const user = db.get('users').find({ email: req.user.email });
  if (!user.value()) return res.status(404).json({ error: 'Пользователь не найден' });

  const currentUntil = user.value().subscriptionUntil && new Date(user.value().subscriptionUntil) > new Date() ? new Date(user.value().subscriptionUntil) : new Date();
  const nextPlan = `${subscription.period} / ${subscription.devices} устройств`;
  user.assign({ subscriptionId, plan: nextPlan, subscriptionUntil: subscriptionUntilFor(subscription, currentUntil), subscriptionFrozen: false, subscriptionFrozenAt: null }).write();
  addActivity(user, 'subscription', `Подписка подключена: ${nextPlan}`);
  const remainingGB = subscription.devices >= 6 || subscription.months >= 6 ? 'Безлимит' : `${Math.max(8, subscription.devices * 10)} ГБ осталось`;

  res.json({ ok: true, subscription, user: { plan: nextPlan, subscriptionId, subscriptionUntil: user.value().subscriptionUntil, remainingGB } });
});

router.post('/subscription/freeze', requireAuth('user'), (req, res) => {
  const user = db.get('users').find({ email: req.user.email });
  if (!user.value()) return res.status(404).json({ error: 'Пользователь не найден' });
  const frozen = Boolean(req.body.frozen);
  const current = user.value();
  if (frozen && !current.subscriptionFrozen) {
    user.assign({ subscriptionFrozen: true, subscriptionFrozenAt: new Date().toISOString() }).write();
  } else if (!frozen && current.subscriptionFrozen) {
    const frozenAt = current.subscriptionFrozenAt ? new Date(current.subscriptionFrozenAt) : new Date();
    const extension = Math.max(0, Date.now() - frozenAt.getTime());
    const subscriptionUntil = current.subscriptionUntil ? new Date(new Date(current.subscriptionUntil).getTime() + extension).toISOString() : null;
    user.assign({ subscriptionFrozen: false, subscriptionFrozenAt: null, subscriptionUntil }).write();
  }
  addActivity(user, 'freeze', frozen ? 'Подписка заморожена' : 'Подписка разморожена');
  res.json({ ok: true, frozen });
});

router.post('/subscription/gift', requireAuth('user'), (req, res) => {
  const subscriptionId = String(req.body.subscriptionId || '').trim();
  const recipientAccountId = String(req.body.recipientAccountId || '').trim();
  const subscription = db.get('settings.subscriptions').find({ id: subscriptionId }).value();
  if (!subscription) return res.status(400).json({ error: 'Подписка не найдена' });
  if (!/^\d{5}$/.test(recipientAccountId)) return res.status(400).json({ error: 'ID получателя должен состоять из 5 цифр' });
  const sender = db.get('users').find({ email: req.user.email });
  const recipient = db.get('users').find({ accountId: recipientAccountId });
  if (!sender.value() || !recipient.value()) return res.status(404).json({ error: 'Получатель не найден' });
  if (sender.value().accountId === recipientAccountId) return res.status(400).json({ error: 'Нельзя подарить подписку самому себе' });
  const currentUntil = recipient.value().subscriptionUntil && new Date(recipient.value().subscriptionUntil) > new Date() ? new Date(recipient.value().subscriptionUntil) : new Date();
  const plan = `${subscription.period} / ${subscription.devices} устройств`;
  recipient.assign({ subscriptionId, plan, subscriptionUntil: subscriptionUntilFor(subscription, currentUntil), subscriptionFrozen: false }).write();
  addActivity(sender, 'gift', `Подарена подписка пользователю #${recipientAccountId}`, { recipientAccountId, subscriptionId });
  addActivity(recipient, 'gift', `Получена подписка в подарок от #${sender.value().accountId}`, { senderAccountId: sender.value().accountId, subscriptionId });
  res.json({ ok: true, recipientAccountId, subscription: { id: subscription.id, plan, until: recipient.value().subscriptionUntil } });
});

router.delete('/devices/:id', requireAuth('user'), (req, res) => {
  const user = db.get('users').find({ email: req.user.email });
  if (!user.value()) return res.status(404).json({ error: 'Пользователь не найден' });
  const devices = (user.value().devices || []).filter(device => device.id !== req.params.id);
  user.assign({ devices }).write();
  addActivity(user, 'device', 'Устройство отключено');
  res.json({ ok: true, devices });
});

// Репорт пользователя виден администраторам в общей панели.
router.post('/reports', requireAuth('user'), (req, res) => {
  const title = String(req.body.title || '').trim();
  const body = String(req.body.body || '').trim();
  if (!title || !body) return res.status(400).json({ error: 'Заполните заголовок и текст' });
  if (title.length > 120 || body.length > 3000) return res.status(400).json({ error: 'Репорт слишком длинный' });

  const report = {
    id: uuid(),
    userId: req.user.id,
    userEmail: req.user.email,
    title,
    body,
    source: 'user',
    createdAt: new Date().toISOString()
  };
  db.get('reports').push(report).write();
  const io = req.app.get('io');
  if (io) io.to('admins').emit('new_report', { report });
  res.status(201).json({ report });
});

router.post('/promo', requireAuth('user'), (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const promo = db.get('promos').find({ code }).value();
  if (!promo) return res.status(404).json({ error: 'Промокод не найден' });
  if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) return res.status(400).json({ error: 'Срок действия промокода истёк' });
  if (promo.maxUses && promo.uses >= promo.maxUses) return res.status(400).json({ error: 'Лимит промокода исчерпан' });
  const user = db.get('users').find({ email: req.user.email });
  if (!user.value()) return res.status(404).json({ error: 'Пользователь не найден' });
  const changes = {};
  if (promo.type === 'trial_days') {
    const base = user.value().trialUntil && new Date(user.value().trialUntil) > new Date() ? new Date(user.value().trialUntil) : new Date();
    changes.trialUntil = new Date(base.getTime() + Number(promo.value) * 86400000).toISOString();
  }
  if (promo.type === 'plan') changes.plan = String(promo.value);
  if (promo.type === 'discount_percent') changes.discountPercent = Math.min(100, Math.max(1, Number(promo.value) || 0));
  user.assign(changes).write();
  db.get('promos').find({ id: promo.id }).assign({ uses: (promo.uses || 0) + 1 }).write();
  const message = promo.type === 'trial_days' ? `Добавлено дней: ${promo.value}` : promo.type === 'discount_percent' ? `Скидка активирована: ${promo.value}%` : `Тариф изменён: ${promo.value}`;
  res.json({ ok: true, message, user: { plan: user.value().plan, trialUntil: user.value().trialUntil, discountPercent: user.value().discountPercent || 0 } });
});

module.exports = router;
