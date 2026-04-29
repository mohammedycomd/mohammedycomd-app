const express      = require('express');
const path         = require('path');
const multer       = require('multer');
const fs           = require('fs');
const jwt          = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const mongoose     = require('mongoose');
const { GridFSBucket, ObjectId } = require('mongodb');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CONFIG ────────────────────────────────────────────────
const ADMIN_USER  = process.env.ADMIN_USER  || "admin";
const ADMIN_PASS  = process.env.ADMIN_PASS  || "admin123";
const JWT_SECRET  = process.env.JWT_SECRET  || "mohammedycomd-jwt-2026-secure";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://anasdwihan_db_user:379229mohd@cluster0.i5d2ov8.mongodb.net/ycomd?retryWrites=true&w=majority&appName=Cluster0";

// ── MONGODB SETUP ─────────────────────────────────────────
let gfsBucket   = null;
let useGridFS   = false;

if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
        .then(() => {
            gfsBucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
            useGridFS = true;
            console.log('✅ MongoDB connected – GridFS enabled (persistent storage)');
        })
        .catch(err => {
            console.error('❌ MongoDB connection failed:', err.message);
            console.log('⚠️  Falling back to local filesystem (files may not persist on Render)');
        });
} else {
    console.log('ℹ️  MONGODB_URI not set – using local filesystem');
}

// File metadata schema (for listing files stored in GridFS)
const FileSchema = new mongoose.Schema({
    originalName : { type: String, required: true },
    gridfsId     : mongoose.Schema.Types.ObjectId,
    size         : Number,
    mimetype     : String,
    uploadDate   : { type: Date, default: Date.now }
});
const FileRecord = mongoose.models.FileRecord || mongoose.model('FileRecord', FileSchema);

// ── MULTER (memory storage → we stream manually to GridFS) ─
const upload = multer({
    storage: multer.memoryStorage(),
    limits : { fileSize: 100 * 1024 * 1024 }  // 100 MB
});

// Local disk fallback storage
const localStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const uploadLocal = multer({ storage: localStorage, limits: { fileSize: 100 * 1024 * 1024 } });

// ── MIDDLEWARE ────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use('/style.css', express.static(path.join(__dirname, 'public', 'style.css')));
app.use('/script.js', express.static(path.join(__dirname, 'public', 'script.js')));

// Local uploads served only when not using GridFS
app.use('/uploads', (req, res, next) => {
    if (!useGridFS) return express.static(path.join(__dirname, 'uploads'))(req, res, next);
    next();
});

// ── AUTH MIDDLEWARE ───────────────────────────────────────
const isAuthenticated = (req, res, next) => {
    const token = req.cookies.authToken;
    if (!token) return res.redirect('/login.html');
    try {
        jwt.verify(token, JWT_SECRET);
        return next();
    } catch { return res.redirect('/login.html'); }
};

// ── PUBLIC ROUTES ─────────────────────────────────────────

// Root → PRIVATE: always redirect to login unless authenticated
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login.html', (req, res) => {
    const token = req.cookies.authToken;
    if (token) {
        try { jwt.verify(token, JWT_SECRET); return res.redirect('/dashboard.html'); } catch {}
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
    const { username, admin_pass } = req.body;
    const password = admin_pass || req.body.password;
    console.log(`Login attempt: user="${username}"`);
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        const token    = jwt.sign({ user: username }, JWT_SECRET, { expiresIn: '7d' });
        const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
        res.cookie('authToken', token, {
            httpOnly: true,
            maxAge  : 7 * 24 * 60 * 60 * 1000,
            sameSite: 'lax',
            secure  : isSecure
        });
        return res.redirect('/dashboard.html');
    }
    return res.send(`<html><head><meta charset="UTF-8"></head>
        <body style="font-family:Cairo,sans-serif;text-align:center;padding:50px;direction:rtl;background:#0f172a;color:#fff;">
        <h2 style="color:#ef4444;">❌ بيانات الدخول خاطئة</h2>
        <br><a href="/login.html" style="color:#c5a059;">← حاول مرة أخرى</a>
        </body></html>`);
});

app.get('/logout', (req, res) => {
    res.clearCookie('authToken');
    res.redirect('/');
});

