const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')))
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inisialisasi Database SQLite yang Aman untuk Railway Volume
const dbFolder = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname);

// Gunakan try-catch agar jika folder belum siap, aplikasi tidak langsung crash
let dbFile = 'database.sqlite';
try {
  const dbFolder = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
  if (!fs.existsSync(dbFolder)) {
    fs.mkdirSync(dbFolder, { recursive: true });
  }
  dbFile = path.join(dbFolder, 'database.sqlite');
} catch (e) {
  console.log('Menggunakan direktori lokal:', e.message);
  dbFile = path.join(__dirname, 'database.sqlite');
}

const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    console.error('Gagal terhubung ke database SQLite:', err.message);
  } else {
    console.log('Terhubung ke database SQLite di:', dbFile);
    initDb();
  }
});

// Setup Tabel Database
function initDb() {
  db.serialize(() => {
    // Tabel Produk
    db.run(`CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT,
      name TEXT,
      type TEXT,
      category TEXT,
      retail_price INTEGER,
      wholesale_price INTEGER,
      stock INTEGER,
      image TEXT,
      p REAL,
      l REAL,
      t REAL
    )`);

    // Tabel Transaksi (dengan kolom customer)
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice TEXT,
      date TEXT,
      price_mode TEXT,
      total INTEGER,
      paid INTEGER,
      change_amount INTEGER,
      customer TEXT,
      items_json TEXT
    )`, () => {
      // Pastikan kolom customer ada jika tabel sudah ada sebelumnya
      db.run(`ALTER TABLE transactions ADD COLUMN customer TEXT`, () => {});
    });

    // Tabel Keuangan / Modal
    db.run(`CREATE TABLE IF NOT EXISTS financials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      description TEXT,
      type TEXT,
      amount INTEGER
    )`);

    // Tambah data awal produk jika masih kosong
    db.get(`SELECT COUNT(*) as count FROM products`, (err, row) => {
      if (row.count === 0) {
        const stmt = db.prepare(`INSERT INTO products (code, name, type, category, retail_price, wholesale_price, stock, image, p, l, t) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        stmt.run('IKN-01', 'Ikan Cupang Hias Plakat', 'ikan', 'Ikan Hias', 15000, 10000, 25, '', null, null, null);
        stmt.run('PAK-01', 'Pelet Ikan 100gr', 'makanan', 'Makanan Ikan', 8000, 5000, 40, '', null, null, null);
        stmt.run('MSN-01', 'Mesin Aerator Oksigen 1 Lubang', 'mesin', 'Mesin & Alat', 45000, 35000, 15, '', null, null, null);
        stmt.run('AQ-01', 'Aquarium Standar 60x30x30', 'aquarium', 'Aquarium 5mm', 95000, 75000, 8, '', 60, 30, 30);
        stmt.finalize();
        console.log('Data awal produk berhasil dimasukkan.');
      }
    });
  });
}

// ==================== ENDPOINT API ====================

// Login Sederhana
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === '123') {
    res.json({ success: true, user: { name: 'Admin Petshop 99', role: 'Owner / Kasir' } });
  } else if (username === 'kasir' && password === '123') {
    res.json({ success: true, user: { name: 'Kasir Petshop', role: 'Kasir' } });
  } else {
    res.status(401).json({ error: 'Username atau password salah! (Gunakan admin / 123)' });
  }
});

// Ambil Semua Produk
app.get('/api/products', (req, res) => {
  db.all(`SELECT * FROM products ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Tambah Produk Baru
app.post('/api/products', (req, res) => {
  const { code, name, type, category, retail_price, wholesale_price, stock, image, p, l, t } = req.body;
  const query = `INSERT INTO products (code, name, type, category, retail_price, wholesale_price, stock, image, p, l, t) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(query, [code, name, type, category, retail_price, wholesale_price, stock, image, p, l, t], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id: this.lastID });
  });
});

// Update Produk
app.put('/api/products/:id', (req, res) => {
  const { code, name, type, category, retail_price, wholesale_price, stock, image, p, l, t } = req.body;
  const query = `UPDATE products SET code = ?, name = ?, type = ?, category = ?, retail_price = ?, wholesale_price = ?, stock = ?, image = COALESCE(NULLIF(?, ''), image), p = ?, l = ?, t = ? WHERE id = ?`;
  db.run(query, [code, name, type, category, retail_price, wholesale_price, stock, image, p, l, t, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Hapus Produk
app.delete('/api/products/:id', (req, res) => {
  db.run(`DELETE FROM products WHERE id = ?`, [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Ambil Riwayat Transaksi
app.get('/api/transactions', (req, res) => {
  db.all(`SELECT * FROM transactions ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Simpan Transaksi & Nama Pelanggan Serta Kurangi Stok
app.post('/api/transactions', (req, res) => {
  const { price_mode, total, paid, change_amount, customer, items } = req.body;
  const invoice = 'INV-' + Date.now();
  const date = new Date().toISOString();
  const customerName = customer && customer.trim() !== '' ? customer.trim() : 'Umum';

  db.serialize(() => {
    db.run(
      `INSERT INTO transactions (invoice, date, price_mode, total, paid, change_amount, customer, items_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoice, date, price_mode, total, paid, change_amount, customerName, JSON.stringify(items)],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });

        const newId = this.lastID;
        const updateStmt = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?");
        items.forEach(item => {
          updateStmt.run(item.qty, item.id);
        });
        updateStmt.finalize();

        // Catat otomatis ke keuangan harian sebagai omzet
        db.run(`INSERT INTO financials (date, description, type, amount) VALUES (?, ?, ?, ?)`, [date.slice(0, 10), `Penjualan ${invoice} (${customerName})`, 'omzet', total]);

        res.json({
          success: true,
          transaction: { id: newId, invoice, date, price_mode, total, paid, change_amount, customer: customerName, items }
        });
      }
    );
  });
});

// Hapus Transaksi Tertentu
app.delete('/api/transactions/:id', (req, res) => {
  db.run(`DELETE FROM transactions WHERE id = ?`, [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Hapus Semua Riwayat Transaksi
app.delete('/api/transactions', (req, res) => {
  db.run(`DELETE FROM transactions`, [], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Ambil Catatan Keuangan & Modal
app.get('/api/financials', (req, res) => {
  db.all(`SELECT * FROM financials ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Tambah Catatan Modal / Pengeluaran
app.post('/api/financials', (req, res) => {
  const { date, description, type, amount } = req.body;
  db.run(`INSERT INTO financials (date, description, type, amount) VALUES (?, ?, ?, ?)`, [date, description, type, amount], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id: this.lastID });
  });
});

// Hapus Catatan Keuangan
app.delete('/api/financials/:id', (req, res) => {
  db.run(`DELETE FROM financials WHERE id = ?`, [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Jalankan Server
app.listen(PORT, () => {
  console.log(`Server Petshop & Aquarium 99 berjalan di http://localhost:${PORT}`);
});