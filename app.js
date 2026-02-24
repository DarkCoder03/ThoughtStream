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

// Profile pic upload (5MB)
const uploadProfile = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});

// Thought image upload (4MB)
const uploadThought = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 4 * 1024 * 1024 }
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
                image: thought.image_url || null,
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
            isAdmin: isAdmin,
            siteUrl: process.env.SITE_URL || 'https://thoughtstream.onrender.com'
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.render('dashboard', {
            userId: userId,
            name: userName,
            email: userEmail,
            profilePic: null,
            thoughts: [],
            isAdmin: isAdmin,
            siteUrl: process.env.SITE_URL || 'https://thoughtstream.onrender.com'
        });
    }
});

// ==========================================
// SINGLE THOUGHT PAGE (For Sharing)
// ==========================================
app.get('/thought/:id', async (req, res) => {
    const thoughtId = parseInt(req.params.id);
    
    try {
        const thoughtQuery = `
            SELECT t.*, u.profile_pic 
            FROM thoughts t 
            LEFT JOIN users u ON t.user_email = u.email 
            WHERE t.id = $1
        `;
        const thoughtResult = await db.query(thoughtQuery, [thoughtId]);
        
        if (thoughtResult.rows.length === 0) {
            return res.redirect('/login');
        }
        
        const thought = thoughtResult.rows[0];
        
        res.render('single-thought', {
            thought: {
                id: thought.id,
                userName: thought.user_name,
                message: thought.message,
                image: thought.image_url,
                timestamp: thought.created_at,
                likeCount: thought.liked_by ? thought.liked_by.length : 0,
                profilePic: thought.profile_pic
            },
            siteUrl: process.env.SITE_URL || 'https://thoughtstream.onrender.com'
        });
    } catch (err) {
        console.error('Single thought error:', err);
        res.redirect('/login');
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
            error: null,
            passwordSuccess: null,
            passwordError: null
        });
    } catch (err) {
        console.error('Settings error:', err);
        res.render('settings', {
            userId: userId,
            name: userName,
            email: userEmail,
            profilePic: null,
            success: null,
            error: null,
            passwordSuccess: null,
            passwordError: null
        });
    }
});

// ==========================================
// SETTINGS UPDATE (Profile)
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
            error: null,
            passwordSuccess: null,
            passwordError: null
        });

    } catch (err) {
        console.error('Error updating profile:', err);
        res.render('settings', {
            userId: userId,
            name: currentName,
            email: userEmail,
            profilePic: null,
            success: null,
            error: 'Failed to update profile. Please try again.',
            passwordSuccess: null,
            passwordError: null
        });
    }
});

