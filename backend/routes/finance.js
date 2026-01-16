const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/authMiddleware');

router.get('/summary', auth, (req, res) => {
    const userId = req.user_id;

    // 1. Total Pemasukan (Semua Waktu) -> Untuk Hitung Saldo
    const qIncomeTotal = `SELECT SUM(jumlah) as total FROM payments WHERE user_id = ?`;
    
    // 2. Total Pengeluaran (Semua Waktu) -> Untuk Hitung Saldo
    const qExpenseTotal = `SELECT SUM(jumlah) as total FROM expenses WHERE user_id = ?`;

    // 3. 🔥 BARU: Pemasukan BULAN INI (Untuk Home Screen)
    const qIncomeMonth = `
        SELECT SUM(jumlah) as total 
        FROM payments 
        WHERE user_id = ? 
        AND MONTH(tanggal) = MONTH(CURRENT_DATE()) 
        AND YEAR(tanggal) = YEAR(CURRENT_DATE())
    `;

    // 4. History
    const qHistory = `SELECT * FROM view_transactions WHERE user_id = ? ORDER BY date DESC, created_at DESC LIMIT 20`;

    db.query(qIncomeTotal, [userId], (err, incRows) => {
        if (err) return res.status(500).json({success:false});
        const incomeTotal = incRows[0].total || 0;

        db.query(qExpenseTotal, [userId], (err, expRows) => {
            if (err) return res.status(500).json({success:false});
            const expenseTotal = expRows[0].total || 0;

            db.query(qIncomeMonth, [userId], (err, incMonthRows) => {
                if (err) return res.status(500).json({success:false});
                const incomeMonthly = incMonthRows[0].total || 0;

                db.query(qHistory, [userId], (err, histRows) => {
                    res.json({
                        success: true,
                        data: {
                            income: parseInt(incomeTotal),
                            expense: parseInt(expenseTotal),
                            balance: parseInt(incomeTotal) - parseInt(expenseTotal),
                            incomeMonthly: parseInt(incomeMonthly), // 🔥 Kirim data baru ini
                            history: histRows
                        }
                    });
                });
            });
        });
    });
});

// Tambah Pengeluaran (Tetap sama)
router.post('/expense', auth, (req, res) => {
    const { nama, jenis, jumlah } = req.body;
    const tanggal = new Date().toISOString().slice(0, 10);

    db.query(
        `INSERT INTO expenses (user_id, nama_kebutuhan, jenis_kebutuhan, jumlah, tanggal) VALUES (?, ?, ?, ?, ?)`,
        [req.user_id, nama, jenis, jumlah, tanggal],
        (err) => {
            if (err) return res.status(500).json({success:false, message: err.message});
            res.json({success: true, message: 'Pengeluaran dicatat'});
        }
    );
});

module.exports = router;