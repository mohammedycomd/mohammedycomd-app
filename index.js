const express = require('express');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Professional Session Config
app.set('trust proxy', 1); // Important for Render/Heroku
app.use(session({
    secret: 'mohammed-exclusive-research-secret',
    resave: true,
    saveUninitialized: true,
    cookie: { secure: false } // Set to false for now to ensure it works
}));

// UPDATED CREDENTIALS FOR TESTING
const ADMIN_USER = "admin";
const ADMIN_PASS = "123456";

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.isLoggedIn) {
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
    console.log(`Login attempt: ${username}`); // For debugging in Render logs
    
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        req.session.isLoggedIn = true;
        req.session.save(() => {
            res.redirect('/');
        });
    } else {
        res.status(401).send('بيانات الدخول خاطئة. يرجى التأكد من كتابة "admin" و "123456" بشكل صحيح. <a href="/login.html">عودة</a>');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

app.get('/nanostation.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'nanostation.html'));
});

app.post('/upload-report', isAuthenticated, upload.single('report'), (req, res) => {
    res.redirect('/?uploaded=true');
});

app.get('/api/reports', isAuthenticated, (req, res) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    
    fs.readdir(dir, (err, files) => {
        if (err) return res.status(500).json([]);
        const reports = files.map(file => ({
            name: file.split('-').slice(1).join('-'),
            url: `/uploads/${file}`,
            date: new Date(parseInt(file.split('-')[0])).toLocaleDateString('ar-EG')
        }));
        res.json(reports);
    });
});

app.listen(PORT, () => {
    console.log(`Professional Server active on port ${PORT}`);
});
