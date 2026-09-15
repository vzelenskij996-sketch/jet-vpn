const overlay = document.getElementById('overlay');
const modalTitle = document.getElementById('modal-title');
const submitBtn = document.getElementById('submit-btn');
const modalNote = document.getElementById('modal-note');
const modalError = document.getElementById('modal-error');
const modalSuccess = document.getElementById('modal-success');
const tabs = document.querySelectorAll('.modal-tab');
let currentMode = 'login';
let selectedPlan = '';
let selectedSubscription = null;

function getToken(){ return localStorage.getItem('nx_token'); }
function getEmail(){ return localStorage.getItem('nx_email'); }
function setSession(token, email){ localStorage.setItem('nx_token', token); localStorage.setItem('nx_email', email); refreshUserBadge(); }

function refreshUserBadge(){
  const badge = document.getElementById('user-badge');
  const emailLabel = document.getElementById('user-email-label');
  const personalBtn = document.getElementById('personal-cabinet-btn');
  const email = getEmail();
  const loggedIn = !!(email && getToken());
  if (badge) badge.style.display = loggedIn ? 'flex' : 'none';
  if (emailLabel) emailLabel.textContent = loggedIn ? email : '';
  if (personalBtn) personalBtn.style.display = loggedIn ? 'inline-flex' : 'none';
  const loginBtn = document.getElementById('login-btn');
  const registerBtn = document.getElementById('register-btn');
  if (loginBtn) loginBtn.style.display = loggedIn ? 'none' : 'inline-flex';
  if (registerBtn) registerBtn.style.display = loggedIn ? 'none' : 'inline-flex';
}
refreshUserBadge();

const pageLoader = document.getElementById('page-loader');
if (pageLoader) {
  window.addEventListener('load', () => {
    setTimeout(() => pageLoader.classList.add('hidden'), 700);
  });
}

function logout(){
  localStorage.removeItem('nx_token');
  localStorage.removeItem('nx_email');
  localStorage.removeItem('nx_subscription_id');
  location.reload();
}

function getSubscriptionSummary(user){
  if (!user || !user.subscriptionId) return { label: 'Нет подписки', usage: 'Нет подписки', active: false };
  const subscriptionId = user.subscriptionId;
  const subscription = (window.allSubscriptions || []).find(item => item.id === subscriptionId) || null;
  if (!subscription) return { label: 'Подписка подключена', usage: 'Безлимит', active: true };
  const isUnlimited = subscription.devices >= 6 || subscription.months >= 6;
  return {
    label: `${subscription.period} / ${subscription.devices} устройств`,
    usage: isUnlimited ? 'Безлимит' : `${Math.max(8, subscription.devices * 10)} ГБ осталось`,
    active: true
  };
}

function normalizeSubscriptionItem(item, index = 0){
  if (!item || typeof item !== 'object') return null;
  const days = Number(item.days || item.durationDays || (item.months ? Number(item.months) * 30 : 30));
  const months = Number(item.months || Math.max(1, Math.round(days / 30)) || 1);
  const devices = Number(item.devices || item.deviceLimit || 1);
  const price = Number(item.price || 0);
  const active = item.active !== false && item.enabled !== false;
  const order = Number(item.order ?? index + 1);
  const period = String(item.period || (days >= 365 ? '12 месяцев' : days >= 180 ? '6 месяцев' : days >= 90 ? '3 месяца' : '1 месяц')).trim();
  const name = String(item.name || item.title || `${period} / ${devices} устройств`).trim();
  return {
    ...item,
    id: String(item.id),
    name,
    price,
    currency: String(item.currency || 'RUB').toUpperCase(),
    days,
    months,
    devices,
    active,
    order,
    period,
    badge: String(item.badge || '').trim()
  };
}

