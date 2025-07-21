const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');


axios.get('http://192.168.196.235:3077/logs/endpoint', {
    auth: {
        username: 'admin',
        password: 'admin123' // <- ganti dengan yang sesuai
    }
})
.then(res => console.log(res.data))
.catch(err => console.error('Error:', err.response.status, err.message));

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' } // agar bisa diakses dari frontend Laravel
});

const PORT = 3000; // ganti port jika perlu

// Tes route biasa (bisa diakses via browser)
app.get('/', (req, res) => {
    res.send('Node.js + Express + Socket.IO server aktif!');
});

// WebSocket client connect
io.on('connection', (socket) => {
    console.log('Client terhubung:', socket.id);

    socket.on('disconnect', () => {
        console.log('Client terputus:', socket.id);
    });
});

// Polling ke API eksternal (192.168.196.235)
const apiURL = 'http://192.168.196.235:3077/logs/endpoint';

setInterval(async () => {
    try {
        const res = await axios.get(apiURL, {
            auth: {
                username: 'admin',
                password: 'admin123'
            }
        });

        console.log('RESPON MENTAH:', res.data);
        
        const filtered = res.data.map(item => ({
    endpoint: item.endpoint,
    status: item.status
}));
io.emit('device-status', filtered);
console.log('Data disederhanakan dikirim ke client:', filtered);


    } catch (error) {
        console.error('Gagal ambil data:', error.response?.status, error.message);
    }
}, 10000);

// Start server
server.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});