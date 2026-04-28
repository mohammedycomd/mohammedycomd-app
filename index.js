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

// ── FILE UPLOAD SETUP ────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // Preserve original filename, avoid duplicates with timestamp prefix
        const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, Date.now() + '-' + safeName);
    }
});

// Accept up to 100 files at once
const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100 MB per file
});

// ── MIDDLEWARE ───────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Serve static assets only (CSS/JS/uploads) - NOT HTML pages directly
app.use('/style.css',  express.static(path.join(__dirname, 'public', 'style.css')));
app.use('/script.js',  express.static(path.join(__dirname, 'public', 'script.js')));
app.use('/uploads',    express.static(path.join(__dirname, 'uploads')));

// ── AUTH MIDDLEWARE ──────────────────────────────────────
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

// ── PUBLIC ROUTES (only login page is public) ────────────

// Root "/" → PRIVATE: redirect to login if not authenticated
app.get('/', (req, res) => {
    const token = req.cookies.authToken;
    if (token) {
        try {
            jwt.verify(token, JWT_SECRET);
            return res.redirect('/dashboard.html');
        } catch {}
    }
    // Not logged in → go to login page directly
    return res.redirect('/login.html');
});

// Login page - always accessible
app.get('/login.html', (req, res) => {
    // If already logged in, skip login
    const token = req.cookies.authToken;
    if (token) {
        try {
            jwt.verify(token, JWT_SECRET);
            return res.redirect('/dashboard.html');
        } catch {}
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login form handler
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    console.log(`Login attempt: user="${username}"`);

    if (username === ADMIN_USER && password === ADMIN_PASS) {
        const token = jwt.sign({ user: username }, JWT_SECRET, { expiresIn: '7d' });
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
            <html><head><meta charset="UTF-8"></head>
            <body style="font-family:Cairo,sans-serif;text-align:center;padding:50px;direction:rtl;background:#0f172a;color:#fff;">
                <h2 style="color:#ef4444;">❌ بيانات الدخول خاطئة</h2>
                <br><a href="/login.html" style="color:#c5a059;">← حاول مرة أخرى</a>
            </body></html>
        `);
    }
});

// Logout
app.get('/logout', (req, res) => {
    res.clearCookie('authToken');
    res.redirect('/login.html');
});

// Block direct access to index.html (private)
app.get('/index.html', isAuthenticated, (req, res) => {
    res.redirect('/dashboard.html');
});

// ── PROTECTED ROUTES ─────────────────────────────────────

// Dashboard - requires login
app.get('/dashboard.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ── MULTI-FILE UPLOAD ─────────────────────────────────────
// Accepts field name "reports" with up to 100 files
app.post('/upload-report', isAuthenticated, upload.array('reports', 100), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'لم يتم اختيار أي ملفات' });
    }

    const uploaded = req.files.map(f => ({
        name: f.originalname,
        storedName: f.filename,
        url: `/uploads/${f.filename}`,
        size: f.size,
        date: new Date().toLocaleDateString('ar-EG', {
            year: 'numeric', month: 'long', day: 'numeric'
        })
    }));

    console.log(`Uploaded ${uploaded.length} file(s)`);

    // Check if request expects JSON (AJAX) or form redirect
    if (req.headers['x-requested-with'] === 'XMLHttpRequest' || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, count: uploaded.length, files: uploaded });
    }

    return res.redirect('/dashboard.html');
});

// ── REPORTS API ───────────────────────────────────────────
app.get('/api/reports', isAuthenticated, (req, res) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) return res.json([]);

    fs.readdir(dir, (err, files) => {
        if (err) return res.json([]);

        const reports = files
            .filter(f => !f.startsWith('.'))
            .map(file => {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);
                const dashIdx = file.indexOf('-');
                const ts = parseInt(file.substring(0, dashIdx));
                const originalName = dashIdx >= 0 ? file.substring(dashIdx + 1) : file;

                return {
                    name: originalName,
                    storedName: file,
                    url: `/uploads/${file}`,
                    size: stat.size,
                    date: isNaN(ts)
                        ? new Date(stat.mtime).toLocaleDateString('ar-EG')
                        : new Date(ts).toLocaleDateString('ar-EG', {
                            year: 'numeric', month: 'long', day: 'numeric'
                        })
                };
            })
            .sort((a, b) => b.storedName.localeCompare(a.storedName)); // newest first

        res.json(reports);
    });
});

// ── DELETE REPORT API ─────────────────────────────────────
app.delete('/api/reports/:filename', isAuthenticated, (req, res) => {
    const filename = req.params.filename;
    // Security: prevent path traversal
    if (filename.includes('..') || filename.includes('/')) {
        return res.status(400).json({ error: 'اسم ملف غير صالح' });
    }
    const filePath = path.join(__dirname, 'uploads', filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'الملف غير موجود' });
    }
    fs.unlink(filePath, err => {
        if (err) return res.status(500).json({ error: 'فشل حذف الملف' });
        res.json({ success: true });
    });
});

app.listen(PORT, () => console.log(`✅ YCOMD Server running on port ${PORT}`));
