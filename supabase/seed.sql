-- =========================================================
-- SEED INITIAL DATA FOR SULTAN SEAFOOD ERP
-- =========================================================

-- 1. Insert Suppliers
INSERT INTO public.suppliers (id, name, contact_name, phone, address, status) VALUES
('a1000000-0000-0000-0000-000000000001', 'UD Nelayan Maju', 'Pak Slamet', '081234567890', 'Pelabuhan Muara Baru, Jakarta Utara', 'ACTIVE'),
('a2000000-0000-0000-0000-000000000002', 'CV Bahari Lestari', 'Bu Wati', '082345678901', 'Jl. Ikan Mujair No. 12, Muara Angke', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- 2. Insert Products
INSERT INTO public.products (id, sku, name, category, default_unit, default_selling_price, status) VALUES
('b0000000-0000-0000-0000-000000000001', 'SKU-001', 'Ikan Kakap Merah', 'Ikan', 'kg', 95000.00, 'ACTIVE'),
('b0000000-0000-0000-0000-000000000002', 'SKU-002', 'Udang Vannamei', 'Udang', 'kg', 120000.00, 'ACTIVE'),
('b0000000-0000-0000-0000-000000000003', 'SKU-003', 'Cumi-cumi Segar', 'Cumi', 'kg', 75000.00, 'ACTIVE'),
('b0000000-0000-0000-0000-000000000004', 'SKU-004', 'Kepiting Rajungan', 'Kepiting', 'kg', 180000.00, 'ACTIVE'),
('b0000000-0000-0000-0000-000000000005', 'SKU-005', 'Ikan Kerapu', 'Ikan', 'kg', 145000.00, 'ACTIVE'),
('b0000000-0000-0000-0000-000000000006', 'SKU-006', 'Lobster Air Laut', 'Lobster', 'ekor', 350000.00, 'ACTIVE')
ON CONFLICT (sku) DO NOTHING;

-- 3. Insert Product Costs (HPP)
INSERT INTO public.product_costs (product_id, supplier_id, unit_cost, notes) VALUES
('b0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 68000.00, 'Harga beli dari Pak Slamet'),
('b0000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 88000.00, 'Udang kualitas grade A'),
('b0000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000002', 52000.00, 'Cumi muara angke');

-- 4. Insert Customers
INSERT INTO public.customers (id, name, contact_name, phone, email, billing_address, payment_term_days, status) VALUES
('c0000000-0000-0000-0000-000000000001', 'Restoran Seafood Bahari', 'Pak Herman', '0211234567', 'herman@baharirest.com', 'Jl. Pantai Indah No. 45, Jakarta Utara', 30, 'ACTIVE'),
('c0000000-0000-0000-0000-000000000002', 'RM Nelayan Asli', 'Bu Susi', '0218765432', 'susi@nelayanasli.com', 'Jl. Kebon Jeruk No. 12, Jakarta Barat', 14, 'ACTIVE'),
('c0000000-0000-0000-0000-000000000003', 'Hotel Grand Marina', 'Chef Kevin', '0215556789', 'procurement@grandmarina.id', 'Jl. Marina Boulevard No. 1, Jakarta Utara', 45, 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- 5. Insert Expenses
INSERT INTO public.expenses (category, description, amount, expense_date) VALUES
('Gaji', 'Gaji karyawan gudang bulan Juli 2026', 8500000.00, CURRENT_DATE),
('Sewa', 'Sewa gudang penyimpanan es Juli 2026', 3500000.00, CURRENT_DATE),
('Listrik & Air', 'Tagihan PLN & PAM gudang', 850000.00, CURRENT_DATE);
