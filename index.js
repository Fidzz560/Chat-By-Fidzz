const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'kunci-rahasia-chat-acode-2026',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 3600000 * 24 }
}));

const users = {}; 
const activeSockets = {}; 
const feedbackList = []; 

app.post('/api/register', async (req, res) => {
    const { username, password, displayName } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Username & Password wajib!' });
    if (users[username]) return res.status(400).json({ success: false, message: 'Username sudah digunakan.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    users[username] = { 
        username, 
        password: hashedPassword, 
        displayName: displayName || username,
        themeColor: 'teal',
        darkMode: false
    };
    res.json({ success: true, message: 'Akun berhasil dibuat! Silakan login.' });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = users[username];
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(400).json({ success: false, message: 'Username atau password salah!' });
    }
    req.session.user = { 
        username: user.username, 
        displayName: user.displayName,
        themeColor: user.themeColor || 'teal',
        darkMode: user.darkMode || false
    };
    res.json({ success: true, user: req.session.user });
});

app.post('/api/update-profile', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    const { displayName, newPassword, themeColor, darkMode } = req.body;
    const username = req.session.user.username;

    if (displayName) {
        users[username].displayName = displayName;
        req.session.user.displayName = displayName;
    }
    if (newPassword) users[username].password = await bcrypt.hash(newPassword, 10);
    if (themeColor !== undefined) {
        users[username].themeColor = themeColor;
        req.session.user.themeColor = themeColor;
    }
    if (darkMode !== undefined) {
        users[username].darkMode = darkMode;
        req.session.user.darkMode = darkMode;
    }

    res.json({ success: true, message: 'Pengaturan berhasil disimpan!', user: req.session.user });
});

app.post('/api/feedback', (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    const { feedback } = req.body;
    if (!feedback) return res.status(400).json({ success: false, message: 'Saran tidak boleh kosong.' });

    feedbackList.push({
        username: req.session.user.username,
        feedback: feedback,
        date: new Date().toLocaleString()
    });

    res.json({ success: true, message: 'Saran berhasil dikirim!' });
});

app.get('/api/session', (req, res) => {
    if (req.session.user) res.json({ loggedIn: true, user: req.session.user });
    else res.json({ loggedIn: false });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

io.on('connection', (socket) => {
    socket.on('register-user', (username) => {
        activeSockets[username] = socket.id;
        socket.username = username;
        io.emit('update-user-list', Object.keys(users));
    });

    socket.on('send-private-message', ({ toUsername, message }) => {
        const recipientSocketId = activeSockets[toUsername];
        const payload = {
            from: socket.username,
            message: message,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        if (recipientSocketId) io.to(recipientSocketId).emit('receive-message', payload);
        socket.emit('message-sent', { ...payload, to: toUsername });
    });

    socket.on('disconnect', () => {
        if (socket.username) delete activeSockets[socket.username];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server aktif di port ${PORT}`));
