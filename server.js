const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Store connected clients and rooms
// Format: { room_id: Set<WebSocket> }
const rooms = {};

wss.on('connection', (ws) => {
    let currentRoomId = null;

    ws.on('message', (messageAsString) => {
        let data;
        try {
            data = JSON.parse(messageAsString);
        } catch (e) {
            console.error("Invalid JSON received");
            return;
        }

        const action = data.action;

        if (action === 'join') {
            const roomId = data.room;
            if (!roomId) return;

            if (!rooms[roomId]) {
                rooms[roomId] = new Set();
            }

            if (rooms[roomId].size >= 2) {
                ws.send(JSON.stringify({ action: 'error', message: 'Room is full' }));
                return;
            }

            rooms[roomId].add(ws);
            currentRoomId = roomId;
            console.log(`User joined room: ${roomId}. Total: ${rooms[roomId].size}`);

            // If room has 2 users, notify them to start connection
            if (rooms[roomId].size === 2) {
                const clients = Array.from(rooms[roomId]);
                clients[0].send(JSON.stringify({ action: 'ready', initiator: true }));
                clients[1].send(JSON.stringify({ action: 'ready', initiator: false }));
            }
        } else if (['offer', 'answer', 'ice-candidate'].includes(action)) {
            // Relay to the other peer in the room
            if (currentRoomId && rooms[currentRoomId]) {
                rooms[currentRoomId].forEach((client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(data));
                    }
                });
            }
        }
    });

    ws.on('close', () => {
        if (currentRoomId && rooms[currentRoomId]) {
            if (rooms[currentRoomId].has(ws)) {
                rooms[currentRoomId].delete(ws);
                console.log(`User left room: ${currentRoomId}. Total: ${rooms[currentRoomId].size}`);
                
                // Notify remaining user
                rooms[currentRoomId].forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ action: 'peer-disconnected' }));
                    }
                });
            }

            if (rooms[currentRoomId].size === 0) {
                delete rooms[currentRoomId];
            }
        }
    });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT} (and ws://0.0.0.0:${PORT}/ws)`);
});
