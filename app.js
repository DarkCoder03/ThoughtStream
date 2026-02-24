require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcrypt');
const db = require('./db');
const supabase = require('./supabaseStorage');
const { generateOTP, sendVerificationEmail } = require('./emailService');

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
    else cb(new Error('Only image files are allowed!'), false);
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
    if (req.session && req.session.userId) {
        if (!req.session.isVerified) {
            return res.redirect('/verify-email');
        }
        return next();
    }
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
    if (req.session && req.session.userId) {
        if (!req.session.isVerified) return res.redirect('/verify-email');
        return res.redirect('/dashboard');
    }
    res.redirect('/login');
});

// ==========================================
// LOGIN
// ==========================================
app.get('/login', (req, res) => {
    if (req.session && req.session.userId) {
        if (!req.session.isVerified) return res.redirect('/verify-email');
        return res.redirect('/dashboard');
    }
    res.render('login', { error: null, success: null });
});

app.post('/login', async (req, res) => {
    const email = req.body.email ? req.body.email.trim().toLowerCase() : '';
    const password = req.body.password ? req.body.password.trim() : '';

    try {
        const result = await db.query('SELECT * FROM users WHERE LOWER(email) = $1', [email]);

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
                req.session.isVerified = user.is_verified || false;
                
                // Check if email is verified
                if (!user.is_verified) {
                    // Generate new OTP and send
                    const otp = generateOTP();
                    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
                    await db.query('UPDATE users SET verification_code = $1, verification_expires = $2 WHERE id = $3', [otp, expires, user.id]);
                    await sendVerificationEmail(user.email, user.name, otp);
                    return res.redirect('/verify-email');
                }
                
                return res.redirect('/dashboard');
            }
        }
        
        return res.render('login', { error: 'Invalid email or password.', success: null });
    } catch (err) {
        console.error('Login error:', err);
        return res.render('login', { error: 'Something went wrong.', success: null });
    }
});

// ==========================================
// REGISTER
// ==========================================
app.get('/register', (req, res) => {
    if (req.session && req.session.userId) return res.redirect('/dashboard');
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

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.render('register', { error: 'Please enter a valid email address.' });
    }

    if (password.length < 6) {
        return res.render('register', { error: 'Password must be at least 6 characters.' });
    }

    if (password !== confirmPassword) {
        return res.render('register', { error: 'Passwords do not match.' });
    }

    try {
        const checkResult = await db.query('SELECT * FROM users WHERE LOWER(email) = $1', [email]);

        if (checkResult.rows.length > 0) {
            return res.render('register', { error: 'Email already registered. Please login.' });
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        const otp = generateOTP();
        const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        const insertQuery = `
            INSERT INTO users (name, email, password, is_verified, verification_code, verification_expires) 
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
        `;
        const result = await db.query(insertQuery, [name, email, hashedPassword, false, otp, expires]);
        const user = result.rows[0];

        // Send verification email
        const emailResult = await sendVerificationEmail(email, name, otp);
        
        if (!emailResult.success) {
            console.error('Failed to send verification email:', emailResult.error);
        }

        // Set session
        req.session.userId = user.id;
        req.session.userName = user.name;
        req.session.userEmail = user.email;
        req.session.isVerified = false;

        return res.redirect('/verify-email');

    } catch (err) {
        console.error('Register error:', err);
        return res.render('register', { error: 'Something went wrong. Please try again.' });
    }
});

// ==========================================
// EMAIL VERIFICATION PAGE
// ==========================================
app.get('/verify-email', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    if (req.session.isVerified) return res.redirect('/dashboard');
    
    res.render('verify-email', { 
        email: req.session.userEmail,
        error: null,
        success: null
    });
});

app.post('/verify-email', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');

    const otp = req.body.otp ? req.body.otp.trim() : '';
    const userId = req.session.userId;

    try {
        const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        
        if (result.rows.length === 0) {
            req.session.destroy();
            return res.redirect('/login');
        }

        const user = result.rows[0];

        // Check if already verified
        if (user.is_verified) {
            req.session.isVerified = true;
            return res.redirect('/dashboard');
        }

        // Check OTP
        if (user.verification_code !== otp) {
            return res.render('verify-email', { 
                email: req.session.userEmail,
                error: 'Invalid verification code. Please try again.',
                success: null
            });
        }

        // Check if OTP expired
        if (new Date() > new Date(user.verification_expires)) {
            return res.render('verify-email', { 
                email: req.session.userEmail,
                error: 'Verification code has expired. Please request a new one.',
                success: null
            });
        }

        // Verify user
        await db.query('UPDATE users SET is_verified = true, verification_code = NULL, verification_expires = NULL WHERE id = $1', [userId]);
        
        req.session.isVerified = true;
        return res.redirect('/dashboard');

    } catch (err) {
        console.error('Verification error:', err);
        return res.render('verify-email', { 
            email: req.session.userEmail,
            error: 'Something went wrong. Please try again.',
            success: null
        });
    }
});

// ==========================================
// RESEND OTP
// ==========================================
app.post('/resend-otp', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false, error: 'Not logged in' });

    try {
        const result = await db.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
        
        if (result.rows.length === 0) {
            return res.json({ success: false, error: 'User not found' });
        }

        const user = result.rows[0];

        if (user.is_verified) {
            return res.json({ success: false, error: 'Already verified' });
        }

        const otp = generateOTP();
        const expires = new Date(Date.now() + 10 * 60 * 1000);

        await db.query('UPDATE users SET verification_code = $1, verification_expires = $2 WHERE id = $3', [otp, expires, user.id]);
        
        const emailResult = await sendVerificationEmail(user.email, user.name, otp);
        
        if (emailResult.success) {
            return res.json({ success: true, message: 'New code sent!' });
        } else {
            return res.json({ success: false, error: 'Failed to send email' });
        }

    } catch (err) {
        console.error('Resend OTP error:', err);
        return res.json({ success: false, error: 'Something went wrong' });
    }
});

