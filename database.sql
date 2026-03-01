-- =============================================
-- AROMA NATION - MySQL Database Schema
-- Run this file to set up your database
-- =============================================

CREATE DATABASE IF NOT EXISTS aroma_nation;
USE aroma_nation;

-- PRODUCTS
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(100),
  description TEXT,
  image_url VARCHAR(500),
  badge VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PRODUCT VARIANTS (different ml sizes with prices)
CREATE TABLE IF NOT EXISTS product_variants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  size_ml INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  stock INT DEFAULT 100,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- CUSTOMERS
CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- COUPONS
CREATE TABLE IF NOT EXISTS coupons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  discount_type ENUM('percentage', 'fixed') NOT NULL,
  discount_value DECIMAL(10,2) NOT NULL,
  min_order_amount DECIMAL(10,2) DEFAULT 0,
  max_uses INT DEFAULT 100,
  used_count INT DEFAULT 0,
  expires_at DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT,
  customer_name VARCHAR(150) NOT NULL,
  customer_email VARCHAR(150) NOT NULL,
  customer_phone VARCHAR(20),
  shipping_address TEXT NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  coupon_code VARCHAR(50),
  status ENUM('pending', 'confirmed', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
  payment_method VARCHAR(50) DEFAULT 'COD',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

-- ORDER ITEMS
CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  variant_id INT NOT NULL,
  product_name VARCHAR(100),
  size_ml INT,
  price DECIMAL(10,2) NOT NULL,
  quantity INT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
);

-- =============================================
-- SEED DATA
-- =============================================

INSERT INTO products (name, category, description, image_url, badge) VALUES
('Noir Royale', 'Oriental · Woody', 'A commanding blend of oud, dark amber, and smoked sandalwood.', 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=400&q=80', 'Bestseller'),
('Or Blanc', 'Floral · Musky', 'White jasmine, tuberose, and creamy musk — a feminine statement.', 'https://images.unsplash.com/photo-1594035910387-fea47794261f?w=400&q=80', 'New'),
('Velvet Oud', 'Oud · Spicy', 'Raw oud heart wrapped in saffron, rose, and warm leather base.', 'https://images.unsplash.com/photo-1541643600914-78b084683702?w=400&q=80', NULL),
('Lumière Noir', 'Citrus · Woody', 'Bergamot and neroli illuminate a deep vetiver and cedar base.', 'https://images.unsplash.com/photo-1616031036890-f3db1f4a7fd7?w=400&q=80', 'Limited'),
('Amber Mirage', 'Amber · Vanilla', 'Sun-warmed amber and tonka bean with a whisper of sweet vanilla.', 'https://images.unsplash.com/photo-1587017539504-67cfbddac569?w=400&q=80', NULL),
('Encens Sacré', 'Incense · Resinous', 'Sacred frankincense, myrrh, and dark labdanum for the soul.', 'https://images.unsplash.com/photo-1590156562745-5d9da3b5b2e5?w=400&q=80', 'Rare');

INSERT INTO product_variants (product_id, size_ml, price, stock) VALUES
(1, 30, 2499, 50), (1, 50, 3799, 80), (1, 100, 5999, 40),
(2, 30, 2199, 60), (2, 50, 3499, 90), (2, 100, 5499, 35),
(3, 30, 2999, 45), (3, 50, 4499, 70), (3, 100, 6999, 25),
(4, 30, 1999, 55), (4, 50, 3199, 85), (4, 100, 4999, 50),
(5, 30, 1799, 70), (5, 50, 2899, 100), (5, 100, 4599, 60),
(6, 30, 3499, 30), (6, 50, 5299, 45), (6, 100, 7999, 20);

INSERT INTO coupons (code, discount_type, discount_value, min_order_amount, max_uses, expires_at) VALUES
('WELCOME10', 'percentage', 10, 1000, 500, '2025-12-31'),
('FLAT500', 'fixed', 500, 3000, 200, '2025-06-30'),
('LUXURY20', 'percentage', 20, 5000, 100, '2025-12-31');
