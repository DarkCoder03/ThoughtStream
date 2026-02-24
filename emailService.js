const nodemailer = require('nodemailer');

// Create transporter with timeout
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    // Add timeouts
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000,
    socketTimeout: 10000
});

// Verify transporter on startup
transporter.verify(function(error, success) {
    if (error) {
        console.log('❌ Email service error:', error.message);
    } else {
        console.log('✅ Email service ready');
    }
});

// Generate 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send verification email (non-blocking)
async function sendVerificationEmail(email, name, otp) {
    const mailOptions = {
        from: process.env.EMAIL_FROM || `ThoughtStream <${process.env.EMAIL_USER}>`,
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
                    <div style="background: linear-gradient(135deg, #a855f7, #ec4899); padding: 40px 30px; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 28px;">ThoughtStream</h1>
                        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 14px;">Share your thoughts with the world</p>
                    </div>
                    <div style="padding: 40px 30px;">
                        <h2 style="color: #1a1a2e; margin: 0 0 20px; font-size: 22px;">Hi ${name}! 👋</h2>
                        <p style="color: #6b7280; line-height: 1.6; margin: 0 0 25px;">
                            Welcome to ThoughtStream! Your verification code is:
                        </p>
                        <div style="background: linear-gradient(135deg, #f3e8ff, #fce7f3); border-radius: 16px; padding: 30px; text-align: center; margin: 25px 0;">
                            <div style="font-size: 40px; font-weight: 700; letter-spacing: 8px; color: #a855f7; font-family: 'Courier New', monospace;">
                                ${otp}
                            </div>
                        </div>
                        <p style="color: #9ca3af; font-size: 13px; margin: 20px 0 0; line-height: 1.5;">
                            ⏰ This code expires in <strong>10 minutes</strong>.
                        </p>
                    </div>
                    <div style="background: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                        <p style="color: #9ca3af; font-size: 12px; margin: 0;">© 2024 ThoughtStream</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        // Send with timeout promise
        const sendPromise = transporter.sendMail(mailOptions);
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Email timeout')), 15000)
        );
        
        await Promise.race([sendPromise, timeoutPromise]);
        console.log('✅ Verification email sent to:', email);
        return { success: true };
    } catch (error) {
        console.error('❌ Email send error:', error.message);
        return { success: false, error: error.message };
    }
}

// Send email in background (fire and forget)
function sendVerificationEmailAsync(email, name, otp) {
    // Don't wait for this - just fire and forget
    sendVerificationEmail(email, name, otp).catch(err => {
        console.error('Background email error:', err.message);
    });
}

module.exports = {
    generateOTP,
    sendVerificationEmail,
    sendVerificationEmailAsync
};