require('dotenv').config();
const { Pool } = require('pg');

const isProduction = process.env.RENDER === 'true';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : false
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('Database connection failed:', err.message);
        return;
    }
    console.log('Connected to Supabase PostgreSQL database.');
    release();
});

module.exports = pool;