// ==========================================
// LOGOUT
// ==========================================
app.get('/logout', (req, res) => {
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
// SETTINGS PAGE
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
        console.error('Settings error:', err);
        res.redirect('/dashboard');
    }
});

// ==========================================
// SETTINGS UPDATE
// ==========================================
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
            const { error } = await supabase.storage.from('profile-pics').upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
            if (!error) {
                const { data: urlData } = supabase.storage.from('profile-pics').getPublicUrl(fileName);
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
        console.error('Update error:', err);
        res.render('settings', { userId, name: currentName, email: userEmail, profilePic: null, success: null, error: 'Update failed.', passwordSuccess: null, passwordError: null });
    }
});

// ==========================================
// CHANGE PASSWORD
// ==========================================
app.post('/settings/change-password', isAuthenticated, async (req, res) => {
    const userId = req.session.userId;
    const userEmail = req.session.userEmail;
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    try {
        const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (result.rows.length === 0) { req.session.destroy(); return res.redirect('/login'); }
        const user = result.rows[0];

        let validPassword = user.password.startsWith('$2b$') 
            ? await bcrypt.compare(currentPassword, user.password) 
            : currentPassword === user.password;

        if (!validPassword) {
            return res.render('settings', { userId, name: user.name, email: userEmail, profilePic: user.profile_pic, success: null, error: null, passwordSuccess: null, passwordError: 'Current password is incorrect.' });
        }
        if (newPassword.length < 6) {
            return res.render('settings', { userId, name: user.name, email: userEmail, profilePic: user.profile_pic, success: null, error: null, passwordSuccess: null, passwordError: 'New password must be at least 6 characters.' });
        }
        if (newPassword !== confirmNewPassword) {
            return res.render('settings', { userId, name: user.name, email: userEmail, profilePic: user.profile_pic, success: null, error: null, passwordSuccess: null, passwordError: 'Passwords do not match.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);

        res.render('settings', { userId, name: user.name, email: userEmail, profilePic: user.profile_pic, success: null, error: null, passwordSuccess: 'Password changed!', passwordError: null });
    } catch (err) {
        console.error('Password change error:', err);
        res.redirect('/settings');
    }
});

// ==========================================
// SINGLE THOUGHT PAGE (For Sharing)
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
        const thoughts = (await db.query(`SELECT t.*, u.profile_pic FROM thoughts t LEFT JOIN users u ON t.user_email = u.email ORDER BY t.created_at DESC`)).rows.map(t => ({ id: t.id, userName: t.user_name, userEmail: t.user_email, message: t.message, image: t.image_url, timestamp: t.created_at, profilePic: t.profile_pic }));
        const replies = (await db.query(`SELECT r.*, u.profile_pic, t.message as thought_message FROM replies r LEFT JOIN users u ON r.user_email = u.email LEFT JOIN thoughts t ON r.thought_id = t.id ORDER BY r.created_at DESC`)).rows.map(r => ({ id: r.id, thoughtId: r.thought_id, userName: r.user_name, userEmail: r.user_email, text: r.reply_text, timestamp: r.created_at, thoughtMessage: r.thought_message, profilePic: r.profile_pic }));
        const users = (await db.query(`SELECT id, name, email, is_admin, is_verified, created_at, profile_pic FROM users ORDER BY created_at DESC`)).rows;
        res.render('admin', { thoughts, replies, users, adminName: req.session.userName });
    } catch (err) { res.redirect('/dashboard'); }
});

app.post('/admin/delete-user', isAuthenticated, isAdmin, async (req, res) => {
    const userId = parseInt(req.body.userId);
    if (userId === req.session.userId) return res.redirect('/admin');
    try {
        const result = await db.query('SELECT email FROM users WHERE id = $1', [userId]);
        if (result.rows.length > 0) {
            const email = result.rows[0].email;
            await db.query('DELETE FROM replies WHERE user_email = $1', [email]);
            await db.query('DELETE FROM replies WHERE thought_id IN (SELECT id FROM thoughts WHERE user_email = $1)', [email]);
            await db.query('DELETE FROM thoughts WHERE user_email = $1', [email]);
            await db.query('DELETE FROM users WHERE id = $1', [userId]);
        }
    } catch (err) { console.error(err); }
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
            const { error } = await supabase.storage.from('thought-images').upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
            if (error) return res.json({ success: false, error: 'Upload failed' });
            const { data: urlData } = supabase.storage.from('thought-images').getPublicUrl(fileName);
            imageUrl = urlData.publicUrl;
        }
        const result = await db.query('INSERT INTO thoughts (user_id, user_name, user_email, message, image_url, liked_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [req.session.userId, req.session.userName, req.session.userEmail, thought, imageUrl, []]);
        const userResult = await db.query('SELECT profile_pic FROM users WHERE email = $1', [req.session.userEmail]);
        res.json({ success: true, thought: { id: result.rows[0].id, userName: req.session.userName, userEmail: req.session.userEmail, message: thought, image: imageUrl, timestamp: result.rows[0].created_at, likedBy: [], profilePic: userResult.rows[0]?.profile_pic || null, replies: [] } });
    } catch (err) { res.json({ success: false }); }
});

app.get('/api/auth-status', (req, res) => {
    res.json({ isLoggedIn: !!(req.session && req.session.userId && req.session.isVerified), userId: req.session?.userId || null });
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));