function accountEscape(value){
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function switchAccountPanel(name){
  document.querySelectorAll('[data-account-panel]').forEach(button => button.classList.toggle('active', button.dataset.accountPanel === name));
  document.querySelectorAll('.account-panel').forEach(panel => panel.classList.toggle('active', panel.id === 'account-panel-' + name));
}

function renderAccountDashboard(user){
  const emailName = (user.email || '').split('@')[0] || 'пользователь';
  const subscriptionActive = Boolean(user.subscriptionActive);
  const expires = user.subscriptionUntil ? new Date(user.subscriptionUntil).toLocaleDateString('ru-RU') : '—';
  const devices = Array.isArray(user.devices) ? user.devices : [];
  document.getElementById('account-welcome').textContent = `Привет, ${emailName}`;
  document.getElementById('account-id-value').textContent = user.accountId || '—';
  document.getElementById('account-days').textContent = String(user.remainingDays || 0);
  document.getElementById('account-expires').textContent = expires;
  document.getElementById('account-device-count').textContent = String(devices.length);
  document.getElementById('account-used-gb').textContent = `${Number(user.usedGB || 0)} ГБ`;
  document.getElementById('account-status').textContent = subscriptionActive ? 'Активна' : (user.subscriptionFrozen ? 'Заморожена' : 'Неактивна');
  document.getElementById('account-status').className = `pill ${subscriptionActive ? 'open' : 'closed'}`;
  document.getElementById('account-subscription-note').textContent = user.plan || 'Подписка не подключена.';
  document.getElementById('account-freeze-state').textContent = user.subscriptionFrozen ? 'Включена' : 'Выключена';
  document.getElementById('account-freeze-btn').textContent = user.subscriptionFrozen ? 'Разморозить' : 'Заморозить';
  document.getElementById('activate-subscription-btn').textContent = user.subscriptionId ? 'Продлить подписку' : 'Подключить подписку';
  document.getElementById('account-history').innerHTML = user.activity && user.activity.length
    ? user.activity.map(item => `<div class="account-history-item"><b>${accountEscape(item.text)}</b><time>${new Date(item.createdAt).toLocaleString('ru-RU')}</time></div>`).join('')
    : '<div class="account-empty">История пока пуста</div>';
  document.getElementById('account-devices').innerHTML = devices.length
    ? devices.map(device => `<div class="account-device"><div><b>${accountEscape(device.name || device.platform || 'Неизвестное устройство')}</b><span>${accountEscape(device.platform || 'VPN-клиент')} · ${accountEscape(device.lastSeen ? new Date(device.lastSeen).toLocaleString('ru-RU') : 'нет данных')}</span></div><button class="btn btn-ghost" onclick="removeAccountDevice('${accountEscape(device.id)}')">Отключить</button></div>`).join('')
    : '<div class="account-empty">Устройства не отображаются. Подключите хост Remnawave/3x-ui.</div>';
}

// ---------------- Личный кабинет ----------------
const cabinetOverlay = document.getElementById('cabinet-overlay');

async function openCabinet(){
  if (!getToken()) {
    openModal('login');
    return;
  }
  cabinetOverlay.classList.add('open', 'account-page');
  document.body.classList.add('account-mode');
  document.body.style.overflow = 'hidden';
  document.getElementById('cab-email').textContent = getEmail();
  document.getElementById('account-subscription-note').textContent = 'Загрузка...';
  document.getElementById('account-used-gb').textContent = 'Загрузка...';
  document.getElementById('activate-subscription-btn').textContent = 'Подключить подписку';
  document.getElementById('activate-subscription-btn').disabled = false;
  window.selectedCabinetUpgrade = null;

  try{
    const res = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + getToken() } });
    if (res.status === 401){ logout(); return; }
    const data = await res.json();
    const u = data.user;
    renderAccountDashboard(u);
    const summary = getSubscriptionSummary(u);
    const trialBtn = document.getElementById('cab-trial-btn');
    if (u.trialUntil){
      const until = new Date(u.trialUntil);
      const active = until > new Date();
      trialBtn.style.display = active ? 'none' : 'block';
    } else {
      trialBtn.style.display = 'block';
    }
    if (u.subscriptionId) {
      const planText = u.plan || summary.label || 'Подписка подключена';
      document.getElementById('activate-subscription-btn').textContent = 'Обновить подписку';
      document.getElementById('activate-subscription-btn').dataset.active = 'true';
      document.getElementById('account-subscription-note').textContent = planText;
    }
  } catch(e){
    document.getElementById('account-subscription-note').textContent = 'Не удалось загрузить данные';
    document.getElementById('account-used-gb').textContent = '—';
  }
}
function closeCabinet(){ cabinetOverlay.classList.remove('open', 'account-page'); document.body.classList.remove('account-mode'); document.body.style.overflow = ''; }

