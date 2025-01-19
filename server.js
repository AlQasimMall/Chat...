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

// خريطة لتخزين معرفات المستخدمين
const users = new Map();

io.on('connection', (socket) => {
    console.log('مستخدم جديد متصل:', socket.id);

    // تسجيل المستخدم الجديد وإرسال قائمة المستخدمين المحدثة
    socket.on('register', (username) => {
        if (!users.has(username)) {
            users.set(username, socket.id);
            io.emit('users-list', Array.from(users.keys())); // إرسال قائمة المستخدمين المحدثة
            console.log(`تم تسجيل المستخدم: ${username}`);
        } else {
            console.log(`اسم المستخدم ${username} مستخدم بالفعل!`);
        }
    });

    // إرسال طلب اتصال من مستخدم إلى آخر
    socket.on('call-user', (data) => {
        const targetId = users.get(data.target);
        if (targetId) {
            console.log(`إرسال طلب اتصال من ${data.caller} إلى ${data.target}`);
            socket.to(targetId).emit('call-made', {
                offer: data.offer,
                caller: data.caller
            });
        } else {
            console.log(`تعذر العثور على المستخدم المستهدف: ${data.target}`);
        }
    });

    // الرد على طلب الاتصال
    socket.on('make-answer', (data) => {
        const targetId = users.get(data.target);
        if (targetId) {
            console.log(`إرسال الإجابة من ${data.answerer} إلى ${data.target}`);
            socket.to(targetId).emit('answer-made', {
                answer: data.answer,
                answerer: data.answerer
            });
        } else {
            console.log(`تعذر العثور على المستخدم المستهدف لإرسال الإجابة: ${data.target}`);
        }
    });

    // معالجة مرشحي ICE
    socket.on('ice-candidate', (data) => {
        const targetId = users.get(data.target);
        if (targetId) {
            console.log(`إرسال مرشح ICE من ${data.sender} إلى ${data.target}`);
            socket.to(targetId).emit('ice-candidate', {
                candidate: data.candidate,
                sender: data.sender
            });
        } else {
            console.log(`تعذر العثور على المستخدم المستهدف لإرسال مرشح ICE: ${data.target}`);
        }
    });

    // التعامل مع انقطاع اتصال المستخدم
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
            io.emit('users-list', Array.from(users.keys())); // تحديث قائمة المستخدمين
            io.emit('user-disconnected', disconnectedUser); // إعلام الآخرين بانقطاع الاتصال
            console.log(`المستخدم ${disconnectedUser} قطع الاتصال.`);
        }
    });
});

// بدء الخادم
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`الخادم يعمل على المنفذ ${PORT}`);
});
