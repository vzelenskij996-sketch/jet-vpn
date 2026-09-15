require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const path = require('path');

const db = require('./data/db');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const supportRoutes = require('./routes/support');
const xui = require('./data/xui');

const app = express();
const server = http.createServer(app);
const ORIGIN = process.env.SITE_URL || '*';
const io = new Server(server, { cors: { origin: ORIGIN } });

app.use(cors({ origin: ORIGIN }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (/\.(html|css|js|svg)$/.test(filePath)) res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  }
}));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);

// Даём роутам доступ к io, чтобы уведомлять админов о новых тикетах в реальном времени
app.set('io', io);

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/settings', (req, res) => res.json({ settings: db.get('settings').value() }));
app.get('/api/service-status', async (req, res) => {
  try {
    const overview = await xui.getOverview();
    res.json({ connected: true, ping: overview.ping, servers: overview.servers.length });
  } catch (error) {
    res.json({ connected: false, ping: null, servers: 0, error: 'VPN-панель не подключена' });
  }
});

// ---- Socket.io: чат поддержки в реальном времени ----
// Комнаты: каждый тикет — своя комната "ticket:<id>".
// Пользователь подключается к своему тикету, админы могут подключиться к любому и отвечать.
io.on('connection', (socket) => {
  socket.on('join_ticket', ({ ticketId }) => {
    socket.join(`ticket:${ticketId}`);
  });

  // Клиентское сообщение (от пользователя или от админа).
  // callback — функция подтверждения (socket.io ack), чтобы отправитель знал,
  // дошло сообщение или нет, а не терял его молча.
  socket.on('send_message', ({ ticketId, from, text, adminToken }, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    const cleanText = String(text || '').trim();

    if (!ticketId || !cleanText) return ack({ ok: false, error: 'Пустое сообщение' });
    if (cleanText.length > 2000) return ack({ ok: false, error: 'Сообщение слишком длинное (макс. 2000 символов)' });

    if (from === 'admin') {
      try {
        const payload = jwt.verify(adminToken, process.env.JWT_SECRET);
        if (payload.role !== 'admin') return ack({ ok: false, error: 'Нет прав администратора' });
      } catch (e) {
        return ack({ ok: false, error: 'Сессия истекла, войдите заново' });
      }
    }

    const ticket = db.get('tickets').find({ id: ticketId }).value();
    if (!ticket) return ack({ ok: false, error: 'Тикет не найден' });
    if (ticket.status === 'closed' && from === 'user') {
      db.get('tickets').find({ id: ticketId }).assign({ status: 'open' }).write();
      io.to('admins').emit('ticket_status_changed', { ticketId, status: 'open' });
    }

    const message = { from, text: cleanText, ts: new Date().toISOString() };
    db.get('tickets').find({ id: ticketId }).get('messages').push(message).write();

    io.to(`ticket:${ticketId}`).emit('new_message', { ticketId, message });
    if (from === 'user') {
      io.to('admins').emit('ticket_activity', { ticketId, userEmail: ticket.userEmail, message });
    }
    ack({ ok: true });
  });

  // Админская панель подписывается на все новые обращения
  socket.on('join_admin_room', ({ adminToken }) => {
    try {
      const payload = jwt.verify(adminToken, process.env.JWT_SECRET);
      if (payload.role === 'admin') socket.join('admins');
    } catch (e) { /* игнорируем */ }
  });

  socket.on('close_ticket', ({ ticketId, adminToken }, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    try {
      const payload = jwt.verify(adminToken, process.env.JWT_SECRET);
      if (payload.role !== 'admin') return ack({ ok: false, error: 'Нет прав администратора' });
      const ticket = db.get('tickets').find({ id: ticketId });
      if (!ticket.value()) return ack({ ok: false, error: 'Тикет не найден' });
      ticket.assign({ status: 'closed' }).write();
      io.to(`ticket:${ticketId}`).emit('ticket_closed', { ticketId });
      io.to('admins').emit('ticket_status_changed', { ticketId, status: 'closed' });
      ack({ ok: true });
    } catch (e) {
      ack({ ok: false, error: 'Сессия истекла, войдите заново' });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Jet VPN запущен на порту ${PORT}`);
  console.log(`Сайт:   ${process.env.SITE_URL || 'http://localhost:' + PORT}`);
  console.log(`Админка: ${(process.env.SITE_URL || 'http://localhost:' + PORT)}/admin.html`);
});
