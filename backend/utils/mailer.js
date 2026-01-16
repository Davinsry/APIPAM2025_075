const nodemailer = require('nodemailer');

// Konfigurasi Transporter Gmail
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'shizuseabusiness@gmail.com', // ✅ Email Kamu
        pass: 'yggi tdmr olqk dthw'         // ✅ App Password dari Google
    }
});

async function sendOtpEmail(toEmail, otp) {
    const mailOptions = {
        from: '"SimKos Admin" <shizuseabusiness@gmail.com>',
        to: toEmail,
        subject: 'Kode Verifikasi SimKos',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <h2 style="color: #000; text-align: center;">Verifikasi Akun SimKos</h2>
                <p>Halo,</p>
                <p>Terima kasih telah menggunakan SimKos. Berikut adalah kode verifikasi (OTP) Anda:</p>
                
                <div style="background-color: #f4f4f4; padding: 15px; text-align: center; border-radius: 5px; margin: 20px 0;">
                    <h1 style="color: #000; letter-spacing: 5px; margin: 0;">${otp}</h1>
                </div>

                <p>Kode ini berlaku selama <strong>5 menit</strong>. Mohon jangan berikan kode ini kepada siapa pun, termasuk pihak SimKos.</p>
                <br>
                <hr style="border: none; border-top: 1px solid #eee;">
                <p style="font-size: 12px; color: #888; text-align: center;">&copy; 2025 SimKos App Management</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Email OTP terkirim ke ${toEmail}`);
        return true;
    } catch (error) {
        console.error('❌ Gagal kirim email:', error);
        throw error;
    }
}

module.exports = sendOtpEmail;