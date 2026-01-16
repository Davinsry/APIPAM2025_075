const mysql = require('mysql2');

// Gunakan createPool agar koneksi tidak putus saat idle (auto-reconnect)
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10, // Bisa menangani hingga 10 koneksi bersamaan
    queueLimit: 0
});

// Test koneksi awal (Optional, supaya log console tetap cantik)
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ DB Error:', err.message);
    } else {
        console.log('✅ MariaDB Connected via Pool to', process.env.DB_NAME);
        connection.release(); // Penting: kembalikan koneksi ke pool setelah cek
    }
});

module.exports = db;