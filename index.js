const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Credentials - change these to whatever you want
const ADMIN_USER = "admin";
const ADMIN_PASS = "admin123";
const SECRET = "mohammedycomd-secure-token-2026";

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Helper: generate secure token
function generateToken(username) {
    return crypto.createHmac('sha256', SECRET).update(username + Date.now()).digest('hex');
}

// Simple in-memory token store
const validTokens = new Set();

// Auth middleware using query token or cookie header
const isAuthenticated = (req, res, next) => {
    const token = req.headers['x-auth-token'] || req.query.token || getCookieToken(req);
    if (token && validTokens.has(token)) {
        req.authToken = token;
        return next();
    }
    res.redirect('/login.html');
};

function getCookieToken(req) {
    const cookieHeader = req.headers.cookie || '';
    const cookies = Object.fromEntries(cookieHeader.split('; ').map(c => c.split('=')));
    return cookies['authToken'];
}

// Static files (public) - serve AFTER auth check for protected routes
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// ROUTES
app.get('/', (req, res) => {
    const token = getCookieToken(req);
    if (token && validTokens.has(token)) {
        res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
    } else {
        res.redirect('/login.html');
    }
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    console.log(`Login attempt: user="${username}", pass="${password}"`);

    if (username === ADMIN_USER && password === ADMIN_PASS) {
        const token = generateToken(username);
        validTokens.add(token);
        // Set cookie for 7 days
        res.setHeader('Set-Cookie', `authToken=${token}; Path=/; Max-Age=604800; HttpOnly`);
        res.redirect('/');
    } else {
        res.send(`
            <div style="font-family:Cairo,sans-serif; text-align:center; margin-top:100px; direction:rtl;">
                <h2 style="color:red;">بيانات الدخول غير صحيحة</h2>
                <p>اسم المستخدم: <strong>admin</strong> | كلمة المرور: <strong>admin123</strong></p>
                <a href="/login.html">المحاولة مرة أخرى</a>
            </div>
        `);
    }
});

app.get('/logout', (req, res) => {
    const token = getCookieToken(req);
    if (token) validTokens.delete(token);
    res.setHeader('Set-Cookie', 'authToken=; Path=/; Max-Age=0');
    res.redirect('/login.html');
});

app.get('/nanostation.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'nanostation.html'));
});

app.get('/dashboard.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.post('/upload-report', isAuthenticated, upload.single('report'), (req, res) => {
    res.redirect('/');
});

app.get('/api/reports', isAuthenticated, (req, res) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) return res.json([]);

    fs.readdir(dir, (err, files) => {
        if (err) return res.json([]);
        const reports = files.filter(f => !f.startsWith('.')).map(file => {
            const ts = parseInt(file.split('-')[0]);
            return {
                name: file.split('-').slice(1).join('-'),
                url: `/uploads/${file}`,
                date: isNaN(ts) ? 'غير محدد' : new Date(ts).toLocaleDateString('ar-EG')
            };
        });
        res.json(reports);
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Login: admin / admin123`);
});
