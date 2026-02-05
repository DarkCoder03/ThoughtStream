const { Pool } = require('pg');

// Create connection pool to PostgreSQL database
const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'starlink',  // ← Change this to your PostgreSQL password
    database: 'login_system'
});

// Test connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('Database connection failed:', err.message);
        return;
    }
    console.log('Connected to PostgreSQL database.');
    release();
});

module.exports = pool;