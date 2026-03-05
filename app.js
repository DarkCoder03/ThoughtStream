require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcrypt');
const db = require('./db');
const supabase = require('./supabaseAuth');
const supabaseStorage = require('./supabaseStorage');

const app = express();
const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 10;

// ==========================================
// HELPER - Format Date to IST
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
    hours = hours % 12 || 12;
    return `${day}/${month}/${year}, ${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
}
app.locals.formatToIST = formatToIST;

// ==========================================
// SESSION SETUP
// ==========================================
app.use(session({
    secret: process.env.SESSION_SECRET || 'thoughtstream-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// ==========================================
// MULTER SETUP
// ==========================================
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed!'), false);
};
const uploadProfile = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadThought = multer({ storage, fileFilter, limits: { fileSize: 4 * 1024 * 1024 } });

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
    if (req.session && req.session.userId) return next();
    return res.redirect('/login');
}

function isAdmin(req, res, next) {
    if (req.session && req.session.userId && req.session.isAdmin) return next();
    return res.redirect('/dashboard');
}

// ==========================================
// ROUTES
// ==========================================
app.get('/', (req, res) => {
    if (req.session && req.session.userId) return res.redirect('/dashboard');
    res.redirect('/login');
});

// ==========================================
// REGISTER
// ==========================================
app.get('/register', (req, res) => {
    if (req.session && req.session.userId) return res.redirect('/dashboard');
    res.render('register', { error: null, success: null });
});

app.post('/register', async (req, res) => {
    const name = req.body.name ? req.body.name.trim() : '';
    const email = req.body.email ? req.body.email.trim().toLowerCase() : '';
    const password = req.body.password ? req.body.password.trim() : '';
    const confirmPassword = req.body.confirmPassword ? req.body.confirmPassword.trim() : '';

    // Validation
    if (!name || !email || !password || !confirmPassword) {
        return res.render('register', { error: 'All fields are required.', success: null });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.render('register', { error: 'Please enter a valid email.', success: null });
    }

    // Allowed domains
    const allowedDomains = ['gmail.com', 'outlook.com', 'hotmail.com', 'live.com'];
    const emailDomain = email.split('@')[1];
    if (!allowedDomains.includes(emailDomain)) {
        return res.render('register', { error: 'Only Gmail and Outlook emails allowed.', success: null });
    }

    if (password.length < 6) {
        return res.render('register', { error: 'Password must be at least 6 characters.', success: null });
    }

    if (password !== confirmPassword) {
        return res.render('register', { error: 'Passwords do not match.', success: null });
    }

    try {
        // 🚫 CHECK IF USER IS BANNED
        const bannedCheck = await db.query('SELECT * FROM banned_users WHERE LOWER(email) = $1', [email]);
        if (bannedCheck.rows.length > 0) {
            console.log('🚫 Banned user tried to register:', email);
            return res.render('register', { 
                error: 'This email has been permanently banned from ThoughtStream.', 
                success: null 
            });
        }

        // Check if email already exists
        const checkResult = await db.query('SELECT * FROM users WHERE LOWER(email) = $1', [email]);
        if (checkResult.rows.length > 0) {
            return res.render('register', { error: 'Email already registered. Please login.', success: null });
        }

        const siteUrl = process.env.SITE_URL || 'https://thoughtstream-xgn8.onrender.com';

        // Register with Supabase Auth
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: { name: name },
                emailRedirectTo: `${siteUrl}/verify-success`
            }
        });

        if (error) {
            console.error('Supabase signup error:', error);
            return res.render('register', { error: error.message, success: null });
        }

        // Save to our users table
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        await db.query(
            'INSERT INTO users (name, email, password, is_verified) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING',
            [name, email, hashedPassword, false]
        );

        console.log('✅ User registered:', email);

        return res.render('register', { 
            error: null, 
            success: 'Registration successful! Please check your email to verify your account.' 
        });

    } catch (err) {
        console.error('Register error:', err);
        return res.render('register', { error: 'Something went wrong. Please try again.', success: null });
    }
});

// ==========================================
// VERIFY SUCCESS PAGE
// ==========================================
app.get('/verify-success', async (req, res) => {
    const token_hash = req.query.token_hash;
    const type = req.query.type;
    const access_token = req.query.access_token;
    const error = req.query.error;
    const error_description = req.query.error_description;

    if (error) {
        console.error('Verification error:', error, error_description);
        return res.render('verify-error', { 
            error: error_description || 'Verification failed. The link may have expired.' 
        });
    }

    if (token_hash && type) {
        try {
            const { data, error: verifyError } = await supabase.auth.verifyOtp({
                token_hash,
                type: type
            });
            
            if (!verifyError && data?.user?.email) {
                await db.query('UPDATE users SET is_verified = true WHERE LOWER(email) = $1', [data.user.email.toLowerCase()]);
                console.log('✅ User verified:', data.user.email);
            }
        } catch (err) {
            console.error('Verify error:', err);
        }
    }

    if (access_token) {
        try {
            const { data: { user } } = await supabase.auth.getUser(access_token);
            if (user?.email) {
                await db.query('UPDATE users SET is_verified = true WHERE LOWER(email) = $1', [user.email.toLowerCase()]);
                console.log('✅ User verified via access_token:', user.email);
            }
        } catch (err) {
            console.error('Access token error:', err);
        }
    }

    res.render('verify-success');
});

// ==========================================
// LOGIN
// ==========================================
app.get('/login', (req, res) => {
    if (req.session && req.session.userId) return res.redirect('/dashboard');
    res.render('login', { error: null, success: req.query.verified ? 'Email verified! You can now login.' : null });
});

app.post('/login', async (req, res) => {
    const email = req.body.email ? req.body.email.trim().toLowerCase() : '';
    const password = req.body.password ? req.body.password.trim() : '';

    try {
        // 🚫 CHECK IF USER IS BANNED FIRST
        const bannedCheck = await db.query('SELECT * FROM banned_users WHERE LOWER(email) = $1', [email]);
        if (bannedCheck.rows.length > 0) {
            console.log('🚫 Banned user tried to login:', email);
            return res.render('login', { 
                error: 'This account has been permanently banned from ThoughtStream.', 
                success: null 
            });
        }

        // Verify with Supabase
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (authError) {
            if (authError.message.includes('Email not confirmed')) {
                return res.render('login', { 
                    error: 'Please verify your email first. Check your inbox.', 
                    success: null 
                });
            }
            return res.render('login', { error: 'Invalid email or password.', success: null });
        }

        if (!authData.user?.email_confirmed_at) {
            return res.render('login', { 
                error: 'Please verify your email first. Check your inbox.', 
                success: null 
            });
        }

        // Get user from our database
        const result = await db.query('SELECT * FROM users WHERE LOWER(email) = $1', [email]);
        
        if (result.rows.length === 0) {
            const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
            const insertResult = await db.query(
                'INSERT INTO users (name, email, password, is_verified) VALUES ($1, $2, $3, true) RETURNING *',
                [authData.user.user_metadata?.name || email.split('@')[0], email, hashedPassword]
            );
            const user = insertResult.rows[0];
            
            req.session.userId = user.id;
            req.session.userName = user.name;
            req.session.userEmail = user.email;
            req.session.profilePic = user.profile_pic;
            req.session.isAdmin = user.is_admin || false;
            
            return res.redirect('/dashboard');
        }

        const user = result.rows[0];

        if (!user.is_verified) {
            await db.query('UPDATE users SET is_verified = true WHERE id = $1', [user.id]);
        }

        req.session.userId = user.id;
        req.session.userName = user.name;
        req.session.userEmail = user.email;
        req.session.profilePic = user.profile_pic;
        req.session.isAdmin = user.is_admin || false;
        
        return res.redirect('/dashboard');

    } catch (err) {
        console.error('Login error:', err);
        return res.render('login', { error: 'Something went wrong.', success: null });
    }
});

// ==========================================
// RESEND VERIFICATION EMAIL
// ==========================================
app.post('/resend-verification', async (req, res) => {
    const email = req.body.email ? req.body.email.trim().toLowerCase() : '';
    
    if (!email) {
        return res.json({ success: false, error: 'Email required' });
    }

    try {
        const { error } = await supabase.auth.resend({
            type: 'signup',
            email: email,
            options: {
                emailRedirectTo: `${process.env.SITE_URL || 'https://thoughtstream-xgn8.onrender.com'}/verify-success`
            }
        });

        if (error) {
            return res.json({ success: false, error: error.message });
        }

        return res.json({ success: true, message: 'Verification email sent!' });
    } catch (err) {
        return res.json({ success: false, error: 'Failed to send email' });
    }
});

// ==========================================
// LOGOUT
// ==========================================
app.get('/logout', async (req, res) => {
    try {
        await supabase.auth.signOut();
    } catch (e) {
        console.log('Supabase signout:', e.message);
    }
    req.session.destroy((err) => {
        if (err) console.error('Logout error:', err);
        res.redirect('/login');
    });
});

// ==========================================
// DASHBOARD
// ==========================================
app.get('/dashboard', isAuthenticated, async (req, res) => {
    const userId = req.session.userId;
    const userEmail = req.session.userEmail;
    const isAdmin = req.session.isAdmin || false;

    try {
        const userResult = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length === 0) {
            req.session.destroy();
            return res.redirect('/login');
        }
        
        const user = userResult.rows[0];
        req.session.userName = user.name;
        req.session.profilePic = user.profile_pic;

        const thoughtsResult = await db.query(`
            SELECT t.*, u.profile_pic 
            FROM thoughts t 
            LEFT JOIN users u ON t.user_email = u.email 
            ORDER BY t.created_at DESC
        `);

        const thoughts = [];
        for (const thought of thoughtsResult.rows) {
            const repliesResult = await db.query(`
                SELECT r.*, u.profile_pic 
                FROM replies r 
                LEFT JOIN users u ON r.user_email = u.email 
                WHERE r.thought_id = $1 
                ORDER BY r.created_at ASC
            `, [thought.id]);
            
            thoughts.push({
                id: thought.id,
                userName: thought.user_name || 'Unknown',
                userEmail: thought.user_email || '',
                message: thought.message || '',
                image: thought.image_url || null,
                timestamp: thought.created_at,
                likedBy: thought.liked_by || [],
                profilePic: thought.profile_pic || null,
                replies: repliesResult.rows.map(r => ({
                    id: r.id,
                    userName: r.user_name || 'Unknown',
                    userEmail: r.user_email || '',
                    text: r.reply_text || '',
                    timestamp: r.created_at,
                    profilePic: r.profile_pic || null
                }))
            });
        }

        res.render('dashboard', {
            userId, name: user.name, email: userEmail,
            profilePic: user.profile_pic || null,
            thoughts, isAdmin,
            siteUrl: process.env.SITE_URL || 'https://thoughtstream-xgn8.onrender.com'
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.redirect('/login');
    }
});

// ==========================================
// SETTINGS
// ==========================================
app.get('/settings', isAuthenticated, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
        if (result.rows.length === 0) { req.session.destroy(); return res.redirect('/login'); }
        const user = result.rows[0];
        res.render('settings', {
            userId: req.session.userId, name: user.name, email: req.session.userEmail,
            profilePic: user.profile_pic || null,
            success: null, error: null, passwordSuccess: null, passwordError: null
        });
    } catch (err) {
        res.redirect('/dashboard');
    }
});

app.post('/settings/update', isAuthenticated, uploadProfile.single('profilePic'), async (req, res) => {
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
            const fileName = `profile-${userId}-${Date.now()}-${req.file.originalname}`;
            const { error } = await supabaseStorage.storage.from('profile-pics').upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
            if (!error) {
                const { data: urlData } = supabaseStorage.storage.from('profile-pics').getPublicUrl(fileName);
                profilePic = urlData.publicUrl;
                await db.query('UPDATE users SET profile_pic = $1 WHERE id = $2', [profilePic, userId]);
                req.session.profilePic = profilePic;
            }
        } else {
            const result = await db.query('SELECT profile_pic FROM users WHERE id = $1', [userId]);
            profilePic = result.rows[0]?.profile_pic || null;
        }

        res.render('settings', { userId, name: newName, email: userEmail, profilePic, success: 'Profile updated!', error: null, passwordSuccess: null, passwordError: null });
    } catch (err) {
        res.render('settings', { userId, name: currentName, email: userEmail, profilePic: null, success: null, error: 'Update failed.', passwordSuccess: null, passwordError: null });
    }
});

app.post('/settings/change-password', isAuthenticated, async (req, res) => {
    const userId = req.session.userId;
    const userEmail = req.session.userEmail;
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    try {
        const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (result.rows.length === 0) { req.session.destroy(); return res.redirect('/login'); }
        const user = result.rows[0];

        const { error: authError } = await supabase.auth.signInWithPassword({
            email: userEmail,
            password: currentPassword
        });

        if (authError) {
            return res.render('settings', { userId, name: user.name, email: userEmail, profilePic: user.profile_pic, success: null, error: null, passwordSuccess: null, passwordError: 'Current password is incorrect.' });
        }

        if (newPassword.length < 6) {
            return res.render('settings', { userId, name: user.name, email: userEmail, profilePic: user.profile_pic, success: null, error: null, passwordSuccess: null, passwordError: 'Password must be at least 6 characters.' });
        }

        if (newPassword !== confirmNewPassword) {
            return res.render('settings', { userId, name: user.name, email: userEmail, profilePic: user.profile_pic, success: null, error: null, passwordSuccess: null, passwordError: 'Passwords do not match.' });
        }

        const { error: updateError } = await supabase.auth.updateUser({
            password: newPassword
        });

        if (updateError) {
            return res.render('settings', { userId, name: user.name, email: userEmail, profilePic: user.profile_pic, success: null, error: null, passwordSuccess: null, passwordError: updateError.message });
        }

        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);

        res.render('settings', { userId, name: user.name, email: userEmail, profilePic: user.profile_pic, success: null, error: null, passwordSuccess: 'Password changed!', passwordError: null });
    } catch (err) {
        res.redirect('/settings');
    }
});

// ==========================================
// SINGLE THOUGHT PAGE
// ==========================================
app.get('/thought/:id', async (req, res) => {
    try {
        const result = await db.query(`SELECT t.*, u.profile_pic FROM thoughts t LEFT JOIN users u ON t.user_email = u.email WHERE t.id = $1`, [parseInt(req.params.id)]);
        if (result.rows.length === 0) return res.redirect('/login');
        const t = result.rows[0];
        res.render('single-thought', {
            thought: { id: t.id, userName: t.user_name, message: t.message, image: t.image_url, timestamp: t.created_at, likeCount: t.liked_by ? t.liked_by.length : 0, profilePic: t.profile_pic },
            siteUrl: process.env.SITE_URL || 'https://thoughtstream-xgn8.onrender.com'
        });
    } catch (err) { res.redirect('/login'); }
});

// ==========================================
// ADMIN PANEL
// ==========================================
app.get('/admin', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const thoughts = (await db.query(`
            SELECT t.*, u.profile_pic 
            FROM thoughts t 
            LEFT JOIN users u ON t.user_email = u.email 
            ORDER BY t.created_at DESC
        `)).rows.map(t => ({ 
            id: t.id, 
            userName: t.user_name, 
            userEmail: t.user_email, 
            message: t.message, 
            image: t.image_url, 
            timestamp: t.created_at, 
            profilePic: t.profile_pic 
        }));
        
        const replies = (await db.query(`
            SELECT r.*, u.profile_pic, t.message as thought_message 
            FROM replies r 
            LEFT JOIN users u ON r.user_email = u.email 
            LEFT JOIN thoughts t ON r.thought_id = t.id 
            ORDER BY r.created_at DESC
        `)).rows.map(r => ({ 
            id: r.id, 
            thoughtId: r.thought_id, 
            userName: r.user_name, 
            userEmail: r.user_email, 
            text: r.reply_text, 
            timestamp: r.created_at, 
            thoughtMessage: r.thought_message, 
            profilePic: r.profile_pic 
        }));
        
        const users = (await db.query(`
            SELECT id, name, email, is_admin, is_verified, created_at, profile_pic 
            FROM users 
            ORDER BY created_at DESC
        `)).rows;
        
        // Get banned users
        let bannedUsers = [];
        try {
            const bannedResult = await db.query('SELECT * FROM banned_users ORDER BY banned_at DESC');
            bannedUsers = bannedResult.rows;
            console.log('📋 Banned users count:', bannedUsers.length);
        } catch (e) {
            console.log('Banned users table may not exist:', e.message);
        }
        
        res.render('admin', { thoughts, replies, users, bannedUsers, adminName: req.session.userName });
    } catch (err) { 
        console.error('Admin error:', err);
        res.redirect('/dashboard'); 
    }
});

// ==========================================
// ADMIN: BAN USER
// ==========================================
app.post('/admin/ban-user', isAuthenticated, isAdmin, async (req, res) => {
    const userId = parseInt(req.body.userId);
    
    if (userId === req.session.userId) {
        return res.redirect('/admin');
    }
    
    try {
        const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            
            if (user.is_admin) {
                return res.redirect('/admin');
            }
            
            console.log('🚫 Banning user:', user.email);
            
            // 1. Add to banned_users table
            await db.query(`
                INSERT INTO banned_users (email, name, reason, banned_by) 
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (email) DO UPDATE SET banned_at = NOW()
            `, [user.email.toLowerCase(), user.name, 'Banned by admin', req.session.userEmail]);
            
            // 2. Delete all user content
            await db.query('DELETE FROM replies WHERE user_email = $1', [user.email]);
            await db.query('DELETE FROM replies WHERE thought_id IN (SELECT id FROM thoughts WHERE user_email = $1)', [user.email]);
            await db.query('DELETE FROM thoughts WHERE user_email = $1', [user.email]);
            
            // 3. Delete user
            await db.query('DELETE FROM users WHERE id = $1', [userId]);
            
            console.log('✅ User banned and deleted:', user.email);
        }
    } catch (err) {
        console.error('❌ Ban user error:', err);
    }
    
    res.redirect('/admin');
});

// ==========================================
// ADMIN: DELETE USER (without ban)
// ==========================================
app.post('/admin/delete-user', isAuthenticated, isAdmin, async (req, res) => {
    const userId = parseInt(req.body.userId);
    
    if (userId === req.session.userId) {
        return res.redirect('/admin');
    }
    
    try {
        const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            
            if (user.is_admin) {
                return res.redirect('/admin');
            }
            
            await db.query('DELETE FROM replies WHERE user_email = $1', [user.email]);
            await db.query('DELETE FROM replies WHERE thought_id IN (SELECT id FROM thoughts WHERE user_email = $1)', [user.email]);
            await db.query('DELETE FROM thoughts WHERE user_email = $1', [user.email]);
            await db.query('DELETE FROM users WHERE id = $1', [userId]);
            
            console.log('🗑️ User deleted (not banned):', user.email);
        }
    } catch (err) {
        console.error('Delete user error:', err);
    }
    
    res.redirect('/admin');
});

// ==========================================
// ADMIN: UNBAN USER
// ==========================================
app.post('/admin/unban-user', isAuthenticated, isAdmin, async (req, res) => {
    const email = req.body.email ? req.body.email.trim().toLowerCase() : '';
    
    try {
        await db.query('DELETE FROM banned_users WHERE LOWER(email) = $1', [email]);
        console.log('✅ User unbanned:', email);
    } catch (err) {
        console.error('Unban error:', err);
    }
    
    res.redirect('/admin');
});

// ==========================================
// ADMIN: DELETE THOUGHT
// ==========================================
app.post('/admin/delete-thought', isAuthenticated, isAdmin, async (req, res) => {
    const thoughtId = parseInt(req.body.thoughtId);
    try {
        await db.query('DELETE FROM replies WHERE thought_id = $1', [thoughtId]);
        await db.query('DELETE FROM thoughts WHERE id = $1', [thoughtId]);
        console.log('🗑️ Thought deleted:', thoughtId);
    } catch (err) {
        console.error('Delete thought error:', err);
    }
    res.redirect('/admin');
});

// ==========================================
// ADMIN: DELETE REPLY
// ==========================================
app.post('/admin/delete-reply', isAuthenticated, isAdmin, async (req, res) => {
    const replyId = parseInt(req.body.replyId);
    try {
        await db.query('DELETE FROM replies WHERE id = $1', [replyId]);
        console.log('🗑️ Reply deleted:', replyId);
    } catch (err) {
        console.error('Delete reply error:', err);
    }
    res.redirect('/admin');
});

// ==========================================
// AJAX API ROUTES
// ==========================================
app.post('/api/like-thought', isAuthenticated, async (req, res) => {
    const thoughtId = parseInt(req.body.thoughtId);
    try {
        const result = await db.query('SELECT liked_by FROM thoughts WHERE id = $1', [thoughtId]);
        if (result.rows.length > 0) {
            let likedBy = result.rows[0].liked_by || [];
            const idx = likedBy.indexOf(req.session.userEmail);
            if (idx > -1) likedBy.splice(idx, 1); else likedBy.push(req.session.userEmail);
            await db.query('UPDATE thoughts SET liked_by = $1 WHERE id = $2', [likedBy, thoughtId]);
            return res.json({ success: true, liked: idx === -1, count: likedBy.length });
        }
        res.json({ success: false });
    } catch (err) { res.json({ success: false }); }
});

app.post('/api/reply/:thoughtId', isAuthenticated, async (req, res) => {
    const thoughtId = parseInt(req.params.thoughtId);
    const replyText = req.body.replyText?.trim();
    if (!replyText) return res.json({ success: false });
    try {
        const result = await db.query('INSERT INTO replies (thought_id, user_name, user_email, reply_text) VALUES ($1, $2, $3, $4) RETURNING *', [thoughtId, req.session.userName, req.session.userEmail, replyText]);
        const userResult = await db.query('SELECT profile_pic FROM users WHERE email = $1', [req.session.userEmail]);
        res.json({ success: true, reply: { id: result.rows[0].id, userName: req.session.userName, userEmail: req.session.userEmail, text: replyText, timestamp: result.rows[0].created_at, profilePic: userResult.rows[0]?.profile_pic || null } });
    } catch (err) { res.json({ success: false }); }
});

app.post('/api/delete-thought', isAuthenticated, async (req, res) => {
    const { thoughtId, thoughtUserEmail } = req.body;
    if (thoughtUserEmail !== req.session.userEmail && !req.session.isAdmin) return res.json({ success: false });
    try {
        await db.query('DELETE FROM replies WHERE thought_id = $1', [thoughtId]);
        await db.query('DELETE FROM thoughts WHERE id = $1', [thoughtId]);
        res.json({ success: true });
    } catch (err) { res.json({ success: false }); }
});

app.post('/api/delete-reply', isAuthenticated, async (req, res) => {
    const { replyId, replyUserEmail } = req.body;
    if (replyUserEmail !== req.session.userEmail && !req.session.isAdmin) return res.json({ success: false });
    try {
        await db.query('DELETE FROM replies WHERE id = $1', [replyId]);
        res.json({ success: true });
    } catch (err) { res.json({ success: false }); }
});

app.post('/api/add-thought', isAuthenticated, uploadThought.single('image'), async (req, res) => {
    const thought = req.body.thought?.trim() || '';
    if (!thought && !req.file) return res.json({ success: false, error: 'Add text or image' });
    try {
        let imageUrl = null;
        if (req.file) {
            const fileName = `thought-${req.session.userId}-${Date.now()}-${req.file.originalname}`;
            const { error } = await supabaseStorage.storage.from('thought-images').upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
            if (error) return res.json({ success: false, error: 'Upload failed' });
            const { data: urlData } = supabaseStorage.storage.from('thought-images').getPublicUrl(fileName);
            imageUrl = urlData.publicUrl;
        }
        const result = await db.query('INSERT INTO thoughts (user_id, user_name, user_email, message, image_url, liked_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [req.session.userId, req.session.userName, req.session.userEmail, thought, imageUrl, []]);
        const userResult = await db.query('SELECT profile_pic FROM users WHERE email = $1', [req.session.userEmail]);
        res.json({ success: true, thought: { id: result.rows[0].id, userName: req.session.userName, userEmail: req.session.userEmail, message: thought, image: imageUrl, timestamp: result.rows[0].created_at, likedBy: [], profilePic: userResult.rows[0]?.profile_pic || null, replies: [] } });
    } catch (err) { res.json({ success: false }); }
});



// ==========================================
// FORGOT PASSWORD
// ==========================================
app.get('/forgot-password', (req, res) => {
    if (req.session && req.session.userId) return res.redirect('/dashboard');
    res.render('forgot-password', { error: null, success: null });
});

app.post('/forgot-password', async (req, res) => {
    const email = req.body.email ? req.body.email.trim().toLowerCase() : '';

    if (!email) {
        return res.render('forgot-password', { error: 'Please enter your email address.', success: null });
    }

    try {
        // Check if user exists in our database
        const userCheck = await db.query('SELECT * FROM users WHERE LOWER(email) = $1', [email]);
        
        if (userCheck.rows.length === 0) {
            // Don't reveal if email exists or not (security)
            return res.render('forgot-password', { 
                error: null, 
                success: 'If this email is registered, you will receive a password reset link shortly. Please check your inbox and spam folder.' 
            });
        }

        // Check if user is banned
        const bannedCheck = await db.query('SELECT * FROM banned_users WHERE LOWER(email) = $1', [email]);
        if (bannedCheck.rows.length > 0) {
            return res.render('forgot-password', { 
                error: 'This account has been banned and cannot reset password.', 
                success: null 
            });
        }

        const siteUrl = process.env.SITE_URL || 'https://thoughtstream-xgn8.onrender.com';

        // Send password reset email via Supabase
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${siteUrl}/reset-password`
        });

        if (error) {
            console.error('Password reset error:', error);
            return res.render('forgot-password', { 
                error: 'Failed to send reset email. Please try again later.', 
                success: null 
            });
        }

        console.log('📧 Password reset email sent to:', email);

        return res.render('forgot-password', { 
            error: null, 
            success: 'Password reset link sent! Please check your email inbox and spam folder. The link will expire in 1 hour.' 
        });

    } catch (err) {
        console.error('Forgot password error:', err);
        return res.render('forgot-password', { error: 'Something went wrong. Please try again.', success: null });
    }
});

