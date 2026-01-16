const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/authMiddleware');

const ALLOWED_STATUS = ['KOSONG', 'ISI', 'BOOKING']


// ✅ GET ALL ROOMS (WITH TENANT DATA)
router.get('/me', auth, (req, res) => {
    // Query diganti pake LEFT JOIN biar data tenant ikut keambil
    const sql = `
        SELECT 
            r.*, 
            t.id AS tenant_id,
            t.nama AS tenant_nama,
            t.no_hp AS tenant_no_hp,
            t.pekerjaan AS tenant_pekerjaan,
            t.tanggal_checkin AS tenant_tanggal_checkin,
            t.tanggal_checkout AS tenant_tanggal_checkout,
            t.metode_pembayaran AS tenant_metode_pembayaran,
            t.jumlah AS tenant_jumlah,
            t.status AS tenant_status
        FROM rooms r
        LEFT JOIN tenants t ON r.id = t.room_id
        WHERE r.user_id = ?
        ORDER BY r.id DESC
    `;

    db.query(sql, [req.user_id], (err, rows) => {
        if (err) {
            console.error(err)
            return res.status(500).json({ success: false, message: 'Gagal ambil data' })
        }

        // KITA FORMAT DATANYA BIAR SESUAI MODEL ANDROID
        // Android butuh object "tenant" di dalam "room"
        const formattedRooms = rows.map(row => {
            // Ambil data dasar room
            const roomData = {
                id: row.id,
                nomor_kamar: row.nomor_kamar,
                harga_bulanan: row.harga_bulanan,
                harga_mingguan: row.harga_mingguan,
                harga_harian: row.harga_harian,
                fasilitas: row.fasilitas,
                status: row.status,
                tenant: null // Default null
            };

            // Kalau ada tenant (id tidak null), masukin ke object tenant
            if (row.tenant_id) {
                roomData.tenant = {
                    id: row.tenant_id,
                    nama: row.tenant_nama,
                    no_hp: row.tenant_no_hp,
                    pekerjaan: row.tenant_pekerjaan,
                    tanggal_checkin: row.tenant_tanggal_checkin, // Format Date
                    tanggal_checkout: row.tenant_tanggal_checkout,
                    metode_pembayaran: row.tenant_metode_pembayaran,
                    jumlah: row.tenant_jumlah,
                    status: row.tenant_status
                };
            }

            return roomData;
        });

        res.json({
            success: true,
            data: formattedRooms
        })
    })
})

router.post('/me', auth, (req, res) => {
    const {
        nomor_kamar,
        harga_bulanan,
        harga_mingguan,
        harga_harian,
        fasilitas
    } = req.body

    if (!nomor_kamar) {
        return res.status(400).json({
            success: false,
            message: 'Nomor kamar wajib'
        })
    }

    db.query(
        `INSERT INTO rooms
        (user_id, nomor_kamar, harga_bulanan, harga_mingguan, harga_harian, fasilitas, status)
        VALUES (?, ?, ?, ?, ?, ?, 'KOSONG')`,
        [
            req.user_id,
            nomor_kamar,
            harga_bulanan || 0,
            harga_mingguan || 0,
            harga_harian || 0,
            fasilitas || ''
        ],
        (err, result) => {
            if (err) {
                console.error(err)
                return res.status(500).json({
                    success: false,
                    message: 'Gagal tambah kamar'
                })
            }

            res.json({
                success: true,
                room_id: result.insertId
            })
        }
    )
})

router.delete('/:id', auth, (req, res) => {
    const roomId = req.params.id

    // 1️⃣ Cek kamar milik user & status
    db.query(
        'SELECT status FROM rooms WHERE id=? AND user_id=?',
        [roomId, req.user_id],
        (err, rows) => {
            if (err) {
                console.error(err)
                return res.status(500).json({ success: false })
            }

            if (!rows || rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Kamar tidak ditemukan'
                })
            }

            if (rows[0].status !== 'KOSONG') {
                return res.status(403).json({
                    success: false,
                    message: 'Kamar tidak bisa dihapus'
                })
            }

            // 2️⃣ Hapus
            db.query(
                'DELETE FROM rooms WHERE id=? AND user_id=?',
                [roomId, req.user_id],
                err => {
                    if (err) {
                        console.error(err)
                        return res.status(500).json({ success: false })
                    }

                    res.json({ success: true })
                }
            )
        }
    )
})

// ✅ UPDATE KAMAR (PUT)
router.put('/:id', auth, (req, res) => {
    const roomId = req.params.id
    const {
        nomor_kamar,
        harga_bulanan,
        harga_mingguan,
        harga_harian,
        fasilitas
    } = req.body

    // Validasi sederhana
    if (!nomor_kamar) {
        return res.status(400).json({
            success: false,
            message: 'Nomor kamar wajib diisi'
        })
    }

    db.query(
        `UPDATE rooms 
         SET nomor_kamar=?, harga_bulanan=?, harga_mingguan=?, harga_harian=?, fasilitas=? 
         WHERE id=? AND user_id=?`,
        [
            nomor_kamar,
            harga_bulanan || 0,
            harga_mingguan || 0,
            harga_harian || 0,
            fasilitas || '',
            roomId,
            req.user_id
        ],
        (err, result) => {
            if (err) {
                console.error(err)
                return res.status(500).json({
                    success: false,
                    message: 'Gagal update kamar'
                })
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Kamar tidak ditemukan atau bukan milik Anda'
                })
            }

            res.json({
                success: true,
                message: 'Data kamar berhasil diperbarui'
            })
        }
    )
})

// 👇 WAJIB ADA DI PALING BAWAH!! JANGAN LUPA!!
module.exports = router;