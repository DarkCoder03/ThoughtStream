const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Generate 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send verification email
async function sendVerificationEmail(email, name, otp) {
    const mailOptions = {
        from: process.env.EMAIL_FROM || 'ThoughtStream <noreply@thoughtstream.com>',
        to: email,
        subject: '🔐 Verify your ThoughtStream account',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa;">
                <div style="max-width: 500px; margin: 40px auto; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <div style="background: linear-gradient(135deg, #a855f7, #ec4899); padding: 40px 30px; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 28px;">ThoughtStream</h1>
                        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 14px;">Share your thoughts with the world</p>
                    </div>
                    
                    <!-- Content -->
                    <div style="padding: 40px 30px;">
                        <h2 style="color: #1a1a2e; margin: 0 0 20px; font-size: 22px;">Hi ${name}! 👋</h2>
                        <p style="color: #6b7280; line-height: 1.6; margin: 0 0 25px;">
                            Welcome to ThoughtStream! To complete your registration, please use the verification code below:
                        </p>
                        
                        <!-- OTP Box -->
                        <div style="background: linear-gradient(135deg, #f3e8ff, #fce7f3); border-radius: 16px; padding: 30px; text-align: center; margin: 25px 0;">
                            <p style="color: #6b7280; margin: 0 0 10px; font-size: 14px;">Your verification code is:</p>
                            <div style="font-size: 40px; font-weight: 700; letter-spacing: 8px; color: #a855f7; font-family: 'Courier New', monospace;">
                                ${otp}
                            </div>
                        </div>
                        
                        <p style="color: #9ca3af; font-size: 13px; margin: 20px 0 0; line-height: 1.5;">
                            ⏰ This code will expire in <strong>10 minutes</strong>.<br>
                            🔒 If you didn't create an account, please ignore this email.
                        </p>
                    </div>
                    
                    <!-- Footer -->
                    <div style="background: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                            © 2024 ThoughtStream. All rights reserved.
                        </p>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        return { success: true };
    } catch (error) {
        console.error('Email send error:', error);
        return { success: false, error: error.message };
    }
}

// Send password reset email (bonus feature)
async function sendPasswordResetEmail(email, name, otp) {
    const mailOptions = {
        from: process.env.EMAIL_FROM || 'ThoughtStream <noreply@thoughtstream.com>',
        to: email,
        subject: '🔑 Reset your ThoughtStream password',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
            </head>
            <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa;">
                <div style="max-width: 500px; margin: 40px auto; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">
                    <div style="background: linear-gradient(135deg, #a855f7, #ec4899); padding: 40px 30px; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 28px;">ThoughtStream</h1>
                    </div>
                    <div style="padding: 40px 30px;">
                        <h2 style="color: #1a1a2e; margin: 0 0 20px;">Hi ${name}!</h2>
                        <p style="color: #6b7280; line-height: 1.6;">We received a request to reset your password. Use this code:</p>
                        <div style="background: #f3e8ff; border-radius: 16px; padding: 30px; text-align: center; margin: 25px 0;">
                            <div style="font-size: 40px; font-weight: 700; letter-spacing: 8px; color: #a855f7;">${otp}</div>
                        </div>
                        <p style="color: #9ca3af; font-size: 13px;">This code expires in 10 minutes.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        return { success: true };
    } catch (error) {
        console.error('Email send error:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    generateOTP,
    sendVerificationEmail,
    sendPasswordResetEmail
};