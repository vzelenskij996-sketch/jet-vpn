function getAdminToken(){ return localStorage.getItem('nx_admin_token'); }
function setAdminToken(t, name, role){ localStorage.setItem('nx_admin_token', t); localStorage.setItem('nx_admin_name', name); localStorage.setItem('nx_admin_role', role || 'junior'); }

let socket = null;
let activeTicketId = null;
let allTickets = [];

if (getAdminToken()) enterApp();

async function adminLogin(){
  const email = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-password').value;
  const err = document.getElementById('login-err');
  err.style.display = 'none';
  try{
    const res = await fetch('/api/admin/login', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok){ err.textContent = data.error; err.style.display = 'block'; return; }
    setAdminToken(data.token, data.admin.name, data.admin.role);
    enterApp();
  } catch(e){ err.textContent = 'Не удалось связаться с сервером'; err.style.display = 'block'; }
}

function adminLogout(){
  localStorage.removeItem('nx_admin_token'); localStorage.removeItem('nx_admin_name');
  location.reload();
}

function enterApp(){
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'flex';
  socket = io();
  socket.emit('join_admin_room', { adminToken: getAdminToken() });
  socket.on('connect', () => socket.emit('join_admin_room', { adminToken: getAdminToken() }));
  socket.on('ticket_activity', ({ ticketId }) => {
    // если это совсем новый тикет — перезагружаем список полностью
    if (!allTickets.find(t => t.id === ticketId)) loadTickets();
  });
  socket.on('new_message', ({ ticketId, message }) => {
    // обновляем превью в списке слева, не дожидаясь ticket_activity
    const t = allTickets.find(t => t.id === ticketId);
    if (t) { t.messages.push(message); renderTicketList(message.from === 'user' ? ticketId : undefined); }
    if (ticketId === activeTicketId) renderChatMessage(message);
  });
  socket.on('new_report', () => loadReports());
  socket.on('ticket_status_changed', ({ ticketId, status }) => {
    const t = allTickets.find(t => t.id === ticketId);
    if (t) t.status = status;
    if (ticketId === activeTicketId) openTicket(ticketId);
    else renderTicketList();
  });
  loadTickets();
  loadUsers();
  loadReports();
  loadSettings();
  loadAdmins();
  loadNetwork();
  loadPromos();
}

async function loadSettings(){
  const data = await apiGet('/api/admin/settings');
  if (!data) return;
  const s = data.settings;
  const normalized = (s.subscriptions || []).map((item, index) => normalizeSubscriptionItem(item, index)).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || Number(a.days) - Number(b.days));
  document.getElementById('setting-logo').value = s.logoText || '';
  document.getElementById('setting-bot').value = s.botUrl || '';
  document.getElementById('setting-trial').value = s.trialDays || 3;
  document.getElementById('setting-texts').value = JSON.stringify({ heroEyebrow:s.heroEyebrow, heroTitle:s.heroTitle, heroTitleAccent:s.heroTitleAccent, heroDescription:s.heroDescription }, null, 2);
  document.getElementById('setting-plans').value = JSON.stringify(normalized, null, 2);
  renderSubscriptionManager(normalized);
}

function normalizeSubscriptionItem(item, index = 0){
  if (!item || typeof item !== 'object') return null;
  const days = Number(item.days || item.durationDays || (item.months ? Number(item.months) * 30 : 30));
  const months = Number(item.months || Math.max(1, Math.round(days / 30)) || 1);
  const devices = Number(item.devices || item.deviceLimit || 1);
  const price = Number(item.price || 0);
  const order = Number(item.order ?? index + 1);
  const active = item.active !== false && item.enabled !== false;
  const badge = String(item.badge || '').trim();
  const name = String(item.name || item.title || item.period || `${months} ${months === 1 ? 'месяц' : months < 5 ? 'месяца' : 'месяцев'}`).trim();
  const period = String(item.period || (days >= 365 ? '12 месяцев' : days >= 180 ? '6 месяцев' : days >= 90 ? '3 месяца' : '1 месяц')).trim();
  return {
    id: String(item.id || `plan-${index + 1}`),
    name,
    price,
    currency: String(item.currency || 'RUB').toUpperCase(),
    days,
    months,
    devices,
    discount: Number(item.discount || 0),
    badge,
    order,
    active,
    period
  };
}