// ==========================================
// FORGOT PASSWORD
// ==========================================
app.get('/forgot-password', (req, res) => {
    if (req.session && req.session.userId) return res.redirect('/dashboard');
    res.render('forgot-password', { error: null, success: null });
});

app.post('/forgot-password', async (req, res) => {
    const email = req.body.email ? req.body.email.trim().toLowerCase() : '';

    if (!email) {
        return res.render('forgot-password', { error: 'Please enter your email address.', success: null });
    }

    try {
        // Check if user exists in our database
        const userCheck = await db.query('SELECT * FROM users WHERE LOWER(email) = $1', [email]);
        
        if (userCheck.rows.length === 0) {
            return res.render('forgot-password', { 
                error: 'This email is not registered. Please create an account first.', 
                success: null 
            });
        }

        // Check if user is banned
        const bannedCheck = await db.query('SELECT * FROM banned_users WHERE LOWER(email) = $1', [email]);
        if (bannedCheck.rows.length > 0) {
            return res.render('forgot-password', { 
                error: 'This account has been banned.', 
                success: null 
            });
        }

        const siteUrl = process.env.SITE_URL || 'https://thoughtstream-xgn8.onrender.com';

        // Send password reset email via Supabase
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${siteUrl}/update-password`
        });

        if (error) {
            console.error('Password reset error:', error);
            return res.render('forgot-password', { 
                error: 'Failed to send reset email. Please try again.', 
                success: null 
            });
        }

        console.log('📧 Password reset email sent to:', email);

        return res.render('forgot-password', { 
            error: null, 
            success: 'Password reset link sent! Check your email inbox and spam folder.' 
        });

    } catch (err) {
        console.error('Forgot password error:', err);
        return res.render('forgot-password', { error: 'Something went wrong. Please try again.', success: null });
    }
});

// ==========================================
// UPDATE PASSWORD PAGE (Supabase redirects here)
// ==========================================
app.get('/update-password', async (req, res) => {
    // Render page - JavaScript will handle the token from URL
    res.render('update-password', { 
        error: null, 
        success: null
    });
});

app.post('/update-password', async (req, res) => {
    const { password, confirmPassword, access_token, refresh_token } = req.body;

    // Validation
    if (!password || !confirmPassword) {
        return res.render('update-password', { 
            error: 'Please fill in all fields.', 
            success: null
        });
    }

    if (password.length < 6) {
        return res.render('update-password', { 
            error: 'Password must be at least 6 characters.', 
            success: null
        });
    }

    if (password !== confirmPassword) {
        return res.render('update-password', { 
            error: 'Passwords do not match.', 
            success: null
        });
    }

    if (!access_token) {
        return res.render('update-password', { 
            error: 'Invalid reset link. Please request a new one.', 
            success: null
        });
    }

    try {
        // Set the session using the tokens from the URL
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token: access_token,
            refresh_token: refresh_token || access_token
        });

        if (sessionError) {
            console.error('Session error:', sessionError);
            return res.render('update-password', { 
                error: 'Reset link has expired. Please request a new one.', 
                success: null
            });
        }

        // Now update the password
        const { data, error } = await supabase.auth.updateUser({
            password: password
        });

        if (error) {
            console.error('Update password error:', error);
            return res.render('update-password', { 
                error: 'Failed to update password: ' + error.message, 
                success: null
            });
        }

        // Update password in our database too
        if (sessionData?.user?.email) {
            const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
            await db.query('UPDATE users SET password = $1 WHERE LOWER(email) = $2', 
                [hashedPassword, sessionData.user.email.toLowerCase()]);
            console.log('✅ Password updated for:', sessionData.user.email);
        }

        // Sign out
        await supabase.auth.signOut();

        return res.render('update-password', { 
            error: null, 
            success: 'Password updated successfully! You can now login.'
        });

    } catch (err) {
        console.error('Update password error:', err);
        return res.render('update-password', { 
            error: 'Something went wrong. Please try again.', 
            success: null
        });
    }
});

// Keep old route for backward compatibility
app.get('/reset-password', (req, res) => {
    res.redirect('/update-password' + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''));
});

// ==========================================
// RESET PASSWORD PAGE
// ==========================================
app.get('/reset-password', async (req, res) => {
    const access_token = req.query.access_token;
    const refresh_token = req.query.refresh_token;
    const type = req.query.type;
    const error = req.query.error;
    const error_description = req.query.error_description;

    // If there's an error from Supabase
    if (error) {
        console.error('Reset password error:', error, error_description);
        return res.render('reset-password', { 
            error: error_description || 'The reset link is invalid or has expired. Please request a new one.',
            success: null,
            access_token: null,
            refresh_token: null
        });
    }

    // Render the page - JavaScript will extract token from URL hash if needed
    res.render('reset-password', { 
        error: null, 
        success: null,
        access_token: access_token || '',
        refresh_token: refresh_token || ''
    });
});

app.post('/reset-password', async (req, res) => {
    const { password, confirmPassword, access_token, refresh_token } = req.body;

    // Validation
    if (!password || !confirmPassword) {
        return res.render('reset-password', { 
            error: 'Please fill in all fields.', 
            success: null,
            access_token: access_token || '',
            refresh_token: refresh_token || ''
        });
    }

    if (password.length < 6) {
        return res.render('reset-password', { 
            error: 'Password must be at least 6 characters.', 
            success: null,
            access_token: access_token || '',
            refresh_token: refresh_token || ''
        });
    }

    if (password !== confirmPassword) {
        return res.render('reset-password', { 
            error: 'Passwords do not match.', 
            success: null,
            access_token: access_token || '',
            refresh_token: refresh_token || ''
        });
    }

    try {
        let userEmail = null;

        // Try to set session with tokens
        if (access_token && refresh_token) {
            const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
                access_token: access_token,
                refresh_token: refresh_token
            });

            if (sessionError) {
                console.error('Session error:', sessionError);
                return res.render('reset-password', { 
                    error: 'Reset link has expired. Please request a new password reset.', 
                    success: null,
                    access_token: '',
                    refresh_token: ''
                });
            }

            if (sessionData?.user?.email) {
                userEmail = sessionData.user.email;
            }
        }

        // Update password in Supabase Auth
        const { data, error } = await supabase.auth.updateUser({
            password: password
        });

        if (error) {
            console.error('Update password error:', error);
            return res.render('reset-password', { 
                error: 'Failed to reset password. Please request a new reset link.', 
                success: null,
                access_token: '',
                refresh_token: ''
            });
        }

        // Get email from response if not already set
        if (!userEmail && data?.user?.email) {
            userEmail = data.user.email;
        }

        // Update password in our database
        if (userEmail) {
            const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
            await db.query('UPDATE users SET password = $1 WHERE LOWER(email) = $2', [hashedPassword, userEmail.toLowerCase()]);
            console.log('✅ Password reset for:', userEmail);
        }

        // Sign out
        await supabase.auth.signOut();

        return res.render('reset-password', { 
            error: null, 
            success: 'Your password has been reset successfully! You can now login with your new password.',
            access_token: '',
            refresh_token: ''
        });

    } catch (err) {
        console.error('Reset password error:', err);
        return res.render('reset-password', { 
            error: 'Something went wrong. Please request a new reset link.', 
            success: null,
            access_token: '',
            refresh_token: ''
        });
    }
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 Site URL: ${process.env.SITE_URL || 'http://localhost:' + PORT}`);
});