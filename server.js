const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const admin = require('firebase-admin');
const cors = require('cors');

// تهيئة Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert(require('./firebase-admin-key.json')),
    databaseURL: "https://messageemeapp-default-rtdb.firebaseio.com"
});

app.use(cors());
app.use(express.static('public'));

const db = admin.database();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // إنشاء غرفة جديدة
    socket.on('create-room', async () => {
        const roomId = Math.random().toString(36).substring(2, 7);
        
        try {
            await db.ref(`rooms/${roomId}`).set({
                hostId: socket.id,
                status: 'waiting',
                createdAt: admin.database.ServerValue.TIMESTAMP
            });

            socket.join(roomId);
            socket.emit('room-created', { roomId });
        } catch (error) {
            console.error('Error creating room:', error);
            socket.emit('error', { message: 'Failed to create room' });
        }
    });

    // الانضمام إلى غرفة
    socket.on('join-room', async (roomId) => {
        try {
            const roomRef = db.ref(`rooms/${roomId}`);
            const snapshot = await roomRef.once('value');
            const room = snapshot.val();

            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }

            socket.join(roomId);
            socket.to(roomId).emit('user-joined', socket.id);

            await roomRef.update({
                guestId: socket.id,
                status: 'connected'
            });
        } catch (error) {
            socket.emit('error', { message: 'Failed to join room' });
        }
    });

    // تبادل معلومات WebRTC
    socket.on('offer', (data) => {
        socket.to(data.roomId).emit('offer', data.offer);
    });

    socket.on('answer', (data) => {
        socket.to(data.roomId).emit('answer', data.answer);
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.roomId).emit('ice-candidate', data.candidate);
    });

    // معالجة قطع الاتصال
    socket.on('disconnect', async () => {
        try {
            const rooms = await db.ref('rooms').once('value');
            rooms.forEach(async (room) => {
                const roomData = room.val();
                if (roomData.hostId === socket.id || roomData.guestId === socket.id) {
                    await db.ref(`rooms/${room.key}`).remove();
                    io.to(room.key).emit('call-ended');
                }
            });
        } catch (error) {
            console.error('Error handling disconnect:', error);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});