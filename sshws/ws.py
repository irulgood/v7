#!/usr/bin/env python3
import base64
import hashlib
import os
import select
import socket
import struct
import threading

LISTEN_HOST = os.environ.get('WS_HOST', '0.0.0.0')
LISTEN_PORTS = [int(x) for x in os.environ.get('WS_PORTS', '8080,8880,2082').split(',') if x.strip()]
SSH_HOST = os.environ.get('SSH_HOST', '127.0.0.1')
SSH_PORT = int(os.environ.get('SSH_PORT', '22'))
GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'


def recv_until(sock, marker=b'\r\n\r\n', limit=8192):
    data = b''
    while marker not in data and len(data) < limit:
        chunk = sock.recv(1024)
        if not chunk:
            break
        data += chunk
    return data


def handshake(client):
    req = recv_until(client)
    if not req:
        return False
    headers = {}
    for line in req.decode('latin1', 'ignore').split('\r\n')[1:]:
        if ':' in line:
            k, v = line.split(':', 1)
            headers[k.strip().lower()] = v.strip()
    key = headers.get('sec-websocket-key')
    if not key:
        client.sendall(b'HTTP/1.1 400 Bad Request\r\n\r\n')
        return False
    accept = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
    resp = (
        'HTTP/1.1 101 Switching Protocols\r\n'
        'Upgrade: websocket\r\n'
        'Connection: Upgrade\r\n'
        f'Sec-WebSocket-Accept: {accept}\r\n\r\n'
    ).encode()
    client.sendall(resp)
    return True


def ws_recv(sock):
    h = sock.recv(2)
    if len(h) < 2:
        return b''
    b1, b2 = h[0], h[1]
    opcode = b1 & 0x0F
    masked = b2 & 0x80
    length = b2 & 0x7F
    if opcode == 8:
        return b''
    if length == 126:
        ext = sock.recv(2)
        if len(ext) < 2:
            return b''
        length = struct.unpack('!H', ext)[0]
    elif length == 127:
        ext = sock.recv(8)
        if len(ext) < 8:
            return b''
        length = struct.unpack('!Q', ext)[0]
    mask = sock.recv(4) if masked else b''
    payload = b''
    while len(payload) < length:
        chunk = sock.recv(length - len(payload))
        if not chunk:
            return b''
        payload += chunk
    if masked:
        payload = bytes(payload[i] ^ mask[i % 4] for i in range(len(payload)))
    return payload


def ws_send(sock, data):
    if not data:
        return
    head = bytearray([0x82])
    ln = len(data)
    if ln < 126:
        head.append(ln)
    elif ln < 65536:
        head.append(126)
        head.extend(struct.pack('!H', ln))
    else:
        head.append(127)
        head.extend(struct.pack('!Q', ln))
    sock.sendall(bytes(head) + data)


def pipe(client, ssh):
    try:
        while True:
            r, _, _ = select.select([client, ssh], [], [], 60)
            if client in r:
                data = ws_recv(client)
                if not data:
                    break
                ssh.sendall(data)
            if ssh in r:
                data = ssh.recv(4096)
                if not data:
                    break
                ws_send(client, data)
    except Exception:
        pass
    finally:
        for s in (client, ssh):
            try:
                s.close()
            except Exception:
                pass


def handle(client, addr):
    try:
        if not handshake(client):
            client.close(); return
        ssh = socket.create_connection((SSH_HOST, SSH_PORT), timeout=10)
        pipe(client, ssh)
    except Exception:
        try:
            client.close()
        except Exception:
            pass


def serve(port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind((LISTEN_HOST, port))
    s.listen(200)
    print(f'SSH WebSocket listen {LISTEN_HOST}:{port} -> {SSH_HOST}:{SSH_PORT}', flush=True)
    while True:
        c, a = s.accept()
        threading.Thread(target=handle, args=(c, a), daemon=True).start()


threads = []
for p in LISTEN_PORTS:
    t = threading.Thread(target=serve, args=(p,), daemon=True)
    t.start(); threads.append(t)
for t in threads:
    t.join()
