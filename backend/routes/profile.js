const express = require('express')
const router = express.Router()
const db = require('../db')
const auth = require('../middleware/authMiddleware')
const dns = require('dns').promises 

// 🔥 IMPORT MAILER
const sendOtpEmail = require('../utils/mailer');

/* ======================
   UTIL: VALIDASI EMAIL
====================== */
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

// 1. COOLDOWN MAP (GANTI EMAIL)
// Mencegah user spam request ganti email
const otpCooldowns = new Map()

async function isDomainValid(email) {
    const domain = email.split('@')[1]
    try {
        const records = await dns.resolveMx(domain)
        return records && records.length > 0
    } catch (error) {
        return false
    }
}

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString()
}

/* ======================
   GET PROFILE
====================== */
router.get('/me', auth, (req, res) => {
    db.query(
        'SELECT email, nama_kos FROM users WHERE id=?',
        [req.user_id],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false })
            if (!rows.length) return res.status(404).json({ success: false })
            res.json({ success: true, data: rows[0] })
        }
    )
})

/* ======================
   UPDATE NAMA KOS
====================== */
router.put('/nama-kos', auth, (req, res) => {
    const { nama_kos } = req.body
    if (!nama_kos) return res.status(400).json({ success: false, message: 'Nama kos wajib' })

    db.query(
        'UPDATE users SET nama_kos=? WHERE id=?',
        [nama_kos, req.user_id],
        err => {
            if (err) return res.status(500).json({ success: false, message: 'Gagal update nama kos' })
            res.json({ success: true })
        }
    )
})

/* ======================
   REQUEST EMAIL CHANGE (OTP)
====================== */
router.post('/email/request', auth, async (req, res) => {
    const { email } = req.body
    const uid = req.user_id

    // 1. CEK COOLDOWN
    if (otpCooldowns.has(uid)) {
        const expireTime = otpCooldowns.get(uid)
        const now = Date.now()
        
        if (now < expireTime) {
            const sisaDetik = Math.ceil((expireTime - now) / 1000)
            return res.status(429).json({
                success: false,
                message: `Tunggu ${sisaDetik} detik lagi`
            })
        } else {
            otpCooldowns.delete(uid)
        }
    }
    
    // 2. VALIDASI INPUT
    if (!email) return res.status(400).json({ success: false, message: 'Email wajib diisi' })

    if (!emailRegex.test(email)) {
        return res.status(400).json({ success: false, message: 'Format email tidak valid' })
    }

    const isRealDomain = await isDomainValid(email)
    if (!isRealDomain) {
        return res.status(400).json({ success: false, message: 'Domain email tidak ditemukan' })
    }

    // 3. CEK DUPLIKAT DB
    db.query('SELECT id FROM users WHERE email = ?', [email], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' })
        
        if (rows.length > 0) {
            return res.status(400).json({ success: false, message: 'Email sudah terdaftar' })
        }

        // 4. GENERATE & KIRIM OTP
        const otp = generateOtp()
        
        // Set cooldown 60 detik
        otpCooldowns.set(uid, Date.now() + 60000)

        db.query(
            'UPDATE users SET pending_email=?, otp=? WHERE id=?',
            [email, otp, uid],
            async err => {
                if (err) {
                    otpCooldowns.delete(uid)
                    return res.status(500).json({ success: false, message: 'Gagal request email' })
                }

                try {
                    // 🔥 KIRIM OTP PAKE NODEMAILER
                    await sendOtpEmail(email, otp)
                    res.json({ success: true })
                } catch (e) {
                    otpCooldowns.delete(uid)
                    res.status(500).json({ success: false, message: 'Gagal kirim OTP' })
                }
            }
        )
    })
})

/* ======================
   VERIFY EMAIL OTP
====================== */
router.post('/email/verify', auth, (req, res) => {
    const { otp } = req.body
    if (!otp) return res.status(400).json({ success: false, message: 'OTP wajib' })

    db.query(
        'SELECT pending_email FROM users WHERE id=? AND otp=?',
        [req.user_id, otp],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false })
            if (!rows.length) return res.status(400).json({ success: false, message: 'OTP salah' })

            const newEmail = rows[0].pending_email

            db.query(
                'UPDATE users SET email=?, pending_email=NULL, otp=NULL WHERE id=?',
                [newEmail, req.user_id],
                err => {
                    if (err) {
                        if (err.code === 'ER_DUP_ENTRY') {
                            return res.status(400).json({ success: false, message: 'Email sudah digunakan' })
                        }
                        return res.status(500).json({ success: false })
                    }
                    res.json({ success: true })
                }
            )
        }
    )
})

/* ======================
   DELETE ACCOUNT
====================== */
router.delete('/clear-data', auth, (req, res) => {
    const uid = req.user_id;

    // 🔥 PERBAIKAN: Hapus juga tabel 'payments' dan 'expenses'
    const queries = [
        'DELETE FROM tenants WHERE user_id=?',
        'DELETE FROM rooms WHERE user_id=?',
        //'DELETE FROM receipts WHERE user_id=?',
        'DELETE FROM payments WHERE user_id=?', // Hapus Pemasukan
        'DELETE FROM expenses WHERE user_id=?'  // Hapus Pengeluaran
    ];

    // Jalankan query satu per satu
    // (Cara sederhana pakai loop biar tidak callback hell)
    let completed = 0;
    queries.forEach(sql => {
        db.query(sql, [uid], (err) => {
            if (err) console.error("Error reset data:", err);
            completed++;
            if (completed === queries.length) {
                res.json({ success: true, message: "Semua data berhasil direset" });
            }
        });
    });
});

// 2. HAPUS AKUN PERMANEN
router.delete('/delete-account', auth, (req, res) => {
    const uid = req.user_id;

    // 🔥 PERBAIKAN: Hapus keuangan dulu, baru hapus user
    const queries = [
        'DELETE FROM tenants WHERE user_id=?',
        'DELETE FROM rooms WHERE user_id=?',
        'DELETE FROM receipts WHERE user_id=?',
        'DELETE FROM payments WHERE user_id=?', // Hapus Pemasukan
        'DELETE FROM expenses WHERE user_id=?'  // Hapus Pengeluaran
    ];

    let completed = 0;
    queries.forEach(sql => {
        db.query(sql, [uid], (err) => {
            completed++;
            // Jika semua data pendukung sudah dihapus, baru hapus USERS
            if (completed === queries.length) {
                db.query('DELETE FROM users WHERE id=?', [uid], (err) => {
                    if (err) return res.status(500).json({ success: false });
                    res.json({ success: true, message: "Akun berhasil dihapus permanen" });
                });
            }
        });
    });
});

module.exports = router