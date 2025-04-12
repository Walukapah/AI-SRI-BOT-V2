const { Boom } = require('@hapi/boom');
const makeWASocket = require('@adiwajshing/baileys').default;
const { useSingleFileAuthState } = require('@adiwajshing/baileys-store');
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

// Store pairing codes
const pairingCodes = new Map();

// Auth state management
const { state, saveState } = useSingleFileAuthState('./auth_info.json');

// Generate random 6-digit code
function generatePairingCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// WhatsApp client setup
let sock = null;

app.post('/start-session', async (req, res) => {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
    }

    // Generate pairing code
    const pairingCode = generatePairingCode();
    pairingCodes.set(phoneNumber, {
        code: pairingCode,
        timestamp: Date.now(),
        verified: false
    });

    // Initialize WhatsApp client
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    });

    sock.ev.on('connection.update', (update) => {
        if (update.qr) {
            // QR code available (fallback)
            console.log('QR code received:', update.qr);
        }
        
        if (update.connection === 'open') {
            console.log('WhatsApp connected!');
            // Mark as verified when connection is open
            const codeData = pairingCodes.get(phoneNumber);
            if (codeData) {
                codeData.verified = true;
                pairingCodes.set(phoneNumber, codeData);
            }
        }
    });

    sock.ev.on('creds.update', saveState);

    res.json({ 
        status: 'success',
        pairingCode,
        message: 'Use this code in WhatsApp Web'
    });
});

app.get('/check-status/:phoneNumber', (req, res) => {
    const { phoneNumber } = req.params;
    const codeData = pairingCodes.get(phoneNumber);
    
    if (!codeData) {
        return res.status(404).json({ error: 'No session found' });
    }

    res.json({
        status: codeData.verified ? 'connected' : 'pending',
        code: codeData.code
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
