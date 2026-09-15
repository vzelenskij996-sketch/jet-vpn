#!/usr/bin/env bash
# Подготовка Codespaces: .env, случайные секреты, зависимости.
set -e

cd "$(dirname "$0")/.."

# .env в репозиторий не попадает (он в .gitignore) — создаём из шаблона
if [ ! -f .env ]; then
  cp .env.example .env
  echo "[setup] Создан .env из .env.example"
fi

# CORS: сервер берёт origin из SITE_URL (server.js: process.env.SITE_URL || '*').
# Публичный адрес Codespaces заранее неизвестен, поэтому оставляем пустым —
# тогда разрешаются запросы с любого origin, и сайт работает по своей же ссылке.
sed -i "s|^SITE_URL=.*|SITE_URL=|" .env

# Заменяем пароли-заглушки на случайные: порт 3000 будет открыт в интернет,
# и значения из .env.example (они публично видны в репозитории) использовать нельзя.
if grep -q '^JWT_SECRET=change_this' .env; then
  JWT_VALUE=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_VALUE}|" .env
  echo "[setup] JWT_SECRET: сгенерирован случайный"
fi

if grep -q '^ADMIN_PASSWORD=change_this' .env; then
  ADMIN_PW=$(node -e "console.log(require('crypto').randomBytes(8).toString('hex'))")
  sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${ADMIN_PW}|" .env
  echo ""
  echo "========================================================"
  echo "  Вход в админку (страница /admin.html):"
  echo "    ADMIN_EMAIL    = admin@jetvpn.example"
  echo "    ADMIN_PASSWORD = ${ADMIN_PW}"
  echo "  Пароль также записан в файл .env — сохраните его."
  echo "========================================================"
  echo ""
fi

echo "[setup] Установка зависимостей (npm install)..."
npm install
echo "[setup] Готово. Сервер запускается автоматически (см. start.sh)."
