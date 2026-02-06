const express = require('express');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const db = require('./db');

const app = express();
const PORT = 3000;

// ==========================================
// SESSION SETUP
// ==========================================
app.use(session({
    secret: 'thoughtstream-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// ==========================================
// MULTER SETUP FOR FILE UPLOADS
// ==========================================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});

// ==========================================
// MIDDLEWARE
// ==========================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// AUTH MIDDLEWARE - Check if user is logged in
// ==========================================
function isAuthenticated(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    return res.redirect('/login');
}

// ==========================================
// ROUTES
// ==========================================

app.get('/', (req, res) => {
    if (req.session && req.session.userId) {
        return res.redirect('/dashboard');
    }
    res.redirect('/login');
});

// ==========================================
// LOGIN
// ==========================================
app.get('/login', (req, res) => {
    // If already logged in, redirect to dashboard
    if (req.session && req.session.userId) {
        return res.redirect('/dashboard');
    }
    res.render('login', { error: null, success: null });
});

app.post('/login', async (req, res) => {
    const email = req.body.email ? req.body.email.trim().toLowerCase() : '';
    const password = req.body.password ? req.body.password.trim() : '';

    try {
        const query = 'SELECT * FROM users WHERE LOWER(email) = $1 AND password = $2';
        const result = await db.query(query, [email, password]);

        if (result.rows.length > 0) {
            const user = result.rows[0];
            
            // Store user data in session
            req.session.userId = user.id;
            req.session.userName = user.name;
            req.session.userEmail = user.email;
            req.session.profilePic = user.profile_pic;
            
            return res.redirect('/dashboard');
        } else {
            return res.render('login', { error: 'Invalid email or password.', success: null });
        }
    } catch (err) {
        console.error('Database error:', err);
        return res.render('login', { error: 'Something went wrong. Please try again.', success: null });
    }
});

// ==========================================
// REGISTER
// ==========================================
app.get('/register', (req, res) => {
    // If already logged in, redirect to dashboard
    if (req.session && req.session.userId) {
        return res.redirect('/dashboard');
    }
    res.render('register', { error: null });
});

app.post('/register', async (req, res) => {
    const name = req.body.name ? req.body.name.trim() : '';
    const email = req.body.email ? req.body.email.trim().toLowerCase() : '';
    const password = req.body.password ? req.body.password.trim() : '';
    const confirmPassword = req.body.confirmPassword ? req.body.confirmPassword.trim() : '';

    if (!name || !email || !password || !confirmPassword) {
        return res.render('register', { error: 'All fields are required.' });
    }

    if (password.length < 6) {
        return res.render('register', { error: 'Password must be at least 6 characters.' });
    }

    if (password !== confirmPassword) {
        return res.render('register', { error: 'Passwords do not match.' });
    }

    try {
        const checkQuery = 'SELECT * FROM users WHERE LOWER(email) = $1';
        const checkResult = await db.query(checkQuery, [email]);

        if (checkResult.rows.length > 0) {
            return res.render('register', { error: 'Email already registered. Please login.' });
        }

        const insertQuery = 'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *';
        await db.query(insertQuery, [name, email, password]);

        return res.render('login', { error: null, success: 'Account created successfully! Please login.' });

    } catch (err) {
        console.error('Database error:', err);
        return res.render('register', { error: 'Something went wrong. Please try again.' });
    }
});

// ==========================================
// LOGOUT
// ==========================================
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/login');
    });
});