// ── PROTECTED ROUTES ──────────────────────────────────────
app.get('/dashboard.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ── SERVE FILE FROM GRIDFS ────────────────────────────────
app.get('/file/:id', isAuthenticated, async (req, res) => {
    if (!useGridFS) return res.status(503).json({ error: 'GridFS not available' });
    try {
        const fileId   = new ObjectId(req.params.id);
        const files    = await gfsBucket.find({ _id: fileId }).toArray();
        if (!files.length) return res.status(404).json({ error: 'File not found' });

        const fileDoc = files[0];
        res.set('Content-Type', fileDoc.contentType || 'application/octet-stream');
        res.set('Content-Disposition', `inline; filename="${encodeURIComponent(fileDoc.filename)}"`);
        gfsBucket.openDownloadStream(fileId).pipe(res);
    } catch (err) {
        console.error('File serve error:', err);
        res.status(500).json({ error: 'Failed to serve file' });
    }
});

// ── MULTI-FILE UPLOAD ─────────────────────────────────────
app.post('/upload-report', isAuthenticated, (req, res) => {
    if (useGridFS) {
        // GridFS path: stream files into MongoDB
        upload.array('reports', 100)(req, res, async (err) => {
            if (err) return res.status(400).json({ error: err.message });
            if (!req.files || req.files.length === 0)
                return res.status(400).json({ error: 'لم يتم اختيار أي ملفات' });

            const results = [];
            for (const file of req.files) {
                try {
                    const gridfsId = await new Promise((resolve, reject) => {
                        const uploadStream = gfsBucket.openUploadStream(file.originalname, {
                            contentType: file.mimetype,
                            metadata   : { uploadedBy: 'admin' }
                        });
                        uploadStream.end(file.buffer);
                        uploadStream.on('finish', () => resolve(uploadStream.id));
                        uploadStream.on('error', reject);
                    });

                    const record = await FileRecord.create({
                        originalName: file.originalname,
                        gridfsId,
                        size    : file.size,
                        mimetype: file.mimetype
                    });
                    results.push({
                        name    : file.originalname,
                        id      : record._id,
                        gridfsId: gridfsId.toString(),
                        url     : `/file/${gridfsId}`,
                        size    : file.size,
                        date    : new Date().toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' })
                    });
                } catch (e) {
                    console.error('GridFS upload error:', e);
                }
            }

            if (req.headers['x-requested-with'] === 'XMLHttpRequest' || (req.headers.accept || '').includes('application/json')) {
                return res.json({ success: true, count: results.length, files: results });
            }
            res.redirect('/dashboard.html');
        });
    } else {
        // Local filesystem fallback
        uploadLocal.array('reports', 100)(req, res, (err) => {
            if (err) return res.status(400).json({ error: err.message });
            if (!req.files || req.files.length === 0)
                return res.status(400).json({ error: 'لم يتم اختيار أي ملفات' });

            const results = req.files.map(f => ({
                name : f.originalname,
                url  : `/uploads/${f.filename}`,
                size : f.size,
                date : new Date().toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' })
            }));

            if (req.headers['x-requested-with'] === 'XMLHttpRequest' || (req.headers.accept || '').includes('application/json')) {
                return res.json({ success: true, count: results.length, files: results });
            }
            res.redirect('/dashboard.html');
        });
    }
});

// ── LIST REPORTS ──────────────────────────────────────────
app.get('/api/reports', isAuthenticated, async (req, res) => {
    if (useGridFS) {
        try {
            const records = await FileRecord.find({}).sort({ uploadDate: -1 }).lean();
            const reports = records.map(r => ({
                id          : r._id.toString(),
                gridfsId    : r.gridfsId ? r.gridfsId.toString() : null,
                name        : r.originalName,
                url         : r.gridfsId ? `/file/${r.gridfsId}` : '#',
                downloadUrl : r.gridfsId ? `/file/${r.gridfsId}` : '#',
                size        : r.size,
                date        : new Date(r.uploadDate).toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' })
            }));
            return res.json(reports);
        } catch (err) {
            console.error('Reports fetch error:', err);
            return res.status(500).json([]);
        }
    }

    // Local filesystem fallback
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) return res.json([]);
    fs.readdir(dir, (err, files) => {
        if (err) return res.json([]);
        const reports = files.filter(f => !f.startsWith('.')).map(file => {
            const ts  = parseInt(file.split('-')[0]);
            const stat = fs.statSync(path.join(dir, file));
            return {
                name: file.split('-').slice(1).join('-'),
                url : `/uploads/${file}`,
                size: stat.size,
                date: isNaN(ts) ? '-' : new Date(ts).toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' })
            };
        }).sort((a,b) => b.date.localeCompare(a.date));
        res.json(reports);
    });
});

// ── DELETE REPORT ─────────────────────────────────────────
app.delete('/api/reports/:id', isAuthenticated, async (req, res) => {
    if (useGridFS) {
        try {
            const record = await FileRecord.findById(req.params.id);
            if (!record) return res.status(404).json({ error: 'السجل غير موجود' });
            // Delete from GridFS
            if (record.gridfsId) {
                await gfsBucket.delete(new ObjectId(record.gridfsId)).catch(() => {});
            }
            await FileRecord.deleteOne({ _id: record._id });
            return res.json({ success: true });
        } catch (err) {
            console.error('Delete error:', err);
            return res.status(500).json({ error: 'فشل الحذف' });
        }
    }
    // Local fallback
    const { id } = req.params;
    if (id.includes('..') || id.includes('/')) return res.status(400).json({ error: 'اسم غير صالح' });
    const filePath = path.join(__dirname, 'uploads', id);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'الملف غير موجود' });
    fs.unlink(filePath, err => {
        if (err) return res.status(500).json({ error: 'فشل الحذف' });
        res.json({ success: true });
    });
});

app.listen(PORT, () => console.log(`✅ YCOMD Server running on port ${PORT}`));
