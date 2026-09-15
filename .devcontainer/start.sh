#!/usr/bin/env bash
# Запускает сервер Jet VPN в фоне при старте Codespace
# и печатает публичную ссылку + данные для входа в админку.
cd "$(dirname "$0")/.."

# Если контейнер перезапускается, старый процесс ещё держит порт 3000 — гасим его,
# иначе Node упадёт с EADDRINUSE.
pkill -f "node server.js" 2>/dev/null || true
sleep 1

nohup npm start > /tmp/jet-vpn.log 2>&1 &
sleep 2

# Публичный адрес проброшенного порта в Codespaces собирается из переменных окружения,
# которые GitHub задаёт автоматически — искать его во вкладке PORTS не обязательно.
if [ -n "$CODESPACE_NAME" ] && [ -n "$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN" ]; then
  PUBLIC_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
else
  PUBLIC_URL="http://localhost:3000"
fi

ADMIN_EMAIL=$(grep '^ADMIN_EMAIL=' .env | cut -d= -f2-)
ADMIN_PW=$(grep '^ADMIN_PASSWORD=' .env | cut -d= -f2-)

echo ""
echo "=================================================================="
echo "  Публичная ссылка на сайт:"
echo "    ${PUBLIC_URL}"
echo ""
echo "  Админка:"
echo "    ${PUBLIC_URL}/admin.html"
echo "    логин:  ${ADMIN_EMAIL}"
echo "    пароль: ${ADMIN_PW}"
echo ""
echo "  Если ссылка отдаёт 404 — открой вкладку PORTS (снизу рядом с"
echo "  TERMINAL), правый клик по строке порта 3000 -> Port Visibility -> Public."
echo "=================================================================="
echo ""
