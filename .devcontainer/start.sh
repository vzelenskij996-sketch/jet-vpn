#!/usr/bin/env bash
# Запускает сервер Jet VPN в фоне при старте Codespace.
cd "$(dirname "$0")/.."

# Если контейнер перезапускается, старый процесс ещё держит порт 3000 — гасим его,
# иначе Node упадёт с EADDRINUSE.
pkill -f "node server.js" 2>/dev/null || true
sleep 1

nohup npm start > /tmp/jet-vpn.log 2>&1 &
echo "[start] Jet VPN запущен в фоне на порту 3000."
echo "[start] Лог: tail -f /tmp/jet-vpn.log"
