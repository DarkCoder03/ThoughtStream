require('dotenv').config();
const nodemailer = require('nodemailer');

console.log('Testing email configuration...');
console.log('EMAIL_USER:', process.env.EMAIL_USER);
console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? '****' + process.env.EMAIL_PASS.slice(-4) : 'NOT SET');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

transporter.verify(function(error, success) {
    if (error) {
        console.log('❌ Error:', error.message);
        console.log('\nPossible issues:');
        console.log('1. App password is incorrect');
        console.log('2. 2-Step Verification not enabled');
        console.log('3. Email/password has extra spaces');
    } else {
        console.log('✅ Email configuration is correct!');
        console.log('Server is ready to send emails.');
    }
    process.exit();
});