function renderSubscriptionManager(items){
  const container = document.getElementById('subscription-manager');
  if (!container) return;
  if (!items.length) {
    container.innerHTML = '<div class="empty-state">Тарифы ещё не добавлены</div><button class="btn btn-primary" onclick="addSubscriptionRow()">Добавить тариф</button>';
    return;
  }
  container.innerHTML = items.map((item, index) => `
    <div class="report-item glass" style="padding:18px; margin-bottom:12px;">
      <div class="field"><label>ID</label><input data-index="${index}" data-field="id" value="${escapeHtml(item.id)}"></div>
      <div class="field"><label>Название</label><input data-index="${index}" data-field="name" value="${escapeHtml(item.name)}"></div>
      <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px;">
        <div class="field"><label>Цена</label><input data-index="${index}" data-field="price" type="number" value="${Number(item.price || 0)}"></div>
        <div class="field"><label>Валюта</label><input data-index="${index}" data-field="currency" value="${escapeHtml(item.currency || 'RUB')}"></div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px;">
        <div class="field"><label>Дней</label><input data-index="${index}" data-field="days" type="number" value="${Number(item.days || 30)}"></div>
        <div class="field"><label>Устройства</label><input data-index="${index}" data-field="devices" type="number" min="1" value="${Number(item.devices || 1)}"></div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px;">
        <div class="field"><label>Скидка %</label><input data-index="${index}" data-field="discount" type="number" min="0" value="${Number(item.discount || 0)}"></div>
        <div class="field"><label>Badge</label><input data-index="${index}" data-field="badge" value="${escapeHtml(item.badge || '')}"></div>
        <div class="field"><label>Порядок</label><input data-index="${index}" data-field="order" type="number" value="${Number(item.order || index + 1)}"></div>
      </div>
      <div class="field"><label>Активен</label><select data-index="${index}" data-field="active"><option value="true" ${item.active !== false ? 'selected' : ''}>Да</option><option value="false" ${item.active === false ? 'selected' : ''}>Нет</option></select></div>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <button class="btn btn-primary" onclick="saveSubscriptionRow(${index})">Сохранить</button>
        <button class="btn btn-ghost" onclick="deleteSubscriptionRow(${index})">Удалить</button>
      </div>
    </div>
  `).join('') + '<button class="btn btn-primary" onclick="addSubscriptionRow()">Добавить тариф</button>';
}

function collectSubscriptionRow(index){
  const container = document.getElementById('subscription-manager');
  if (!container) return null;
  const row = container.querySelectorAll('[data-index="' + index + '"]');
  if (!row || !row.length) return null;
  const values = {};
  row.forEach(input => {
    const field = input.dataset.field;
    if (!field) return;
    if (input.tagName === 'SELECT') values[field] = input.value === 'true';
    else values[field] = input.value;
  });
  const days = Number(values.days || 30);
  return {
    id: String(values.id || `plan-${index + 1}`),
    name: String(values.name || `Тариф ${index + 1}`),
    price: Number(values.price || 0),
    currency: String(values.currency || 'RUB').toUpperCase(),
    days,
    months: Number(values.months || Math.max(1, Math.round(days / 30)) || 1),
    devices: Number(values.devices || 1),
    discount: Number(values.discount || 0),
    badge: String(values.badge || '').trim(),
    order: Number(values.order || index + 1),
    active: values.active !== false,
    period: String(values.period || (days >= 365 ? '12 месяцев' : days >= 180 ? '6 месяцев' : days >= 90 ? '3 месяца' : '1 месяц'))
  };
}

async function saveSubscriptionRow(index){
  const list = JSON.parse(document.getElementById('setting-plans').value || '[]');
  const payload = collectSubscriptionRow(index);
  if (!payload) return;
  list[index] = payload;
  document.getElementById('setting-plans').value = JSON.stringify(list, null, 2);
  await saveSettings();
  loadSettings();
}

