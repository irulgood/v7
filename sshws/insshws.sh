#!/bin/bash
set -e
apt update -y >/dev/null 2>&1 || true
apt install -y python3 >/dev/null 2>&1 || true
mkdir -p /usr/local/bin
if [ -f ./ws.py ]; then
  cp ./ws.py /usr/local/bin/ssh-ws-proxy.py
elif [ -f ./sshws/ws.py ]; then
  cp ./sshws/ws.py /usr/local/bin/ssh-ws-proxy.py
else
  curl -L -k -sS https://raw.githubusercontent.com/irulgood/v7/main/sshws/ws.py -o /usr/local/bin/ssh-ws-proxy.py
fi
chmod +x /usr/local/bin/ssh-ws-proxy.py
cat > /etc/systemd/system/ws.service <<'EOF'
[Unit]
Description=SSH WebSocket Proxy v7
After=network.target ssh.service
Wants=network.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 /usr/local/bin/ssh-ws-proxy.py
Restart=always
RestartSec=3
Environment=WS_PORTS=8080,8880,2082
Environment=SSH_HOST=127.0.0.1
Environment=SSH_PORT=22
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now ws.service >/dev/null 2>&1 || systemctl restart ws.service
systemctl status ws.service --no-pager -l | head -n 12 || true
echo "SSH WebSocket service installed on ports 8080,8880,2082"
