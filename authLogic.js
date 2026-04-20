const nodemailer = require('nodemailer');

// Configure your email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail', // You can use Outlook/SendGrid too
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const sendOTPMail = async (targetEmail, otp) => {
    const mailOptions = {
        from: '"Smart Study Support" <no-reply@smartstudy.com>',
        to: targetEmail,
        subject: 'Your Verification Code',
        html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee;">
                <h2 style="color: #6366f1;">Smart Study Verification</h2>
                <p>Use the code below to complete your registration:</p>
                <h1 style="background: #f4f4f4; padding: 10px; display: inline-block;">${otp}</h1>
                <p>This code expires in 10 minutes.</p>
            </div>`
    };
    return transporter.sendMail(mailOptions);
};

module.exports = { generateOTP, sendOTPMail };
