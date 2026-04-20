#!/bin/bash
# ==========================================
# 🔧 System Auto Update & License Checker
# ==========================================

MYIP=$(curl -sS ipv4.icanhazip.com)
echo ""
# SET MANUAL (tanpa GitHub)
# SET MANUAL (tanpa GitHub)
username="localuser"
valid="4000-12-31"
echo "$username" > /usr/bin/user
echo "$valid" > /usr/bin/e
today=`date -d "0 days" +"%Y-%m-%d"`
#oid=$(cat /usr/bin/ver)
exp=$(cat /usr/bin/e)
COLOR1='\033[1;36m'
NC='\e[0m'
GREEN='\033[0;32m'
RED='\033[0;31m'
clear
d1=$(date -d "$valid" +%s)
d2=$(date -d "$today" +%s)
certifacate=$(((d1 - d2) / 86400))
DATE=$(date +'%Y-%m-%d')
datediff() {
d1=$(date -d "$1" +%s)
d2=$(date -d "$2" +%s)
echo -e "${COLOR1}Expiry In   : $(( (d1 - d2) / 86400 )) Days${NC}"
}
mai=$(datediff "$exp" "$DATE")
Info="${GREEN}Active${NC}"
Error="${RED}Expired${NC}"
if [[ "$certifacate" -le "0" ]]; then
sts="${Error}"
echo -e " ${RED}Masa Aktif Script Kamu Sudah Habis${NC}"
echo -e " ${RED}Silahkan Contact Admin Untuk Perpanjang ${NC}"
echo -e " ${GREEN}Whatsapp = wa.me/6281327393959 ${NC}"
echo -e " ${GREEN}Telegram = @ARI_VPN_STORE ${NC}"
sleep 3
exit 1
else
sts="${Info}"
fi

ipsaya=$MYIP
RED="\033[0;31m"
WH="\033[1;37m"
data_server=$(curl -v --insecure --silent https://google.com/ 2>&1 | grep Date | sed -e 's/< Date: //')
date_list=$(date +"%Y-%m-%d" -d "$data_server")

# ==========================================
# ⚙️ Fungsi: Mengecek izin script dan versi
# ==========================================
#checking_sc() {
    useexp=$(cat /usr/bin/e)
    date_list=$(date +%Y-%m-%d)

    ### 🔐 Validasi masa aktif izin script
    if [[ $(date -d "$date_list" +%s) -lt $(date -d "$useexp" +%s) ]]; then
        echo -e " [INFO] Fetching server version..."

        ### 🌍 Lokasi repository update
        REPO="http://raw.githubusercontent.com/irulgood/v7/main/"  # Ganti dengan URL repository Anda
        serverV=$(curl -sS ${REPO}versi)

        ### 🔍 Cek versi lokal
        if [[ -f /opt/.ver ]]; then
            localV=$(cat /opt/.ver)
        else
            localV="0"
        fi

        ### 🔁 Bandingkan versi lokal dan server
        if [[ $serverV == $localV ]]; then
            echo -e " [INFO] Script sudah versi terbaru ($serverV). Tidak ada update yang diperlukan."
            return
        else
            echo -e " [INFO] Versi script berbeda. Memulai proses update script..."
            wget -q ${REPO}menu/update.sh -O update.sh
            chmod +x update.sh
            ./update.sh
            echo $serverV > /opt/.ver.local
            return
        fi

    ### 🚫 Jika masa aktif habis
    else
        echo -e "\033[1;93m────────────────────────────────────────────\033[0m"
        echo -e "\033[41;1m ⚠️       AKSES DI TOLAK         ⚠️ \033[0m"
        echo -e "\033[1;93m────────────────────────────────────────────\033[0m"
        echo ""
        echo -e "        \033[91;1m❌ SCRIPT LOCKED ❌\033[0m"
        echo ""
        echo -e "  \033[0;33m🔒 Your VPS\033[0m $MYIP \033[0;33mHas been Banned\033[0m"
        echo ""
        echo -e "  \033[91m⚠️  Masa Aktif Sudah Habis ⚠️\033[0m"
        echo -e "  \033[0;33m💡 Beli izin resmi hanya dari Admin!\033[0m"
        echo ""
        echo -e "  \033[92;1m📞 Contact Admin:\033[0m"
        echo -e "  \033[96m🌍 Telegram: https://ARI_VPN_STORE\033[0m"
        echo -e "  \033[96m📱 WhatsApp: https://wa.me/6281774970898\033[0m"
        echo ""
        echo -e "\033[1;93m────────────────────────────────────────────\033[0m"

        ### 🛠️ Jalankan proses penguncian script
        cd
        {
            > /etc/cron.d/cpu_otm

            cat > /etc/cron.d/cpu_otm << END
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
*/5 * * * * root /usr/bin/detek
END

#            wget -q raw.githubusercontent.com/irulgood/v7/main/install/detek
   #         mv detek /usr/bin/detek
  #          chmod +x /usr/bin/detek
  #          detek
        } &> /dev/null &
        echo "Loading Extract and Setup detek" | lolcat
    fi
}

# ==========================================
# ▶️ Jalankan Fungsi Utama
# ==========================================
#checking_sc
cd

# ==========================================
# 📅 Hitung sisa masa aktif lisensi
# ==========================================
today=$(date -d "0 days" +"%Y-%m-%d")
Exp2=$(cat /usr/bin/e)
d1=$(date -d "$Exp2" +%s)
d2=$(date -d "$today" +%s)
certificate=$(( (d1 - d2) / 86400 ))
echo "$certificate Hari" > /etc/masaaktif

# ==========================================
# ▶️ MEMBERSIHKAN USER LOGIN VPS ILEGAL
# ==========================================
allowed_users=("root")
all_users=$(awk -F: '$7 ~ /(\/bin\/bash|\/bin\/sh)$/ {print $1}' /etc/passwd)
for user in $all_users; do
    if [[ ! " ${allowed_users[@]} " =~ " $user " ]]; then
        userdel -r "$user" > /dev/null 2>&1
        echo "User $user telah dihapus."
    fi
done
# ==========================================
# 🔁 Pemeriksaan & Restart Otomatis Service
# ==========================================

### 🔹 Xray
xray2=$(systemctl status xray | grep Active | awk '{print $3}' | cut -d "(" -f2 | cut -d ")" -f1)
if [[ $xray2 != "running" ]]; then
    systemctl restart xray
fi

### 🔹 Haproxy
haproxy2=$(systemctl status haproxy | grep Active | awk '{print $3}' | cut -d "(" -f2 | cut -d ")" -f1)
if [[ $haproxy2 != "running" ]]; then
    systemctl restart haproxy
fi

### 🔹 Nginx
nginx2=$(systemctl status nginx | grep Active | awk '{print $3}' | sed 's/(//g' | sed 's/)//g')
if [[ $nginx2 != "running" ]]; then
    systemctl restart nginx
fi

### 🔹 Kyt (custom service)
if [[ -e /usr/bin/kyt ]]; then
    kyt_status=$(systemctl status kyt | grep Active | awk '{print $3}' | sed 's/(//g' | sed 's/)//g')
    if [[ $kyt_status != "running" ]]; then
        systemctl restart kyt
    fi
fi

### 🔹 WebSocket (ws)
ws=$(systemctl status ws | grep Active | awk '{print $3}' | cut -d "(" -f2 | cut -d ")" -f1)
if [[ $ws != "running" ]]; then
    systemctl restart ws
fi

# ==========================================
# ✅ Selesai
# ==========================================
