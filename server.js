require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '-'))
});
const upload = multer({ storage });

const app = express();
const PORT = process.env.PORT || 3000;

// ─── DB CONNECTION ────────────────────────────────────────────────
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'aroma_nation',
  waitForConnections: true,
  connectionLimit: 10,
});

// ─── MIDDLEWARE ───────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ═══════════════════════════════════════════════════════════════════
//  PUBLIC API ROUTES
// ═══════════════════════════════════════════════════════════════════

// GET all active products with variants
app.get('/api/products', async (req, res) => {
  try {
    const [products] = await pool.query(
      'SELECT * FROM products WHERE is_active = 1 ORDER BY id'
    );
    for (const product of products) {
      const [variants] = await pool.query(
        'SELECT * FROM product_variants WHERE product_id = ? ORDER BY size_ml',
        [product.id]
      );
      product.variants = variants;
    }
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single product
app.get('/api/products/:id', async (req, res) => {
  try {
    const [[product]] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const [variants] = await pool.query('SELECT * FROM product_variants WHERE product_id = ? ORDER BY size_ml', [product.id]);
    product.variants = variants;
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// VALIDATE coupon
app.post('/api/coupons/validate', async (req, res) => {
  const { code, order_amount } = req.body;
  try {
    const [[coupon]] = await pool.query(
      'SELECT * FROM coupons WHERE code = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at >= CURDATE()) AND used_count < max_uses',
      [code]
    );
    if (!coupon) return res.status(404).json({ error: 'Invalid or expired coupon' });
    if (order_amount < coupon.min_order_amount)
      return res.status(400).json({ error: `Minimum order amount is ₹${coupon.min_order_amount}` });

    let discount = 0;
    if (coupon.discount_type === 'percentage') {
      discount = (order_amount * coupon.discount_value) / 100;
    } else {
      discount = coupon.discount_value;
    }
    res.json({ valid: true, coupon, discount: Math.round(discount) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PLACE ORDER
app.post('/api/orders', async (req, res) => {
  const { customer_name, customer_email, customer_phone, shipping_address, items, coupon_code, subtotal, discount_amount, total, payment_method, notes } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Upsert customer
    let customerId = null;
    if (customer_email) {
      const [[existing]] = await conn.query('SELECT id FROM customers WHERE email = ?', [customer_email]);
      if (existing) {
        customerId = existing.id;
        await conn.query('UPDATE customers SET name=?, phone=?, address=? WHERE id=?', [customer_name, customer_phone, shipping_address, customerId]);
      } else {
        const [result] = await conn.query(
          'INSERT INTO customers (name, email, phone, address) VALUES (?,?,?,?)',
          [customer_name, customer_email, customer_phone, shipping_address]
        );
        customerId = result.insertId;
      }
    }

    // Create order
    const [orderResult] = await conn.query(
      'INSERT INTO orders (customer_id, customer_name, customer_email, customer_phone, shipping_address, subtotal, discount_amount, total, coupon_code, payment_method, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [customerId, customer_name, customer_email, customer_phone, shipping_address, subtotal, discount_amount || 0, total, coupon_code || null, payment_method || 'COD', notes || null]
    );
    const orderId = orderResult.insertId;

    // Insert order items & update stock
    for (const item of items) {
      await conn.query(
        'INSERT INTO order_items (order_id, product_id, variant_id, product_name, size_ml, price, quantity) VALUES (?,?,?,?,?,?,?)',
        [orderId, item.product_id, item.variant_id, item.product_name, item.size_ml, item.price, item.quantity]
      );
      await conn.query('UPDATE product_variants SET stock = stock - ? WHERE id = ?', [item.quantity, item.variant_id]);
    }

    // Increment coupon usage
    if (coupon_code) {
      await conn.query('UPDATE coupons SET used_count = used_count + 1 WHERE code = ?', [coupon_code]);
    }

    await conn.commit();
    res.json({ success: true, order_id: orderId });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ═══════════════════════════════════════════════════════════════════
//  ADMIN AUTH
// ═══════════════════════════════════════════════════════════════════

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === (process.env.ADMIN_USERNAME || 'admin') && password === (process.env.ADMIN_PASSWORD || 'admin123')) {
    req.session.isAdmin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/admin/check', (req, res) => {
  res.json({ isAdmin: !!req.session.isAdmin });
});

// ═══════════════════════════════════════════════════════════════════
//  ADMIN PRODUCT ROUTES
// ═══════════════════════════════════════════════════════════════════

// GET all products (including inactive)
app.get('/api/admin/products', requireAdmin, async (req, res) => {
  try {
    const [products] = await pool.query('SELECT * FROM products ORDER BY id DESC');
    for (const p of products) {
      const [variants] = await pool.query('SELECT * FROM product_variants WHERE product_id = ? ORDER BY size_ml', [p.id]);
      p.variants = variants;
    }
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE product
app.post('/api/admin/products', requireAdmin, async (req, res) => {
  const { name, category, description, image_url, badge, is_active, variants } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT INTO products (name, category, description, image_url, badge, is_active) VALUES (?,?,?,?,?,?)',
      [name, category, description, image_url, badge || null, is_active !== false ? 1 : 0]
    );
    const productId = result.insertId;
    if (variants && variants.length) {
      for (const v of variants) {
        await conn.query('INSERT INTO product_variants (product_id, size_ml, price, stock) VALUES (?,?,?,?)', [productId, v.size_ml, v.price, v.stock || 100]);
      }
    }
    await conn.commit();
    res.json({ success: true, id: productId });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// UPDATE product
app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const { name, category, description, image_url, badge, is_active, variants } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'UPDATE products SET name=?, category=?, description=?, image_url=?, badge=?, is_active=? WHERE id=?',
      [name, category, description, image_url, badge || null, is_active !== false ? 1 : 0, req.params.id]
    );
    if (variants && variants.length) {
      await conn.query('DELETE FROM product_variants WHERE product_id = ?', [req.params.id]);
      for (const v of variants) {
        await conn.query('INSERT INTO product_variants (product_id, size_ml, price, stock) VALUES (?,?,?,?)', [req.params.id, v.size_ml, v.price, v.stock || 100]);
      }
    }
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// DELETE product
app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
//  ADMIN ORDER ROUTES
// ═══════════════════════════════════════════════════════════════════

app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = 'SELECT * FROM orders WHERE 1=1';
    const params = [];
    if (status) { query += ' AND status = ?'; params.push(status); }
    if (search) { query += ' AND (customer_name LIKE ? OR customer_email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    query += ' ORDER BY created_at DESC';
    const [orders] = await pool.query(query, params);
    for (const order of orders) {
      const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
      order.items = items;
    }
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/orders/:id/status', requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE orders SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
//  ADMIN CUSTOMER ROUTES
// ═══════════════════════════════════════════════════════════════════

app.get('/api/admin/customers', requireAdmin, async (req, res) => {
  try {
    const { search } = req.query;
    let query = 'SELECT c.*, COUNT(o.id) as order_count, SUM(o.total) as total_spent FROM customers c LEFT JOIN orders o ON c.id = o.customer_id WHERE 1=1';
    const params = [];
    if (search) { query += ' AND (c.name LIKE ? OR c.email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    query += ' GROUP BY c.id ORDER BY c.created_at DESC';
    const [customers] = await pool.query(query, params);
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
//  ADMIN COUPON ROUTES
// ═══════════════════════════════════════════════════════════════════

app.get('/api/admin/coupons', requireAdmin, async (req, res) => {
  try {
    const [coupons] = await pool.query('SELECT * FROM coupons ORDER BY created_at DESC');
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/coupons', requireAdmin, async (req, res) => {
  const { code, discount_type, discount_value, min_order_amount, max_uses, expires_at } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO coupons (code, discount_type, discount_value, min_order_amount, max_uses, expires_at) VALUES (?,?,?,?,?,?)',
      [code.toUpperCase(), discount_type, discount_value, min_order_amount || 0, max_uses || 100, expires_at || null]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/coupons/:id', requireAdmin, async (req, res) => {
  const { discount_type, discount_value, min_order_amount, max_uses, expires_at, is_active } = req.body;
  try {
    await pool.query(
      'UPDATE coupons SET discount_type=?, discount_value=?, min_order_amount=?, max_uses=?, expires_at=?, is_active=? WHERE id=?',
      [discount_type, discount_value, min_order_amount, max_uses, expires_at || null, is_active ? 1 : 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/coupons/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM coupons WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DASHBOARD STATS ─────────────────────────────────────────────
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const [[{ total_orders }]] = await pool.query('SELECT COUNT(*) as total_orders FROM orders');
    const [[{ total_revenue }]] = await pool.query("SELECT COALESCE(SUM(total),0) as total_revenue FROM orders WHERE status != 'cancelled'");
    const [[{ total_customers }]] = await pool.query('SELECT COUNT(*) as total_customers FROM customers');
    const [[{ total_products }]] = await pool.query('SELECT COUNT(*) as total_products FROM products WHERE is_active = 1');
    const [recent_orders] = await pool.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 5');
    res.json({ total_orders, total_revenue, total_customers, total_products, recent_orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SERVE HTML PAGES ─────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/cart', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cart.html')));
app.get('/checkout', (req, res) => res.sendFile(path.join(__dirname, 'public', 'checkout.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'index.html')));

app.post('/api/upload', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ─── START ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌹 Aroma Nation server running at http://localhost:${PORT}`);
  console.log(`🛠️  Admin panel: http://localhost:${PORT}/admin\n`);
});
