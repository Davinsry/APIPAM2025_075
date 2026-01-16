const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/authMiddleware');
const dns = require('dns').promises; // 🔥 WAJIB: Untuk Cek Domain

// 🔥 IMPORT MAILER
const sendOtpEmail = require('../utils/mailer');

/* ======================
   CONFIG & UTILS
====================== */

// 1. REGEX EMAIL
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// 2. COOLDOWN MAP (Opsional, saat ini tidak dipakai karena logic DB lebih kuat)
const loginCooldowns = new Map();

// 3. GENERATE OTP
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// 4. CEK MX RECORD
async function isDomainValid(email) {
    const domain = email.split('@')[1];
    try {
        const records = await dns.resolveMx(domain);
        return records && records.length > 0;
    } catch (error) {
        return false;
    }
}

/* ======================
   REGISTER
====================== */
router.post('/register', async (req, res) => {
    let { email, nama_kos } = req.body;

    // 1. Cek Kelengkapan
    if (!email || !nama_kos) {
        return res.status(400).json({ success: false, message: 'Data tidak lengkap' });
    }

    // 🔥 Bersihkan Data
    email = email.trim().toLowerCase();
    nama_kos = nama_kos.trim();

    // 2. VALIDASI REGEX
    if (!emailRegex.test(email)) {
        return res.status(400).json({
            success: false,
            message: 'Format email tidak valid (contoh: nama@email.com)'
        });
    }

    // 3. VALIDASI DOMAIN
    const isRealDomain = await isDomainValid(email);
    if (!isRealDomain) {
        return res.status(400).json({
            success: false,
            message: 'Domain email tidak valid atau tidak ditemukan'
        });
    }

    // 4. CEK APAKAH EMAIL SUDAH ADA
    const checkSql = 'SELECT id FROM users WHERE email = ?';
    
    db.query(checkSql, [email], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });

        if (rows.length > 0) {
            return res.json({ 
                success: false,
                message: 'Email sudah terdaftar' 
            });
        }

        // 5. INSERT DATA BARU
        const insertSql = `INSERT INTO users (email, nama_kos) VALUES (?, ?)`;

        db.query(insertSql, [email, nama_kos], (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.json({ success: false, message: 'Email sudah terdaftar' });
                }
                return res.status(500).json({ success: false, message: 'Gagal daftar' });
            }

            return res.json({
                success: true,
                user_id: result.insertId
            });
        });
    });
});

/* ======================
   LOGIN (GENERATE OTP + EXPIRATION)
====================== */
router.post('/login', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, message: 'Email wajib diisi' });
    }

    const otp = generateOtp();

    // 🔥 UPDATE UTAMA 1: Simpan OTP + Waktu Expired (5 Menit dari sekarang)
    db.query(
        `UPDATE users 
         SET otp = ?, 
             otp_expires = DATE_ADD(NOW(), INTERVAL 5 MINUTE) 
         WHERE email = ?`,
        [otp, email],
        async (err, result) => {
            if (err) {
                console.error('LOGIN DB ERROR:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }

            if (!result || result.affectedRows === 0) {
                return res.json({ success: false, message: 'Email tidak ditemukan' });
            }

            // 🔥 UPDATE UTAMA 2: Fire & Forget (Tanpa Await)
            // Email dikirim di background agar respon ke HP instan
            sendOtpEmail(email, otp).catch(e => {
                console.error("⚠️ Email gagal terkirim di background:", e);
            });

            // Respon Instan ke Android
            return res.json({
                success: true,
                message: 'OTP sedang dikirim'
            });
        }
    );
});

/* ======================
   VERIFY OTP (CEK WAKTU)
====================== */
router.post('/verify', (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ success: false, message: 'Email dan OTP wajib diisi' });
    }

    // 🔥 Ambil ID dan otp_expires untuk dicek
    db.query(
        'SELECT id, otp_expires FROM users WHERE email=? AND otp=?',
        [email, otp],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: 'Server error' });

            // 1. Cek Apakah OTP Cocok?
            if (!rows || rows.length === 0) {
                return res.json({ success: false, message: 'OTP salah' });
            }

            const user = rows[0];
            const now = new Date();
            const expires = new Date(user.otp_expires);

            // 2. 🔥 Validasi Waktu: Apakah sekarang > waktu expired?
            if (now > expires) {
                return res.json({ 
                    success: false, 
                    message: 'Kode OTP sudah kedaluwarsa. Silakan kirim ulang.' 
                });
            }

            // 3. Jika Valid & Aman -> Generate Token
            const token = jwt.sign(
                { user_id: user.id },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            // 4. Bersihkan OTP & Expires
            db.query('UPDATE users SET otp=NULL, otp_expires=NULL WHERE id=?', [user.id]);
            
            return res.json({ success: true, token });
        }
    );
});

/* ======================
   GET PROFILE
====================== */
router.get('/me', auth, (req, res) => {
    db.query('SELECT email, nama_kos FROM users WHERE id = ?', [req.user_id], (err, rows) => {
        if (err) return res.status(500).json({ success: false });
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
        
        res.json({
            success: true,
            data: rows[0]
        });
    });
});

module.exports = router;