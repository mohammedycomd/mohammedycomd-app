const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Credentials
const ADMIN_USER = "admin";
const ADMIN_PASS = "admin123";
const JWT_SECRET = "mohammedycomd-jwt-2026-secure";

// ── FILE UPLOAD SETUP (defined early so routes can use it) ──
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// ── MIDDLEWARE ──────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Serve static assets (CSS/JS) but NOT HTML pages directly
app.use('/style.css', express.static(path.join(__dirname, 'public', 'style.css')));
app.use('/script.js', express.static(path.join(__dirname, 'public', 'script.js')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── AUTH MIDDLEWARE ─────────────────────────────────────
const isAuthenticated = (req, res, next) => {
    const token = req.cookies.authToken;
    if (!token) return res.redirect('/login.html');
    try {
        jwt.verify(token, JWT_SECRET);
        return next();
    } catch (err) {
        return res.redirect('/login.html');
    }
};

// ── PUBLIC ROUTES ───────────────────────────────────────
app.get('/', (req, res) => {
    // If already logged in → go to dashboard directly
    const token = req.cookies.authToken;
    if (token) {
        try {
            jwt.verify(token, JWT_SECRET);
            return res.redirect('/dashboard.html');
        } catch {}
    }
    // Otherwise → show the beautiful landing page
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    console.log(`Login attempt: user="${username}"`);

    if (username === ADMIN_USER && password === ADMIN_PASS) {
        const token = jwt.sign({ user: username }, JWT_SECRET, { expiresIn: '7d' });
        // Detect HTTPS properly on Render (uses reverse proxy with X-Forwarded-Proto)
        const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
        res.cookie('authToken', token, {
            httpOnly: true,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            sameSite: 'lax',
            secure: isSecure
        });
        return res.redirect('/dashboard.html');
    } else {
        return res.send(`
            <html><body style="font-family:Cairo,sans-serif;text-align:center;padding:50px;direction:rtl;background:#0f172a;color:#fff;">
                <h2 style="color:#ef4444;">❌ بيانات الدخول خاطئة</h2>
                <br><a href="/login.html" style="color:#c5a059;">← حاول مرة أخرى</a>
            </body></html>
        `);
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('authToken');
    res.redirect('/login.html');
});

// ── PROTECTED ROUTES ────────────────────────────────────
app.get('/dashboard.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/nanostation.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'nanostation.html'));
});

app.post('/upload-report', isAuthenticated, upload.single('report'), (req, res) => {
    res.redirect('/dashboard.html');
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
                date: isNaN(ts) ? '-' : new Date(ts).toLocaleDateString('ar-EG')
            };
        });
        res.json(reports);
    });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
