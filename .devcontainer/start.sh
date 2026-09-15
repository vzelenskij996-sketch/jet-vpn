#!/usr/bin/env bash
# Запускает сервер Jet VPN в фоне при старте Codespace,
# делает порт публичным и печатает ссылку + данные для входа в админку.
cd "$(dirname "$0")/.."

# Если контейнер перезапускается, старый процесс ещё держит порт 3000 — гасим его,
# иначе Node упадёт с EADDRINUSE.
pkill -f "node server.js" 2>/dev/null || true
sleep 1

nohup npm start > /tmp/jet-vpn.log 2>&1 &
sleep 2

# Публичный адрес проброшенного порта собирается из переменных окружения,
# которые GitHub Codespaces задаёт автоматически.
if [ -n "$CODESPACE_NAME" ] && [ -n "$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN" ]; then
  PUBLIC_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
else
  PUBLIC_URL="http://localhost:3000"
fi

# Делаем порт 3000 публичным автоматически — так не нужно искать вкладку PORTS.
# VS Code пробрасывает порт с задержкой, поэтому пробуем несколько раз.
if [ -n "$CODESPACE_NAME" ] && command -v gh >/dev/null 2>&1; then
  for _ in 1 2 3 4 5; do
    if gh codespace ports visibility 3000:public -c "$CODESPACE_NAME" >/dev/null 2>&1; then
      echo "[start] Порт 3000 открыт публично."
      break
    fi
    sleep 2
  done
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
echo "  Если ссылка отдаёт 401 или 404, порт ещё приватный. Тогда:"
echo "    gh codespace ports visibility 3000:public -c \"\$CODESPACE_NAME\""
echo "  Посмотреть порты и адреса:"
echo "    gh codespace ports -c \"\$CODESPACE_NAME\""
echo "=================================================================="
echo ""
