const express = require('express');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(session({
    secret: 'mohammedycomd-secret-key',
    resave: false,
    saveUninitialized: true
}));

// Mock Database (You can change these credentials)
const ADMIN_USER = "admin";
const ADMIN_PASS = "mohammed2026";

// Multer Storage Configuration for Platts Reports
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Authentication Middleware
const isAuthenticated = (req, res, next) => {
    if (req.session.isLoggedIn) {
        return next();
    }
    res.redirect('/login.html');
};

// Routes
app.get('/', (req, res) => {
    if (req.session.isLoggedIn) {
        res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
    } else {
        res.redirect('/login.html');
    }
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        req.session.isLoggedIn = true;
        res.redirect('/');
    } else {
        res.send('اسم المستخدم أو كلمة المرور غير صحيحة. <a href="/login.html">حاول مرة أخرى</a>');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

// Protected File Routes
app.get('/nanostation.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'nanostation.html'));
});

// Platts Reports API
app.post('/upload-report', isAuthenticated, upload.single('report'), (req, res) => {
    res.redirect('/?uploaded=true');
});

app.get('/api/reports', isAuthenticated, (req, res) => {
    const directoryPath = path.join(__dirname, 'uploads');
    fs.readdir(directoryPath, (err, files) => {
        if (err) return res.status(500).send('Unable to scan files');
        const reports = files.map(file => ({
            name: file.split('-').slice(1).join('-'),
            url: `/uploads/${file}`,
            date: new Date(parseInt(file.split('-')[0])).toLocaleDateString('ar-EG')
        }));
        res.json(reports);
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
