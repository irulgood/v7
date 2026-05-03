# API Adapter v7 untuk BotVPN

Folder ini khusus untuk API script v7 agar bisa dipanggil oleh BotVPN/BotVPN2.

Service yang dibuat:
- `botvpn2-api`

Port yang aktif:
- `5889` untuk API utama dan path `/vps/...`
- `5888` untuk endpoint Shadowsocks/BotVPN2 lama

Token otomatis dibuat di:
- `/etc/botvpn2-api/token`

Perintah cek:
```bash
botvpn2-api token
botvpn2-api status
botvpn2-api log
botvpn2-api restart
botvpn2-api test
```

Endpoint yang didukung:
- `/vps/sshvpn`
- `/vps/vmessall`
- `/vps/vlessall`
- `/vps/trojanall`
- `/vps/renewsshvpn/user/hari`
- `/vps/renewvmess/user/hari`
- `/vps/renewvless/user/hari`
- `/vps/renewtrojan/user/hari`
- `/vps/deletesshvpn/user`
- `/vps/deletevmess/user`
- `/vps/deletevless/user`
- `/vps/deletetrojan/user`
- `/vps/locksshvpn/user`
- `/vps/unlocksshvpn/user`
- `/createssh`, `/createvmess`, `/createvless`, `/createtrojan`, `/createshadowsocks`
- `/renewssh`, `/renewvmess`, `/renewvless`, `/renewtrojan`, `/renewshadowsocks`

Auth BotVPN:
- Header: `Authorization: TOKEN`

Auth BotVPN2/API lama:
- Query: `?auth=TOKEN`
