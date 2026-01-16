const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/authMiddleware');

// 1. TAMBAH PENYEWA (POST /tenants)
router.post('/', auth, (req, res) => {
    const {
        room_id, nama, no_hp, pekerjaan,
        tanggal_checkin, tanggal_checkout,
        metode_pembayaran, jumlah, status
    } = req.body;

    if (!room_id || !nama || !tanggal_checkin) {
        return res.status(400).json({ success: false, message: 'Data wajib diisi' });
    }

    const sql = `
        INSERT INTO tenants
        (user_id, room_id, nama, no_hp, pekerjaan, tanggal_checkin, tanggal_checkout, metode_pembayaran, jumlah, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sql,
        [req.user_id, room_id, nama, no_hp, pekerjaan, tanggal_checkin, tanggal_checkout, metode_pembayaran, jumlah || 0, status || 'BOOKING'],
        (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ success: false, message: 'Gagal tambah' });
            }

            const tenantId = result.insertId;

            // 🔥 A. Update Status Kamar
            const statusKamar = (status === 'LUNAS') ? 'ISI' : 'BOOKING';
            db.query('UPDATE rooms SET status=? WHERE id=?', [statusKamar, room_id]);

            // 🔥 B. CATAT PEMBAYARAN (Hanya jika LUNAS)
            if (status === 'LUNAS' && jumlah > 0) {
                db.query(
                    `INSERT INTO payments (user_id, tenant_id, judul, jumlah, tanggal) VALUES (?, ?, ?, ?, ?)`,
                    [req.user_id, tenantId, `Sewa Awal - ${nama}`, jumlah, tanggal_checkin]
                );
            }

            res.json({ success: true, message: 'Penyewa ditambahkan' });
        }
    );
});

// 2. ✅ EDIT DATA PENYEWA (PUT /tenants/:id) - UPDATED!
router.put('/:id', auth, (req, res) => {
    const tenantId = req.params.id;
    const {
        nama, no_hp, pekerjaan, tanggal_checkin, tanggal_checkout,
        metode_pembayaran, jumlah, status, room_id
    } = req.body;

    // Ambil 10 karakter pertama (YYYY-MM-DD)
    const tglMasuk = tanggal_checkin ? tanggal_checkin.substring(0, 10) : null;
    const tglKeluar = tanggal_checkout ? tanggal_checkout.substring(0, 10) : null;

    // 1. Ambil status lama dulu untuk pengecekan
    db.query('SELECT status FROM tenants WHERE id = ?', [tenantId], (err, rows) => {
        if (err || rows.length === 0) return res.status(500).json({ success: false });
        
        const oldStatus = rows[0].status;

        // 2. Update Data Tenant
        const sql = `
            UPDATE tenants SET 
            nama=?, no_hp=?, pekerjaan=?, tanggal_checkin=?, tanggal_checkout=?, 
            metode_pembayaran=?, jumlah=?, status=?
            WHERE id=? AND user_id=?
        `;

        db.query(sql,
            [nama, no_hp, pekerjaan, tglMasuk, tglKeluar, metode_pembayaran, jumlah, status, tenantId, req.user_id],
            (err, result) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ success: false, message: 'Gagal update' });
                }

                // 3. LOGIKA SINKRONISASI SALDO 🔥
                // Jika status berubah dari 'BOOKING' menjadi 'LUNAS', catat sebagai Pemasukan Baru
                if (oldStatus === 'BOOKING' && status === 'LUNAS') {
                    db.query(
                        `INSERT INTO payments (user_id, tenant_id, judul, jumlah, tanggal) VALUES (?, ?, ?, ?, ?)`,
                        [req.user_id, tenantId, `Pelunasan - ${nama}`, jumlah, tglMasuk],
                        (err) => {
                            if (err) console.error("Gagal catat pelunasan:", err);
                        }
                    );
                }

                // 4. Update Status Kamar (Opsional: Pastikan kamar jadi ISI)
                if (status === 'LUNAS' && room_id) {
                    db.query('UPDATE rooms SET status="ISI" WHERE id=?', [room_id]);
                }

                res.json({ success: true, message: 'Data diperbarui & Saldo disinkronkan' });
            }
        );
    });
});

// 3. CHECKOUT (POST /tenants/:id/checkout)
router.post('/:id/checkout', auth, (req, res) => {
    const tenantId = req.params.id;
    db.query('SELECT room_id FROM tenants WHERE id=? AND user_id=?', [tenantId, req.user_id], (err, rows) => {
        if (err || rows.length === 0) return res.status(404).json({ success: false });

        const roomId = rows[0].room_id;
        db.query('UPDATE rooms SET status="KOSONG" WHERE id=?', [roomId]);
        db.query('DELETE FROM tenants WHERE id=?', [tenantId], (e) => {
            if (e) return res.status(500).json({ success: false });
            res.json({ success: true, message: 'Checkout berhasil' });
        });
    });
});

// 4. 🔥 PERPANJANG SEWA (POST /tenants/:id/extend)
router.post('/:id/extend', auth, (req, res) => {
    const tenantId = req.params.id;
    const { tanggal_checkout_baru, nominal_tambahan } = req.body;

    if (!tanggal_checkout_baru || !nominal_tambahan) return res.status(400).json({success: false});

    // ✅ UPDATE DATA TENANT
    // Kita UPDATE kolom 'jumlah' dengan nominal_tambahan (DI-REPLACE, BUKAN DITAMBAH)
    db.query(
        `UPDATE tenants SET 
         tanggal_checkout = ?, 
         jumlah = ?  
         WHERE id = ? AND user_id = ?`,
        [tanggal_checkout_baru, nominal_tambahan, tenantId, req.user_id],
        (err) => {
            if (err) return res.status(500).json({success:false});

            // 2. Ambil Nama Tenant untuk judul pembayaran history
            db.query('SELECT nama FROM tenants WHERE id=?', [tenantId], (e, r) => {
                const namaTenant = r.length > 0 ? r[0].nama : 'Penyewa';
                
                // 3. Masukkan Uang ke Tabel PAYMENTS (Ini yang masuk ke Laporan Keuangan)
                db.query(
                    `INSERT INTO payments (user_id, tenant_id, judul, jumlah, tanggal) VALUES (?, ?, ?, ?, NOW())`,
                    [req.user_id, tenantId, `Perpanjangan - ${namaTenant}`, nominal_tambahan],
                    (errIns) => {
                        if(errIns) console.error(errIns);
                        res.json({success: true, message: 'Perpanjangan berhasil'});
                    }
                );
            });
        }
    );
});

module.exports = router;