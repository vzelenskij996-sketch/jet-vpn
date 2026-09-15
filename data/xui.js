// Интеграция с панелью 3x-ui.
// 3x-ui даёт HTTP API поверх сессионной cookie-авторизации.
// Ниже — рабочий каркас запросов; проверьте пути под версию вашей панели
// (у части форков 3x-ui эндпоинты отличаются, сверяйтесь с документацией своей панели).

const XUI_URL = process.env.XUI_PANEL_URL;
const XUI_USER = process.env.XUI_USERNAME;
const XUI_PASS = process.env.XUI_PASSWORD;
const INBOUND_ID = process.env.XUI_INBOUND_ID;

let sessionCookie = null;

async function login() {
  if (!XUI_URL) throw new Error('XUI_PANEL_URL не задан в .env');
  const res = await fetch(`${XUI_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${encodeURIComponent(XUI_USER)}&password=${encodeURIComponent(XUI_PASS)}`
  });
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) throw new Error('Не удалось авторизоваться в 3x-ui');
  sessionCookie = setCookie.split(';')[0];
  return sessionCookie;
}

async function xuiFetch(pathname, options = {}) {
  if (!sessionCookie) await login();
  const res = await fetch(`${XUI_URL}${pathname}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Cookie: sessionCookie
    }
  });
  if (res.status === 401) {
    // сессия истекла — логинимся заново и повторяем один раз
    await login();
    return xuiFetch(pathname, options);
  }
  return res.json();
}

// Создать клиента (конфиг) для пользователя на нужном inbound
async function createClient({ email, totalGB = 0, expiryDays = 30 }) {
  const uuid = require('uuid').v4();
  const expiryTime = expiryDays ? Date.now() + expiryDays * 86400000 : 0;

  const clientSettings = {
    id: INBOUND_ID,
    settings: JSON.stringify({
      clients: [{
        id: uuid,
        email,
        totalGB: totalGB * 1024 * 1024 * 1024,
        expiryTime,
        enable: true
      }]
    })
  };

  const result = await xuiFetch('/panel/api/inbounds/addClient', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(clientSettings)
  });

  return { uuid, result };
}

// Удалить/деактивировать клиента (например, при окончании подписки)
async function removeClient(clientUuid) {
  return xuiFetch(`/panel/api/inbounds/${INBOUND_ID}/delClient/${clientUuid}`, {
    method: 'POST'
  });
}

async function getOverview() {
  const started = Date.now();
  const [inbounds, server] = await Promise.all([
    xuiFetch('/panel/api/inbounds/list'),
    xuiFetch('/panel/api/server/status').catch(() => null)
  ]);
  return {
    connected: true,
    ping: Date.now() - started,
    servers: Array.isArray(inbounds?.obj) ? inbounds.obj.map(item => ({ id: item.id, remark: item.remark || `Inbound ${item.id}`, port: item.port, protocol: item.protocol, enabled: item.enable !== false })) : [],
    server: server?.obj || server?.data || null
  };
}

module.exports = { createClient, removeClient, login, getOverview };
