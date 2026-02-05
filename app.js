const express = require('express');
const path = require('path');
const multer = require('multer');
const db = require('./db');

const app = express();
const PORT = 3000;

// ==========================================
// IN-MEMORY STORAGE
// ==========================================
let globalThoughts = [];
let userProfiles = {}; // Store user profile pictures: { email: { profilePic: 'filename.jpg' } }

// ==========================================
// MULTER SETUP FOR FILE UPLOADS
// ==========================================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        // Create unique filename: timestamp-originalname
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

const fileFilter = (req, file, cb) => {
    // Accept only images
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// ==========================================
// MIDDLEWARE
// ==========================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ==========================================
// HELPER FUNCTION
// ==========================================
function getUserProfile(email) {
    return userProfiles[email] || { profilePic: null };
}

// ==========================================
// ROUTES
// ==========================================

// Home - Redirect to login
app.get('/', (req, res) => {
    res.redirect('/login');
});

// ==========================================
// LOGIN
// ==========================================
app.get('/login', (req, res) => {
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
            return res.redirect(`/dashboard?id=${user.id}&name=${encodeURIComponent(user.name)}&email=${encodeURIComponent(user.email)}`);
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
// DASHBOARD
// ==========================================
app.get('/dashboard', (req, res) => {
    const userId = req.query.id || '';
    const userName = req.query.name || 'User';
    const userEmail = req.query.email || '';
    const userProfile = getUserProfile(userEmail);

    // Add profile pics to thoughts and sort by newest first
    const thoughtsWithProfiles = globalThoughts.map(thought => ({
        ...thought,
        profilePic: getUserProfile(thought.userEmail).profilePic
    })).reverse();

    res.render('dashboard', {
        userId: userId,
        name: userName,
        email: userEmail,
        profilePic: userProfile.profilePic,
        thoughts: thoughtsWithProfiles
    });
});

// ==========================================
// SETTINGS PAGE
// ==========================================
app.get('/settings', (req, res) => {
    const userId = req.query.id || '';
    const userName = req.query.name || 'User';
    const userEmail = req.query.email || '';
    const userProfile = getUserProfile(userEmail);

    res.render('settings', {
        userId: userId,
        name: userName,
        email: userEmail,
        profilePic: userProfile.profilePic,
        success: null,
        error: null
    });
});

app.post('/settings/update', upload.single('profilePic'), async (req, res) => {
    const userId = req.body.userId || '';
    const currentName = req.body.currentName || '';
    const userEmail = req.body.userEmail || '';
    const newName = req.body.newName ? req.body.newName.trim() : currentName;

    try {
        // Update name in database
        if (newName !== currentName) {
            const updateQuery = 'UPDATE users SET name = $1 WHERE id = $2';
            await db.query(updateQuery, [newName, userId]);

            // Update name in existing thoughts
            globalThoughts = globalThoughts.map(thought => {
                if (thought.userEmail === userEmail) {
                    return { ...thought, userName: newName };
                }
                return thought;
            });
        }

        // Update profile picture
        if (req.file) {
            userProfiles[userEmail] = {
                ...userProfiles[userEmail],
                profilePic: req.file.filename
            };
        }

        res.render('settings', {
            userId: userId,
            name: newName,
            email: userEmail,
            profilePic: getUserProfile(userEmail).profilePic,
            success: 'Profile updated successfully!',
            error: null
        });

    } catch (err) {
        console.error('Error updating profile:', err);
        res.render('settings', {
            userId: userId,
            name: currentName,
            email: userEmail,
            profilePic: getUserProfile(userEmail).profilePic,
            success: null,
            error: 'Failed to update profile. Please try again.'
        });
    }
});

// ==========================================
// ADD THOUGHT
// ==========================================
app.post('/add-thought', (req, res) => {
    const thought = req.body.thought ? req.body.thought.trim() : '';
    const userId = req.body.userId || '';
    const userName = req.body.userName || 'Anonymous';
    const userEmail = req.body.userEmail || '';

    if (thought !== '') {
        globalThoughts.push({
            id: Date.now(),
            oderId: globalThoughts.length + 1,
            userName: userName,
            userEmail: userEmail,
            message: thought,
            timestamp: new Date(),
            likedBy: [],  // Array to store emails of users who liked
            replies: []   // Array to store replies
        });
    }

    res.redirect(`/dashboard?id=${userId}&name=${encodeURIComponent(userName)}&email=${encodeURIComponent(userEmail)}`);
});

// ==========================================
// LIKE THOUGHT (TOGGLE)
// ==========================================
app.post('/like-thought', (req, res) => {
    const thoughtId = parseInt(req.body.thoughtId);
    const userId = req.body.userId || '';
    const userName = req.body.userName || 'User';
    const userEmail = req.body.userEmail || '';

    // Find the thought
    const thought = globalThoughts.find(t => t.id === thoughtId);
    
    if (thought) {
        // Initialize likedBy if it doesn't exist (for old thoughts)
        if (!thought.likedBy) {
            thought.likedBy = [];
        }

        // Toggle like
        const likeIndex = thought.likedBy.indexOf(userEmail);
        
        if (likeIndex > -1) {
            // User already liked, so remove (unlike)
            thought.likedBy.splice(likeIndex, 1);
        } else {
            // User hasn't liked, so add (like)
            thought.likedBy.push(userEmail);
        }
    }

    res.redirect(`/dashboard?id=${userId}&name=${encodeURIComponent(userName)}&email=${encodeURIComponent(userEmail)}`);
});

// ==========================================
// REPLY TO THOUGHT
// ==========================================
app.post('/reply/:thoughtId', (req, res) => {
    const thoughtId = parseInt(req.params.thoughtId);
    const replyText = req.body.replyText ? req.body.replyText.trim() : '';
    const userId = req.body.userId || '';
    const userName = req.body.userName || 'User';
    const userEmail = req.body.userEmail || '';

    if (replyText !== '') {
        const thought = globalThoughts.find(t => t.id === thoughtId);
        
        if (thought) {
            // Initialize replies if it doesn't exist
            if (!thought.replies) {
                thought.replies = [];
            }

            thought.replies.push({
                id: Date.now(),
                userName: userName,
                userEmail: userEmail,
                text: replyText,
                timestamp: new Date(),
                profilePic: getUserProfile(userEmail).profilePic
            });
        }
    }

    res.redirect(`/dashboard?id=${userId}&name=${encodeURIComponent(userName)}&email=${encodeURIComponent(userEmail)}`);
});

// ==========================================
// DELETE THOUGHT
// ==========================================
app.post('/delete-thought', (req, res) => {
    const thoughtId = parseInt(req.body.thoughtId);
    const thoughtUserEmail = req.body.thoughtUserEmail;
    const userId = req.body.userId || '';
    const userName = req.body.userName || 'User';
    const userEmail = req.body.userEmail || '';

    // Only allow user to delete their own thoughts
    if (thoughtUserEmail === userEmail) {
        globalThoughts = globalThoughts.filter(t => t.id !== thoughtId);
    }

    res.redirect(`/dashboard?id=${userId}&name=${encodeURIComponent(userName)}&email=${encodeURIComponent(userEmail)}`);
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
    console.log('Server is running on http://localhost:' + PORT);
});