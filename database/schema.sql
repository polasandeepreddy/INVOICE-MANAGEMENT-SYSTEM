-- MySQL Database Schema for Invoice Management System

CREATE DATABASE IF NOT EXISTS invoice_manager;
USE invoice_manager;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    full_name VARCHAR(255),
    username VARCHAR(100),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'super_admin', 'user') DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_email (email)
);

-- 2. Banks Table (Bank Master Data)
CREATE TABLE IF NOT EXISTS banks (
    id VARCHAR(50) PRIMARY KEY,
    bank_name VARCHAR(255) NOT NULL,
    account_number VARCHAR(50) NOT NULL UNIQUE,
    ifsc_code VARCHAR(20) NOT NULL,
    account_holder VARCHAR(255) NOT NULL,
    branch VARCHAR(255),
    is_default BOOLEAN DEFAULT FALSE,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_bank_name (bank_name),
    INDEX idx_account_number (account_number),
    INDEX idx_branch (branch),
    INDEX idx_is_default (is_default),
    INDEX idx_status (status)
);

-- 3. Clients Table (with Pay To Bank Mapping)
CREATE TABLE IF NOT EXISTS clients (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    branch VARCHAR(255),
    gst_number VARCHAR(50),
    phone VARCHAR(20),
    email VARCHAR(255),
    pay_to_bank_id VARCHAR(50) NULL,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (pay_to_bank_id) REFERENCES banks(id) ON DELETE SET NULL,
    INDEX idx_client_name (name),
    INDEX idx_branch (branch),
    INDEX idx_gst_number (gst_number),
    INDEX idx_pay_to_bank_id (pay_to_bank_id),
    INDEX idx_created_by (created_by)
);

-- 4. Invoices Table
CREATE TABLE IF NOT EXISTS invoices (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    created_by_name VARCHAR(255),
    invoice_number VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    business_name TEXT,
    business_address TEXT,
    client_id VARCHAR(50),
    client_name TEXT,
    client_address TEXT,
    client_branch VARCHAR(255),
    client_gst VARCHAR(50),
    client_phone VARCHAR(20),
    client_email VARCHAR(255),
    place_of_supply VARCHAR(100),
    description TEXT,
    currency VARCHAR(3) DEFAULT 'INR',
    base_amount DECIMAL(15, 2) DEFAULT 0,
    tax_rate DECIMAL(5, 2) DEFAULT 18,
    sgst DECIMAL(15, 2) DEFAULT 0,
    cgst DECIMAL(15, 2) DEFAULT 0,
    igst DECIMAL(15, 2) DEFAULT 0,
    total_amount DECIMAL(15, 2) DEFAULT 0,
    tds_percentage DECIMAL(5, 2) DEFAULT 0,
    tds_amount DECIMAL(15, 2) DEFAULT 0,
    net_amount DECIMAL(15, 2) DEFAULT 0,
    received DECIMAL(15, 2) DEFAULT 0,
    pending_amount DECIMAL(15, 2) DEFAULT 0,
    payment_status ENUM('paid', 'unpaid', 'cancelled') DEFAULT 'unpaid',
    approval_status ENUM('created', 'requested', 'final_approved') DEFAULT 'created',
    signature_data LONGTEXT,
    esign_signature LONGTEXT,
    cloud_signer_signature_url TEXT,
    signed_at TIMESTAMP NULL,
    bank_account_id VARCHAR(50),
    bank_name VARCHAR(255),
    bank_account_no VARCHAR(100),
    bank_ifsc VARCHAR(50),
    account_holder VARCHAR(255),
    remarks TEXT,
    manual_signature_status ENUM('Not Required', 'Pending Manual Signature', 'Manually Signed', 'Rejected') DEFAULT 'Not Required',
    manual_signed_file_id VARCHAR(255) NULL,
    manual_signed_file_url TEXT NULL,
    manual_signed_file_name VARCHAR(255) NULL,
    manual_signed_uploaded_at TIMESTAMP NULL,
    manual_signed_uploaded_by VARCHAR(50) NULL,
    cancellation_reason TEXT,
    cancelled_by VARCHAR(255),
    cancelled_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_invoice_number (invoice_number),
    INDEX idx_date (date),
    INDEX idx_payment_status (payment_status),
    INDEX idx_approval_status (approval_status),
    INDEX idx_manual_signature_status (manual_signature_status),
    INDEX idx_user_id (user_id)
);

-- 5. Invoice Items Table
CREATE TABLE IF NOT EXISTS invoice_items (
    id VARCHAR(50) PRIMARY KEY,
    invoice_id VARCHAR(50) NOT NULL,
    description TEXT,
    hsn VARCHAR(50),
    quantity INT DEFAULT 1,
    price DECIMAL(15, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

-- 6. State Mapping Table
CREATE TABLE IF NOT EXISTS state_mapping (
    code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

INSERT IGNORE INTO state_mapping (code, name) VALUES
('36', 'Telangana'),
('37', 'Andhra Pradesh'),
('29', 'Karnataka'),
('33', 'Tamil Nadu'),
('27', 'Maharashtra');

-- Demo Credentials Seed Data
-- Passwords below are bcrypt hashed (Adgjmptw@demouser, Adgjmptw@demoadmin, Adgjmptw@demosuperadmin)
INSERT INTO users (id, full_name, username, email, password, role) VALUES
('usr_demo_user', 'Demo User', 'Demouser', 'Demouser@gmail.com', '$2a$10$89D5i5vW1y/lAepq2f66E.tGq5p0l088qQ7C2eZ7s28hZ7J0507.m', 'user'),
('usr_demo_admin', 'Demo Admin', 'Demoadmin', 'Demoadmins@gmail.com', '$2a$10$Q7a79n.i6E63e9fE72e4G.uX.j.9F9aE.s2.H8d47b0e12.18181O', 'admin'),
('usr_demo_superadmin', 'Demo Super Admin', 'Demosuperadmin', 'Demosuperadmin@gmail.com', '$2a$10$R9n7u0t287h27J83e92.e.H8d47b0e12.18181O29u38n.28282O', 'super_admin')
ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), username=VALUES(username), role=VALUES(role);
