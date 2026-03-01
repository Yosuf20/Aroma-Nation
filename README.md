# 🌹 Aroma Nation — Luxury Perfume Store

A full-stack perfume e-commerce website with Node.js backend, MySQL database, and a complete admin panel.

---

## 📁 Project Structure

```
aroma-nation/
├── server.js           ← Express backend (all API routes)
├── database.sql        ← MySQL schema + seed data
├── package.json
├── .env.example        ← Copy to .env and fill in your details
├── public/
│   ├── index.html      ← Customer storefront
│   ├── cart.html       ← Shopping cart
│   └── checkout.html   ← Checkout & order placement
└── admin/
    └── index.html      ← Full admin panel
```

---

## ⚙️ Setup Instructions

### 1. Install Node.js
Download from https://nodejs.org (v18 or higher recommended)

### 2. Install MySQL
Download from https://dev.mysql.com/downloads/installer/
Set up a root password during installation.

### 3. Set up the Database
Open MySQL Workbench or MySQL CLI and run:
```sql
source /path/to/aroma-nation/database.sql
```
Or paste the contents of `database.sql` into MySQL Workbench and execute.

### 4. Configure Environment
```bash
cp .env.example .env
```
Edit `.env` and fill in:
- `DB_PASSWORD` → your MySQL root password
- `SESSION_SECRET` → any random string
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` → your admin login

### 5. Install Dependencies
```bash
cd aroma-nation
npm install
```

### 6. Run the Server
```bash
npm start
# OR for auto-restart during development:
npm run dev
```

### 7. Open in Browser
- **Store:** http://localhost:3000
- **Admin Panel:** http://localhost:3000/admin
  - Default login: `admin` / `admin123`

---

## 🛠️ Features

### Customer Store
- Beautiful luxury dark theme
- All products loaded from database
- Size selector (30ml / 50ml / 100ml) with dynamic pricing
- Shopping cart (stored in browser)
- Coupon code validation
- Checkout form → places order in database

### Admin Panel
| Section | Features |
|---|---|
| **Dashboard** | Total orders, revenue, customers, products + recent orders |
| **Products** | Add / Edit / Delete products with multiple size variants |
| **Orders** | View all orders, filter by status, update order status |
| **Customers** | View all customers, order count, total spend |
| **Coupons** | Create / Edit / Delete coupons (% or fixed, expiry, min order) |

---

## 🔧 Customization

### Add More Products
Go to Admin Panel → Products → Add Product

### Change Admin Password
Edit `.env` file:
```
ADMIN_USERNAME=youradmin
ADMIN_PASSWORD=yourpassword
```

### Change Port
Edit `.env`:
```
PORT=8080
```

---

## 📦 Tech Stack
- **Backend:** Node.js + Express
- **Database:** MySQL (via mysql2)
- **Frontend:** Vanilla HTML/CSS/JS
- **Auth:** express-session
- **Fonts:** Google Fonts (Cinzel, Cormorant Garamond, Montserrat)
