//server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

const PORT = 3000;

// Test route
app.get('/', (req, res) => {
    res.send('Node.js + Express + Socket.IO server aktif!');
});

// WebSocket client connect
io.on('connection', (socket) => {
    console.log('Client terhubung:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('Client terputus:', socket.id);
    });
    
    // Send immediate status on connect
    socket.emit('server-info', {
        message: 'Connected to device status server',
        timestamp: new Date().toISOString(),
        clientId: socket.id
    });
});

// API configuration
const apiURL = 'http://192.168.196.235:3077/logs/endpoint';
const apiAuth = {
    username: 'admin',
    password: 'admin123'
};

let lastSuccessfulData = [];
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;

// Enhanced polling dengan error handling
const pollInterval = setInterval(async () => {
    try {
        console.log('Polling API...');
        
        const res = await axios.get(apiURL, {
            auth: apiAuth,
            timeout: 10000 // 10 second timeout
        });
        
        console.log('RAW API Response:', JSON.stringify(res.data, null, 2));
        
        // Reset error counter on success
        consecutiveErrors = 0;
        
        // Validasi data
        if (!Array.isArray(res.data)) {
            console.warn('API response is not an array:', typeof res.data);
            return;
        }
        
        if (res.data.length === 0) {
            console.log('No data received from API');
            return;
        }
        
        // Filter duplicate endpoints (keep latest)
        const seen = new Set();
        const filtered = [];
        
        // Process dalam urutan terbalik untuk mengambil data terbaru
        res.data.reverse().forEach(item => {
            if (!seen.has(item.endpoint)) {
                seen.add(item.endpoint);
                
                // Ensure all required fields exist
                const processedItem = {
                    endpoint: item.endpoint || 'unknown',
                    status: item.status || 'offline',
                    timestamp: item.timestamp || new Date().toISOString()
                };
                
                filtered.push(processedItem);
                console.log(`Processed: ${processedItem.endpoint} -> ${processedItem.status}`);
            }
        });
        
        // Compare dengan data sebelumnya
        const hasChanges = JSON.stringify(filtered) !== JSON.stringify(lastSuccessfulData);
        
        if (hasChanges || true) { // Force send for debugging
            console.log('Sending to clients:', filtered.length, 'devices');
            console.log('Data detail:', filtered);
            
            // Emit ke semua client
            io.emit('device-status', filtered);
            
            // Log per client
            const connectedClients = Array.from(io.sockets.sockets.keys());
            console.log('Connected clients:', connectedClients);
            
            lastSuccessfulData = filtered;
        } else {
            console.log('No changes detected, skipping emit');
        }
        
    } catch (error) {
        consecutiveErrors++;
        console.error('API Error:', {
            status: error.response?.status,
            message: error.message,
            consecutiveErrors: consecutiveErrors
        });
        
        // Send error status to clients if too many consecutive errors
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            console.error('Too many consecutive errors, notifying clients');
            io.emit('server-error', {
                message: 'API temporarily unavailable',
                errorCount: consecutiveErrors,
                timestamp: new Date().toISOString()
            });
        }
    }
}, 3000);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    clearInterval(pollInterval);
    server.close(() => {
        console.log('Server stopped');
        process.exit(0);
    });
});

// Error handling for server
server.on('error', (error) => {
    console.error('Server error:', error);
});

// Start server
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Polling ${apiURL} every 3 seconds`);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        lastDataCount: lastSuccessfulData.length,
        consecutiveErrors: consecutiveErrors,
        connectedClients: io.sockets.sockets.size
    });
});

// Manual trigger endpoint for testing
app.get('/trigger', async (req, res) => {
    try {
        const response = await axios.get(apiURL, { auth: apiAuth });
        const testData = [{
            endpoint: 'test-manual',
            status: 'online',
            timestamp: new Date().toISOString()
        }];
        
        io.emit('device-status', testData);
        res.json({ 
            message: 'Manual trigger sent', 
            data: testData,
            apiData: response.data 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});