async function deleteSubscriptionRow(index){
  const list = JSON.parse(document.getElementById('setting-plans').value || '[]');
  list.splice(index, 1);
  document.getElementById('setting-plans').value = JSON.stringify(list, null, 2);
  await saveSettings();
  loadSettings();
}

function addSubscriptionRow(){
  const list = JSON.parse(document.getElementById('setting-plans').value || '[]');
  const nextIndex = list.length + 1;
  list.push({
    id: `plan-${Date.now()}`,
    name: `Тариф ${nextIndex}`,
    price: 0,
    currency: 'RUB',
    days: 30,
    months: 1,
    devices: 1,
    discount: 0,
    badge: '',
    order: nextIndex,
    active: true,
    period: '1 месяц'
  });
  document.getElementById('setting-plans').value = JSON.stringify(list, null, 2);
  renderSubscriptionManager(list.map((item, index) => normalizeSubscriptionItem(item, index)));
}

async function saveSettings(){
  const status = document.getElementById('settings-status');
  try{
    const texts = JSON.parse(document.getElementById('setting-texts').value || '{}');
    const plans = JSON.parse(document.getElementById('setting-plans').value || '[]').map((item, index) => normalizeSubscriptionItem(item, index));
    const payload = { logoText:document.getElementById('setting-logo').value.trim(), botUrl:document.getElementById('setting-bot').value.trim(), trialDays:Number(document.getElementById('setting-trial').value), ...texts, subscriptions: plans };
    const res = await fetch('/api/admin/settings', { method:'PUT', headers:{'Content-Type':'application/json', Authorization:'Bearer '+getAdminToken()}, body:JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Не удалось сохранить настройки');
    status.textContent = 'Сохранено'; status.style.color = 'var(--ok)';
  } catch (error){ status.textContent = error.message; status.style.color = 'var(--warn)'; }
}

async function loadAdmins(){
  const list = document.getElementById('admins-list');
  if (localStorage.getItem('nx_admin_role') !== 'owner'){ list.innerHTML = '<p class="empty-state">Раздел доступен только главному администратору.</p>'; return; }
  const data = await apiGet('/api/admin/admins');
  if (!data) return;
  list.innerHTML = data.admins.map(admin => `<div class="report-item glass"><b>${escapeHtml(admin.name)}</b><p>${escapeHtml(admin.email)}</p><span>${escapeHtml(admin.role)}</span></div>`).join('');
}

async function createAdmin(){
  const status = document.getElementById('admins-status');
  const payload = { name:document.getElementById('new-admin-name').value.trim(), email:document.getElementById('new-admin-email').value.trim(), password:document.getElementById('new-admin-password').value, role:document.getElementById('new-admin-role').value };
  try{
    const res = await fetch('/api/admin/admins', { method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+getAdminToken()}, body:JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Не удалось создать администратора');
    status.textContent = 'Аккаунт создан'; status.style.color = 'var(--ok)';
    loadAdmins();
  } catch (error){ status.textContent = error.message; status.style.color = 'var(--warn)'; }
}

async function loadNetwork(){
  const data = await apiGet('/api/admin/network');
  if (!data) return;
  const overview = data.overview;
  document.getElementById('network-ping').textContent = overview.ping ? overview.ping + ' мс' : '—';
  document.getElementById('network-count').textContent = overview.servers.length;
  document.getElementById('network-state').textContent = overview.connected ? 'Онлайн' : 'Не подключено';
  const list = document.getElementById('servers-list');
  if (!overview.servers.length){ list.innerHTML = `<div class="empty-state">${escapeHtml(overview.error || 'Серверы не найдены')}</div>`; return; }
  list.innerHTML = overview.servers.map(server => `<div class="server-row"><div><b>${escapeHtml(server.remark)}</b><span>${escapeHtml(server.protocol || '—')} · порт ${escapeHtml(String(server.port || '—'))}</span></div><span class="pill ${server.enabled ? 'open' : 'closed'}">${server.enabled ? 'активен' : 'выключен'}</span></div>`).join('');
}

async function loadPromos(){
  const data = await apiGet('/api/admin/promos');
  if (!data) return;
  const list = document.getElementById('promos-list');
  list.innerHTML = data.promos.map(promo => `<div class="promo-line"><b>${escapeHtml(promo.code)}</b><span>${promo.type === 'trial_days' ? 'Дни триала' : promo.type === 'discount_percent' ? 'Скидка %' : 'Тариф'}</span><span>${escapeHtml(String(promo.value))}</span><span>${promo.uses}${promo.maxUses ? '/' + promo.maxUses : ''}</span><button class="btn btn-ghost" onclick="deletePromo('${promo.id}')">Удалить</button></div>`).join('') || '<p class="empty-state">Промокодов пока нет</p>';
}

async function createPromo(){
  const status = document.getElementById('promo-admin-status');
  const payload = { code:document.getElementById('promo-new-code').value.trim(), type:document.getElementById('promo-new-type').value, value:document.getElementById('promo-new-value').value.trim(), maxUses:Number(document.getElementById('promo-new-limit').value) || 0 };
  const res = await fetch('/api/admin/promos', { method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+getAdminToken()}, body:JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok){ status.textContent = data.error || 'Не удалось создать промокод'; status.style.color = 'var(--warn)'; return; }
  status.textContent = 'Промокод создан'; status.style.color = 'var(--ok)';
  loadPromos();
}

async function deletePromo(id){
  await fetch('/api/admin/promos/' + id, { method:'DELETE', headers:{Authorization:'Bearer '+getAdminToken()} });
  loadPromos();
}

function showPanel(name){
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.panel === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
}

async function apiGet(path){
  const res = await fetch(path, { headers: { Authorization: 'Bearer ' + getAdminToken() } });
  if (res.status === 401 || res.status === 403){ adminLogout(); return null; }
  return res.json();
}

// ---------------- Тикеты ----------------
async function loadTickets(){
  const data = await apiGet('/api/admin/tickets');
  if (!data) return;
  allTickets = data.tickets.slice().reverse();
  renderTicketList();
}

function renderTicketList(flashId){
  const list = document.getElementById('ticket-list');
  list.innerHTML = '';
  if (allTickets.length === 0){
    list.innerHTML = '<div class="empty-state">Обращений пока нет</div>';
    return;
  }
  allTickets.forEach(t => {
    const row = document.createElement('div');
    row.className = 'ticket-row' + (t.id === activeTicketId ? ' active' : '');
    const last = t.messages[t.messages.length - 1];
    row.innerHTML = `<b>${escapeHtml(t.userEmail)}</b><span>${last ? escapeHtml(last.text.slice(0,40)) : ''}</span>`;
    row.onclick = () => openTicket(t.id);
    if (t.id === flashId) row.classList.add('flash');
    list.appendChild(row);
  });
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function openTicket(id){
  activeTicketId = id;
  socket.emit('join_ticket', { ticketId: id });
  const ticket = allTickets.find(t => t.id === id);
  const panel = document.getElementById('chat-panel');
  panel.innerHTML = `
    <div class="chat-panel-head">
      <b>${escapeHtml(ticket.userEmail)}</b>
      <div style="display:flex; align-items:center; gap:10px;">
        <span class="pill ${ticket.status}" id="ticket-status-pill">${ticket.status === 'open' ? 'открыт' : 'закрыт'}</span>
        ${ticket.status === 'open' ? '<button class="btn btn-ghost" style="padding:7px 14px; font-size:12.5px;" onclick="closeActiveTicket()">Закрыть</button>' : ''}
      </div>
    </div>
    <div class="chat-panel-body" id="admin-chat-body"></div>
    <div class="chat-panel-input">
      <input id="admin-chat-input" placeholder="Ответить..." onkeydown="if(event.key==='Enter')adminSendMessage()">
      <button class="btn btn-primary" onclick="adminSendMessage()">Отправить</button>
    </div>
  `;
  ticket.messages.forEach(renderChatMessage);
  renderTicketList();
}

function closeActiveTicket(){
  if (!activeTicketId) return;
  socket.timeout(5000).emit('close_ticket', { ticketId: activeTicketId, adminToken: getAdminToken() }, (err, response) => {
    if (err || !response || !response.ok){
      alert('Не удалось закрыть обращение: ' + ((response && response.error) || 'нет ответа от сервера'));
      return;
    }
    const t = allTickets.find(t => t.id === activeTicketId);
    if (t) t.status = 'closed';
    openTicket(activeTicketId);
  });
}

function renderChatMessage(message){
  const body = document.getElementById('admin-chat-body');
  if (!body) return;
  const div = document.createElement('div');
  div.className = 'msg ' + (message.from === 'admin' ? 'user' : 'admin');
  div.style.alignSelf = message.from === 'admin' ? 'flex-end' : 'flex-start';
  div.textContent = message.text;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function adminSendMessage(){
  const input = document.getElementById('admin-chat-input');
  const text = input.value.trim();
  if (!text || !activeTicketId) return;
  input.value = '';
  const ticketAtSendTime = activeTicketId;
  // Локально не рисуем — сообщение придёт через 'new_message', т.к. админ уже в комнате тикета.
  // Раньше рисовалось и тут, и там — сообщения дублировались.
  socket.timeout(5000).emit('send_message', { ticketId: ticketAtSendTime, from: 'admin', text, adminToken: getAdminToken() }, (err, response) => {
    if (err || !response || !response.ok){
      const msg = (response && response.error) || 'нет ответа от сервера';
      if (msg.includes('истекла')) { alert('Сессия истекла, войдите заново'); adminLogout(); return; }
      alert('Сообщение не доставлено: ' + msg);
      input.value = text;
    }
  });
}

// ---------------- Пользователи ----------------
async function loadUsers(){
  const data = await apiGet('/api/admin/users');
  if (!data) return;
  const tbody = document.getElementById('users-table');
  tbody.innerHTML = data.users.map(u => `
    <tr>
      <td>${escapeHtml(u.email)}</td>
      <td><input class="inline-edit" id="plan-${u.id}" value="${escapeHtml(u.plan || '')}" placeholder="Нет тарифа"></td>
      <td><input class="inline-edit" id="trial-${u.id}" type="date" value="${u.trialUntil ? new Date(u.trialUntil).toISOString().slice(0,10) : ''}"></td>
      <td>${escapeHtml(u.xuiClientId || '—')}</td>
      <td>${new Date(u.createdAt).toLocaleDateString('ru-RU')}</td>
      <td><button class="btn btn-ghost inline-save" onclick="updateUser('${u.id}')">Сохранить</button></td>
    </tr>
  `).join('') || '<tr><td colspan="6">Пользователей пока нет</td></tr>';
}

async function updateUser(id){
  const plan = document.getElementById('plan-' + id).value.trim();
  const date = document.getElementById('trial-' + id).value;
  const res = await fetch('/api/admin/users/' + id, { method:'PUT', headers:{'Content-Type':'application/json', Authorization:'Bearer '+getAdminToken()}, body:JSON.stringify({ plan, trialUntil: date ? new Date(date).toISOString() : null }) });
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'Не удалось сохранить пользователя');
  loadUsers();
}

// ---------------- Репорты ----------------
async function loadReports(){
  const data = await apiGet('/api/admin/reports');
  if (!data) return;
  const list = document.getElementById('reports-list');
  list.innerHTML = data.reports.slice().reverse().map(r => `
    <div class="report-item glass">
      <b>${escapeHtml(r.title)}</b>
      <p>${escapeHtml(r.body)}</p>
      <span class="report-meta"><span class="report-source">От пользователя</span><span>${escapeHtml(r.userEmail || 'Неизвестный пользователь')}</span><span>· ${new Date(r.createdAt).toLocaleString('ru-RU')}</span></span>
    </div>
  `).join('') || '<p style="color:var(--text-dim); font-size:14px;">Репортов пока нет</p>';
}

