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

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Auth middleware using JWT
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

// ROUTES
app.get('/', (req, res) => {
    const token = req.cookies.authToken;
    try {
        if (token) jwt.verify(token, JWT_SECRET);
        else return res.redirect('/login.html');
        res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
    } catch {
        res.redirect('/login.html');
    }
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    console.log(`Login: user="${username}" pass="${password}"`);

    if (username === ADMIN_USER && password === ADMIN_PASS) {
        const token = jwt.sign({ user: username }, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('authToken', token, {
            httpOnly: true,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            sameSite: 'lax'
        });
        res.redirect('/');
    } else {
        res.send(`
            <html><body style="font-family:Cairo,sans-serif;text-align:center;padding:50px;direction:rtl;">
                <h2 style="color:red;">❌ بيانات الدخول خاطئة</h2>
                <p>اسم المستخدم الصحيح: <b>admin</b></p>
                <p>كلمة المرور الصحيحة: <b>admin123</b></p>
                <br><a href="/login.html" style="color:blue;">← حاول مرة أخرى</a>
            </body></html>
        `);
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('authToken');
    res.redirect('/login.html');
});

app.get('/nanostation.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'nanostation.html'));
});

app.get('/dashboard.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// File upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

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
                date: isNaN(ts) ? '-' : new Date(ts).toLocaleDateString('ar-EG')
            };
        });
        res.json(reports);
    });
});

app.listen(PORT, () => console.log(`Server on port ${PORT}`));
