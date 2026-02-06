const { Pool } = require('pg');

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'starlink',  // ← Change this!
    database: 'login_system'
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('Database connection failed:', err.message);
        return;
    }
    console.log('Connected to PostgreSQL database.');
    release();
});

module.exports = pool;