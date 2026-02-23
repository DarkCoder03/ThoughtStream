require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcrypt');
const db = require('./db');
const supabase = require('./supabaseStorage');

const app = express();
const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 10;

// ==========================================
// HELPER FUNCTION - Format Date to IST
// ==========================================
function formatToIST(date) {
    if (!date) return '';
    const d = new Date(date);
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(d.getTime() + istOffset);
    
    const day = String(istDate.getUTCDate()).padStart(2, '0');
    const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
    const year = istDate.getUTCFullYear();
    
    let hours = istDate.getUTCHours();
    const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
    const seconds = String(istDate.getUTCSeconds()).padStart(2, '0');
    
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hoursStr = String(hours).padStart(2, '0');
    
    return `${day}/${month}/${year}, ${hoursStr}:${minutes}:${seconds} ${ampm}`;
}

// Make it available to all templates
app.locals.formatToIST = formatToIST;

// ==========================================
// SESSION SETUP
// ==========================================
app.use(session({
    secret: process.env.SESSION_SECRET || 'thoughtstream-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 24 * 60 * 60 * 1000 
    }
}));

// ==========================================
// MULTER SETUP FOR FILE UPLOADS
// ==========================================
const storage = multer.memoryStorage();

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
// AUTH MIDDLEWARE
// ==========================================
function isAuthenticated(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    return res.redirect('/login');
}

function isAdmin(req, res, next) {
    if (req.session && req.session.userId && req.session.isAdmin) {
        return next();
    }
    return res.redirect('/dashboard');
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
    if (req.session && req.session.userId) {
        return res.redirect('/dashboard');
    }
    res.render('login', { error: null, success: null });
});

app.post('/login', async (req, res) => {
    const email = req.body.email ? req.body.email.trim().toLowerCase() : '';
    const password = req.body.password ? req.body.password.trim() : '';

    try {
        const query = 'SELECT * FROM users WHERE LOWER(email) = $1';
        const result = await db.query(query, [email]);

        if (result.rows.length > 0) {
            const user = result.rows[0];
            
            let validPassword = false;
            if (user.password.startsWith('$2b$')) {
                validPassword = await bcrypt.compare(password, user.password);
            } else {
                validPassword = (password === user.password);
                if (validPassword) {
                    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
                    await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, user.id]);
                }
            }
            
            if (validPassword) {
                req.session.userId = user.id;
                req.session.userName = user.name;
                req.session.userEmail = user.email;
                req.session.profilePic = user.profile_pic;
                req.session.isAdmin = user.is_admin || false;
                
                return res.redirect('/dashboard');
            }
        }
        
        return res.render('login', { error: 'Invalid email or password.', success: null });
    } catch (err) {
        console.error('Database error:', err);
        return res.render('login', { error: 'Something went wrong. Please try again.', success: null });
    }
});

