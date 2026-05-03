#!/bin/bash
set -e
REPO="https://raw.githubusercontent.com/irulgood/v7/main/"
API_DIR="/opt/v7-botvpn-api"
CONFIG_DIR="/etc/botvpn2-api"
TOKEN_FILE="$CONFIG_DIR/token"
SERVICE_FILE="/etc/systemd/system/botvpn2-api.service"
NGINX_FILE="/etc/nginx/conf.d/botvpn-api-v7.conf"

mkdir -p "$API_DIR" "$CONFIG_DIR"

if ! command -v node >/dev/null 2>&1; then
  apt update -y
  apt install -y nodejs npm
fi

if [ ! -s "$TOKEN_FILE" ]; then
  TOKEN="IRULTUN$(tr -dc 'A-Z0-9' </dev/urandom | head -c 24)"
  echo "$TOKEN" > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
fi

if [ -f "./api.js" ]; then
  cp ./api.js "$API_DIR/api.js"
elif [ -f "./api/api.js" ]; then
  cp ./api/api.js "$API_DIR/api.js"
else
  curl -L -k -sS "${REPO}api/api.js" -o "$API_DIR/api.js"
fi

if [ -f "./package.json" ]; then
  cp ./package.json "$API_DIR/package.json"
elif [ -f "./api/package.json" ]; then
  cp ./api/package.json "$API_DIR/package.json"
else
  curl -L -k -sS "${REPO}api/package.json" -o "$API_DIR/package.json" || true
fi

chmod +x "$API_DIR/api.js"

cat > "$SERVICE_FILE" <<EOSERVICE
[Unit]
Description=BotVPN API Adapter for v7
After=network.target xray.service nginx.service
Wants=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node $API_DIR/api.js
Restart=always
RestartSec=3
User=root
Environment=PORTS=5889,5888
WorkingDirectory=$API_DIR
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOSERVICE

cat > /usr/local/sbin/botvpn2-api <<'EOCMD'
#!/bin/bash
case "$1" in
  token) cat /etc/botvpn2-api/token; echo ;;
  restart) systemctl restart botvpn2-api ;;
  status) systemctl status botvpn2-api --no-pager ;;
  log) journalctl -u botvpn2-api -n 120 --no-pager ;;
  test)
    DOMAIN=$(cat /etc/xray/domain 2>/dev/null || hostname -I | awk '{print $1}')
    TOKEN=$(cat /etc/botvpn2-api/token 2>/dev/null)
    echo "Local status:"
    curl -sS -H "Authorization: $TOKEN" "http://127.0.0.1:5889/status"; echo
    echo "BotVPN URL : http://$DOMAIN/vps/sshvpn"
    echo "SS URL     : http://$DOMAIN:5888/createshadowsocks?auth=$TOKEN"
    ;;
  *) echo "Gunakan: botvpn2-api token|restart|status|log|test" ;;
esac
EOCMD
chmod +x /usr/local/sbin/botvpn2-api

# Proxy /vps/ ke API 5889 agar BotVPN bisa akses http://domain/vps/...
if command -v nginx >/dev/null 2>&1; then
  python3 - <<'PYNGINX' || true
from pathlib import Path
location = """
    # BotVPN API v7 adapter
    location ^~ /vps/ {
        proxy_pass http://127.0.0.1:5889;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }
"""
paths = list(Path('/etc/nginx/conf.d').glob('*.conf')) + list(Path('/etc/nginx/sites-enabled').glob('*'))
target = None
for p in paths:
    try:
        txt = p.read_text()
    except Exception:
        continue
    if 'location ^~ /vps/' in txt:
        target = p
        break
    if target is None and 'server {' in txt and 'listen 80' in txt:
        target = p
if target is None:
    target = Path('/etc/nginx/conf.d/default.conf')
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        target.write_text('server {\n    listen 80 default_server;\n    server_name _;\n}\n')

txt = target.read_text()
if 'location ^~ /vps/' not in txt:
    idx = txt.rfind('}')
    if idx == -1:
        raise SystemExit('Tidak menemukan blok server nginx')
    target.with_suffix(target.suffix + '.bak-botvpn').write_text(txt)
    target.write_text(txt[:idx] + location + '\n' + txt[idx:])
print('patched', target)
PYNGINX
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx >/dev/null 2>&1 || systemctl restart nginx >/dev/null 2>&1 || true
  else
    echo "Warning: nginx -t gagal setelah patch /vps. Cek manual: nginx -t"
  fi
fi

systemctl daemon-reload
systemctl enable --now botvpn2-api
systemctl restart botvpn2-api

DOMAIN=$(cat /etc/xray/domain 2>/dev/null || curl -sS ipv4.icanhazip.com 2>/dev/null || echo '-')
IPVPS=$(curl -sS ipv4.icanhazip.com 2>/dev/null || echo '-')
echo "========================================"
echo "API v7 untuk BotVPN berhasil dipasang"
echo "Folder API  : $API_DIR"
echo "Port API    : 5889 dan 5888"
echo "Path BotVPN : http://$DOMAIN/vps/..."
echo "Domain      : $DOMAIN"
echo "IP VPS      : $IPVPS"
echo "API Token   : $(cat $TOKEN_FILE)"
echo "Cek token   : botvpn2-api token"
echo "Cek status  : botvpn2-api status"
echo "Cek log     : botvpn2-api log"
echo "========================================"
