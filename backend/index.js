require('dotenv').config(); 
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

console.log('📦 DB_NAME =', process.env.DB_NAME);
// ROUTES
app.use('/auth', require('./routes/auth'));
app.use('/rooms', require('./routes/rooms'));
app.use('/tenants', require('./routes/tenants'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/finance', require('./routes/finance'));
app.use('/receipts', require('./routes/receipts'));
app.use('/profile', require('./routes/profile'));




app.get('/', (req, res) => {
    res.json({ status: 'SIMKOS BACKEND OK' });
});

app.listen(4444, () => {
    console.log('🚀 Backend running on port 4444');
});