// ==========================================
// REGISTER
// ==========================================
app.get('/register', (req, res) => {
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

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        const insertQuery = 'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *';
        await db.query(insertQuery, [name, email, hashedPassword]);

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
// DASHBOARD
// ==========================================
app.get('/dashboard', isAuthenticated, async (req, res) => {
    const userId = req.session.userId;
    const userName = req.session.userName;
    const userEmail = req.session.userEmail;
    const isAdmin = req.session.isAdmin || false;

    try {
        const userQuery = 'SELECT * FROM users WHERE id = $1';
        const userResult = await db.query(userQuery, [userId]);
        
        if (userResult.rows.length === 0) {
            req.session.destroy();
            return res.redirect('/login');
        }
        
        const user = userResult.rows[0];
        const profilePic = user.profile_pic || null;
        
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
            thoughts: thoughts,
            isAdmin: isAdmin
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.render('dashboard', {
            userId: userId,
            name: userName,
            email: userEmail,
            profilePic: null,
            thoughts: [],
            isAdmin: isAdmin
        });
    }
});

// ==========================================
// SETTINGS PAGE
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

// ==========================================
// SETTINGS UPDATE
// ==========================================
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
            req.session.userName = newName;
        }

        let profilePic = null;
        
        if (req.file) {
            const fileName = `${userId}-${Date.now()}-${req.file.originalname}`;
            
            const { data, error } = await supabase.storage
                .from('profile-pics')
                .upload(fileName, req.file.buffer, {
                    contentType: req.file.mimetype,
                    upsert: true
                });

            if (error) {
                console.error('Supabase upload error:', error);
            } else {
                const { data: urlData } = supabase.storage
                    .from('profile-pics')
                    .getPublicUrl(fileName);
                
                profilePic = urlData.publicUrl;
                await db.query('UPDATE users SET profile_pic = $1 WHERE id = $2', [profilePic, userId]);
                req.session.profilePic = profilePic;
            }
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
// ADD THOUGHT
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
// LIKE THOUGHT
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
// REPLY TO THOUGHT
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
// DELETE THOUGHT
// ==========================================
app.post('/delete-thought', isAuthenticated, async (req, res) => {
    const thoughtId = parseInt(req.body.thoughtId);
    const thoughtUserEmail = req.body.thoughtUserEmail;
    const userEmail = req.session.userEmail;
    const isAdmin = req.session.isAdmin;

    if (thoughtUserEmail === userEmail || isAdmin) {
        try {
            await db.query('DELETE FROM replies WHERE thought_id = $1', [thoughtId]);
            await db.query('DELETE FROM thoughts WHERE id = $1', [thoughtId]);
        } catch (err) {
            console.error('Delete error:', err);
        }
    }

    const referer = req.get('Referer') || '/dashboard';
    res.redirect(referer);
});

// ==========================================
// DELETE REPLY
// ==========================================
app.post('/delete-reply', isAuthenticated, async (req, res) => {
    const replyId = parseInt(req.body.replyId);
    const replyUserEmail = req.body.replyUserEmail;
    const userEmail = req.session.userEmail;
    const isAdmin = req.session.isAdmin;

    if (replyUserEmail === userEmail || isAdmin) {
        try {
            await db.query('DELETE FROM replies WHERE id = $1', [replyId]);
        } catch (err) {
            console.error('Delete reply error:', err);
        }
    }

    const referer = req.get('Referer') || '/dashboard';
    res.redirect(referer);
});

// ==========================================
// ADMIN PANEL
// ==========================================
app.get('/admin', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const thoughtsResult = await db.query(`
            SELECT t.*, u.profile_pic 
            FROM thoughts t 
            LEFT JOIN users u ON t.user_email = u.email 
            ORDER BY t.created_at DESC
        `);

        const repliesResult = await db.query(`
            SELECT r.*, u.profile_pic, t.message as thought_message
            FROM replies r 
            LEFT JOIN users u ON r.user_email = u.email 
            LEFT JOIN thoughts t ON r.thought_id = t.id
            ORDER BY r.created_at DESC
        `);

        const usersResult = await db.query(`
            SELECT id, name, email, is_admin, created_at, profile_pic 
            FROM users 
            ORDER BY created_at DESC
        `);

        const thoughts = thoughtsResult.rows.map(t => ({
            id: t.id,
            userName: t.user_name,
            userEmail: t.user_email,
            message: t.message,
            timestamp: t.created_at,
            profilePic: t.profile_pic
        }));

        const replies = repliesResult.rows.map(r => ({
            id: r.id,
            thoughtId: r.thought_id,
            userName: r.user_name,
            userEmail: r.user_email,
            text: r.reply_text,
            timestamp: r.created_at,
            thoughtMessage: r.thought_message,
            profilePic: r.profile_pic
        }));

        const users = usersResult.rows;

        res.render('admin', {
            thoughts: thoughts,
            replies: replies,
            users: users,
            adminName: req.session.userName
        });

    } catch (err) {
        console.error('Admin panel error:', err);
        res.redirect('/dashboard');
    }
});

// ==========================================
// ADMIN - DELETE USER
// ==========================================
app.post('/admin/delete-user', isAuthenticated, isAdmin, async (req, res) => {
    const userId = parseInt(req.body.userId);
    const currentUserId = req.session.userId;

    if (userId === currentUserId) {
        return res.redirect('/admin');
    }

    try {
        const userResult = await db.query('SELECT email FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length > 0) {
            const userEmail = userResult.rows[0].email;
            
            await db.query('DELETE FROM replies WHERE user_email = $1', [userEmail]);
            await db.query(`
                DELETE FROM replies WHERE thought_id IN 
                (SELECT id FROM thoughts WHERE user_email = $1)
            `, [userEmail]);
            await db.query('DELETE FROM thoughts WHERE user_email = $1', [userEmail]);
            await db.query('DELETE FROM users WHERE id = $1', [userId]);
        }
    } catch (err) {
        console.error('Delete user error:', err);
    }

    res.redirect('/admin');
});

// ==========================================
// CHECK AUTH STATUS
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
    console.log(`Server is running on port ${PORT}`);
});