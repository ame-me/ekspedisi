const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Log all requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Robust Master Key for Windows Compatibility
const SECRET_KEY = "EKSPRESIN_AJA_2026_MASTER_KEY";
console.log(`System Security Initialized.`);

const db = new sqlite3.Database('./ekspedisi.db', (err) => {
    if (err) console.error(err.message);
});

// Reset table for fresh testing with fixed encryption
db.serialize(() => {
    // db.run(`DROP TABLE IF EXISTS shipments`); 
    db.run(`CREATE TABLE IF NOT EXISTS shipments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tracking_number TEXT UNIQUE,
        sender_name_enc TEXT,
        sender_phone_enc TEXT,
        sender_kec_enc TEXT,
        sender_addr_enc TEXT,
        receiver_name_enc TEXT,
        receiver_phone_enc TEXT,
        receiver_kec_enc TEXT,
        receiver_addr_enc TEXT,
        item_name_enc TEXT,
        item_category_enc TEXT,
        item_notes TEXT,
        insurance_enc TEXT,
        nonce TEXT,
        service_type TEXT,
        weight REAL,
        status TEXT DEFAULT 'Pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

/**
 * High-Precision ChaCha20 Implementation
 */
function chacha20Block(key, nonce, counter) {
    const state = new Uint32Array(16);
    
    // Key (32 bytes)
    const k = Buffer.alloc(32, 0);
    Buffer.from(key).copy(k);
    
    // Nonce (12 bytes)
    const n = Buffer.from(nonce, 'base64');

    state[0] = 0x61707865; state[1] = 0x3320646e; state[2] = 0x79622d32; state[3] = 0x6b206574;
    for (let i = 0; i < 8; i++) state[i + 4] = k.readUInt32LE(i * 4);
    state[12] = counter;
    state[13] = n.readUInt32LE(0);
    state[14] = n.readUInt32LE(4);
    state[15] = n.readUInt32LE(8);

    const workingState = new Uint32Array(state);
    const rotate = (v, c) => (v << c) | (v >>> (32 - c));
    const quarterRound = (a, b, c, d) => {
        workingState[a] += workingState[b]; workingState[d] ^= workingState[a]; workingState[d] = rotate(workingState[d], 16);
        workingState[c] += workingState[d]; workingState[b] ^= workingState[c]; workingState[b] = rotate(workingState[b], 12);
        workingState[a] += workingState[b]; workingState[d] ^= workingState[a]; workingState[d] = rotate(workingState[d], 8);
        workingState[c] += workingState[d]; workingState[b] ^= workingState[c]; workingState[b] = rotate(workingState[b], 7);
    };

    for (let i = 0; i < 10; i++) {
        quarterRound(0, 4, 8, 12); quarterRound(1, 5, 9, 13); quarterRound(2, 6, 10, 14); quarterRound(3, 7, 11, 15);
        quarterRound(0, 5, 10, 15); quarterRound(1, 6, 11, 12); quarterRound(2, 7, 8, 13); quarterRound(3, 4, 9, 14);
    }

    for (let i = 0; i < 16; i++) state[i] += workingState[i];
    return Buffer.from(state.buffer);
}

function processChaCha20(key, nonce, data) {
    const input = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const output = Buffer.alloc(input.length);
    let keyStream;
    for (let i = 0; i < input.length; i++) {
        if (i % 64 === 0) {
            const block = chacha20Block(key, nonce, Math.floor(i / 64) + 1);
            keyStream = block;
        }
        output[i] = input[i] ^ keyStream[i % 64];
    }
    return output;
}

// HELPER: Root route to check server status
app.get('/', (req, res) => {
    res.send(`<h1>🚀 Server Ekspedisi Aktif</h1><p>API running on /api/shipments</p>`);
});

// API
// PUBLIC TRACKING API
app.get('/api/track/:number', (req, res) => {
    const { number } = req.params;
    db.get("SELECT * FROM shipments WHERE tracking_number = ?", [number], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ message: 'Resi tidak ditemukan' });
        res.json(row);
    });
});

app.get('/api/key', (req, res) => res.json({ key: SECRET_KEY }));

app.get('/api/shipments', (req, res) => {
    console.log('GET /api/shipments - Fetching all data');
    db.all("SELECT * FROM shipments ORDER BY created_at DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/shipments', (req, res) => {
    const { 
        senderName, senderPhone, senderKec, senderAddr,
        receiverName, receiverPhone, receiverKec, receiverAddr,
        itemName, itemCategory, itemDesc, insuranceValue, service, weight 
    } = req.body;
    
    const tracking_number = 'EJA-' + Math.random().toString(36).substr(2, 7).toUpperCase();
    const nonce = Buffer.alloc(12);
    for (let i = 0; i < 12; i++) nonce[i] = Math.floor(Math.random() * 256);
    
    const nonceB64 = nonce.toString('base64');
    const enc = (data) => (data !== undefined && data !== null && data !== '') ? processChaCha20(SECRET_KEY, nonceB64, data.toString()).toString('base64') : '';

    console.log(`POST /api/shipments - Saving new shipment...`);

    db.run(`INSERT INTO shipments (
        tracking_number, 
        sender_name_enc, sender_phone_enc, sender_kec_enc, sender_addr_enc,
        receiver_name_enc, receiver_phone_enc, receiver_kec_enc, receiver_addr_enc,
        item_name_enc, item_category_enc, item_notes, insurance_enc, 
        nonce, service_type, weight, status
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
            tracking_number, 
            enc(senderName), enc(senderPhone), enc(senderKec), enc(senderAddr),
            enc(receiverName), enc(receiverPhone), enc(receiverKec), enc(receiverAddr),
            enc(itemName), enc(itemCategory), itemDesc, enc(insuranceValue),
            nonceB64, service, weight, 'Pending'
        ],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, tracking_number });
        }
    );
});

app.put('/api/shipments/:id/status', (req, res) => {
    const shipmentId = parseInt(req.params.id);
    const { status } = req.body;
    db.run(`UPDATE shipments SET status = ? WHERE id = ?`, [status, shipmentId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Success' });
    });
});

app.post('/api/decrypt', (req, res) => {
    const { encryptedData, nonceBase64 } = req.body;
    if (!encryptedData || !nonceBase64) {
        return res.json({ decrypted: '' });
    }
    try {
        const encrypted = Buffer.from(encryptedData, 'base64');
        const decrypted = processChaCha20(SECRET_KEY, nonceBase64, encrypted);
        res.json({ decrypted: decrypted.toString() });
    } catch (err) {
        res.status(500).json({ error: 'Decryption failed' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`------------------------------------------`);
    console.log(`🚀 BACKEND RUNNING: http://127.0.0.1:${PORT}`);
    console.log(`------------------------------------------`);
});
