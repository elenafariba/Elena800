const http = require('http');
const WebSocket = require('ws');
const net = require('net');

// شناسایی هوشمند پورت: اولویت با پورت پویا در پتروداکتیل (Botkeep)، بعد پورت عمومی و در نهایت 3000
const port = process.env.SERVER_PORT || process.env.PORT || 3000;
const MY_UUID = process.env.UUID || 'd342d11e-d424-4583-b36e-524ab1f0afa4';

const server = http.createServer((req, res) => {
    const host = req.headers.host || 'localhost';
    
    // نمایش لینک کانفیگ در مسیر /config
    if (req.url === '/config') {
        let vlessLink;
        
        // اگر روی بات‌کیپ (پتروداکتیل) بودیم با پورت پویا و امنیت none
        if (process.env.SERVER_PORT) {
            vlessLink = `vless://${MY_UUID}@${host}?encryption=none&security=none&type=ws&path=%2F#Botkeep-VLESS`;
        } else {
            // اگر روی رندر یا ریلویل بودیم با پورت استاندارد و امنیت tls
            vlessLink = `vless://${MY_UUID}@${host}:443?encryption=none&security=tls&sni=${host}&fp=chrome&type=ws&host=${host}&path=%2F#Render-Railway-VLESS`;
        }
        
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(vlessLink);
        return;
    }

    // صفحه فیک و عادی برای سایر مسیرها جهت جلوگیری از شناسایی
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
        status: "success",
        code: 200,
        message: "Node.js backend service is actively running."
    }));
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
    const protocols = req.headers['sec-websocket-protocol'];
    
    const handleVless = (buffer) => {
        try {
            if (buffer.length < 24) {
                ws.close();
                return;
            }

            const clientUUID = toUUID(buffer.slice(1, 17));
            if (clientUUID !== MY_UUID) {
                ws.close(1011, 'Invalid Request');
                return;
            }

            let i = 19 + buffer[17];
            let targetPort = (buffer[i++] << 8) | buffer[i++];
            let type = buffer[i++];
            let address = "";
            
            if (type === 1) {
                address = buffer.slice(i, i + 4).join(".");
                i += 4;
            } else if (type === 2) {
                let len = buffer[i++];
                address = buffer.slice(i, i + len).toString('utf8');
                i += len;
            } else if (type === 3) {
                ws.close();
                return;
            }

            const targetSocket = net.connect(targetPort, address, () => {
                ws.send(new Uint8Array([buffer[0], 0]));
                if (buffer.length > i) {
                    targetSocket.write(buffer.slice(i));
                }
            });

            targetSocket.on('data', (data) => {
                if (ws.readyState === WebSocket.OPEN) ws.send(data);
            });
            
            ws.on('message', (data) => {
                if (targetSocket && !targetSocket.destroyed) targetSocket.write(data);
            });

            targetSocket.on('error', () => ws.close());
            targetSocket.on('close', () => ws.close());
            ws.on('close', () => targetSocket.destroy());
            ws.on('error', () => targetSocket.destroy());

        } catch (error) {
            ws.close();
        }
    };

    if (protocols) {
        const decoded = Buffer.from(protocols.replace(/-/g, "+").replace(/_/g, "/"), 'base64');
        handleVless(decoded);
    } else {
        ws.once('message', (msg) => {
            handleVless(Buffer.from(msg));
        });
    }
});

function toUUID(bytes) {
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

server.listen(port, () => {
    console.log(`Service initialized successfully on port ${port}`);
});
