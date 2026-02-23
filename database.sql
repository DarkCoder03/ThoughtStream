<<<<<<< HEAD
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (name, email, password) VALUES
('Rahul Sharma', 'rahul.sharma@gmail.com', 'Rahul@2024'),
('Priya Patel', 'priya.patel@yahoo.com', 'Priya#5678'),
('Amit Kumar', 'amit.kumar@outlook.com', 'AmitK!9012'),
('Sneha Gupta', 'sneha.gupta@gmail.com', 'Sneha$3456'),
('Vikram Singh', 'vikram.singh@hotmail.com', 'Vikram%7890'),
('Anjali Verma', 'anjali.verma@gmail.com', 'Anjali^1234'),
('Rajesh Nair', 'rajesh.nair@yahoo.com', 'Rajesh&5678'),
('Pooja Reddy', 'pooja.reddy@outlook.com', 'Pooja*9012'),
('Arjun Menon', 'arjun.menon@gmail.com', 'Arjun#3456'),
('Kavita Joshi', 'kavita.joshi@hotmail.com', 'Kavita@7890');


SELECT * FROM users;

-- Create thoughts table to store posts
CREATE TABLE thoughts (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    user_name VARCHAR(100) NOT NULL,
    user_email VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    likes INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Check if tables exist
SELECT * FROM users;
SELECT * FROM thoughts;

UPDATE users
SET email = 'anup.ctae@gmail.co'
WHERE id = 11;




-- Add profile_pic column to users table (if not exists)
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_pic VARCHAR(255);

-- Make sure thoughts table exists with all columns
CREATE TABLE IF NOT EXISTS thoughts (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    user_name VARCHAR(100) NOT NULL,
    user_email VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    liked_by TEXT[] DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create replies table
CREATE TABLE IF NOT EXISTS replies (
    id SERIAL PRIMARY KEY,
    thought_id INT REFERENCES thoughts(id) ON DELETE CASCADE,
    user_name VARCHAR(100) NOT NULL,
    user_email VARCHAR(100) NOT NULL,
    reply_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Check and fix users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_pic VARCHAR(255);

-- Drop and recreate thoughts table with correct structure
DROP TABLE IF EXISTS replies;
DROP TABLE IF EXISTS thoughts;

-- Create thoughts table
CREATE TABLE thoughts (
    id SERIAL PRIMARY KEY,
    user_id INT,
    user_name VARCHAR(100) NOT NULL,
    user_email VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    liked_by TEXT[] DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create replies table
CREATE TABLE replies (
    id SERIAL PRIMARY KEY,
    thought_id INT REFERENCES thoughts(id) ON DELETE CASCADE,
    user_name VARCHAR(100) NOT NULL,
    user_email VARCHAR(100) NOT NULL,
    reply_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);















=======
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (name, email, password) VALUES
('Rahul Sharma', 'rahul.sharma@gmail.com', 'Rahul@2024'),
('Priya Patel', 'priya.patel@yahoo.com', 'Priya#5678'),
('Amit Kumar', 'amit.kumar@outlook.com', 'AmitK!9012'),
('Sneha Gupta', 'sneha.gupta@gmail.com', 'Sneha$3456'),
('Vikram Singh', 'vikram.singh@hotmail.com', 'Vikram%7890'),
('Anjali Verma', 'anjali.verma@gmail.com', 'Anjali^1234'),
('Rajesh Nair', 'rajesh.nair@yahoo.com', 'Rajesh&5678'),
('Pooja Reddy', 'pooja.reddy@outlook.com', 'Pooja*9012'),
('Arjun Menon', 'arjun.menon@gmail.com', 'Arjun#3456'),
('Kavita Joshi', 'kavita.joshi@hotmail.com', 'Kavita@7890');


SELECT * FROM users;

-- Create thoughts table to store posts
CREATE TABLE thoughts (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    user_name VARCHAR(100) NOT NULL,
    user_email VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    likes INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Check if tables exist
SELECT * FROM users;
SELECT * FROM thoughts;

UPDATE users
SET email = 'anup.ctae@gmail.co'
WHERE id = 11;




-- Add profile_pic column to users table (if not exists)
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_pic VARCHAR(255);

-- Make sure thoughts table exists with all columns
CREATE TABLE IF NOT EXISTS thoughts (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    user_name VARCHAR(100) NOT NULL,
    user_email VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    liked_by TEXT[] DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create replies table
CREATE TABLE IF NOT EXISTS replies (
    id SERIAL PRIMARY KEY,
    thought_id INT REFERENCES thoughts(id) ON DELETE CASCADE,
    user_name VARCHAR(100) NOT NULL,
    user_email VARCHAR(100) NOT NULL,
    reply_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Check and fix users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_pic VARCHAR(255);

-- Drop and recreate thoughts table with correct structure
DROP TABLE IF EXISTS replies;
DROP TABLE IF EXISTS thoughts;

-- Create thoughts table
CREATE TABLE thoughts (
    id SERIAL PRIMARY KEY,
    user_id INT,
    user_name VARCHAR(100) NOT NULL,
    user_email VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    liked_by TEXT[] DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create replies table
CREATE TABLE replies (
    id SERIAL PRIMARY KEY,
    thought_id INT REFERENCES thoughts(id) ON DELETE CASCADE,
    user_name VARCHAR(100) NOT NULL,
    user_email VARCHAR(100) NOT NULL,
    reply_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);















>>>>>>> fd7c2b33ebafaee61e8cc8dd16b3b1d393f2b563