function handleTrialAction(){
  if (getToken()) {
    openCabinet();
    return;
  }
  openModal('trial');
}

async function toggleSubscriptionFreeze(){
  const current = document.getElementById('account-freeze-state').textContent === 'Включена';
  const res = await fetch('/api/auth/subscription/freeze', { method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer ' + getToken()}, body:JSON.stringify({ frozen: !current }) });
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'Не удалось изменить состояние подписки');
  openCabinet();
}

async function giftSubscription(){
  const recipientAccountId = document.getElementById('gift-account-id').value.trim();
  const status = document.getElementById('gift-status');
  const plan = selectedSubscription || (window.allSubscriptions || [])[0];
  if (!/^\d{5}$/.test(recipientAccountId)) { status.textContent = 'Введите ID из 5 цифр'; return; }
  if (!plan) { status.textContent = 'Сначала выберите подписку'; return; }
  const res = await fetch('/api/auth/subscription/gift', { method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer ' + getToken()}, body:JSON.stringify({ recipientAccountId, subscriptionId: plan.id }) });
  const data = await res.json();
  status.textContent = res.ok ? `Подарок отправлен пользователю #${recipientAccountId}` : (data.error || 'Не удалось отправить подарок');
}

async function removeAccountDevice(id){
  const res = await fetch('/api/auth/devices/' + encodeURIComponent(id), { method:'DELETE', headers:{ Authorization:'Bearer ' + getToken() } });
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'Не удалось отключить устройство');
  openCabinet();
  switchAccountPanel('devices');
}

async function connectSelectedSubscription(){
  if (!getToken()) {
    openModal('register');
    return;
  }
  const plan = window.selectedCabinetUpgrade || selectedSubscription || (window.allSubscriptions || []).find(item => item.active !== false);
  if (!plan) {
    alert('Активные тарифы пока не загружены');
    return;
  }
  const button = document.getElementById('activate-subscription-btn');
  button.disabled = true;
  button.textContent = 'Подключаем...';
  try {
    const res = await fetch('/api/auth/subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
      body: JSON.stringify({ subscriptionId: plan.id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Не удалось подключить подписку');
    document.getElementById('account-subscription-note').textContent = `${plan.period} / ${plan.devices} устройств`;
    document.getElementById('activate-subscription-btn').textContent = 'Обновить подписку';
    button.disabled = false;
    closeCabinet();
    setTimeout(() => openCabinet(), 150);
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Подключить подписку';
    alert(error.message);
  }
}

async function startTrialFromCabinet(){
  const btn = document.getElementById('cab-trial-btn');
  btn.disabled = true; btn.textContent = 'Активируем...';
  try{
    const res = await fetch('/api/auth/trial', {
      method:'POST', headers:{ Authorization: 'Bearer ' + getToken() }
    });
    const data = await res.json();
    if (res.ok){
      document.getElementById('account-subscription-note').textContent = 'Тестовый период активен до ' + new Date(data.trialUntil).toLocaleDateString('ru-RU');
      btn.style.display = 'none';
    } else {
      btn.disabled = false; btn.textContent = 'Активировать тест на 3 дня';
      alert(data.error || 'Не удалось активировать тест');
    }
  } catch(e){
    btn.disabled = false; btn.textContent = 'Активировать тест на 3 дня';
  }
}

async function applyPromo(){
  const input = document.getElementById('promo-code');
  const status = document.getElementById('promo-status');
  const code = input.value.trim();
  if (!code){ status.textContent = 'Введите промокод.'; status.style.color = 'var(--warn)'; return; }
  status.textContent = 'Проверяем...';
  status.style.color = 'var(--text-dim)';
  try{
    const res = await fetch('/api/auth/promo', {
      method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer ' + getToken()},
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Промокод не применён');
    input.value = '';
    status.textContent = data.message;
    status.style.color = 'var(--ok)';
  } catch (error){
    status.textContent = error.message;
    status.style.color = 'var(--warn)';
  }
}

// ---------------- Тема ----------------
// Переключатель тем убран: сайт всегда в тёмной (чёрной) теме.
document.documentElement.setAttribute('data-theme', 'dark');

async function loadPublicSettings(){
  try{
    const res = await fetch('/api/settings', { cache: 'no-store' });
    const { settings } = await res.json();
    const logo = document.getElementById('site-logo-text');
    const heroTitle = document.querySelector('.hero h1');

    if (logo) logo.textContent = settings.logoText || 'Jet VPN';
    if (heroTitle) heroTitle.innerHTML = `${settings.heroTitle || 'Подключение'}<br><span>${settings.heroTitleAccent || 'к VPN'}</span>`;
    window.allSubscriptions = (settings.subscriptions || []).map(normalizeSubscriptionItem).filter(subscription => subscription && subscription.active !== false).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || Number(a.days) - Number(b.days));
    renderSubscriptions(window.allSubscriptions);
  } catch (error) { /* оставляем встроенные значения, если API недоступен */ }
}
loadPublicSettings();

function renderSubscriptions(subscriptions){
  const normalized = (subscriptions || []).map(normalizeSubscriptionItem).filter(item => item && item.active !== false).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || Number(a.days) - Number(b.days));
  const periods = [...new Map(normalized.map(item => [item.months, item])).values()].sort((a,b) => a.months - b.months);
  const periodBox = document.getElementById('subscription-periods');
  const cardsBox = document.getElementById('subscription-cards');
  if (!periodBox || !cardsBox || !normalized.length) return;
  let activeMonths = Number(periodBox.dataset.activeMonths) || periods[0].months;
  const draw = () => {
    periodBox.innerHTML = periods.map(period => `<button class="period-btn ${period.months === activeMonths ? 'active' : ''}" onclick="selectSubscriptionPeriod(${period.months})">${period.period}</button>`).join('');
    cardsBox.innerHTML = normalized.filter(item => item.months === activeMonths).map((item, index) => `
      <div class="plan glass subscription-card ${index === 1 ? 'featured' : ''}">
        ${item.badge ? `<div class="badge">${item.badge}</div>` : (index === 1 ? '<div class="badge">Популярный</div>' : '')}
        <div class="pname">${item.name || `${item.devices} устройств`}</div>
        <div class="pprice">${item.price}${item.currency === 'USD' ? '$' : '₽'} <small>/ ${item.period.toLowerCase()}</small></div>
        <div class="pnote">Подписка на ${item.devices} устройства</div>
        <ul><li>До ${item.devices} устройств</li><li>Доступ к VPN-серверам</li><li>Поддержка 24/7</li></ul>
        <button class="btn ${index === 1 ? 'btn-primary' : 'btn-ghost'}" onclick="chooseSubscription('${item.id}')">Выбрать подписку</button>
      </div>`).join('');
  };
  periodBox.dataset.activeMonths = activeMonths;
  window.selectSubscriptionPeriod = months => { activeMonths = months; periodBox.dataset.activeMonths = months; draw(); };
  window.chooseSubscription = id => {
    selectedSubscription = normalized.find(item => item.id === id);
    selectedPlan = `${selectedSubscription.period} / ${selectedSubscription.devices} устройств / ${selectedSubscription.price}₽`;
    if (getToken()) {
      window.selectedCabinetUpgrade = selectedSubscription;
      openCabinet();
      return;
    }
    openModal('register');
    modalNote.textContent = `Выбрано: ${selectedPlan}. После регистрации подписка будет подключена автоматически.`;
  };
  draw();
}

function openModal(mode){
  overlay.classList.add('open');
  modalError.style.display = 'none';
  modalSuccess.style.display = 'none';
  document.getElementById('auth-email').value = '';
  document.getElementById('auth-password').value = '';
  document.getElementById('auth-password-confirm').value = '';
  switchTab(mode === 'trial' ? 'register' : mode);
  if (mode === 'trial'){
    modalTitle.textContent = 'Запуск тестового периода';
    modalNote.textContent = 'Зарегистрируйтесь (или войдите), затем тест запустится автоматически на 3 дня.';
    currentMode = 'trial';
  }
  document.body.style.overflow = 'hidden';
}
function choosePlan(plan){
  selectedPlan = plan;
  openModal('register');
  modalNote.textContent = 'Вы выбрали тариф «' + plan + '». После регистрации его можно активировать в кабинете.';
}
function closeModal(){ overlay.classList.remove('open'); document.body.style.overflow = ''; }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const confirmField = document.getElementById('confirm-field');
let submitting = false;

function switchTab(mode){
  currentMode = mode;
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === (mode === 'trial' ? 'register' : mode)));
  modalError.style.display = 'none'; modalSuccess.style.display = 'none';
  const isRegister = mode === 'register' || mode === 'trial';
  confirmField.style.display = isRegister ? 'block' : 'none';
  if (mode === 'login'){
    modalTitle.textContent = 'Вход в кабинет'; submitBtn.textContent = 'Войти';
    modalNote.textContent = 'Вход через рабочий API на бэкенде.';
  } else if (mode === 'register'){
    modalTitle.textContent = 'Создать аккаунт'; submitBtn.textContent = 'Зарегистрироваться';
    modalNote.textContent = 'После регистрации сразу выдаётся токен доступа в кабинет.';
  }
}

async function submitForm(){
  if (submitting) return; // защита от повторной отправки по двойному клику

  const email = document.getElementById('auth-email').value.trim().toLowerCase();
  const password = document.getElementById('auth-password').value;
  const isRegister = currentMode === 'register' || currentMode === 'trial';
  modalError.style.display = 'none';
  modalSuccess.style.display = 'none';

  if (!email || !EMAIL_RE.test(email)){ showError('Введите корректный email'); return; }
  if (!password || password.length < 6){ showError('Пароль должен быть не короче 6 символов'); return; }
  if (isRegister){
    const confirm = document.getElementById('auth-password-confirm').value;
    if (password !== confirm){ showError('Пароли не совпадают'); return; }
  }

  const endpoint = currentMode === 'login' ? '/api/auth/login' : '/api/auth/register';
  const originalLabel = submitBtn.textContent;
  submitting = true;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Подождите...';

  try{
    const res = await fetch(endpoint, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email, password, subscriptionId: selectedSubscription ? selectedSubscription.id : '' })
    });
    const data = await res.json();
    if (!res.ok){ showError(data.error || 'Ошибка, попробуйте ещё раз'); return; }

    setSession(data.token, email);

    if (selectedSubscription && currentMode !== 'login') {
      try {
        const subRes = await fetch('/api/auth/subscription', {
          method: 'POST',
          headers: { 'Content-Type':'application/json', Authorization: 'Bearer ' + data.token },
          body: JSON.stringify({ subscriptionId: selectedSubscription.id })
        });
        const subData = await subRes.json();
        if (!subRes.ok) {
          showSuccess('Аккаунт создан. Подписка не подключилась: ' + (subData.error || 'проверьте тариф'));
        } else {
          showSuccess('Аккаунт создан и подписка подключена');
        }
      } catch (subErr) {
        showSuccess('Аккаунт создан. Подписка будет доступна после повторного подключения.');
      }
    }

    if (currentMode === 'trial'){
      const trialRes = await fetch('/api/auth/trial', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization': 'Bearer ' + data.token }
      });
      const trialData = await trialRes.json();
      if (trialRes.ok){
        showSuccess('Тест запущен на 3 дня! Конфиг создан.');
      } else {
        showSuccess('Аккаунт создан. Тест не запустился автоматически: ' + (trialData.error || 'проверьте настройки 3x-ui на сервере.'));
      }
      setTimeout(() => { closeModal(); openCabinet(); }, 1800);
    } else if (selectedSubscription && currentMode !== 'login') {
      setTimeout(() => {
        closeModal();
        openCabinet();
      }, 1100);
    } else {
      showSuccess(currentMode === 'login' ? 'Вы вошли в аккаунт' : 'Аккаунт создан');
      setTimeout(() => { closeModal(); openCabinet(); }, 700);
    }
  } catch(e){
    showError('Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.');
  } finally {
    submitting = false;
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
}
function showError(msg){ modalError.textContent = msg; modalError.style.display = 'block'; }
function showSuccess(msg){ modalSuccess.textContent = msg; modalSuccess.style.display = 'block'; }

