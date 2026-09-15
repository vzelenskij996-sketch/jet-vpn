const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const adapter = new FileSync(path.join(__dirname, 'db.json'));
const db = low(adapter);

db.defaults({
  users: [],       // { id, email, passwordHash, plan, subscriptionId, createdAt, trialUntil, xuiClientId }
  admins: [],       // { id, email, passwordHash, name }
  tickets: [],      // { id, userId, userEmail, status, messages: [{from, text, ts}], createdAt }
  reports: [],     // { id, userId, userEmail, title, body, source, createdAt }
  promos: [],      // { id, code, type, value, maxUses, uses, expiresAt, createdAt }
  settings: {
    logoText: 'Jet VPN',
    botUrl: 'https://t.me/jetvpnpro_bot',
    trialDays: 3,
    heroEyebrow: 'Более 100 клиентов доверяют нам ежедневно',
    heroTitle: 'Интернет без границ.',
    heroTitleAccent: 'Приватность без вопросов.',
    heroDescription: 'Быстрые сервера, собственная панель управления и честные тарифы — без логов, без ограничений скорости, без компромиссов.',
    subscriptions: [
      { id: '1m-3', name: '1 месяц', period: '1 месяц', months: 1, devices: 3, price: 100, currency: 'RUB', days: 30, discount: 0, badge: '', order: 1, active: true },
      { id: '1m-6', name: '1 месяц', period: '1 месяц', months: 1, devices: 6, price: 185, currency: 'RUB', days: 30, discount: 0, badge: '', order: 2, active: true },
      { id: '1m-9', name: '1 месяц', period: '1 месяц', months: 1, devices: 9, price: 270, currency: 'RUB', days: 30, discount: 0, badge: '', order: 3, active: true },
      { id: '3m-3', name: '3 месяца', period: '3 месяца', months: 3, devices: 3, price: 300, currency: 'RUB', days: 90, discount: 0, badge: 'Популярный', order: 4, active: true },
      { id: '3m-6', name: '3 месяца', period: '3 месяца', months: 3, devices: 6, price: 465, currency: 'RUB', days: 90, discount: 0, badge: '', order: 5, active: true },
      { id: '3m-9', name: '3 месяца', period: '3 месяца', months: 3, devices: 9, price: 630, currency: 'RUB', days: 90, discount: 0, badge: '', order: 6, active: true },
      { id: '6m-3', name: '6 месяцев', period: '6 месяцев', months: 6, devices: 3, price: 600, currency: 'RUB', days: 180, discount: 0, badge: '', order: 7, active: true },
      { id: '6m-6', name: '6 месяцев', period: '6 месяцев', months: 6, devices: 6, price: 885, currency: 'RUB', days: 180, discount: 0, badge: '', order: 8, active: true },
      { id: '6m-9', name: '6 месяцев', period: '6 месяцев', months: 6, devices: 9, price: 1170, currency: 'RUB', days: 180, discount: 0, badge: '', order: 9, active: true },
      { id: '12m-3', name: '12 месяцев', period: '12 месяцев', months: 12, devices: 3, price: 1200, currency: 'RUB', days: 365, discount: 0, badge: '', order: 10, active: true },
      { id: '12m-6', name: '12 месяцев', period: '12 месяцев', months: 12, devices: 6, price: 1725, currency: 'RUB', days: 365, discount: 0, badge: '', order: 11, active: true },
      { id: '12m-9', name: '12 месяцев', period: '12 месяцев', months: 12, devices: 9, price: 2250, currency: 'RUB', days: 365, discount: 0, badge: '', order: 12, active: true }
    ],
    plans: [
      { id: 'basic', name: 'Базовый', price: 299, note: 'Для одного устройства', features: ['1 устройство', 'Базовые сервера', 'До 50 Мбит/с'] },
      { id: 'standard', name: 'Стандарт', price: 599, note: 'Для семьи из 3–5 устройств', features: ['5 устройств', 'Все сервера', 'Безлимитная скорость', 'Приоритетная поддержка'] },
      { id: 'pro', name: 'Про', price: 1290, note: 'Для продвинутых сценариев', features: ['10 устройств', 'Выделенный IP', 'Безлимитная скорость', 'API-доступ'] }
    ]
  }
}).write();