// ==========================================
// DASHBOARD (Protected Route)
// ==========================================
app.get('/dashboard', isAuthenticated, async (req, res) => {
    const userId = req.session.userId;
    const userName = req.session.userName;
    const userEmail = req.session.userEmail;

    try {
        // Get latest user data from database
        const userQuery = 'SELECT * FROM users WHERE id = $1';
        const userResult = await db.query(userQuery, [userId]);
        
        if (userResult.rows.length === 0) {
            // User not found, destroy session
            req.session.destroy();
            return res.redirect('/login');
        }
        
        const user = userResult.rows[0];
        const profilePic = user.profile_pic || null;
        
        // Update session with latest data
        req.session.userName = user.name;
        req.session.profilePic = user.profile_pic;

        const thoughtsQuery = `
            SELECT t.*, u.profile_pic 
            FROM thoughts t 
            LEFT JOIN users u ON t.user_email = u.email 
            ORDER BY t.created_at DESC
        `;
        const thoughtsResult = await db.query(thoughtsQuery);

        const thoughts = [];
        
        for (const thought of thoughtsResult.rows) {
            const repliesQuery = `
                SELECT r.*, u.profile_pic 
                FROM replies r 
                LEFT JOIN users u ON r.user_email = u.email 
                WHERE r.thought_id = $1 
                ORDER BY r.created_at ASC
            `;
            const repliesResult = await db.query(repliesQuery, [thought.id]);
            
            const formattedReplies = repliesResult.rows.map(reply => ({
                id: reply.id,
                userName: reply.user_name || 'Unknown',
                userEmail: reply.user_email || '',
                text: reply.reply_text || '',
                timestamp: reply.created_at,
                profilePic: reply.profile_pic || null
            }));

            thoughts.push({
                id: thought.id,
                userName: thought.user_name || 'Unknown',
                userEmail: thought.user_email || '',
                message: thought.message || '',
                timestamp: thought.created_at,
                likedBy: thought.liked_by || [],
                profilePic: thought.profile_pic || null,
                replies: formattedReplies
            });
        }

        res.render('dashboard', {
            userId: userId,
            name: user.name,
            email: userEmail,
            profilePic: profilePic,
            thoughts: thoughts
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.render('dashboard', {
            userId: userId,
            name: userName,
            email: userEmail,
            profilePic: null,
            thoughts: []
        });
    }
});

// ==========================================
// SETTINGS PAGE (Protected Route)
// ==========================================
app.get('/settings', isAuthenticated, async (req, res) => {
    const userId = req.session.userId;
    const userName = req.session.userName;
    const userEmail = req.session.userEmail;

    try {
        const userQuery = 'SELECT * FROM users WHERE id = $1';
        const userResult = await db.query(userQuery, [userId]);
        
        if (userResult.rows.length === 0) {
            req.session.destroy();
            return res.redirect('/login');
        }
        
        const user = userResult.rows[0];

        res.render('settings', {
            userId: userId,
            name: user.name,
            email: userEmail,
            profilePic: user.profile_pic || null,
            success: null,
            error: null
        });
    } catch (err) {
        console.error('Settings error:', err);
        res.render('settings', {
            userId: userId,
            name: userName,
            email: userEmail,
            profilePic: null,
            success: null,
            error: null
        });
    }
});

app.post('/settings/update', isAuthenticated, upload.single('profilePic'), async (req, res) => {
    const userId = req.session.userId;
    const userEmail = req.session.userEmail;
    const currentName = req.body.currentName || '';
    const newName = req.body.newName ? req.body.newName.trim() : currentName;

    try {
        if (newName !== currentName) {
            await db.query('UPDATE users SET name = $1 WHERE id = $2', [newName, userId]);
            await db.query('UPDATE thoughts SET user_name = $1 WHERE user_email = $2', [newName, userEmail]);
            await db.query('UPDATE replies SET user_name = $1 WHERE user_email = $2', [newName, userEmail]);
            
            // Update session
            req.session.userName = newName;
        }

        let profilePic = null;
        if (req.file) {
            profilePic = req.file.filename;
            await db.query('UPDATE users SET profile_pic = $1 WHERE id = $2', [profilePic, userId]);
            
            // Update session
            req.session.profilePic = profilePic;
        } else {
            const result = await db.query('SELECT profile_pic FROM users WHERE id = $1', [userId]);
            profilePic = result.rows[0]?.profile_pic || null;
        }

        res.render('settings', {
            userId: userId,
            name: newName,
            email: userEmail,
            profilePic: profilePic,
            success: 'Profile updated successfully!',
            error: null
        });

    } catch (err) {
        console.error('Error updating profile:', err);
        res.render('settings', {
            userId: userId,
            name: currentName,
            email: userEmail,
            profilePic: null,
            success: null,
            error: 'Failed to update profile. Please try again.'
        });
    }
});

// ==========================================
// ADD THOUGHT (Protected Route)
// ==========================================
app.post('/add-thought', isAuthenticated, async (req, res) => {
    const thought = req.body.thought ? req.body.thought.trim() : '';
    const userId = req.session.userId;
    const userName = req.session.userName;
    const userEmail = req.session.userEmail;

    if (thought !== '') {
        try {
            const query = `
                INSERT INTO thoughts (user_id, user_name, user_email, message, liked_by) 
                VALUES ($1, $2, $3, $4, $5)
            `;
            await db.query(query, [userId, userName, userEmail, thought, []]);
        } catch (err) {
            console.error('Add thought error:', err);
        }
    }

    res.redirect('/dashboard');
});

// ==========================================
// LIKE THOUGHT (Protected Route)
// ==========================================
app.post('/like-thought', isAuthenticated, async (req, res) => {
    const thoughtId = parseInt(req.body.thoughtId);
    const userEmail = req.session.userEmail;

    try {
        const result = await db.query('SELECT liked_by FROM thoughts WHERE id = $1', [thoughtId]);
        
        if (result.rows.length > 0) {
            let likedBy = result.rows[0].liked_by || [];
            
            const likeIndex = likedBy.indexOf(userEmail);
            
            if (likeIndex > -1) {
                likedBy.splice(likeIndex, 1);
            } else {
                likedBy.push(userEmail);
            }
            
            await db.query('UPDATE thoughts SET liked_by = $1 WHERE id = $2', [likedBy, thoughtId]);
        }
    } catch (err) {
        console.error('Like error:', err);
    }

    res.redirect('/dashboard');
});

// ==========================================
// REPLY TO THOUGHT (Protected Route)
// ==========================================
app.post('/reply/:thoughtId', isAuthenticated, async (req, res) => {
    const thoughtId = parseInt(req.params.thoughtId);
    const replyText = req.body.replyText ? req.body.replyText.trim() : '';
    const userName = req.session.userName;
    const userEmail = req.session.userEmail;

    if (replyText !== '') {
        try {
            const query = `
                INSERT INTO replies (thought_id, user_name, user_email, reply_text) 
                VALUES ($1, $2, $3, $4)
            `;
            await db.query(query, [thoughtId, userName, userEmail, replyText]);
        } catch (err) {
            console.error('Reply error:', err);
        }
    }

    res.redirect('/dashboard');
});

// ==========================================
// DELETE THOUGHT (Protected Route)
// ==========================================
app.post('/delete-thought', isAuthenticated, async (req, res) => {
    const thoughtId = parseInt(req.body.thoughtId);
    const thoughtUserEmail = req.body.thoughtUserEmail;
    const userEmail = req.session.userEmail;

    if (thoughtUserEmail === userEmail) {
        try {
            await db.query('DELETE FROM replies WHERE thought_id = $1', [thoughtId]);
            await db.query('DELETE FROM thoughts WHERE id = $1', [thoughtId]);
        } catch (err) {
            console.error('Delete error:', err);
        }
    }

    res.redirect('/dashboard');
});

// ==========================================
// CHECK AUTH STATUS (API for tabs sync)
// ==========================================
app.get('/api/auth-status', (req, res) => {
    res.json({
        isLoggedIn: !!(req.session && req.session.userId),
        userId: req.session?.userId || null
    });
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
    console.log('Server is running on http://localhost:' + PORT);
});