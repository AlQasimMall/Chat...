const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const path = require('path');

app.use(express.static('public'));

// تخزين معرفات المستخدمين
const users = new Map();

io.on('connection', (socket) => {
    console.log('مستخدم جديد متصل:', socket.id);

    // تسجيل مستخدم جديد
    socket.on('register', (username) => {
        users.set(username, socket.id);
        io.emit('users-list', Array.from(users.keys()));
        console.log('تم تسجيل المستخدم:', username);
    });

    // إرسال طلب اتصال
    socket.on('call-user', (data) => {
        const targetId = users.get(data.target);
        if (targetId) {
            socket.to(targetId).emit('call-made', {
                offer: data.offer,
                caller: data.caller
            });
        }
    });

    // الرد على طلب الاتصال
    socket.on('make-answer', (data) => {
        const targetId = users.get(data.target);
        if (targetId) {
            socket.to(targetId).emit('answer-made', {
                answer: data.answer,
                answerer: data.answerer
            });
        }
    });

    // إرسال مرشحي ICE
    socket.on('ice-candidate', (data) => {
        const targetId = users.get(data.target);
        if (targetId) {
            socket.to(targetId).emit('ice-candidate', {
                candidate: data.candidate,
                sender: data.sender
            });
        }
    });

    // قطع الاتصال
    socket.on('disconnect', () => {
        let disconnectedUser;
        for (const [username, id] of users.entries()) {
            if (id === socket.id) {
                disconnectedUser = username;
                break;
            }
        }
        if (disconnectedUser) {
            users.delete(disconnectedUser);
            io.emit('users-list', Array.from(users.keys()));
            io.emit('user-disconnected', disconnectedUser);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`الخادم يعمل على المنفذ ${PORT}`);
});