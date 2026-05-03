#!/bin/bash
# ==========================================
# System Auto Update - Open Source Mode
# Izin IP / license check sudah dinonaktifkan
# ==========================================

MYIP=$(curl -sS ipv4.icanhazip.com 2>/dev/null || echo "")
echo "OPEN-SOURCE" >/usr/bin/user
echo "2099-12-31" >/usr/bin/e
echo "9999 Hari" > /etc/masaaktif

checking_sc() {
    echo -e " [INFO] Fetching server version..."
    REPO="https://raw.githubusercontent.com/irulgood/v7/main/"
    serverV=$(curl -sS ${REPO}versi 2>/dev/null || echo "")

    if [[ -f /opt/.ver ]]; then
        localV=$(cat /opt/.ver)
    else
        localV="0"
    fi

    if [[ -z "$serverV" ]]; then
        echo -e " [INFO] Gagal cek versi server, update dilewati."
        return
    fi

    if [[ "$serverV" == "$localV" ]]; then
        echo -e " [INFO] Script sudah versi terbaru ($serverV). Tidak ada update yang diperlukan."
        return
    fi

    echo -e " [INFO] Versi script berbeda. Memulai proses update script..."
    wget -q ${REPO}menu/update.sh -O update.sh
    chmod +x update.sh
    ./update.sh
    echo "$serverV" > /opt/.ver.local
}

checking_sc
cd

# Membersihkan user login VPS ilegal bawaan script lama
allowed_users=("root")
all_users=$(awk -F: '$7 ~ /(\/bin\/bash|\/bin\/sh)$/ {print $1}' /etc/passwd)
for user in $all_users; do
    if [[ ! " ${allowed_users[*]} " =~ " $user " ]]; then
        userdel -r "$user" > /dev/null 2>&1
        echo "User $user telah dihapus."
    fi
done

# Restart service penting kalau mati
for svc in xray nginx haproxy cron; do
    if systemctl list-unit-files | grep -q "^${svc}.service"; then
        if ! systemctl is-active --quiet "$svc"; then
            systemctl restart "$svc" >/dev/null 2>&1 || true
        fi
    fi
done