function toggleFaq(item){
  document.querySelectorAll('.faq-item.open').forEach(openItem => {
    if (openItem !== item) openItem.classList.remove('open');
  });
  item.classList.toggle('open');
}

async function checkServiceStatus(){
  const updated = document.getElementById('status-updated');
  const ping = document.getElementById('ping-value');
  const title = document.getElementById('status-title');
  const dot = document.getElementById('status-dot');
  const started = performance.now();
  updated.textContent = 'Проверяем соединение...';
  try{
    const res = await fetch('/api/service-status', { cache: 'no-store' });
    if (!res.ok) throw new Error('health check failed');
    const status = await res.json();
    if (!status.connected || !status.servers){
      title.textContent = 'Серверы не подключены';
      updated.textContent = 'Ожидается подключение Remnawave';
      ping.textContent = '—';
      dot.classList.add('offline');
      return;
    }
    title.textContent = 'Сервисы работают стабильно';
    updated.textContent = `Подключено серверов: ${status.servers}`;
    ping.textContent = (status.ping || Math.max(1, Math.round(performance.now() - started))) + ' мс';
    dot.classList.remove('offline');
  } catch(e){
    title.textContent = 'Серверы не подключены';
    ping.textContent = '—';
    updated.textContent = 'Ожидается подключение Remnawave';
    dot.classList.add('offline');
  }
}
checkServiceStatus();