// ==========================================
// CHANGE PASSWORD
// ==========================================
app.post('/settings/change-password', isAuthenticated, async (req, res) => {
    const userId = req.session.userId;
    const userEmail = req.session.userEmail;
    const currentPassword = req.body.currentPassword ? req.body.currentPassword.trim() : '';
    const newPassword = req.body.newPassword ? req.body.newPassword.trim() : '';
    const confirmNewPassword = req.body.confirmNewPassword ? req.body.confirmNewPassword.trim() : '';

    try {
        const userQuery = 'SELECT * FROM users WHERE id = $1';
        const userResult = await db.query(userQuery, [userId]);
        
        if (userResult.rows.length === 0) {
            req.session.destroy();
            return res.redirect('/login');
        }
        
        const user = userResult.rows[0];

        let validPassword = false;
        if (user.password.startsWith('$2b$')) {
            validPassword = await bcrypt.compare(currentPassword, user.password);
        } else {
            validPassword = (currentPassword === user.password);
        }

        if (!validPassword) {
            return res.render('settings', {
                userId: userId,
                name: user.name,
                email: userEmail,
                profilePic: user.profile_pic || null,
                success: null,
                error: null,
                passwordSuccess: null,
                passwordError: 'Current password is incorrect.'
            });
        }

        if (newPassword.length < 6) {
            return res.render('settings', {
                userId: userId,
                name: user.name,
                email: userEmail,
                profilePic: user.profile_pic || null,
                success: null,
                error: null,
                passwordSuccess: null,
                passwordError: 'New password must be at least 6 characters.'
            });
        }

        if (newPassword !== confirmNewPassword) {
            return res.render('settings', {
                userId: userId,
                name: user.name,
                email: userEmail,
                profilePic: user.profile_pic || null,
                success: null,
                error: null,
                passwordSuccess: null,
                passwordError: 'New passwords do not match.'
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);

        res.render('settings', {
            userId: userId,
            name: user.name,
            email: userEmail,
            profilePic: user.profile_pic || null,
            success: null,
            error: null,
            passwordSuccess: 'Password changed successfully!',
            passwordError: null
        });

    } catch (err) {
        console.error('Error changing password:', err);
        const userResult = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        const user = userResult.rows[0] || { name: '', profile_pic: null };
        
        res.render('settings', {
            userId: userId,
            name: user.name,
            email: userEmail,
            profilePic: user.profile_pic || null,
            success: null,
            error: null,
            passwordSuccess: null,
            passwordError: 'Failed to change password. Please try again.'
        });
    }
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
            image: t.image_url,
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
// AJAX API ROUTES
// ==========================================

// AJAX Like
app.post('/api/like-thought', isAuthenticated, async (req, res) => {
    const thoughtId = parseInt(req.body.thoughtId);
    const userEmail = req.session.userEmail;

    try {
        const result = await db.query('SELECT liked_by FROM thoughts WHERE id = $1', [thoughtId]);
        
        if (result.rows.length > 0) {
            let likedBy = result.rows[0].liked_by || [];
            let liked = false;
            
            const likeIndex = likedBy.indexOf(userEmail);
            
            if (likeIndex > -1) {
                likedBy.splice(likeIndex, 1);
                liked = false;
            } else {
                likedBy.push(userEmail);
                liked = true;
            }
            
            await db.query('UPDATE thoughts SET liked_by = $1 WHERE id = $2', [likedBy, thoughtId]);
            
            return res.json({ success: true, liked: liked, count: likedBy.length });
        }
        
        res.json({ success: false });
    } catch (err) {
        console.error('Like error:', err);
        res.json({ success: false, error: err.message });
    }
});

// AJAX Reply
app.post('/api/reply/:thoughtId', isAuthenticated, async (req, res) => {
    const thoughtId = parseInt(req.params.thoughtId);
    const replyText = req.body.replyText ? req.body.replyText.trim() : '';
    const userName = req.session.userName;
    const userEmail = req.session.userEmail;

    if (replyText === '') {
        return res.json({ success: false, error: 'Empty reply' });
    }

    try {
        const query = `
            INSERT INTO replies (thought_id, user_name, user_email, reply_text) 
            VALUES ($1, $2, $3, $4) RETURNING *
        `;
        const result = await db.query(query, [thoughtId, userName, userEmail, replyText]);
        
        const userResult = await db.query('SELECT profile_pic FROM users WHERE email = $1', [userEmail]);
        const profilePic = userResult.rows[0]?.profile_pic || null;

        res.json({ 
            success: true, 
            reply: {
                id: result.rows[0].id,
                userName: userName,
                userEmail: userEmail,
                text: replyText,
                timestamp: result.rows[0].created_at,
                profilePic: profilePic
            }
        });
    } catch (err) {
        console.error('Reply error:', err);
        res.json({ success: false, error: err.message });
    }
});

// AJAX Delete Thought
app.post('/api/delete-thought', isAuthenticated, async (req, res) => {
    const thoughtId = parseInt(req.body.thoughtId);
    const thoughtUserEmail = req.body.thoughtUserEmail;
    const userEmail = req.session.userEmail;
    const isAdmin = req.session.isAdmin;

    if (thoughtUserEmail !== userEmail && !isAdmin) {
        return res.json({ success: false, error: 'Not authorized' });
    }

    try {
        await db.query('DELETE FROM replies WHERE thought_id = $1', [thoughtId]);
        await db.query('DELETE FROM thoughts WHERE id = $1', [thoughtId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete error:', err);
        res.json({ success: false, error: err.message });
    }
});

// AJAX Delete Reply
app.post('/api/delete-reply', isAuthenticated, async (req, res) => {
    const replyId = parseInt(req.body.replyId);
    const replyUserEmail = req.body.replyUserEmail;
    const userEmail = req.session.userEmail;
    const isAdmin = req.session.isAdmin;

    if (replyUserEmail !== userEmail && !isAdmin) {
        return res.json({ success: false, error: 'Not authorized' });
    }

    try {
        await db.query('DELETE FROM replies WHERE id = $1', [replyId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete reply error:', err);
        res.json({ success: false, error: err.message });
    }
});

// AJAX Add Thought with Image
app.post('/api/add-thought', isAuthenticated, uploadThought.single('image'), async (req, res) => {
    const thought = req.body.thought ? req.body.thought.trim() : '';
    const userId = req.session.userId;
    const userName = req.session.userName;
    const userEmail = req.session.userEmail;

    if (thought === '' && !req.file) {
        return res.json({ success: false, error: 'Please add text or image' });
    }

    try {
        let imageUrl = null;

        // Upload image to Supabase if provided
        if (req.file) {
            const fileName = `thought-${userId}-${Date.now()}-${req.file.originalname}`;
            
            const { data, error } = await supabase.storage
                .from('thought-images')
                .upload(fileName, req.file.buffer, {
                    contentType: req.file.mimetype,
                    upsert: true
                });

            if (error) {
                console.error('Supabase upload error:', error);
                return res.json({ success: false, error: 'Failed to upload image' });
            }

            const { data: urlData } = supabase.storage
                .from('thought-images')
                .getPublicUrl(fileName);
            
            imageUrl = urlData.publicUrl;
        }

        const query = `
            INSERT INTO thoughts (user_id, user_name, user_email, message, image_url, liked_by) 
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
        `;
        const result = await db.query(query, [userId, userName, userEmail, thought, imageUrl, []]);
        
        const userResult = await db.query('SELECT profile_pic FROM users WHERE email = $1', [userEmail]);
        const profilePic = userResult.rows[0]?.profile_pic || null;

        res.json({ 
            success: true, 
            thought: {
                id: result.rows[0].id,
                userName: userName,
                userEmail: userEmail,
                message: thought,
                image: imageUrl,
                timestamp: result.rows[0].created_at,
                likedBy: [],
                profilePic: profilePic,
                replies: []
            }
        });
    } catch (err) {
        console.error('Add thought error:', err);
        res.json({ success: false, error: err.message });
    }
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