if (!db.get('settings.subscriptions').value()) {
  db.set('settings.subscriptions', [
    { id: '1m-3', name: '1 месяц', period: '1 месяц', months: 1, devices: 3, price: 100, currency: 'RUB', days: 30, discount: 0, badge: '', order: 1, active: true },
    { id: '1m-6', name: '1 месяц', period: '1 месяц', months: 1, devices: 6, price: 185, currency: 'RUB', days: 30, discount: 0, badge: '', order: 2, active: true },
    { id: '1m-9', name: '1 месяц', period: '1 месяц', months: 1, devices: 9, price: 270, currency: 'RUB', days: 30, discount: 0, badge: '', order: 3, active: true },
    { id: '3m-3', name: '3 месяца', period: '3 месяца', months: 3, devices: 3, price: 300, currency: 'RUB', days: 90, discount: 0, badge: 'Популярный', order: 4, active: true },
    { id: '3m-6', name: '3 месяца', period: '3 месяца', months: 3, devices: 6, price: 465, currency: 'RUB', days: 90, discount: 0, badge: '', order: 5, active: true },
    { id: '3m-9', name: '3 месяца', period: '3 месяца', months: 3, devices: 9, price: 630, currency: 'RUB', days: 90, discount: 0, badge: '', order: 6, active: true },
    { id: '6m-3', name: '6 месяцев', period: '6 месяцев', months: 6, devices: 3, price: 600, currency: 'RUB', days: 180, discount: 0, badge: '', order: 7, active: true },
    { id: '6m-6', name: '6 месяцев', period: '6 месяцев', months: 6, devices: 6, price: 885, currency: 'RUB', days: 180, discount: 0, badge: '', order: 8, active: true },
    { id: '6m-9', name: '6 месяцев', period: '6 месяцев', months: 6, devices: 9, price: 1170, currency: 'RUB', days: 180, discount: 0, badge: '', order: 9, active: true },
    { id: '12m-3', name: '12 месяцев', period: '12 месяцев', months: 12, devices: 3, price: 1200, currency: 'RUB', days: 365, discount: 0, badge: '', order: 10, active: true },
    { id: '12m-6', name: '12 месяцев', period: '12 месяцев', months: 12, devices: 6, price: 1725, currency: 'RUB', days: 365, discount: 0, badge: '', order: 11, active: true },
    { id: '12m-9', name: '12 месяцев', period: '12 месяцев', months: 12, devices: 9, price: 2250, currency: 'RUB', days: 365, discount: 0, badge: '', order: 12, active: true }
  ]).write();
}

// Миграция старых тарифов к единому серверному формату каталога.
const subscriptions = db.get('settings.subscriptions').value() || [];
db.set('settings.subscriptions', subscriptions.map((item, index) => {
  const days = Number(item.days || item.durationDays || (item.months ? item.months * 30 : 30));
  const months = Number(item.months || Math.max(1, Math.round(days / 30)));
  return {
    ...item,
    id: String(item.id || `plan-${index + 1}`),
    name: String(item.name || item.title || item.period || `${months} месяцев`),
    price: Number(item.price || 0),
    currency: String(item.currency || 'RUB').toUpperCase(),
    days,
    months,
    discount: Number(item.discount || 0),
    badge: String(item.badge || ''),
    order: Number(item.order || index + 1),
    active: item.active !== false
  };
})).write();

function createAccountId() {
  let accountId;
  do {
    accountId = String(Math.floor(10000 + Math.random() * 90000));
  } while (db.get('users').find({ accountId }).value());
  return accountId;
}

db.get('users').value().forEach(user => {
  const changes = {};
  if (!user.accountId) changes.accountId = createAccountId();
  if (!Array.isArray(user.devices)) changes.devices = [];
  if (!Array.isArray(user.activity)) changes.activity = [];
  if (typeof user.subscriptionFrozen !== 'boolean') changes.subscriptionFrozen = false;
  if (!user.subscriptionFrozenAt) changes.subscriptionFrozenAt = null;
  if (typeof user.usedGB !== 'number') changes.usedGB = 0;
  if (Object.keys(changes).length) db.get('users').find({ id: user.id }).assign(changes).write();
});

// Миграция старых данных: ранее у админов не было уровней доступа.
db.get('admins').value().forEach(admin => {
  if (!admin.role) db.get('admins').find({ id: admin.id }).assign({ role: 'owner' }).write();
});

// Создаём первого админа автоматически, если админов ещё нет
if (db.get('admins').size().value() === 0 && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const passwordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
  db.get('admins').push({
    id: 'admin_' + Date.now(),
    email: process.env.ADMIN_EMAIL,
    passwordHash,
    name: 'Главный админ',
    role: 'owner',
    createdAt: new Date().toISOString()
  }).write();
  console.log(`[init] Создан админ по умолчанию: ${process.env.ADMIN_EMAIL}`);
}

module.exports = db;