// ---------------- Чат поддержки ----------------
const socket = io();
let ticketId = localStorage.getItem('nx_ticket_id');
const chatBody = document.getElementById('chat-body');
const chatWindow = document.getElementById('chat-window');
let chatSending = false;

if (ticketId){
  socket.emit('join_ticket', { ticketId });
}

function toggleChat(){ chatWindow.classList.toggle('open'); }
function startNewChat(){
  ticketId = null;
  localStorage.removeItem('nx_ticket_id');
  chatBody.innerHTML = '<div class="msg admin">Новый диалог открыт. Опишите вопрос.</div>';
  document.getElementById('new-chat-button').style.display = 'none';
  document.getElementById('chat-input').focus();
}

function appendMessage(from, text){
  const div = document.createElement('div');
  div.className = 'msg ' + (from === 'admin' ? 'admin' : 'user');
  div.textContent = text;
  chatBody.appendChild(div);
  chatBody.scrollTop = chatBody.scrollHeight;
}

async function sendChatMessage(){
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || chatSending) return;
  input.value = '';
  chatSending = true;

  try{
    if (!ticketId){
      const email = getEmail() || 'гость_' + Math.random().toString(36).slice(2,8) + '@web';
      const res = await fetch('/api/support/tickets', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ userEmail: email, message: text })
      });
      if (!res.ok){
        appendMessage('admin', 'Не удалось отправить сообщение. Попробуйте ещё раз.');
        input.value = text; // возвращаем текст, чтобы пользователь не набирал заново
        return;
      }
      const data = await res.json();
      ticketId = data.ticket.id;
      localStorage.setItem('nx_ticket_id', ticketId);
      socket.emit('join_ticket', { ticketId });
      appendMessage('user', text);
      return;
    }

    // ack — подтверждение от сервера, что сообщение реально сохранено и разослано
    socket.timeout(5000).emit('send_message', { ticketId, from: 'user', text }, (err, response) => {
      if (err || !response || !response.ok){
        appendMessage('admin', 'Сообщение не доставлено: ' + (response && response.error ? response.error : 'нет ответа от сервера'));
        input.value = text;
      }
      // при успехе сообщение уже отрисовано через socket.on('new_message') ниже
    });
  } catch(e){
    appendMessage('admin', 'Нет соединения с сервером. Сообщение не отправлено.');
    input.value = text;
  } finally {
    chatSending = false;
  }
}

