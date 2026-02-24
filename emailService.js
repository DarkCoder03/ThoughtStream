const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

console.log('📧 Email Service: Resend');
console.log('   API Key:', process.env.RESEND_API_KEY ? '✓ Set' : '✗ NOT SET');

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, name, otp) {
    console.log('📤 Sending verification email...');
    console.log('   To:', email);
    console.log('   OTP:', otp);

    if (!process.env.RESEND_API_KEY) {
        console.error('❌ RESEND_API_KEY not configured');
        return { success: false, error: 'Email service not configured' };
    }

    try {
        const { data, error } = await resend.emails.send({
            // USE YOUR VERIFIED DOMAIN HERE! 👇
            from: 'ThoughtStream <noreply@thoughtstream.com>',
            to: [email],
            subject: `🔐 Your verification code is ${otp}`,
            html: `
                <!DOCTYPE html>
                <html>
                <body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background-color:#f8f9fa;">
                    <div style="max-width:500px;margin:40px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.1);">
                        <div style="background:linear-gradient(135deg,#a855f7,#ec4899);padding:40px 30px;text-align:center;">
                            <h1 style="color:white;margin:0;font-size:28px;">ThoughtStream</h1>
                            <p style="color:rgba(255,255,255,0.9);margin:10px 0 0;font-size:14px;">Share your thoughts with the world</p>
                        </div>
                        <div style="padding:40px 30px;">
                            <h2 style="color:#1a1a2e;margin:0 0 20px;font-size:22px;">Hi ${name}! 👋</h2>
                            <p style="color:#6b7280;line-height:1.6;margin:0 0 25px;">
                                Your verification code is:
                            </p>
                            <div style="background:linear-gradient(135deg,#f3e8ff,#fce7f3);border-radius:16px;padding:30px;text-align:center;margin:25px 0;">
                                <div style="font-size:40px;font-weight:700;letter-spacing:8px;color:#a855f7;font-family:'Courier New',monospace;">
                                    ${otp}
                                </div>
                            </div>
                            <p style="color:#9ca3af;font-size:13px;margin:20px 0 0;">
                                ⏰ Expires in <strong>10 minutes</strong>
                            </p>
                        </div>
                        <div style="background:#f9fafb;padding:20px 30px;text-align:center;border-top:1px solid #e5e7eb;">
                            <p style="color:#9ca3af;font-size:12px;margin:0;">© 2024 ThoughtStream</p>
                        </div>
                    </div>
                </body>
                </html>
            `,
            text: `Hi ${name}! Your ThoughtStream verification code is: ${otp}. Expires in 10 minutes.`
        });

        if (error) {
            console.error('❌ Resend error:', error);
            return { success: false, error: error.message };
        }

        console.log('✅ Email sent! ID:', data?.id);
        return { success: true, emailId: data?.id };

    } catch (err) {
        console.error('❌ Email error:', err.message);
        return { success: false, error: err.message };
    }
}

function sendVerificationEmailAsync(email, name, otp) {
    sendVerificationEmail(email, name, otp)
        .then(result => {
            if (result.success) console.log('✅ Email sent to:', email);
            else console.error('❌ Email failed:', result.error);
        })
        .catch(err => console.error('❌ Email error:', err.message));
}

module.exports = { generateOTP, sendVerificationEmail, sendVerificationEmailAsync };