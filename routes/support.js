const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../data/db');

const router = express.Router();

// Создать новый тикет (используется, когда пользователь открывает чат впервые)
router.post('/tickets', (req, res) => {
  const userEmail = String(req.body.userEmail || '').trim();
  const message = String(req.body.message || '').trim();
  if (!userEmail || !message) return res.status(400).json({ error: 'Укажите userEmail и message' });
  if (message.length > 2000) return res.status(400).json({ error: 'Сообщение слишком длинное' });

  const ticket = {
    id: uuid(),
    userEmail,
    status: 'open',
    messages: [{ from: 'user', text: message, ts: new Date().toISOString() }],
    createdAt: new Date().toISOString()
  };
  db.get('tickets').push(ticket).write();

  // Уведомляем всех подключённых админов сразу, не дожидаясь следующего сообщения
  const io = req.app.get('io');
  if (io) io.to('admins').emit('ticket_activity', { ticketId: ticket.id, userEmail, message: ticket.messages[0] });

  res.status(201).json({ ticket });
});

router.get('/tickets/:id', (req, res) => {
  const ticket = db.get('tickets').find({ id: req.params.id }).value();
  if (!ticket) return res.status(404).json({ error: 'Тикет не найден' });
  res.json({ ticket });
});

module.exports = router;