socket.on('new_message', ({ ticketId: tId, message }) => {
  if (tId !== ticketId) return;
  appendMessage(message.from, message.text);
});

socket.on('ticket_closed', ({ ticketId: tId }) => {
  if (tId !== ticketId) return;
  appendMessage('admin', 'Обращение закрыто. Напишите снова, если вопрос не решён — чат откроется заново.');
  document.getElementById('new-chat-button').style.display = 'block';
});

socket.on('connect', () => { if (ticketId) socket.emit('join_ticket', { ticketId }); });

// ---------------- Анимации интерфейса ----------------

// Появление блоков при скролле
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting){
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal, .reveal-stagger').forEach(el => revealObserver.observe(el));

// Счётчики цифр в статистике — считают от 0 до целевого значения при появлении в кадре
function animateCount(el){
  const target = parseFloat(el.dataset.count);
  const suffix = el.dataset.suffix || '';
  const isFloat = String(el.dataset.count).includes('.');
  const duration = 1100;
  const start = performance.now();
  function tick(now){
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const value = target * eased;
    el.textContent = (isFloat ? value.toFixed(1) : Math.round(value)) + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
const countObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting){
      animateCount(entry.target);
      countObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });
document.querySelectorAll('[data-count]').forEach(el => countObserver.observe(el));

// Рипл-эффект по клику на кнопках
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn');
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  const ripple = document.createElement('span');
  const size = Math.max(rect.width, rect.height);
  ripple.className = 'ripple';
  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
  ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
});

// Лёгкий 3D-наклон карточек тарифов вслед за курсором (только на устройствах с мышью)
if (window.matchMedia('(hover: hover)').matches){
  document.querySelectorAll('.plan').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `translateY(-6px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });
}

// Хедер темнеет/обрастает тенью при скролле
const headerEl = document.querySelector('header');
if (headerEl){
  window.addEventListener('scroll', () => {
    headerEl.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
}

// Чат-пузырь "трясётся", когда приходит ответ, а чат свёрнут
const chatBubbleEl = document.getElementById('chat-bubble');
socket.on('new_message', ({ message }) => {
  if (message.from === 'admin' && !chatWindow.classList.contains('open')){
    chatBubbleEl.classList.remove('has-unread');
    void chatBubbleEl.offsetWidth; // рестарт CSS-анимации
    chatBubbleEl.classList.add('has-unread');
  }
});
