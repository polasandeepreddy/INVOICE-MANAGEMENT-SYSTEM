const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const dotenv = require('dotenv');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const invoiceRoutes = require("./routes/invoiceRoutes");
const generateInvoicePDF = require('./utils/generateInvoicePDF');
const pdfManager = require('./utils/pdfManager');
const googleDrive = require('./utils/googleDrive');
const ExcelJS = require('exceljs');
const ExcelImporter = require('./utils/excelImporter');
const { PDFDocument, rgb } = require('pdf-lib');


const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

dotenv.config();

const app = express();

// ========== CORS CONFIGURATION ==========
const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'];

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, or same-origin)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || !process.env.CORS_ORIGIN) {
            return callback(null, true);
        }
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Authorization'],
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use("/api/invoice", invoiceRoutes);

// ========== DEFAULT BUSINESS CONSTANTS ==========
const DEFAULT_BUSINESS_NAME = 'JAYARAMA ASSOCIATES';
const DEFAULT_BUSINESS_ADDRESS = `Plot No: 12, Road No: 1A, CZECH COLONY,
SANATH NAGAR, HYDERABAD - 500018
Phone no. : 9866669777
Email : jayaramassociates@yahoo.com
PAN : AMIPM2958D
GSTIN : 36AMIPM2958D1ZY
State: 36-Telangana`;
const DEFAULT_LOCATION = 'Hyderabad';
const DEFAULT_PLACE_OF_SUPPLY = '36-Telangana';
const DEFAULT_TAX_RATE = 18;

// MySQL Database Connection
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'invoice_manager',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+05:30',
    namedPlaceholders: true
});

const promiseDb = db.promise();

// CloudSigner Configuration
const CLOUDSIGNER_URL = process.env.CLOUDSIGNER_URL;
const CLOUDSIGNER_API_KEY = process.env.CLOUDSIGNER_API_KEY;
const CLOUDSIGNER_CERTIFICATE_ID = process.env.CLOUDSIGNER_CERTIFICATE_ID;
const CERTIFICATE_SERIAL_NUMBER = process.env.CERTIFICATE_SERIAL_NUMBER || process.env.CLOUDSIGNER_CERTIFICATE_SERIAL_NUMBER;

// OTP Stores
const otpStore = new Map();
const userEmailOtpStore = new Map();
const deleteOtpStore = new Map();

// Configure email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Helper Functions
function getFinancialYear(dateInput) {
    const d = dateInput ? new Date(dateInput) : new Date();
    const validDate = isNaN(d.getTime()) ? new Date() : d;
    const year = validDate.getFullYear();
    const month = validDate.getMonth() + 1;

    if (month >= 4) {
        return `${year.toString().slice(-2)}-${(year + 1).toString().slice(-2)}`;
    } else {
        return `${(year - 1).toString().slice(-2)}-${year.toString().slice(-2)}`;
    }
}

function validateUsername(username) {
    const usernameRegex = /^[A-Z][A-Za-z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]*$/;
    return usernameRegex.test(username) && username.length >= 2;
}

function validateEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const trimmed = email.trim();
    // Standard RFC-compliant email regex accepting standard and international formats (e.g., .com, .co.in, .org, subdomains)
    // Rejects invalid strings without valid domain / @ (e.g., 'bhsdfebfjh.uihjhjbhudsiufhie')
    const emailRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return emailRegex.test(trimmed);
}

function calculateTaxAmounts(baseAmount, placeOfSupply, taxRate = DEFAULT_TAX_RATE) {
    const isIntraState = placeOfSupply && (
        placeOfSupply.includes('36') ||
        placeOfSupply.includes('Telangana') ||
        placeOfSupply.includes('36-Telangana')
    );

    const taxAmount = (baseAmount * taxRate) / 100;

    let result;
    if (isIntraState) {
        result = {
            baseAmount: baseAmount,
            sgst: parseFloat((taxAmount / 2).toFixed(2)),
            cgst: parseFloat((taxAmount / 2).toFixed(2)),
            igst: 0,
            totalAmount: parseFloat((baseAmount + taxAmount).toFixed(2)),
            taxRate: taxRate
        };
    } else {
        result = {
            baseAmount: baseAmount,
            sgst: 0,
            cgst: 0,
            igst: parseFloat(taxAmount.toFixed(2)),
            totalAmount: parseFloat((baseAmount + taxAmount).toFixed(2)),
            taxRate: taxRate
        };
    }

    return result;
}

function convertToWords(amount) {
    if (amount === 0) return 'Zero Rupees only';

    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
        'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function convert(n) {
        if (n < 20) return ones[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
        if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '');
        if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
        if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
        return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
    }

    const rupees = Math.floor(amount);
    const paise = Math.round((amount - rupees) * 100);

    let words = convert(rupees) + ' Rupees';
    if (paise > 0) {
        words += ' and ' + convert(paise) + ' Paise';
    }
    return words + ' only';
}

// PDF Helper Functions
const formatRupeesForPDF = (amount) => {
    if (amount === undefined || amount === null) return '₹0.00';
    const num = typeof amount === 'number' ? amount : parseFloat(amount);
    if (isNaN(num)) return '₹0.00';
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatIndianNumber = (amount) => {
    if (amount === undefined || amount === null) return '0';
    const num = typeof amount === 'number' ? amount : parseFloat(amount);
    if (isNaN(num)) return '0';
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};


const buildInvoiceHTML = (invoice) => {
    // Helper function to escape HTML and prevent XSS
    const escapeHtml = (str) => {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    // Sanitize URLs to prevent XSS
    const sanitizeUrl = (url) => {
        if (!url) return '';
        const urlStr = String(url).toLowerCase().trim();
        const dangerous = ['javascript:', 'data:text/html', 'vbscript:', 'file:'];
        if (dangerous.some(protocol => urlStr.startsWith(protocol))) {
            return '';
        }
        return url;
    };

    // Format date consistently
    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const formatAcrobatDate = (dateStr) => {
        const d = dateStr ? new Date(dateStr) : new Date();
        if (isNaN(d.getTime())) return '2026.08.11 13:50:19 +05\'30\'';
        const YYYY = d.getFullYear();
        const MM = String(d.getMonth() + 1).padStart(2, '0');
        const DD = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `${YYYY}.${MM}.${DD} ${hh}:${mm}:${ss} +05'30'`;
    };

    // Function to merge items with same HSN
    const mergeItemsByHSN = (items) => {
        if (!items || items.length === 0) return [];

        const grouped = new Map();

        items.forEach(item => {
            const hsn = item.hsn || '998399';
            const quantity = Number(item.quantity) || 1;
            const price = Number(item.price) || 0;
            const amount = quantity * price;

            if (grouped.has(hsn)) {
                const existing = grouped.get(hsn);
                if (item.description && item.description !== existing.description) {
                    existing.description = existing.description + ' + ' + item.description;
                }
                existing.quantity += quantity;
                const totalValue = (existing.price * (existing.quantity - quantity)) + amount;
                existing.price = totalValue / existing.quantity;
            } else {
                grouped.set(hsn, {
                    ...item,
                    description: item.description || 'PROFESSIONAL FEE',
                    quantity: quantity,
                    price: price
                });
            }
        });

        return Array.from(grouped.values());
    };

    // IMPROVED: Function to determine if same state (intra-state vs inter-state)
    const isSameState = (invoice) => {
        // Check explicit flag first
        if (invoice.same_state === true) return true;
        if (invoice.same_state === false) return false;

        // Get the place of supply (most important for tax calculation)
        let placeOfSupply = invoice.place_of_supply || '';

        // If place_of_supply is empty, try to get from client_state or default
        if (!placeOfSupply) {
            placeOfSupply = invoice.client_state || DEFAULT_PLACE_OF_SUPPLY || '36-Telangana';
        }

        // Convert to string and trim
        placeOfSupply = String(placeOfSupply).trim().toLowerCase();

        // Check if place of supply is Telangana (state code 36)
        const isTelangana = placeOfSupply.includes('36') ||
            placeOfSupply.includes('telangana') ||
            placeOfSupply === '36-telangana';

        // For this business (JAYARAMA ASSOCIATES), the business state is Telangana (36)
        // So same state = true only if place of supply is Telangana
        return isTelangana;
    };

    // Safely parse items if JSON string
    let rawItems = invoice.items;
    if (typeof rawItems === 'string') {
        try { rawItems = JSON.parse(rawItems); } catch (e) { rawItems = []; }
    }
    let items = Array.isArray(rawItems) && rawItems.length > 0 ? rawItems : [];

    // Extract database amounts
    const dbBase = parseFloat(invoice.base_amount || invoice.calculated_base_amount || invoice.amount || 0);
    const dbSgst = parseFloat(invoice.sgst || invoice.calculated_sgst || 0);
    const dbCgst = parseFloat(invoice.cgst || invoice.calculated_cgst || 0);
    const dbIgst = parseFloat(invoice.igst || invoice.calculated_igst || 0);
    const dbTotal = parseFloat(invoice.total_amount || invoice.calculated_total_amount || 0);
    const effectiveBase = dbBase > 0 ? dbBase : (dbTotal > 0 ? (dbSgst || dbCgst || dbIgst ? dbTotal - (dbSgst + dbCgst + dbIgst) : dbTotal / 1.18) : 0);

    const sameState = isSameState(invoice);

    let subtotal = 0;
    let sgst = 0;
    let cgst = 0;
    let igst = 0;
    let total = 0;

    if (items.length > 0) {
        // Heal items with missing or zero price using effectiveBase
        items = items.map(item => {
            const qty = Number(item.quantity) || 1;
            let pr = Number(item.price);
            if (isNaN(pr) || pr <= 0) {
                pr = effectiveBase > 0 ? effectiveBase / qty : 0;
            }
            return { ...item, quantity: qty, price: pr };
        });

        // Only merge if there are multiple items with same HSN
        const hasDuplicateHSN = items.length > 1 &&
            new Set(items.map(i => i.hsn || '998399')).size < items.length;
        if (hasDuplicateHSN) {
            items = mergeItemsByHSN(items);
        }
        subtotal = items.reduce(
            (sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.price) || 0)),
            0
        );
    } else {
        subtotal = effectiveBase;
        items = [{
            description: invoice.description || 'PROFESSIONAL FEE FOR SERVICES RENDERED',
            hsn: '998399',
            quantity: 1,
            price: subtotal
        }];
    }

    if (dbTotal > 0 && (dbSgst > 0 || dbCgst > 0 || dbIgst > 0)) {
        sgst = dbSgst;
        cgst = dbCgst;
        igst = dbIgst;
        total = dbTotal;
        if (subtotal === 0 && dbBase > 0) subtotal = dbBase;
        else if (subtotal === 0) subtotal = dbTotal - (sgst + cgst + igst);
    } else if (subtotal > 0) {
        if (sameState) {
            sgst = parseFloat((subtotal * 0.09).toFixed(2));
            cgst = parseFloat((subtotal * 0.09).toFixed(2));
            igst = 0;
        } else {
            sgst = 0;
            cgst = 0;
            igst = parseFloat((subtotal * 0.18).toFixed(2));
        }
        total = parseFloat((subtotal + sgst + cgst + igst).toFixed(2));
    } else if (dbTotal > 0) {
        total = dbTotal;
        subtotal = dbTotal;
    }

    const received = Number(invoice.received) || 0;
    const balance = parseFloat((total - received).toFixed(2));

    const parseNum = (val) => {
        if (val === undefined || val === null || val === '') return 0;
        const clean = String(val).replace(/,/g, '').trim();
        const num = parseFloat(clean);
        return isNaN(num) ? 0 : num;
    };

    const formatCurrency = (value) => {
        const num = parseNum(value);
        return `₹ ${num.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;
    };

    // Convert number to words
    const convertToWords = (amount) => {
        const num = parseNum(amount);
        if (num === 0) return 'Rupees Zero Only';

        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
            'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
            'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

        const numToWords = (n) => {
            if (n < 20) return ones[n];
            if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
            if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + numToWords(n % 100) : '');
            if (n < 100000) return numToWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + numToWords(n % 1000) : '');
            if (n < 10000000) return numToWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + numToWords(n % 100000) : '');
            return numToWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + numToWords(n % 10000000) : '');
        };

        const rupees = Math.floor(num);
        const paise = Math.round((num - rupees) * 100);

        let words = 'Rupees ' + numToWords(rupees);
        if (paise > 0) {
            words += ' and ' + numToWords(paise) + ' Paise';
        }
        return words + ' Only';
    };

    // Generate table rows
    const rows = items.map((item, index) => {
        const quantity = parseNum(item.quantity) || 1;
        const price = parseNum(item.price);
        const amount = parseNum(item.amount) || (quantity * price);

        return `
            <tr>
                <td style="text-align: center; padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 12px; border: none; color: #000000;">${index + 1}.</td>
                <td style="padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 12px; text-align: left; border: none; color: #000000;">${escapeHtml(item.description || 'PROFESSIONAL FEE')}</td>
                <td style="text-align: center; padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 12px; border: none; color: #000000;">${escapeHtml(item.hsn || '998399')}</td>
                <td style="text-align: center; padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 12px; border: none; color: #000000;">${quantity}</td>
                <td style="text-align: center; padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 12px; border: none; color: #000000;">${formatCurrency(price)}</td>
                <td style="text-align: left; padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 12px; border: none; color: #000000;">${formatCurrency(amount)}</td>
            </tr>
        `;
    }).join("");

    const COMPLETE_BUSINESS_ADDRESS = `Plot No: 12, Road No: 1A, Czech Colony,</br>
    Sanath Nagar, Hyderabad - 500018<br/>
    Phone No. : 9866669777<br/>
    Email : jayaramassociates@yahoo.com<br/>
    PAN : AMIPM2958D<br/>
    GSTIN : 36AMIPM2958D1ZY<br/>
    State: 36-Telangana`;

    const getBusinessAddress = () => {
        if (invoice.business_address && invoice.business_address.includes('PAN')) {
            return escapeHtml(invoice.business_address);
        }
        return COMPLETE_BUSINESS_ADDRESS;
    };

    // Safely handle logo URLs
    const companyLogoUrl = sanitizeUrl(invoice.company_logo) || "JAYARAMA LOGO1.png";
    const fallbackLogo = "https://placehold.co/140x120?text=JAYARAMA+LOGO";

    const hasImageSignature = !!(
        (invoice.signature_data && invoice.signature_data !== 'CloudSigner_Digital_Signature' && typeof invoice.signature_data === 'string' && invoice.signature_data.startsWith('data:image')) ||
        (invoice.cloud_signer_signature_url && invoice.cloud_signer_signature_url !== 'null' && typeof invoice.cloud_signer_signature_url === 'string' && invoice.cloud_signer_signature_url.startsWith('http'))
    );

    const signatureSrc = hasImageSignature ? (invoice.cloud_signer_signature_url || invoice.signature_data) : null;
    const signatoryMarginTop = hasImageSignature ? '10px' : '70px';

    const descriptionText = (invoice.description &&
        invoice.description.length > 1 &&
        invoice.description !== 'd' &&
        invoice.description !== 'D' &&
        invoice.description !== 'G')
        ? escapeHtml(invoice.description)
        : 'Professional Fee for Services Rendered';

    // Format client address properly
    const formatAddress = (address) => {
        if (!address) return '';
        return escapeHtml(address).toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
    };

    // Return the HTML template
    return `<!DOCTYPE html>
    <html>
    <head>
    <meta charset="UTF-8">
    <title>Tax Invoice</title>
    <style>
        @page { 
            size: A4;
            margin: 1.5cm !important;
        }
        @media print {
            body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .no-print {
                display: none;
            }
        }
        body {
            margin: 0;
            padding: 0;
            background: #fff;
            font-family: 'Times New Roman', Times, serif;
        }
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            border: none;
        }
        th, td {
            border: none;
        }
    </style>
    </head>
    <body style="font-family: 'Times New Roman', Times, serif; margin: 0; padding: 0; color: #000; background: #fff;">
    
    <div style="width: 100%; margin: 0; padding: 0;">
    
        <!-- Top Section: Company Details + Logo -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
                <div style="font-family: 'Times New Roman', Times, serif; font-size: 18px; color: #000000; font-weight: bold;">
                    ${escapeHtml(invoice.business_name || 'JAYARAMA ASSOCIATES')}
                </div>
                <div style="font-family: 'Times New Roman', Times, serif; font-size: 11px; font-weight: normal; color: #000000; margin-top: 5px; line-height: 1.5;">
                    ${getBusinessAddress()}
                </div>
            </div>
            <div style="text-align: center;">
                <img 
                    src="${companyLogoUrl}"
                    alt="Company Logo" 
                    style="max-width: 140px; max-height: 120px; object-fit: contain; margin-bottom: 5px; transform: translate(-40px, 10px);"
                    onerror="this.onerror=null; this.src='${fallbackLogo}';"
                />
            </div>
        </div>
    
        <!-- Invoice Title -->
        <div style="margin-bottom: 5px;">
            <div style="
                font-family: 'Times New Roman', Times, serif;
                font-size: 20px;
                font-weight: bold;
                text-align: center;
                display: block;
                margin-top: 10px;
                color: #00AEEF;
                border-bottom: none;
                letter-spacing: 0px;
                text-transform: capitalize;
            ">
                Tax Invoice
            </div>
        </div>
    
        <!-- Bill To & Invoice Details -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 20px;">
            <div style="flex: 1;">
                <div style="font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000000; border-bottom: 1px solid #f1f5f9; display: inline-block; font-weight: bold;">
                    Bill To
                </div>
                <div style="font-family: 'Times New Roman', Times, serif; font-size: 14px; margin-top: 5px; color: #000000; font-weight: bold;">
                    ${escapeHtml(invoice.client_name || '')}
                </div>
                <div style="font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000000; white-space: pre-line; margin-top: -8px; line-height: 1.4; font-weight: normal;">
                    ${formatAddress(invoice.client_address || '')}
                </div>
                ${invoice.client_phone ? `
                    <div style="font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000000; margin-top: 3px;">
                        Phone: ${escapeHtml(invoice.client_phone)}
                    </div>
                ` : ''}
                ${invoice.client_gst ? `
                    <div style="font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000000; margin-top: 3px;">
                        GSTIN: ${escapeHtml(invoice.client_gst)}
                    </div>
                ` : ''}
                ${invoice.client_email ? `
                    <div style="font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000000; margin-top: 3px;">
                        Email: ${escapeHtml(invoice.client_email)}
                    </div>
                ` : ''}
                <div style="font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000000; margin-top: 3px;">
                    State: ${escapeHtml(invoice.client_state || '36-Telangana')}
                </div>
            </div>
            <div style="text-align: right; margin-top: 30px; color: #000000;">
                <p style="font-family: 'Times New Roman', Times, serif; font-size: 13px; color: #000000; margin: 2px 0; font-weight: normal;">
                    <span style="font-weight: normal;">Place of supply:</span>
                    <span style="font-weight: normal;">${escapeHtml(invoice.place_of_supply || '36-Telangana')}</span>
                </p>
                <p style="font-family: 'Times New Roman', Times, serif; font-size: 13px; margin-top: 10px; margin-bottom: 10px; color: #000000; font-weight: bold;">
                    Invoice No: ${escapeHtml(invoice.invoice_number || '')}
                </p>
                <p style="font-family: 'Times New Roman', Times, serif; font-size: 12px; margin-top: 5px; color: #000000; font-weight: bold;">
                    Date: ${formatDate(invoice.date || '')}
                </p>
            </div>
        </div>
    
        <!-- Items Table -->
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-family: 'Times New Roman', Times, serif; border: none;">
            <thead>
                <tr style="background: #00AEEF;">
                    <th style="width: 42px; padding: 10px; color: white; text-align: center; font-family: 'Times New Roman', Times, serif; font-size: 11px; background: #00AEEF; border: none; font-weight: bold;">S.No.</th>
                    <th style="padding: 10px; color: white; text-align: left; font-family: 'Times New Roman', Times, serif; font-size: 11px; background: #00AEEF; border: none; font-weight: bold;">Item Name</th>
                    <th style="width: 80px; padding: 10px; color: white; text-align: center; font-family: 'Times New Roman', Times, serif; font-size: 11px; background: #00AEEF; border: none; font-weight: bold;">HSN/SAC</th>
                    <th style="width: 60px; padding: 10px; color: white; text-align: center; font-family: 'Times New Roman', Times, serif; font-size: 11px; background: #00AEEF; border: none; font-weight: bold;">Qty</th>
                    <th style="width: 110px; padding: 10px; color: white; text-align: center; font-family: 'Times New Roman', Times, serif; font-size: 11px; background: #00AEEF; border: none; font-weight: bold;">Price/Unit</th>
                    <th style="width: 110px; padding: 10px; color: white; text-align: left; font-family: 'Times New Roman', Times, serif; font-size: 11px; background: #00AEEF; border: none; font-weight: bold;">Amount</th>
                </tr>
            </thead>
            <tbody>
                ${rows || '<tr><td colspan="6" style="text-align: center; padding: 40px; border: none;">No items added</td>'}
            </tbody>
        </table>
    
        <!-- Bottom Section: Description + Summary -->
        <div style="display: flex; justify-content: space-between; margin-top: 20px;">
            <div style="flex: 1; margin-right: 20px;">
                <div style="font-family: 'Times New Roman', Times, serif; font-size: 12px; margin-bottom: 5px; color: #000000; font-weight: bold; line-height: 1.4">
                    Description
                </div>
                <div style="font-family: 'Times New Roman', Times, serif; font-size: 11px; color: #000000; width: 100%; text-transform: uppercase; margin: 0;">
                    ${descriptionText}
                </div>
                <div style="font-family: 'Times New Roman', Times, serif; font-size: 12px; margin-top: 20px; margin-bottom: 5px; color: #000000; font-weight: bold;">
                    Invoice Amount In Word
                </div>
                <div style="font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000000; text-transform: capitalize; margin: 0;">
                    ${invoice.amount_in_words ? escapeHtml(invoice.amount_in_words) : convertToWords(total)}
                </div>
            </div>
            <div class="p-tots" style="width: 250px;">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; font-family: 'Times New Roman', Times, serif; font-size: 12px; font-weight: bold;">
                    <span>Sub Total</span>
                    <span style="text-align: left; min-width: 100px;">${formatCurrency(subtotal)}</span>
                </div>
                
                ${sameState ? `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; font-family: 'Times New Roman', Times, serif; font-size: 12px;">
                        <span>SGST @ 9%</span>
                        <span style="text-align: left; min-width: 100px;">${formatCurrency(sgst)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; font-family: 'Times New Roman', Times, serif; font-size: 12px;">
                        <span>CGST @ 9%</span>
                        <span style="text-align: left; min-width: 100px;">${formatCurrency(cgst)}</span>
                    </div>
                ` : `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; font-family: 'Times New Roman', Times, serif; font-size: 12px;">
                        <span>IGST @ 18%</span>
                        <span style="text-align: left; min-width: 100px;">${formatCurrency(igst)}</span>
                    </div>
                `}
                
                <div style="background: #00AEEF; color: black; display: flex; justify-content: space-between; padding: 10px; border-radius: 5px; margin: 10px 0; font-family: 'Times New Roman', Times, serif; font-size: 13px;">
                    <span style="font-weight: bold;">TOTAL</span>
                    <span style="font-weight: bold; text-align: left; min-width: 100px;">${formatCurrency(total)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; font-family: 'Times New Roman', Times, serif; font-size: 12px;">
                    <span>Received</span>
                    <span style="text-align: left; min-width: 100px;">${formatCurrency(received)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; font-family: 'Times New Roman', Times, serif; font-size: 12px;">
                    <span style="font-weight: bold;">Balance Due</span>
                    <span style="font-weight: bold; text-align: left; min-width: 100px;">${formatCurrency(balance)}</span>
                </div>
            </div>
        </div>
    
        <!-- Terms and Conditions -->
        <div style="margin-top: 20px;">
            <div style="font-family: 'Times New Roman', Times, serif; letter-spacing: 0px; font-size: 12px; color: #000000; text-transform: capitalize; font-weight: bold;">
                Terms and Conditions
            </div>
            <div style="font-family: 'Times New Roman', Times, serif; font-size: 11px; color: #000000; line-height: 1.3; font-weight: normal;">
                ${escapeHtml(invoice.terms_conditions || 'Thanks for doing business with us!')}
            </div>
        </div>
    
        <!-- Bank Details & Signature Section -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 10px; border-top: none; padding-top: 5px;">
            <div style="flex: 1;">
                <div style="font-family: 'Times New Roman', Times, serif; margin-bottom: 10px; text-decoration: underline; font-size: 11px; color: #000000;">
                    Pay To-
                </div>
                <div style="margin-bottom: 5px; font-size: 11px; font-family: 'Times New Roman', Times, serif; color: #000000;">
                    Bank Name : <b>${escapeHtml(invoice.bank_name || 'HDFC BANK')}</b>
                </div>
                <div style="margin-bottom: 5px; font-size: 11px; font-family: 'Times New Roman', Times, serif; color: #000000;">
                    Bank Account No : <b>${escapeHtml(invoice.bank_account_no || '50100123456789')}</b>
                </div>
                <div style="margin-bottom: 5px; font-size: 11px; font-family: 'Times New Roman', Times, serif; color: #000000;">
                    Bank IFSC code : <b>${escapeHtml(invoice.bank_ifsc || 'HDFC0001234')}</b>
                </div>
                <div style="margin-bottom: 5px; font-size: 11px; font-family: 'Times New Roman', Times, serif; color: #000000;">
                    Account holder's name : <b>${escapeHtml(invoice.account_holder || 'JAYARAMA ASSOCIATES')}</b>
                </div>
            </div>
            
            <!-- Signature Area -->
            <div id="cs-sig-col" style="text-align: center; min-width: 220px; padding-right: 15px;">
                <div id="cs-sig-for" style="font-family: 'Times New Roman', Times, serif; font-size: 12px; margin-bottom: 8px; color: #000000; font-weight: normal; text-align: center;">
                    For : JAYARAMA ASSOCIATES
                </div>

                ${hasImageSignature && signatureSrc ? `
                <div style="display: flex; justify-content: center; align-items: center; margin-bottom: 4px; min-height: 50px;">
                    <img
                        src="${signatureSrc}"
                        alt="Digital Signature"
                        style="max-width: 130px; max-height: 48px; width: auto; height: auto; object-fit: contain; background: transparent; border: none;"
                        onerror="this.style.display='none';"
                    />
                </div>
                ` : ''}

                <div id="cs-sig-auth" style="font-family: 'Times New Roman', Times, serif; text-align: center; font-size: 12px; margin-top: ${hasImageSignature ? '0px' : '70px'}; margin-bottom: 0px; letter-spacing: 1px; color: #000000; font-weight: normal; text-transform: capitalize; line-height: 1.2;">
                    Authorized Signatory
                </div>
                
                ${invoice.signed_at ? `
                <div style="font-size: 9px; color: #555; margin-top: 3px; text-align: center; line-height: 1.2;">
                    Signed: ${formatDate(invoice.signed_at)}
                </div>
                ` : ''}
            </div>
        </div>
    </div>
    </body>
    </html>
    `;
};

// Legacy PDFKit manual generation removed. Use HTML / Puppeteer for PDF output.


// Initialize Database Tables
async function initializeDatabase() {
    try {
        // Create users table
        await promiseDb.execute(`
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
            )
        `);

        // Live chat messages (recipient_id NULL = broadcast to everyone)
        await promiseDb.execute(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                sender_id VARCHAR(50) NOT NULL,
                recipient_id VARCHAR(50) NULL,
                body TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_chat_recipient (recipient_id, id),
                INDEX idx_chat_sender (sender_id, id)
            )
        `);

        // Per-recipient delivery/read receipts for chat messages
        await promiseDb.execute(`
            CREATE TABLE IF NOT EXISTS chat_receipts (
                message_id BIGINT NOT NULL,
                user_id VARCHAR(50) NOT NULL,
                delivered_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                read_at TIMESTAMP NULL,
                PRIMARY KEY (message_id, user_id),
                INDEX idx_receipt_user (user_id)
            )
        `);

        // Create Banks Table (Bank Master Data)
        await promiseDb.execute(`
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
            )
        `);

        // Create Clients Table (with Pay To Bank Mapping)
        await promiseDb.execute(`
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
            )
        `);

        // Migration: Ensure pay_to_bank_id exists in clients table
        try {
            await promiseDb.execute(`ALTER TABLE clients ADD COLUMN pay_to_bank_id VARCHAR(50) NULL`);
            console.log('✅ Added pay_to_bank_id column to clients table');
        } catch (e) { /* Column already exists */ }

        try {
            await promiseDb.execute(`ALTER TABLE clients ADD CONSTRAINT fk_clients_pay_to_bank FOREIGN KEY (pay_to_bank_id) REFERENCES banks(id) ON DELETE SET NULL`);
            console.log('✅ Added fk_clients_pay_to_bank foreign key to clients table');
        } catch (e) { /* Foreign key already exists */ }

        // Create Invoices Table with all eSign columns
        await promiseDb.execute(`
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
                tds_amount DECIMAL(15, 2) DEFAULT 0,
                net_amount DECIMAL(15, 2) DEFAULT 0,
                received DECIMAL(15, 2) DEFAULT 0,
                pending_amount DECIMAL(15, 2) DEFAULT 0,
                payment_status ENUM('paid', 'unpaid', 'cancelled') DEFAULT 'unpaid',
                approval_status ENUM('created', 'requested', 'final_approved') DEFAULT 'created',
                payment_due_date DATE,
                bank_name TEXT,
                bank_account_no VARCHAR(100),
                bank_ifsc VARCHAR(50),
                account_holder TEXT,
                amount_in_words TEXT,
                terms_conditions TEXT,
                authorized_signatory VARCHAR(255),
                remarks TEXT,
                items JSON,
                requested_at DATETIME NULL,
                requested_by VARCHAR(50) NULL,
                approved_at DATETIME NULL,
                approved_by VARCHAR(50) NULL,
                signature_data TEXT NULL,
                signed_at DATETIME NULL,
                signed_pdf LONGTEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
                INDEX idx_user_id (user_id),
                INDEX idx_client_id (client_id),
                INDEX idx_invoice_number (invoice_number),
                INDEX idx_date (date),
                INDEX idx_payment_status (payment_status),
                INDEX idx_approval_status (approval_status)
            )
        `);

        // Migration: Ensure Google Drive columns exist in invoices table
        try {
            await promiseDb.execute(`ALTER TABLE invoices ADD COLUMN google_drive_file_id VARCHAR(255) NULL`);
            console.log('✅ Added google_drive_file_id column to invoices table');
        } catch (e) { /* Column already exists */ }

        try {
            await promiseDb.execute(`ALTER TABLE invoices ADD COLUMN google_drive_file_name VARCHAR(255) NULL`);
            console.log('✅ Added google_drive_file_name column to invoices table');
        } catch (e) { /* Column already exists */ }

        try {
            await promiseDb.execute(`ALTER TABLE invoices ADD COLUMN attached_pdfs LONGTEXT NULL`);
            console.log('✅ Added attached_pdfs column to invoices table');
        } catch (e) { /* Column already exists */ }

        // Migration: Ensure Manual Signature columns exist in invoices table
        try {
            await promiseDb.execute(`ALTER TABLE invoices ADD COLUMN manual_signature_status ENUM('Not Required', 'Pending Manual Signature', 'Manually Signed', 'Rejected') DEFAULT 'Not Required'`);
            console.log('✅ Added manual_signature_status column to invoices table');
        } catch (e) { /* Column already exists */ }

        try {
            await promiseDb.execute(`ALTER TABLE invoices ADD COLUMN manual_signed_file_id VARCHAR(255) NULL`);
            console.log('✅ Added manual_signed_file_id column to invoices table');
        } catch (e) { /* Column already exists */ }

        try {
            await promiseDb.execute(`ALTER TABLE invoices ADD COLUMN manual_signed_file_url TEXT NULL`);
            console.log('✅ Added manual_signed_file_url column to invoices table');
        } catch (e) { /* Column already exists */ }

        try {
            await promiseDb.execute(`ALTER TABLE invoices ADD COLUMN manual_signed_file_name VARCHAR(255) NULL`);
            console.log('✅ Added manual_signed_file_name column to invoices table');
        } catch (e) { /* Column already exists */ }

        try {
            await promiseDb.execute(`ALTER TABLE invoices ADD COLUMN manual_signed_uploaded_at DATETIME NULL`);
            console.log('✅ Added manual_signed_uploaded_at column to invoices table');
        } catch (e) { /* Column already exists */ }

        try {
            await promiseDb.execute(`ALTER TABLE invoices ADD COLUMN manual_signed_uploaded_by VARCHAR(50) NULL`);
            console.log('✅ Added manual_signed_uploaded_by column to invoices table');
        } catch (e) { /* Column already exists */ }

        // Create Tax Settings Table
        await promiseDb.execute(`
            CREATE TABLE IF NOT EXISTS tax_settings (
                id VARCHAR(50) PRIMARY KEY,
                tax_name VARCHAR(100) NOT NULL,
                tax_rate DECIMAL(5, 2) NOT NULL,
                is_default BOOLEAN DEFAULT FALSE,
                applicable_from DATE,
                applicable_to DATE,
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_by VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_is_default (is_default),
                INDEX idx_status (status)
            )
        `);

        // Create State Mapping Table
        await promiseDb.execute(`
            CREATE TABLE IF NOT EXISTS state_mapping (
                code VARCHAR(2) PRIMARY KEY,
                name VARCHAR(100) NOT NULL
            )
        `);

        console.log('✅ Database tables initialized successfully');

        // Migrate existing data: Convert partial/overdue to unpaid
        await promiseDb.execute(`
            UPDATE invoices 
            SET payment_status = 'unpaid' 
            WHERE payment_status IN ('partial', 'overdue')
        `);
        console.log('✅ Migrated existing partial/overdue invoices to unpaid status');

        // Migrate existing invoices to populate created_by_name
        const [result] = await promiseDb.execute(`
            UPDATE invoices i
            JOIN users u ON i.user_id = u.id
            SET i.created_by_name = u.full_name
            WHERE i.created_by_name IS NULL OR i.created_by_name = ''
        `);
        console.log(`✅ Updated ${result.affectedRows} invoices with creator names`);

        // Insert default tax settings if none exist
        const [taxCount] = await promiseDb.execute('SELECT COUNT(*) as count FROM tax_settings');
        if (taxCount[0].count === 0) {
            await promiseDb.execute(`
                INSERT INTO tax_settings (id, tax_name, tax_rate, is_default, applicable_from, status) VALUES
                (UUID(), 'GST', 18, 1, CURDATE(), 'active'),
                (UUID(), 'GST', 12, 0, CURDATE(), 'active'),
                (UUID(), 'GST', 5, 0, CURDATE(), 'active'),
                (UUID(), 'GST', 0, 0, CURDATE(), 'active')
            `);
            console.log('✅ Default tax settings inserted');
        }

        // Insert default bank accounts if none exist
        const [bankCount] = await promiseDb.execute('SELECT COUNT(*) as count FROM banks');
        if (bankCount[0].count === 0) {
            await promiseDb.execute(`
                INSERT INTO banks (id, bank_name, account_number, ifsc_code, account_holder, branch, is_default) VALUES
                (UUID(), 'AXIS BANK LIMITED', '922020060131840', 'UTIB0000425', 'JAYARAMA ASSOCIATES', 'Sanath Nagar, Hyderabad', 1),
                (UUID(), 'STATE BANK OF INDIA', '38406950654', 'SBIN0005094', 'JAYARAMA ASSOCIATES', 'Czech Colony, Sanath Nagar', 0),
                (UUID(), 'HDFC BANK', '50100123456789', 'HDFC0001234', 'JAYARAMA ASSOCIATES', 'Banjara Hills, Hyderabad', 0),
                (UUID(), 'ICICI BANK', '000105001234', 'ICIC0000001', 'JAYARAMA ASSOCIATES', 'Sanath Nagar, Hyderabad', 0)
            `);
            console.log('✅ Default bank accounts inserted (Axis, SBI, HDFC, ICICI)');
        } else {
            // Check if ICICI BANK is present, insert if missing
            const [iciciCheck] = await promiseDb.execute("SELECT id FROM banks WHERE bank_name LIKE '%ICICI%'");
            if (iciciCheck.length === 0) {
                await promiseDb.execute(`
                    INSERT INTO banks (id, bank_name, account_number, ifsc_code, account_holder, branch, is_default) VALUES
                    (UUID(), 'ICICI BANK', '000105001234', 'ICIC0000001', 'JAYARAMA ASSOCIATES', 'Sanath Nagar, Hyderabad', 0)
                `);
                console.log('✅ Added ICICI BANK to settlement banks');
            }
        }

        // Insert default state mapping if none exist
        const [stateCount] = await promiseDb.execute('SELECT COUNT(*) as count FROM state_mapping');
        if (stateCount[0].count === 0) {
            await promiseDb.execute(`
                INSERT INTO state_mapping (code, name) VALUES 
                ('36', 'Telangana'),
                ('37', 'Andhra Pradesh')
            `);
            console.log('✅ Default state mapping inserted');
        }

        // Insert sample clients if none exist
        const [clientCount] = await promiseDb.execute('SELECT COUNT(*) as count FROM clients');
        if (clientCount[0].count === 0) {
            await promiseDb.execute(`
                INSERT INTO clients (id, name, address, branch, gst_number, phone, email) VALUES
                (UUID(), 'POLA SANDEEP REDDY', 'Plot No:- 12, Road No:- 1A, Czech Colony, sanath Nagar', 'Sanath Nagar, Hyderabad', '36LUAPS9179K1Z', '7286997507', 'sandeep@example.com'),
                (UUID(), 'Axis Bank', '8-17, opposite railway station, giddalur', 'Giddalur, Prakasam District', '37LUAPS9179K1Z', '07286997507', 'axisbank@example.com'),
                (UUID(), 'DCB BANK LIMITED', '8-2-120/84, II FLOOR, JYOTHI MAJESTIC, ROAD NO.2, BANJARA HILLS', 'Banjara Hills, Hyderabad', '36AAACD1461F1Z3', '02268997777', 'dcb@example.com')
            `);
            console.log('✅ Sample clients inserted');
        }

        // Ensure first user is super_admin if no users exist
        const [userCount] = await promiseDb.execute('SELECT COUNT(*) as count FROM users');
        if (userCount[0].count > 0) {
            const [firstUser] = await promiseDb.execute('SELECT id, role FROM users ORDER BY created_at ASC LIMIT 1');
            if (firstUser[0] && firstUser[0].role === 'admin') {
                await promiseDb.execute('UPDATE users SET role = "super_admin" WHERE id = ?', [firstUser[0].id]);
                console.log('✅ First user promoted to super_admin');
            }
        }

    } catch (error) {
        console.error('❌ Database initialization error:', error);
        throw error;
    }
}

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key', (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

const authorizeAdmin = (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    next();
};

const authorizeSuperAdmin = (req, res, next) => {
    if (req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Access denied. Super Admin privileges required.' });
    }
    next();
};

// ============= AUTH ROUTES =============

// Real-time username & email availability check endpoint
app.post('/api/auth/check-user-exists', async (req, res) => {
    try {
        const { username, email } = req.body;

        if (username && username.trim()) {
            const [uRows] = await promiseDb.execute(
                'SELECT id FROM users WHERE username = ?',
                [username.trim()]
            );
            if (uRows.length > 0) {
                return res.json({ exists: true, field: 'username', message: 'This username already exists' });
            }
        }

        if (email && email.trim()) {
            const trimmedEmail = email.trim().toLowerCase();
            if (!validateEmail(trimmedEmail)) {
                return res.status(400).json({ exists: false, error: 'Please enter a valid email address' });
            }
            const [eRows] = await promiseDb.execute(
                'SELECT id FROM users WHERE email = ?',
                [trimmedEmail]
            );
            if (eRows.length > 0) {
                return res.json({ exists: true, field: 'email', message: 'This email ID already exists' });
            }
        }

        res.json({ exists: false });
    } catch (err) {
        console.error('Check user exists error:', err);
        res.status(500).json({ error: 'Failed to check user existence' });
    }
});

// ============= STEP 1: USER EMAIL OTP VERIFICATION =============

// Send OTP to USER email for email verification (Step 1)
app.post('/api/auth/send-user-email-otp', async (req, res) => {
    try {
        const { fullName, username, email } = req.body;

        if (!email || !email.trim()) {
            return res.status(400).json({ success: false, message: 'A valid email ID is required' });
        }

        const trimmedEmail = email.trim().toLowerCase();
        if (!validateEmail(trimmedEmail)) {
            return res.status(400).json({
                success: false,
                message: 'A valid email ID is required (e.g., name@gmail.com, name@yahoo.co.in, user@company.com)'
            });
        }

        if (!fullName || fullName.trim().length < 3) {
            return res.status(400).json({ success: false, message: 'Full name must be at least 3 characters' });
        }

        if (username && username.trim()) {
            if (!validateUsername(username.trim())) {
                return res.status(400).json({
                    success: false,
                    message: 'Username must start with a capital letter, followed by letters, numbers, or symbols'
                });
            }

            // Check if username already exists in DB
            const [existingUsername] = await promiseDb.execute(
                'SELECT id FROM users WHERE username = ?',
                [username.trim()]
            );
            if (existingUsername.length > 0) {
                return res.status(400).json({ success: false, message: 'This username already exists' });
            }
        }

        // Check if email already exists in DB
        const [existingEmail] = await promiseDb.execute(
            'SELECT id FROM users WHERE email = ?',
            [trimmedEmail]
        );
        if (existingEmail.length > 0) {
            return res.status(400).json({ success: false, message: 'This email ID already exists' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

        userEmailOtpStore.set(trimmedEmail, {
            otp,
            expiresAt,
            attempts: 0,
            fullName: fullName.trim(),
            username: username ? username.trim() : '',
            email: trimmedEmail
        });

        const mailOptions = {
            from: `"JAYARAMA Invoice Manager" <${process.env.EMAIL_USER || 'jayaramaassociates.info@gmail.com'}>`,
            to: trimmedEmail,
            subject: `📧 Verify Your Email Address - JAYARAMA Invoice Manager`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
                    <div style="background-color: #0072bc; color: white; padding: 18px 20px; border-radius: 8px 8px 0 0; text-align: center;">
                        <h2 style="margin: 0; font-size: 22px;">🔐 Email Verification Code</h2>
                    </div>
                    <div style="padding: 24px 20px; color: #1e293b;">
                        <p style="font-size: 16px; margin-top: 0;">Hello <strong>${fullName ? fullName.trim() : 'User'}</strong>,</p>
                        <p style="font-size: 15px; line-height: 1.5; color: #475569;">Thank you for signing up with <strong>JAYARAMA Invoice Manager</strong>. Please use the verification code below to verify your email address and unlock password setup.</p>
                        
                        <div style="background-color: #f1f5f9; border: 2px dashed #0072bc; border-radius: 8px; padding: 18px; text-align: center; margin: 25px 0;">
                            <div style="font-size: 13px; color: #64748b; margin-bottom: 6px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">Your 6-Digit OTP</div>
                            <div style="font-size: 34px; font-weight: bold; color: #0072bc; letter-spacing: 6px; font-family: monospace;">${otp}</div>
                        </div>

                        <p style="font-size: 13px; color: #64748b;">⏰ This code is valid for <strong>10 minutes</strong>. Do not share this OTP with anyone.</p>
                        <p style="font-size: 13px; color: #64748b;">If you did not initiate this request, please ignore this email.</p>
                    </div>
                    <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center; font-size: 12px; color: #94a3b8;">
                        JAYARAMA ASSOCIATES • Invoice Management System
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'Verification OTP sent to your email address' });
    } catch (error) {
        console.error('Error sending user email OTP:', error);
        res.status(500).json({ success: false, message: 'Failed to send verification email: ' + error.message });
    }
});

// Verify User's Email OTP (Step 1 Verification)
app.post('/api/auth/verify-user-email-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ success: false, message: 'Email and OTP are required' });
        }

        const trimmedEmail = email.trim().toLowerCase();
        if (!validateEmail(trimmedEmail)) {
            return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
        }

        const storedData = userEmailOtpStore.get(trimmedEmail);

        if (!storedData) {
            return res.status(400).json({ success: false, message: 'OTP not found or expired. Please click "Get OTP" to request a new code.' });
        }

        if (storedData.attempts >= 5) {
            userEmailOtpStore.delete(trimmedEmail);
            return res.status(400).json({ success: false, message: 'Too many failed attempts. Please request a new OTP.' });
        }

        if (Date.now() > storedData.expiresAt) {
            userEmailOtpStore.delete(trimmedEmail);
            return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new OTP.' });
        }

        if (storedData.otp !== otp.trim()) {
            storedData.attempts++;
            userEmailOtpStore.set(trimmedEmail, storedData);
            return res.status(400).json({ success: false, message: `Invalid OTP. ${5 - storedData.attempts} attempts remaining.` });
        }

        // Save verified status for user email
        const verificationKey = `email_verified_${trimmedEmail}`;
        userEmailOtpStore.set(verificationKey, {
            verified: true,
            fullName: storedData.fullName,
            username: storedData.username,
            email: trimmedEmail,
            verifiedAt: Date.now(),
            expiresAt: Date.now() + 60 * 60 * 1000 // valid for 1 hour
        });

        userEmailOtpStore.delete(trimmedEmail);

        res.json({ success: true, message: 'Email verified successfully! You can now set your password.' });
    } catch (error) {
        console.error('Error verifying user email OTP:', error);
        res.status(500).json({ success: false, message: 'Failed to verify OTP: ' + error.message });
    }
});

// ============= STEP 3: SUPER ADMIN APPROVAL OTP =============

// Send OTP to ADMIN email for registration approval (Step 3)
app.post('/api/auth/send-otp', async (req, res) => {
    const { adminEmail, userEmail, fullName, username } = req.body;

    const trimmedUserEmail = (userEmail || '').trim().toLowerCase();
    const targetAdminEmail = (adminEmail || process.env.ADMIN_EMAIL || 'jayaramaassociates.info@gmail.com').trim();

    if (!trimmedUserEmail || !validateEmail(trimmedUserEmail)) {
        return res.status(400).json({ success: false, message: 'Please provide a valid user email address' });
    }

    // Check if user email is verified first
    const emailVerificationKey = `email_verified_${trimmedUserEmail}`;
    const emailVerification = userEmailOtpStore.get(emailVerificationKey);
    if (!emailVerification || !emailVerification.verified || Date.now() > emailVerification.expiresAt) {
        return res.status(400).json({
            success: false,
            message: 'Email address has not been verified yet. Please verify your email first.'
        });
    }

    try {
        // 1. Check if username already exists in database BEFORE sending OTP
        if (username && username.trim()) {
            const [existingUsername] = await promiseDb.execute(
                'SELECT id FROM users WHERE username = ?',
                [username.trim()]
            );
            if (existingUsername.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'This username already exists'
                });
            }
        }

        // 2. Check if email already exists in database BEFORE sending OTP
        const [existingEmail] = await promiseDb.execute(
            'SELECT id FROM users WHERE email = ?',
            [trimmedUserEmail]
        );
        if (existingEmail.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'This email ID already exists'
            });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 10 * 60 * 1000;

        otpStore.set(targetAdminEmail, {
            otp,
            expiresAt,
            attempts: 0,
            userEmail: trimmedUserEmail,
            fullName: (fullName || emailVerification.fullName || '').trim(),
            username: (username || emailVerification.username || '').trim()
        });

        const mailOptions = {
            from: `"JAYARAMA Invoice Manager" <${process.env.EMAIL_USER || 'jayaramaassociates.info@gmail.com'}>`,
            to: targetAdminEmail,
            subject: `🔐 New Registration Approval Request - ${fullName || username || trimmedUserEmail}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
                    <div style="background-color: #1e293b; color: white; padding: 18px 20px; border-radius: 8px 8px 0 0; text-align: center;">
                        <h2 style="margin: 0; font-size: 20px;">🛡️ Super Admin Approval Required</h2>
                    </div>
                    <div style="padding: 20px; color: #1e293b;">
                        <p style="font-size: 15px;">A new user has verified their email and requested registration approval:</p>
                        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px; margin: 15px 0;">
                            <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
                                <tr>
                                    <td style="padding: 6px 0; color: #64748b; font-weight: bold; width: 140px;">👤 Full Name:</td>
                                    <td style="padding: 6px 0; font-weight: 600;">${fullName || 'Not provided'}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 6px 0; color: #64748b; font-weight: bold;">🏷️ Username:</td>
                                    <td style="padding: 6px 0; font-weight: 600;">${username || 'Not provided'}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 6px 0; color: #64748b; font-weight: bold;">📧 Email (Verified):</td>
                                    <td style="padding: 6px 0; font-weight: 600; color: #0072bc;">${trimmedUserEmail}</td>
                                </tr>
                            </table>
                        </div>
                        <p style="font-size: 14px;">Provide the following OTP to the user to grant registration approval:</p>
                        <div style="background-color: #f1f5f9; border: 2px dashed #3b82f6; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
                            <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">Approval OTP</div>
                            <div style="font-size: 32px; font-weight: bold; color: #1e293b; letter-spacing: 6px; font-family: monospace;">${otp}</div>
                        </div>
                        <p style="font-size: 13px; color: #64748b;">⏰ This OTP is valid for 10 minutes.</p>
                    </div>
                    <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center; font-size: 12px; color: #94a3b8;">
                        JAYARAMA ASSOCIATES • Security & Access Control
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'Registration request sent to administrator' });
    } catch (error) {
        console.error('Error sending Admin OTP:', error);
        res.status(500).json({ success: false, message: 'Failed to send registration request: ' + error.message });
    }
});

// Verify Admin Approval OTP
app.post('/api/auth/verify-otp', async (req, res) => {
    const { adminEmail, otp, userEmail } = req.body;
    const targetAdminEmail = (adminEmail || process.env.ADMIN_EMAIL || 'jayaramaassociates.info@gmail.com').trim();
    const trimmedUserEmail = (userEmail || '').trim().toLowerCase();

    if (!otp) {
        return res.status(400).json({ success: false, message: 'OTP is required' });
    }

    const storedData = otpStore.get(targetAdminEmail);

    if (!storedData) {
        return res.status(400).json({ success: false, message: 'Admin OTP not found. Please request approval again.' });
    }

    if (storedData.attempts >= 5) {
        otpStore.delete(targetAdminEmail);
        return res.status(400).json({ success: false, message: 'Too many failed attempts. Please request a new OTP.' });
    }

    if (Date.now() > storedData.expiresAt) {
        otpStore.delete(targetAdminEmail);
        return res.status(400).json({ success: false, message: 'Admin OTP has expired. Please request a new OTP.' });
    }

    if (storedData.otp !== otp.trim()) {
        storedData.attempts++;
        otpStore.set(targetAdminEmail, storedData);
        return res.status(400).json({ success: false, message: `Invalid Admin OTP. ${5 - storedData.attempts} attempts remaining.` });
    }

    const verificationKey = `verified_${storedData.userEmail}`;
    otpStore.set(verificationKey, {
        verified: true,
        userData: {
            fullName: storedData.fullName,
            username: storedData.username,
            email: storedData.userEmail
        },
        expiresAt: Date.now() + 30 * 60 * 1000
    });

    otpStore.delete(targetAdminEmail);

    res.json({ success: true, message: 'Admin OTP verified successfully' });
});

// Complete Signup endpoint
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { fullName, username, email, password, otpVerified } = req.body;
        const trimmedEmail = (email || '').trim().toLowerCase();
        const trimmedUsername = (username || '').trim();
        const trimmedFullName = (fullName || '').trim();

        // 1. Verify User Email was verified in Step 1
        const emailVerificationKey = `email_verified_${trimmedEmail}`;
        const emailVerification = userEmailOtpStore.get(emailVerificationKey);
        if (!emailVerification || !emailVerification.verified) {
            return res.status(400).json({ error: 'Please verify your email address first.' });
        }

        // 2. Verify Admin Approval was completed in Step 3
        const verificationKey = `verified_${trimmedEmail}`;
        const verificationData = otpStore.get(verificationKey);

        if (!otpVerified || !verificationData || !verificationData.verified) {
            return res.status(400).json({ error: 'Please get admin approval with OTP first.' });
        }

        if (Date.now() > verificationData.expiresAt) {
            otpStore.delete(verificationKey);
            return res.status(400).json({ error: 'Admin approval has expired. Please request a new OTP from admin.' });
        }

        if (!trimmedFullName || !trimmedUsername || !trimmedEmail || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (trimmedFullName.length < 3) {
            return res.status(400).json({ error: 'Full name must be at least 3 characters' });
        }

        if (!validateUsername(trimmedUsername)) {
            return res.status(400).json({
                error: 'Username must start with a capital letter, followed by letters, numbers, or symbols'
            });
        }

        if (!validateEmail(trimmedEmail)) {
            return res.status(400).json({ error: 'Please enter a valid email address (e.g., name@gmail.com, name@yahoo.co.in)' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const [existingUsername] = await promiseDb.execute(
            'SELECT id FROM users WHERE username = ?',
            [trimmedUsername]
        );

        if (existingUsername.length > 0) {
            return res.status(400).json({ error: 'This username already exists' });
        }

        const [existingEmail] = await promiseDb.execute(
            'SELECT id FROM users WHERE email = ?',
            [trimmedEmail]
        );

        if (existingEmail.length > 0) {
            return res.status(400).json({ error: 'This email ID already exists' });
        }

        const [userCount] = await promiseDb.execute('SELECT COUNT(*) as count FROM users');
        const role = userCount[0].count === 0 ? 'super_admin' : 'user';

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = `u_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        await promiseDb.execute(
            'INSERT INTO users (id, full_name, username, email, password, role) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, trimmedFullName, trimmedUsername, trimmedEmail, hashedPassword, role]
        );

        // Cleanup temporary stores
        otpStore.delete(verificationKey);
        userEmailOtpStore.delete(emailVerificationKey);

        const token = jwt.sign(
            { id: userId, email: trimmedEmail, username: trimmedUsername, role: role, full_name: trimmedFullName },
            process.env.JWT_SECRET || 'your_secret_key',
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: userId,
                full_name: trimmedFullName,
                username: trimmedUsername,
                email: trimmedEmail,
                role: role
            }
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const trimmedEmail = email.trim().toLowerCase();
        if (!validateEmail(trimmedEmail)) {
            return res.status(400).json({ error: 'Please enter a valid email address (e.g., name@gmail.com, name@yahoo.co.in)' });
        }

        const [users] = await promiseDb.execute(
            'SELECT * FROM users WHERE email = ?',
            [trimmedEmail]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users[0];
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, username: user.username, role: user.role, full_name: user.full_name },
            process.env.JWT_SECRET || 'your_secret_key',
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                full_name: user.full_name,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get current user endpoint
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const [users] = await promiseDb.execute(
            'SELECT id, full_name, username, email, role FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(users[0]);
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Verify super admin credentials for critical operations
app.post('/api/auth/verify-super-admin', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Find user by username or email
        const [users] = await promiseDb.execute(
            'SELECT id, username, email, password, role FROM users WHERE (username = ? OR email = ?) AND role = ?',
            [username, username, 'super_admin']
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials or insufficient privileges' });
        }

        const user = users[0];

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        res.json({ success: true, message: 'Super admin credentials verified' });
    } catch (error) {
        console.error('Super admin verification error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// ============= USER MANAGEMENT ROUTES (SUPER ADMIN ONLY) =============

// Get all users
app.get('/api/auth/users', authenticateToken, authorizeSuperAdmin, async (req, res) => {
    try {
        const [users] = await promiseDb.execute(
            'SELECT id, full_name, username, email, role, created_at FROM users ORDER BY created_at DESC'
        );
        res.json(users);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create user
app.post('/api/auth/users', authenticateToken, authorizeSuperAdmin, async (req, res) => {
    try {
        const { full_name, username, email, password, role } = req.body;

        if (!full_name || !username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const [existingUsername] = await promiseDb.execute(
            'SELECT id FROM users WHERE username = ?',
            [username]
        );

        if (existingUsername.length > 0) {
            return res.status(400).json({ error: 'This username already exists' });
        }

        const [existingEmail] = await promiseDb.execute(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );

        if (existingEmail.length > 0) {
            return res.status(400).json({ error: 'This email ID already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = `u_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        await promiseDb.execute(
            'INSERT INTO users (id, full_name, username, email, password, role) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, full_name.trim(), username.trim(), email.trim(), hashedPassword, role || 'user']
        );

        res.json({ success: true, message: 'User created successfully' });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update user
app.put('/api/auth/users/:id', authenticateToken, authorizeSuperAdmin, async (req, res) => {
    try {
        const { full_name, username, email, password, role } = req.body;
        const userId = req.params.id;

        let updateQuery = 'UPDATE users SET full_name = ?, username = ?, email = ?, role = ?';
        let params = [full_name, username, email, role];

        if (password && password.trim()) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updateQuery += ', password = ?';
            params.push(hashedPassword);
        }

        updateQuery += ', updated_at = CURRENT_TIMESTAMP WHERE id = ?';
        params.push(userId);

        await promiseDb.execute(updateQuery, params);

        res.json({ success: true, message: 'User updated successfully' });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete user
app.delete('/api/auth/users/:id', authenticateToken, authorizeSuperAdmin, async (req, res) => {
    try {
        const userId = req.params.id;

        if (userId === req.user.id) {
            return res.status(400).json({ error: 'You cannot delete your own account' });
        }

        await promiseDb.execute('DELETE FROM users WHERE id = ?', [userId]);

        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/// ============= eSign APPROVAL WORKFLOW ROUTES =============

// Request eSign approval (Admin only)
app.post('/api/invoices/:id/request-esign', authenticateToken, async (req, res) => {
    try {
        const invoiceId = req.params.id;

        const [invoices] = await promiseDb.execute(
            'SELECT approval_status, manual_signature_status, manual_signed_file_id FROM invoices WHERE id = ?',
            [invoiceId]
        );

        if (invoices.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const isManuallySigned = invoices[0].manual_signature_status === 'Manually Signed' || !!invoices[0].manual_signed_file_id;
        if (isManuallySigned) {
            return res.status(400).json({ error: 'Cannot request eSign: This invoice has already been manually signed.' });
        }

        if (invoices[0].approval_status !== 'created') {
            return res.status(400).json({ error: 'Invoice already requested or approved' });
        }

        await promiseDb.execute(
            `UPDATE invoices 
             SET approval_status = 'requested',
                 requested_at = NOW(),
                 requested_by = ?
             WHERE id = ?`,
            [req.user.id, invoiceId]
        );

        console.log(`✅ Invoice ${invoiceId} eSign approval requested by Admin ${req.user.email}`);

        res.json({
            success: true,
            message: 'eSign approval requested successfully',
            status: 'requested'
        });
    } catch (error) {
        console.error('Request eSign error:', error);
        res.status(500).json({ error: 'Failed to request eSign approval: ' + error.message });
    }
});

const pdfUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024 } // 30MB limit for attached PDFs
});

async function mergeInvoiceAndAttachedPdfs(mainInvoicePdfBuffer, reqFiles = [], storedAttachedPdfsJson = null) {
    let attachedList = [];

    // 1. Add files uploaded in request if present
    if (reqFiles && reqFiles.length > 0) {
        reqFiles.forEach((f, idx) => {
            if (f && f.buffer) {
                attachedList.push({ name: f.originalname || `attachment_${idx + 1}.pdf`, buffer: f.buffer });
            }
        });
    }

    // 2. Add stored attached_pdfs from DB if present
    if (storedAttachedPdfsJson) {
        try {
            const parsed = typeof storedAttachedPdfsJson === 'string' ? JSON.parse(storedAttachedPdfsJson) : storedAttachedPdfsJson;
            if (Array.isArray(parsed)) {
                parsed.forEach((att, idx) => {
                    if (att && att.data) {
                        const base64Data = att.data.replace(/^data:application\/pdf;base64,/, '');
                        const buf = Buffer.from(base64Data, 'base64');
                        attachedList.push({ name: att.name || `attachment_${idx + 1}.pdf`, buffer: buf });
                    }
                });
            }
        } catch (e) {
            console.error('[PDF Merge] Error parsing stored attached_pdfs:', e);
        }
    }

    if (attachedList.length === 0) {
        return mainInvoicePdfBuffer;
    }

    try {
        const mergedDoc = await PDFDocument.create();

        // Copy pages from Main Invoice PDF
        const mainDoc = await PDFDocument.load(mainInvoicePdfBuffer);
        const mainPages = await mergedDoc.copyPages(mainDoc, mainDoc.getPageIndices());
        mainPages.forEach(p => mergedDoc.addPage(p));

        // Process each attached PDF in order
        for (let i = 0; i < attachedList.length; i++) {
            const attachedFile = attachedList[i];
            const attachedDoc = await PDFDocument.load(attachedFile.buffer);
            const pageIndices = attachedDoc.getPageIndices();
            const copiedPages = await mergedDoc.copyPages(attachedDoc, pageIndices);

            copiedPages.forEach((page) => {
                mergedDoc.addPage(page);
            });
        }

        const mergedBytes = await mergedDoc.save();
        return Buffer.from(mergedBytes);
    } catch (err) {
        console.error('[PDF Merge Error]:', err);
        return mainInvoicePdfBuffer;
    }
}

// ============= CLOUDSIGNER SIGNATURE LOCATIONS =============
// Common signature locations in PDF [x, y, width, height]
const SIGNATURE_LOCATIONS = {
    // Main Invoice - Middle Right (standard invoice signature area)
    INVOICE_MAIN: [420, 239, 45, 80],

    // Main Invoice - Bottom Right
    INVOICE_BOTTOM_RIGHT: [450, 80, 180, 70],

    // Main Invoice - Top Right
    INVOICE_TOP_RIGHT: [450, 700, 180, 70],

    // Attachments - Bottom Left
    ATTACHMENT_BOTTOM_LEFT: [50, 50, 200, 80],

    // Attachments - Bottom Right
    ATTACHMENT_BOTTOM_RIGHT: [450, 50, 200, 80],

    // Attachments - Top Left
    ATTACHMENT_TOP_LEFT: [50, 750, 200, 80],

    // Small signature stamp
    SMALL_STAMP: [50, 50, 100, 50],

    // Full width signature at bottom
    FULL_WIDTH_BOTTOM: [50, 50, 500, 60]
};

// ============= HELPER FUNCTION: Sign Individual PDF =============
async function signPDFWithLocation(pdfBuffer, location, cloudSignerConfig, requestIdPrefix = 'inv') {
    try {
        const sigLoc = Array.isArray(location) && location.length === 4
            ? location
            : (SIGNATURE_LOCATIONS.INVOICE_MAIN);

        const payload = {
            api_key: cloudSignerConfig.api_key || CLOUDSIGNER_API_KEY,
            certificate_id: cloudSignerConfig.certificate_id || CLOUDSIGNER_CERTIFICATE_ID,
            action: cloudSignerConfig.action || "sign",
            enableltv: cloudSignerConfig.enableltv || "false",
            enablegreentick: cloudSignerConfig.enablegreentick || "true",
            invisiblesignature: cloudSignerConfig.invisiblesignature || "false",
            lock: cloudSignerConfig.lock || "false",
            ts: cloudSignerConfig.ts || "false",
            page: "1",
            location: sigLoc,
            request_id: `${requestIdPrefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
            request_ts: new Date().toISOString(),
            options: {
                reason: cloudSignerConfig.options?.reason || "Approved",
                locations: cloudSignerConfig.options?.locations || "Jayarama Associates",
                customtext: cloudSignerConfig.options?.customtext || "Digitally Signed by CloudSigner DSC"
            },
            data: pdfBuffer.toString('base64')
        };

        const response = await axios.post(CLOUDSIGNER_URL, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000
        });

        if (!response.data || !response.data.pdf) {
            const errMsg = response.data?.errorMessage || response.data?.message || 'CloudSigner returned no PDF';
            console.error('❌ CloudSigner Error Response:', response.data);
            throw new Error(`CloudSigner signing failed: ${errMsg}`);
        }

        const signedBuffer = Buffer.from(response.data.pdf, 'base64');
        return signedBuffer;
    } catch (error) {
        console.error('[Sign PDF Error]:', error.message);
        throw error;
    }
}

// 🔥 SIGN INVOICE API (CloudSigner integration + Google Drive upload)
app.post('/api/invoices/:id/esign', authenticateToken, authorizeSuperAdmin, pdfUpload.array('attached_pdfs'), async (req, res) => {
    try {
        const invoiceId = req.params.id;

        // Check CloudSigner configuration
        if (!CLOUDSIGNER_URL || !CLOUDSIGNER_API_KEY || !CLOUDSIGNER_CERTIFICATE_ID) {
            return res.status(500).json({
                error: 'CloudSigner is not configured. Please check .env file.'
            });
        }

        // Get invoice from database
        const [rows] = await promiseDb.execute(
            'SELECT * FROM invoices WHERE id = ?',
            [invoiceId]
        );

        if (!rows.length) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const invoice = rows[0];

        const isManuallySigned = invoice.manual_signature_status === 'Manually Signed' || !!invoice.manual_signed_file_id;
        if (isManuallySigned) {
            return res.status(400).json({ error: 'Cannot finalize eSign: This invoice has already been manually signed.' });
        }

        // STEP 17 — Duplicate Upload Protection (Skip if user is attaching supporting PDFs)
        const hasAttachedFiles = req.files && req.files.length > 0;
        if (invoice.google_drive_file_id && invoice.approval_status === 'final_approved' && !hasAttachedFiles) {
            console.log(`[Invoice] Invoice ${invoice.invoice_number} already signed and uploaded to Google Drive (File ID: ${invoice.google_drive_file_id})`);
            return res.json({
                success: true,
                message: "Invoice already digitally signed and uploaded to Google Drive",
                invoice_id: invoiceId,
                invoice_number: invoice.invoice_number,
                google_drive_file_id: invoice.google_drive_file_id,
                download_url: `/api/invoices/${invoiceId}/download-signed-pdf`
            });
        }

        // Check approval status
        if (invoice.approval_status !== 'requested') {
            return res.status(400).json({
                error: `Invoice must be in "requested" state before CloudSigner approval. Current status: ${invoice.approval_status}`
            });
        }

        // Parse items if needed
        let items = [];
        try {
            items = typeof invoice.items === 'string' ? JSON.parse(invoice.items) : (invoice.items || []);
        } catch (e) {
            items = [];
        }

        // Prepare invoice data for PDF generation
        const invoiceData = {
            ...invoice,
            items: items,
            signature_data: invoice.signature_data,
            client_name: invoice.client_name || 'N/A',
            client_address: invoice.client_address || 'N/A',
            client_gst: invoice.client_gst || 'N/A',
            client_branch: invoice.client_branch || 'N/A',
            place_of_supply: invoice.place_of_supply || '36-Telangana',
            invoice_number: invoice.invoice_number || 'N/A',
            date: invoice.date ? new Date(invoice.date).toLocaleDateString('en-IN') : 'N/A',
            payment_due_date: invoice.payment_due_date || 'N/A',
            tds_amount: parseFloat(invoice.tds_amount) || 0,
            received: parseFloat(invoice.received) || 0,
            bank_name: invoice.bank_name || 'AXIS BANK LIMITED',
            bank_account_no: invoice.bank_account_no || '922020060131840',
            bank_ifsc: invoice.bank_ifsc || 'UTIB0000425',
            account_holder: invoice.account_holder || 'JAYARAMA ASSOCIATES',
            terms_conditions: invoice.terms_conditions || 'Thanks for doing business with us!',
            authorized_signatory: invoice.authorized_signatory || 'JAYARAMA ASSOCIATES',
            tax_rate: parseFloat(invoice.tax_rate) || 18,
            base_amount: parseFloat(invoice.base_amount) || 0,
            sgst: parseFloat(invoice.sgst) || 0,
            cgst: parseFloat(invoice.cgst) || 0,
            igst: parseFloat(invoice.igst) || 0,
            total_amount: parseFloat(invoice.total_amount) || 0,
            net_amount: parseFloat(invoice.net_amount) || 0,
            company_logo: "http://localhost:3000/JAYARAMA%20LOGO1.png"
        };

        console.log(`[CloudSigner] Signing invoice ${invoice.invoice_number}...`);

        // 1. Generate Main Invoice PDF
        const invoiceHTML = buildInvoiceHTML(invoiceData);
        const outputPath = path.join(tempDir, `invoice-${invoiceId}-${Date.now()}.pdf`);
        let signatureGapRect = null;
        try {
            const pdfGenResult = await generateInvoicePDF(invoiceHTML, outputPath);
            if (pdfGenResult && pdfGenResult.signatureGapRect) {
                signatureGapRect = pdfGenResult.signatureGapRect;
            }
        } catch (pdfGenErr) {
            console.warn('[PDF Gen Warning] generateInvoicePDF measurement notice:', pdfGenErr.message);
        }
        const rawInvoicePdfBuffer = fs.readFileSync(outputPath);
        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
        }

        const approverName = req.user.full_name || 'MADHAVA REDDY MUNAGALA';
        // Base CloudSigner configuration
        const cloudSignerBaseConfig = {
            api_key: CLOUDSIGNER_API_KEY,
            certificate_id: CLOUDSIGNER_CERTIFICATE_ID,
            action: "sign",
            enableltv: "false",
            enablegreentick: "true",
            invisiblesignature: "false",
            lock: "false",
            ts: "false",
            options: {
                reason: `Approved by MADHAVA REDDY MUNAGALA for ${invoice.invoice_number}`,
                locations: "Jayarama Associates",
                customtext: `Digitally Signed by CloudSigner DSC`
            }
        };

        // Main invoice signature location: [420, 240, 50, 80]
        const mainSignatureLocation = SIGNATURE_LOCATIONS.INVOICE_MAIN;

        // 2. Merge main invoice PDF with attached PDFs BEFORE signing
        // (Cryptographic digital signatures are corrupted if re-saved through pdf-lib after signing)
        console.log('📑 Merging main invoice with any attached PDFs before signing...');
        const pdfToSignBuffer = await mergeInvoiceAndAttachedPdfs(
            rawInvoicePdfBuffer,
            req.files || [],
            invoice.attached_pdfs
        );

        // 3. SIGN PDF WITH CLOUDSIGNER
        console.log('📄 Signing invoice PDF with CloudSigner at location:', mainSignatureLocation);
        const finalSignedPdfBuffer = await signPDFWithLocation(
            pdfToSignBuffer,
            mainSignatureLocation,
            cloudSignerBaseConfig,
            `inv_${invoiceId}_main`
        );

        // 5. UPLOAD SIGNED PDF TO GOOGLE DRIVE
        console.log('[GoogleDrive] Uploading signed PDF...');
        const safeNum = (invoice.invoice_number || `JA-${invoiceId}`).replace(/[/\\?%*:|"<>]/g, '-');
        const driveFileName = `Signed_Invoice_${safeNum}.pdf`;

        let driveResult;
        try {
            driveResult = await googleDrive.uploadSignedPDF(finalSignedPdfBuffer, driveFileName);
            console.log('[GoogleDrive] Upload successful');
            console.log(`[GoogleDrive] File ID: ${driveResult.fileId}`);
        } catch (driveErr) {
            console.error('[GoogleDrive] Signed PDF upload failed:', driveErr.message || driveErr);
            return res.status(500).json({
                error: "Signed PDF could not be uploaded to Google Drive.",
                details: driveErr.message
            });
        }

        // 6. STORE IN MYSQL ONLY AFTER UPLOAD SUCCEEDS
        await promiseDb.execute(`
            UPDATE invoices
            SET approval_status = 'final_approved',
                signature_data = 'CloudSigner_Digital_Signature',
                google_drive_file_id = ?,
                google_drive_file_name = ?,
                signed_at = NOW(),
                approved_at = NOW(),
                approved_by = ?
            WHERE id = ?
        `, [driveResult.fileId, driveResult.fileName, req.user.id, invoiceId]);

        console.log('[Invoice] Google Drive reference saved');
        console.log('[Invoice] Final eSign completed');

        // Return success response
        res.json({
            success: true,
            message: "Invoice signed successfully with CloudSigner and uploaded to Google Drive",
            invoice_id: invoiceId,
            invoice_number: invoice.invoice_number,
            google_drive_file_id: driveResult.fileId,
            signed_by: "CloudSigner Digital Certificate",
            serial_number: CERTIFICATE_SERIAL_NUMBER || CLOUDSIGNER_CERTIFICATE_ID,
            download_url: `/api/invoices/${invoiceId}/download-signed-pdf`
        });

    } catch (error) {
        console.error('CloudSigner Error Details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });

        let errorMessage = "CloudSigner DSC signing failed. The invoice has not been marked as digitally signed.";
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
            errorMessage = "CloudSigner service is unavailable. Please make sure the CloudSigner service and DSC token are connected.";
        } else if (error.response?.data?.errorMessage?.toLowerCase().includes('token') || error.message?.toLowerCase().includes('token')) {
            errorMessage = "DSC token is not available. Please connect/register the DSC token with CloudSigner.";
        } else if (error.response?.data?.errorMessage) {
            errorMessage = `CloudSigner DSC signing failed: ${error.response.data.errorMessage}`;
        }

        res.status(500).json({
            error: errorMessage,
            details: error.response?.data || error.message
        });
    }
});

// Final eSign approval (Super Admin only) - Manual signature
app.post('/api/invoices/:id/final-esign', authenticateToken, authorizeSuperAdmin, async (req, res) => {
    try {
        const invoiceId = req.params.id;
        const { signature_data, signed_at } = req.body;

        if (!signature_data) {
            return res.status(400).json({ error: 'Signature data is required' });
        }

        const [invoices] = await promiseDb.execute(
            'SELECT approval_status, manual_signature_status, manual_signed_file_id FROM invoices WHERE id = ?',
            [invoiceId]
        );

        if (invoices.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const isManuallySigned = invoices[0].manual_signature_status === 'Manually Signed' || !!invoices[0].manual_signed_file_id;
        if (isManuallySigned) {
            return res.status(400).json({ error: 'Cannot finalize eSign: This invoice has already been manually signed.' });
        }

        if (invoices[0].approval_status !== 'requested') {
            return res.status(400).json({ error: 'Invoice not in requested state' });
        }

        let formattedDateTime = null;
        if (signed_at) {
            const date = new Date(signed_at);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            formattedDateTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        } else {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            formattedDateTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        }

        await promiseDb.execute(
            `UPDATE invoices 
             SET approval_status = 'final_approved',
                 approved_at = NOW(),
                 approved_by = ?,
                 signature_data = ?,
                 signed_at = ?
             WHERE id = ?`,
            [req.user.id, signature_data, formattedDateTime, invoiceId]
        );

        console.log(`✅ Invoice ${invoiceId} final approved by Super Admin ${req.user.email}`);

        res.json({
            success: true,
            message: 'Invoice final approved with eSign',
            status: 'final_approved'
        });
    } catch (error) {
        console.error('Final eSign error:', error);
        res.status(500).json({ error: 'Failed to final approve invoice: ' + error.message });
    }
});

// Helper function to stream signed PDF from Google Drive or dynamic fallback
const streamSignedPDFFromDrive = async (req, res, isDownload = false) => {
    try {
        const invoiceId = req.params.id;
        const [rows] = await promiseDb.execute(
            'SELECT * FROM invoices WHERE id = ? OR invoice_number = ?',
            [invoiceId, invoiceId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const invoice = rows[0];

        // 1. Try streaming from Google Drive if file_id exists (eSign or Manually Signed)
        const fileIdToStream = invoice.google_drive_file_id || invoice.manual_signed_file_id;
        if (fileIdToStream) {
            try {
                console.log(`[GoogleDrive] Streaming signed PDF for invoice ${invoice.invoice_number || invoice.id}`);
                const pdfStream = await googleDrive.getSignedPDFStream(fileIdToStream);
                const safeNum = (invoice.invoice_number || `JA-${invoice.id}`).replace(/[/\\?%*:|"<>]/g, '-');
                const fileName = invoice.manual_signed_file_name || invoice.google_drive_file_name || `Signed_Invoice_${safeNum}.pdf`;

                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `${isDownload ? 'attachment' : 'inline'}; filename="${fileName}"`);
                return pdfStream.pipe(res);
            } catch (driveErr) {
                console.warn('[GoogleDrive Stream Warning]: Drive stream failed, falling back to dynamic PDF rendering:', driveErr.message);
            }
        }

        // 2. Fallback: Generate merged PDF dynamically on backend
        console.log(`[PDF Generator] Generating dynamic PDF stream for invoice ${invoice.invoice_number}...`);
        let rawItems = invoice.items;
        if (typeof rawItems === 'string') {
            try { rawItems = JSON.parse(rawItems); } catch (e) { rawItems = []; }
        }
        const items = Array.isArray(rawItems) ? rawItems : [];

        const invoiceData = {
            ...invoice,
            invoice_no: invoice.invoice_number,
            date: invoice.invoice_date ? (invoice.invoice_date.toISOString ? invoice.invoice_date.toISOString().split('T')[0] : String(invoice.invoice_date)) : '',
            customer: invoice.client_name,
            customer_gstin: invoice.client_gstin,
            customer_address: invoice.client_address,
            customer_state: invoice.client_state,
            bank_name: invoice.bank_name,
            account_number: invoice.account_number,
            ifsc_code: invoice.ifsc_code,
            items: items,
            base_amount: parseFloat(invoice.base_amount) || 0,
            sgst: parseFloat(invoice.sgst) || 0,
            cgst: parseFloat(invoice.cgst) || 0,
            igst: parseFloat(invoice.igst) || 0,
            total_amount: parseFloat(invoice.total_amount) || 0,
            net_amount: parseFloat(invoice.net_amount) || 0,
            company_logo: "http://localhost:3000/JAYARAMA%20LOGO1.png"
        };

        const invoiceHTML = buildInvoiceHTML(invoiceData);
        const outputPath = path.join(tempDir, `invoice-view-${invoice.id}-${Date.now()}.pdf`);
        await generateInvoicePDF(invoiceHTML, outputPath);
        const rawInvoicePdfBuffer = fs.readFileSync(outputPath);
        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
        }

        const pdfBuffer = await mergeInvoiceAndAttachedPdfs(rawInvoicePdfBuffer, [], invoice.attached_pdfs);

        const safeNum = (invoice.invoice_number || `JA-${invoice.id}`).replace(/[/\\?%*:|"<>]/g, '-');
        const fileName = `Signed_Invoice_${safeNum}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${isDownload ? 'attachment' : 'inline'}; filename="${fileName}"`);
        res.send(pdfBuffer);
    } catch (error) {
        console.error('[PDF Stream Error]:', error);
        res.status(500).json({ error: 'Failed to generate signed PDF' });
    }
};

// STEP 10 & 11 — Routes to stream/view signed PDF directly from Google Drive
app.get('/api/invoices/:id/signed-pdf', authenticateToken, async (req, res) => {
    await streamSignedPDFFromDrive(req, res, false);
});

app.get('/api/invoices/:id/open-signed-pdf', authenticateToken, async (req, res) => {
    await streamSignedPDFFromDrive(req, res, false);
});

app.get('/api/invoices/:id/download-signed-pdf', authenticateToken, async (req, res) => {
    await streamSignedPDFFromDrive(req, res, true);
});

// ============= MANUAL SIGNATURE WORKFLOW ROUTES =============

const manualSignPdfUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024 }, // 30MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed for signed invoice upload!'));
        }
    }
});

// 1. Download Unsigned PDF for Manual Signing
app.get('/api/invoices/:id/manual-signature/download-unsigned', authenticateToken, async (req, res) => {
    try {
        const invoiceId = req.params.id;
        const [rows] = await promiseDb.execute(
            'SELECT * FROM invoices WHERE id = ? OR invoice_number = ?',
            [invoiceId, invoiceId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const invoice = rows[0];

        let rawItems = invoice.items;
        if (typeof rawItems === 'string') {
            try { rawItems = JSON.parse(rawItems); } catch (e) { rawItems = []; }
        }
        const items = Array.isArray(rawItems) ? rawItems : [];

        // Build complete invoice data without digital signatures
        const invoiceData = {
            ...invoice,
            invoice_no: invoice.invoice_number,
            date: invoice.date ? (invoice.date.toISOString ? invoice.date.toISOString().split('T')[0] : String(invoice.date)) : '',
            customer: invoice.client_name,
            customer_gstin: invoice.client_gst,
            customer_address: invoice.client_address,
            customer_state: invoice.client_state,
            bank_name: invoice.bank_name || 'AXIS BANK LIMITED',
            bank_account_no: invoice.bank_account_no || '922020060131840',
            bank_ifsc: invoice.bank_ifsc || 'UTIB0000425',
            account_holder: invoice.account_holder || 'JAYARAMA ASSOCIATES',
            items: items,
            base_amount: parseFloat(invoice.base_amount) || 0,
            sgst: parseFloat(invoice.sgst) || 0,
            cgst: parseFloat(invoice.cgst) || 0,
            igst: parseFloat(invoice.igst) || 0,
            total_amount: parseFloat(invoice.total_amount) || 0,
            net_amount: parseFloat(invoice.net_amount) || 0,
            signature_data: null, // Unsigned template for physical signing
            company_logo: "http://localhost:3000/JAYARAMA%20LOGO1.png"
        };

        const invoiceHTML = buildInvoiceHTML(invoiceData);
        const outputPath = path.join(tempDir, `invoice-unsigned-${invoice.id}-${Date.now()}.pdf`);
        await generateInvoicePDF(invoiceHTML, outputPath);
        const rawInvoicePdfBuffer = fs.readFileSync(outputPath);
        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
        }

        // If there are attached PDFs, bundle them cleanly
        let finalPdfBuffer = rawInvoicePdfBuffer;
        if (invoice.attached_pdfs) {
            let attachedList = [];
            try {
                const parsed = typeof invoice.attached_pdfs === 'string' ? JSON.parse(invoice.attached_pdfs) : invoice.attached_pdfs;
                if (Array.isArray(parsed)) attachedList = parsed;
            } catch (e) { }

            if (attachedList.length > 0) {
                try {
                    const mergedDoc = await PDFDocument.create();
                    const mainDoc = await PDFDocument.load(rawInvoicePdfBuffer);
                    const mainPages = await mergedDoc.copyPages(mainDoc, mainDoc.getPageIndices());
                    mainPages.forEach(p => mergedDoc.addPage(p));

                    for (let i = 0; i < attachedList.length; i++) {
                        const att = attachedList[i];
                        if (att && att.data) {
                            const base64Data = att.data.replace(/^data:application\/pdf;base64,/, '');
                            const buf = Buffer.from(base64Data, 'base64');
                            const attDoc = await PDFDocument.load(buf);
                            const pages = await mergedDoc.copyPages(attDoc, attDoc.getPageIndices());
                            pages.forEach(p => mergedDoc.addPage(p));
                        }
                    }
                    const mergedBytes = await mergedDoc.save();
                    finalPdfBuffer = Buffer.from(mergedBytes);
                } catch (mergeErr) {
                    console.error('[Manual Signature] Merge error for unsigned PDF:', mergeErr);
                }
            }
        }

        const safeNum = (invoice.invoice_number || `INV-${invoice.id}`).replace(/[/\\?%*:|"<>]/g, '_');
        const fileName = `${safeNum}_Unsigned.pdf`;

        console.log(`[Manual Signature] Downloading unsigned PDF for invoice ${invoice.invoice_number} by ${req.user.email}`);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(finalPdfBuffer);

    } catch (error) {
        console.error('[Manual Signature] Download unsigned PDF error:', error);
        res.status(500).json({ error: 'Failed to generate unsigned invoice PDF: ' + error.message });
    }
});

// 2. Upload Manually Signed PDF
app.post('/api/invoices/:id/manual-signature/upload', authenticateToken, manualSignPdfUpload.single('signed_pdf'), async (req, res) => {
    try {
        const invoiceId = req.params.id;

        if (!req.file) {
            return res.status(400).json({ error: 'Please select a PDF file to upload' });
        }

        const [rows] = await promiseDb.execute(
            'SELECT * FROM invoices WHERE id = ?',
            [invoiceId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const invoice = rows[0];

        if (invoice.approval_status === 'final_approved' || invoice.signature_data) {
            return res.status(400).json({ error: 'Cannot manually sign: This invoice has already been digitally signed via eSign.' });
        }

        const safeNum = (invoice.invoice_number || `INV-${invoiceId}`).replace(/[/\\?%*:|"<>]/g, '_');
        const driveFileName = `${safeNum}_Manually_Signed.pdf`;

        console.log(`[Manual Signature] Uploading signed invoice for ${invoice.invoice_number} by user ${req.user.email}...`);

        // Upload to Google Drive under 'Manually Signed Invoices' folder
        const driveResult = await googleDrive.uploadManuallySignedPDF(req.file.buffer, driveFileName);

        const now = new Date();
        const uploadedAt = now.toISOString().slice(0, 19).replace('T', ' ');

        // Update database with manual signature details
        await promiseDb.execute(`
            UPDATE invoices
            SET manual_signature_status = 'Manually Signed',
                manual_signed_file_id = ?,
                manual_signed_file_url = ?,
                manual_signed_file_name = ?,
                manual_signed_uploaded_at = NOW(),
                manual_signed_uploaded_by = ?
            WHERE id = ?
        `, [
            driveResult.fileId,
            driveResult.webViewLink || null,
            driveResult.fileName || driveFileName,
            req.user.id,
            invoiceId
        ]);

        console.log(`[Audit] User ${req.user.email} uploaded manually signed invoice for ${invoice.invoice_number} (File ID: ${driveResult.fileId})`);

        res.json({
            success: true,
            message: 'Manually signed invoice uploaded successfully to Google Drive',
            invoice_id: invoiceId,
            invoice_number: invoice.invoice_number,
            manual_signature_status: 'Manually Signed',
            manual_signed_file_id: driveResult.fileId,
            manual_signed_file_name: driveResult.fileName || driveFileName,
            manual_signed_file_url: driveResult.webViewLink || null,
            manual_signed_uploaded_at: uploadedAt,
            download_url: `/api/invoices/${invoiceId}/manual-signature/download`,
            view_url: `/api/invoices/${invoiceId}/manual-signature/view`
        });

    } catch (error) {
        console.error('[Manual Signature] Upload error:', error);
        res.status(500).json({ error: 'Failed to upload manually signed invoice: ' + error.message });
    }
});

// 3. Replace Manually Signed PDF
app.post('/api/invoices/:id/manual-signature/replace', authenticateToken, manualSignPdfUpload.single('signed_pdf'), async (req, res) => {
    try {
        const invoiceId = req.params.id;

        if (!req.file) {
            return res.status(400).json({ error: 'Please select a replacement PDF file to upload' });
        }

        const [rows] = await promiseDb.execute(
            'SELECT * FROM invoices WHERE id = ?',
            [invoiceId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const invoice = rows[0];

        if (invoice.approval_status === 'final_approved' || invoice.signature_data) {
            return res.status(400).json({ error: 'Cannot replace manual signature: This invoice has already been digitally signed via eSign.' });
        }
        const oldFileId = invoice.manual_signed_file_id;

        // Optionally delete old file from drive/storage
        if (oldFileId) {
            try {
                await googleDrive.deleteFile(oldFileId);
            } catch (delErr) {
                console.warn('[Manual Signature] Could not delete old file:', delErr.message);
            }
        }

        const safeNum = (invoice.invoice_number || `INV-${invoiceId}`).replace(/[/\\?%*:|"<>]/g, '_');
        const driveFileName = `${safeNum}_Manually_Signed.pdf`;

        console.log(`[Manual Signature] Replacing signed invoice for ${invoice.invoice_number} by user ${req.user.email}...`);

        const driveResult = await googleDrive.uploadManuallySignedPDF(req.file.buffer, driveFileName);

        const now = new Date();
        const uploadedAt = now.toISOString().slice(0, 19).replace('T', ' ');

        await promiseDb.execute(`
            UPDATE invoices
            SET manual_signature_status = 'Manually Signed',
                manual_signed_file_id = ?,
                manual_signed_file_url = ?,
                manual_signed_file_name = ?,
                manual_signed_uploaded_at = NOW(),
                manual_signed_uploaded_by = ?
            WHERE id = ?
        `, [
            driveResult.fileId,
            driveResult.webViewLink || null,
            driveResult.fileName || driveFileName,
            req.user.id,
            invoiceId
        ]);

        console.log(`[Audit] User ${req.user.email} replaced manually signed invoice for ${invoice.invoice_number} (New File ID: ${driveResult.fileId})`);

        res.json({
            success: true,
            message: 'Manually signed invoice replaced successfully in Google Drive',
            invoice_id: invoiceId,
            invoice_number: invoice.invoice_number,
            manual_signature_status: 'Manually Signed',
            manual_signed_file_id: driveResult.fileId,
            manual_signed_file_name: driveResult.fileName || driveFileName,
            manual_signed_file_url: driveResult.webViewLink || null,
            manual_signed_uploaded_at: uploadedAt,
            download_url: `/api/invoices/${invoiceId}/manual-signature/download`,
            view_url: `/api/invoices/${invoiceId}/manual-signature/view`
        });

    } catch (error) {
        console.error('[Manual Signature] Replace error:', error);
        res.status(500).json({ error: 'Failed to replace manually signed invoice: ' + error.message });
    }
});

// 4. View Manually Signed PDF inline
app.get(['/api/invoices/:id/manual-signature/view', '/api/invoices/:id/manual-signature/open'], authenticateToken, async (req, res) => {
    try {
        const invoiceId = req.params.id;
        const [rows] = await promiseDb.execute(
            'SELECT * FROM invoices WHERE id = ? OR invoice_number = ?',
            [invoiceId, invoiceId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const invoice = rows[0];

        if (!invoice.manual_signed_file_id) {
            return res.status(404).json({ error: 'No manually signed invoice has been uploaded for this record.' });
        }

        const safeNum = (invoice.invoice_number || `INV-${invoice.id}`).replace(/[/\\?%*:|"<>]/g, '_');
        const fileName = invoice.manual_signed_file_name || `${safeNum}_Manually_Signed.pdf`;

        console.log(`[Manual Signature] Streaming view for invoice ${invoice.invoice_number} (File ID: ${invoice.manual_signed_file_id})`);

        const pdfStream = await googleDrive.getManuallySignedPDFStream(invoice.manual_signed_file_id);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
        pdfStream.pipe(res);

    } catch (error) {
        console.error('[Manual Signature] View error:', error);
        res.status(500).json({ error: 'Failed to view manually signed invoice: ' + error.message });
    }
});

// 5. Download Manually Signed PDF
app.get('/api/invoices/:id/manual-signature/download', authenticateToken, async (req, res) => {
    try {
        const invoiceId = req.params.id;
        const [rows] = await promiseDb.execute(
            'SELECT * FROM invoices WHERE id = ? OR invoice_number = ?',
            [invoiceId, invoiceId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const invoice = rows[0];

        if (!invoice.manual_signed_file_id) {
            return res.status(404).json({ error: 'No manually signed invoice has been uploaded for this record.' });
        }

        const safeNum = (invoice.invoice_number || `INV-${invoice.id}`).replace(/[/\\?%*:|"<>]/g, '_');
        const fileName = invoice.manual_signed_file_name || `${safeNum}_Manually_Signed.pdf`;

        console.log(`[Manual Signature] Streaming download for invoice ${invoice.invoice_number} (File ID: ${invoice.manual_signed_file_id})`);

        const pdfStream = await googleDrive.getManuallySignedPDFStream(invoice.manual_signed_file_id);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        pdfStream.pipe(res);

    } catch (error) {
        console.error('[Manual Signature] Download error:', error);
        res.status(500).json({ error: 'Failed to download manually signed invoice: ' + error.message });
    }
});

// ============= INVOICE ROUTES =============

app.get('/api/invoices/next-number', authenticateToken, async (req, res) => {
    try {
        const dateInput = req.query.date;
        const currentFY = getFinancialYear(dateInput);

        // Fetch ALL invoice numbers for current financial year
        const [rows] = await promiseDb.execute(
            `SELECT invoice_number FROM invoices WHERE invoice_number LIKE ?`,
            [`JA/${currentFY}/%`]
        );

        let maxSerial = 0;
        rows.forEach(r => {
            if (r.invoice_number) {
                const match = r.invoice_number.match(/JA\/\d{2}-\d{2}\/(\d+)/);
                if (match && match[1]) {
                    const num = parseInt(match[1], 10);
                    if (!isNaN(num) && num > maxSerial) {
                        maxSerial = num;
                    }
                }
            }
        });

        let nextSerial = maxSerial + 1;
        let formattedSerial = nextSerial.toString().padStart(3, '0');
        let invoiceNumber = `JA/${currentFY}/${formattedSerial}`;

        // Loop safety check to guarantee uniqueness in database
        let isUnique = false;
        let safetyCounter = 0;
        while (!isUnique && safetyCounter < 100) {
            const [checkRows] = await promiseDb.execute(
                `SELECT id FROM invoices WHERE invoice_number = ?`,
                [invoiceNumber]
            );
            if (checkRows.length === 0) {
                isUnique = true;
            } else {
                nextSerial++;
                formattedSerial = nextSerial.toString().padStart(3, '0');
                invoiceNumber = `JA/${currentFY}/${formattedSerial}`;
                safetyCounter++;
            }
        }

        res.json({
            success: true,
            invoiceNumber: invoiceNumber,
            previousNumber: maxSerial > 0 ? `JA/${currentFY}/${maxSerial.toString().padStart(3, '0')}` : 'None',
            nextSerial: nextSerial,
            financialYear: currentFY
        });

    } catch (error) {
        console.error('Generate invoice number error:', error);
        const dateInput = req.query.date;
        const currentFY = getFinancialYear(dateInput);
        const fallbackNumber = `JA/${currentFY}/001`;
        res.json({
            success: false,
            invoiceNumber: fallbackNumber,
            previousNumber: 'Error occurred'
        });
    }
});

// ============= INVOICE CHATBOT LOOKUP HELPER FUNCTIONS =============
function getFYCodeFromInvoice(dateStr, invNum) {
    if (invNum) {
        const m = invNum.match(/(?:JA[\/\-_])?(\d{2}-\d{2})/i);
        if (m && m[1]) return m[1];
    }
    if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            if (month >= 4) {
                return `${year.toString().slice(-2)}-${(year + 1).toString().slice(-2)}`;
            } else {
                return `${(year - 1).toString().slice(-2)}-${year.toString().slice(-2)}`;
            }
        }
    }
    return '00-00';
}

function getFYSortWeight(fyCode) {
    if (!fyCode) return 0;
    const parts = fyCode.split('-');
    if (parts.length === 2) {
        const startYr = parseInt(parts[0], 10);
        if (!isNaN(startYr)) {
            return startYr >= 70 ? 1900 + startYr : 2000 + startYr;
        }
    }
    return 0;
}

function parseLookupQuery(rawQuery) {
    if (!rawQuery) return null;
    const q = rawQuery.trim();
    
    // Check if query contains a financial year (e.g. "23-24", "26-27", "2023-2024", "2026-2027")
    let targetFY = null;
    const fyMatch = q.match(/\b(\d{2})-(\d{2})\b/) || q.match(/\b(20\d{2})-(20\d{2})\b/) || q.match(/\b(20\d{2})-(\d{2})\b/);
    if (fyMatch) {
        if (fyMatch[1].length === 4) {
            targetFY = `${fyMatch[1].slice(-2)}-${fyMatch[2].slice(-2)}`;
        } else {
            targetFY = `${fyMatch[1]}-${fyMatch[2]}`;
        }
    }

    // Extract serial number / digits excluding the FY
    let serialStr = '';
    if (targetFY) {
        const withoutFY = q.replace(new RegExp(`(?:JA[\\/\\-_]?)?${targetFY}`, 'i'), '')
                           .replace(/JA[\/\-_]/i, '')
                           .replace(/[^\d]/g, '');
        serialStr = withoutFY;
    } else {
        serialStr = q.replace(/\D/g, '');
    }

    const serialNum = serialStr ? parseInt(serialStr, 10) : null;
    const paddedSerial3 = serialStr ? serialStr.padStart(3, '0') : '';
    const paddedSerial4 = serialStr ? serialStr.padStart(4, '0') : '';

    return {
        originalQuery: q,
        targetFY, // e.g. "23-24" or null
        serialStr, // e.g. "1042", "42"
        serialNum, // e.g. 1042, 42
        paddedSerial3, // "042" or "1042"
        paddedSerial4 // "0042" or "1042"
    };
}

function scoreAndPickBestInvoice(queryObj, rows) {
    if (!rows || rows.length === 0) return null;

    const { originalQuery, targetFY, serialStr, serialNum, paddedSerial3 } = queryObj;
    const cleanQ = originalQuery.toLowerCase();
    const cleanNoDelim = cleanQ.replace(/[\/\-_\s]/g, '');

    const now = new Date();
    const currentFY = (now.getMonth() + 1 >= 4)
        ? `${now.getFullYear().toString().slice(-2)}-${(now.getFullYear() + 1).toString().slice(-2)}`
        : `${(now.getFullYear() - 1).toString().slice(-2)}-${now.getFullYear().toString().slice(-2)}`;

    let scoredInvoices = rows.map(inv => {
        const invNum = (inv.invoice_number || '').trim();
        const invNumLower = invNum.toLowerCase();
        const invNoDelim = invNumLower.replace(/[\/\-_\s]/g, '');
        const invFY = getFYCodeFromInvoice(inv.date, invNum);
        const fyWeight = getFYSortWeight(invFY);

        const parts = invNum.split('/');
        const lastPart = parts.length > 0 ? parts[parts.length - 1] : '';
        const invSerialDigits = lastPart.replace(/\D/g, '');
        const invSerialNum = invSerialDigits ? parseInt(invSerialDigits, 10) : null;

        let baseMatchScore = 0;

        // 1. Exact full invoice number match (e.g. "JA/26-27/083")
        if (invNumLower === cleanQ || invNoDelim === cleanNoDelim) {
            baseMatchScore = 10000;
        }
        // 2. User specified FY + Serial (e.g. "23-24/1042" or "23-24/42" or "JA/23-24/1042")
        else if (targetFY && invFY === targetFY) {
            if (serialNum !== null && invSerialNum === serialNum) {
                baseMatchScore = 9000; // Perfect match on specified FY and serial
            } else if (serialStr && lastPart.includes(serialStr)) {
                baseMatchScore = 8000;
            } else {
                baseMatchScore = 4000;
            }
        }
        // 3. User entered only serial / number without FY (e.g. "1042", "42", "042", "83", "083")
        else if (!targetFY && serialNum !== null) {
            if (invSerialNum === serialNum) {
                baseMatchScore = 7000;
            } else if (paddedSerial3 && (lastPart === paddedSerial3 || lastPart.endsWith(paddedSerial3))) {
                baseMatchScore = 6500;
            } else if (serialStr && (lastPart.endsWith(serialStr) || lastPart.includes(serialStr))) {
                baseMatchScore = 5000;
            } else if (invNumLower.includes(cleanQ)) {
                baseMatchScore = 3000;
            }
        }
        // 4. Substring match
        else if (invNumLower.includes(cleanQ)) {
            baseMatchScore = 2000;
        }

        // Add Financial Year recency bonus when user did NOT specify a specific FY
        // This guarantees that recent/current year invoices are always preferred!
        let fyBonus = 0;
        if (!targetFY) {
            fyBonus = fyWeight * 10;
            if (invFY === currentFY) {
                fyBonus += 500;
            }
        }

        const invDate = inv.date ? new Date(inv.date).getTime() : 0;
        const invCreated = inv.created_at ? new Date(inv.created_at).getTime() : 0;

        const totalScore = baseMatchScore + fyBonus;

        return {
            inv,
            baseMatchScore,
            totalScore,
            fyWeight,
            invFY,
            invSerialNum,
            invDate,
            invCreated
        };
    });

    scoredInvoices = scoredInvoices.filter(s => s.baseMatchScore > 0);
    if (scoredInvoices.length === 0) return null;

    // Sort by totalScore DESC, then invDate DESC, then invCreated DESC, then id DESC
    scoredInvoices.sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        if (b.invDate !== a.invDate) return b.invDate - a.invDate;
        if (b.invCreated !== a.invCreated) return b.invCreated - a.invCreated;
        return (b.inv.id || '').localeCompare(a.inv.id || '');
    });

    return scoredInvoices[0].inv;
}

// ============= INVOICE CHATBOT LOOKUP API =============
app.get('/api/invoices/lookup', authenticateToken, async (req, res) => {
    try {
        const queryNum = req.query.invoice_number || req.query.q;
        if (!queryNum || !queryNum.trim()) {
            return res.status(400).json({ success: false, error: 'Invoice number is required' });
        }

        const parsedQuery = parseLookupQuery(queryNum);
        if (!parsedQuery) {
            return res.json({ success: false, message: 'Invoice not found.' });
        }

        const { originalQuery, targetFY, serialStr, paddedSerial3 } = parsedQuery;

        // Build SQL search conditions to fetch potential candidates
        let whereClauses = [
            'LOWER(i.invoice_number) = LOWER(?)',
            'LOWER(i.id) = LOWER(?)',
            'i.invoice_number LIKE ?'
        ];
        let params = [
            originalQuery,
            originalQuery,
            `%${originalQuery}%`
        ];

        if (targetFY) {
            whereClauses.push('i.invoice_number LIKE ?');
            params.push(`%${targetFY}%`);

            if (serialStr) {
                whereClauses.push('i.invoice_number LIKE ?');
                params.push(`%${targetFY}%${serialStr}%`);
                if (paddedSerial3) {
                    whereClauses.push('i.invoice_number LIKE ?');
                    params.push(`%${targetFY}%${paddedSerial3}%`);
                }
            }
        } else if (serialStr) {
            whereClauses.push('i.invoice_number LIKE ?');
            params.push(`%/${serialStr}`);

            if (paddedSerial3 && paddedSerial3 !== serialStr) {
                whereClauses.push('i.invoice_number LIKE ?');
                params.push(`%/${paddedSerial3}`);
            }

            whereClauses.push('i.invoice_number LIKE ?');
            params.push(`%${serialStr}%`);
        }

        let query = `
            SELECT i.*, 
                   i.created_by_name as direct_created_by_name,
                   u.full_name as user_full_name,
                   c.name as client_bank_name
            FROM invoices i
            LEFT JOIN users u ON i.user_id = u.id
            LEFT JOIN clients c ON i.client_id = c.id
            WHERE (${whereClauses.join(' OR ')})
        `;

        if (req.user.role === 'user') {
            query += ` AND i.user_id = ?`;
            params.push(req.user.id);
        }

        query += ` ORDER BY i.date DESC, i.created_at DESC, i.id DESC LIMIT 100`;

        const [rows] = await promiseDb.execute(query, params);

        if (!rows || rows.length === 0) {
            return res.json({ success: false, message: 'Invoice not found.' });
        }

        const bestInvoice = scoreAndPickBestInvoice(parsedQuery, rows);
        if (!bestInvoice) {
            return res.json({ success: false, message: 'Invoice not found.' });
        }

        const invoice = bestInvoice;

        // Parse items
        let items = [];
        try {
            items = typeof invoice.items === 'string' ? JSON.parse(invoice.items) : (invoice.items || []);
        } catch (e) {
            items = [];
        }

        // Format Date
        let dateString = null;
        if (invoice.date) {
            if (invoice.date instanceof Date) {
                const year = invoice.date.getFullYear();
                const month = String(invoice.date.getMonth() + 1).padStart(2, '0');
                const day = String(invoice.date.getDate()).padStart(2, '0');
                dateString = `${year}-${month}-${day}`;
            } else {
                const dateStr = String(invoice.date);
                if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
                    dateString = dateStr.split('T')[0].split(' ')[0];
                } else {
                    dateString = dateStr;
                }
            }
        }

        const base = parseFloat(invoice.base_amount) || 0;
        const total = parseFloat(invoice.total_amount) || 0;
        const tds = parseFloat(invoice.tds_amount) || 0;
        const net = total - tds;
        const received = parseFloat(invoice.received) || 0;
        const pending = Math.max(0, net - received);

        const creatorName = invoice.user_full_name || invoice.full_name || invoice.direct_created_by_name || invoice.created_by_name || (invoice.user_id === req.user.id ? (req.user.full_name || 'User') : 'Unknown');

        const formattedInvoice = {
            ...invoice,
            items,
            date: dateString,
            calculated_base_amount: base,
            calculated_total_amount: total,
            calculated_net_amount: net,
            calculated_pending: pending,
            received: received,
            created_by_name: creatorName
        };

        res.json({
            success: true,
            invoice: formattedInvoice
        });
    } catch (error) {
        console.error('Invoice lookup chatbot API error:', error);
        res.status(500).json({ success: false, error: 'Failed to query invoice data' });
    }
});

// GET all invoices
app.get('/api/invoices', authenticateToken, async (req, res) => {
    try {
        let query = `
            SELECT i.*, 
                   i.created_by_name as stored_created_by,
                   u.full_name as user_full_name,
                   c.name as client_bank_name
            FROM invoices i
            LEFT JOIN users u ON i.user_id = u.id
            LEFT JOIN clients c ON i.client_id = c.id
        `;
        let params = [];

        if (req.user.role === 'user') {
            query += ` WHERE i.user_id = ?`;
            params.push(req.user.id);
        }

        query += ` ORDER BY i.created_at DESC`;

        const [invoices] = await promiseDb.execute(query, params);

        console.log(`User ${req.user.email} (${req.user.role}) fetched ${invoices.length} invoices`);

        const parsedInvoices = invoices.map(invoice => {
            let items = [];
            try {
                items = typeof invoice.items === 'string' ? JSON.parse(invoice.items) : (invoice.items || []);
            } catch (e) {
                items = [];
            }

            let dateString = null;
            if (invoice.date) {
                if (invoice.date instanceof Date) {
                    const year = invoice.date.getFullYear();
                    const month = String(invoice.date.getMonth() + 1).padStart(2, '0');
                    const day = String(invoice.date.getDate()).padStart(2, '0');
                    dateString = `${year}-${month}-${day}`;
                } else {
                    const dateStr = String(invoice.date);
                    if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
                        dateString = dateStr.split('T')[0].split(' ')[0];
                    } else {
                        dateString = dateStr;
                    }
                }
            }

            let attachedPdfs = [];
            try {
                attachedPdfs = typeof invoice.attached_pdfs === 'string' ? JSON.parse(invoice.attached_pdfs) : (invoice.attached_pdfs || []);
            } catch (e) {
                attachedPdfs = [];
            }

            let base = parseFloat(invoice.base_amount) || 0;
            let total = parseFloat(invoice.total_amount) || 0;
            let tds = parseFloat(invoice.tds_amount) || 0;
            let net = parseFloat(invoice.net_amount) || 0;

            // Auto-repair values if base_amount or net_amount is 0 in DB but items exist
            if (base === 0 && items.length > 0) {
                items.forEach(item => {
                    const price = parseFloat(item.price) || parseFloat(item.amount) || 0;
                    const quantity = item.quantity !== undefined ? parseFloat(item.quantity) : 1;
                    base += price * quantity;
                });
            }
            if (total === 0 && base > 0) {
                const supplyLocation = invoice.client_state || invoice.place_of_supply || DEFAULT_PLACE_OF_SUPPLY;
                const taxRate = parseFloat(invoice.tax_rate) || DEFAULT_TAX_RATE;
                const taxCalc = calculateTaxAmounts(base, supplyLocation, taxRate);
                total = taxCalc.totalAmount;
            }
            if (tds === 0 && base > 0) {
                tds = parseFloat((base * 0.10).toFixed(2));
            }
            if (net === 0 && total > 0) {
                net = total - tds;
            }

            const creatorName = invoice.user_full_name || invoice.full_name || invoice.stored_created_by || invoice.created_by_name || 'Unknown';

            return {
                ...invoice,
                items: items,
                base_amount: base,
                total_amount: total,
                tds_amount: tds,
                net_amount: net,
                calculated_base_amount: base,
                calculated_total_amount: total,
                calculated_tds_amount: tds,
                calculated_net_amount: net,
                attached_pdfs: attachedPdfs,
                date: dateString,
                created_by_name: creatorName,
                full_name: creatorName
            };
        });

        res.json(parsedInvoices);
    } catch (error) {
        console.error('Get invoices error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// CREATE or UPDATE invoice
app.post('/api/invoices', authenticateToken, async (req, res) => {
    try {
        const invoice = req.body;

        const [userInfo] = await promiseDb.execute(
            'SELECT full_name FROM users WHERE id = ?',
            [req.user.id]
        );
        const currentUserName = userInfo.length > 0 ? userInfo[0].full_name : req.user.full_name || 'Unknown';

        if (!invoice.id) {
            const [existing] = await promiseDb.execute(
                'SELECT id FROM invoices WHERE invoice_number = ?',
                [invoice.invoice_number || '']
            );

            if (existing.length > 0) {
                return res.status(400).json({
                    error: 'Invoice number already exists! Please refresh the page to get a new number.'
                });
            }
            invoice.id = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        let mysqlDate = null;
        if (invoice.date) {
            if (typeof invoice.date === 'string' && invoice.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                mysqlDate = invoice.date;
            }
            else if (typeof invoice.date === 'string' && invoice.date.match(/^\d{2}-\d{2}-\d{4}$/)) {
                const [day, month, year] = invoice.date.split('-');
                mysqlDate = `${year}-${month}-${day}`;
            }
            else if (invoice.date instanceof Date) {
                const year = invoice.date.getFullYear();
                const month = String(invoice.date.getMonth() + 1).padStart(2, '0');
                const day = String(invoice.date.getDate()).padStart(2, '0');
                mysqlDate = `${year}-${month}-${day}`;
            }
            else {
                const parsedDate = new Date(invoice.date);
                if (!isNaN(parsedDate.getTime())) {
                    const year = parsedDate.getFullYear();
                    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
                    const day = String(parsedDate.getDate()).padStart(2, '0');
                    mysqlDate = `${year}-${month}-${day}`;
                }
            }
        }

        if (!mysqlDate) {
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            mysqlDate = `${year}-${month}-${day}`;
        }

        const [existingInvoice] = await promiseDb.execute(
            'SELECT * FROM invoices WHERE id = ?',
            [invoice.id]
        );

        let items = invoice.items;
        if (typeof items === 'string') {
            try { items = JSON.parse(items); } catch (e) { items = []; }
        }
        if (!Array.isArray(items)) items = [];

        // If items not passed or empty when updating, preserve existing items from DB
        if (items.length === 0 && existingInvoice.length > 0 && existingInvoice[0].items) {
            try {
                const storedItems = typeof existingInvoice[0].items === 'string' ? JSON.parse(existingInvoice[0].items) : existingInvoice[0].items;
                if (Array.isArray(storedItems) && storedItems.length > 0) {
                    items = storedItems;
                }
            } catch (e) { }
        }

        let baseAmount = 0;
        items.forEach(item => {
            const price = parseFloat(item.price) || parseFloat(item.amount) || 0;
            const quantity = item.quantity !== undefined ? parseFloat(item.quantity) : 1;
            baseAmount += price * quantity;
        });

        if (!baseAmount || baseAmount === 0) {
            baseAmount = parseFloat(invoice.base_amount || invoice.calculated_base_amount || invoice.amount) || 0;
        }
        if ((!baseAmount || baseAmount === 0) && existingInvoice.length > 0) {
            baseAmount = parseFloat(existingInvoice[0].base_amount) || 0;
        }

        let supplyLocation = invoice.client_state || invoice.place_of_supply || (existingInvoice.length > 0 ? existingInvoice[0].place_of_supply : null) || DEFAULT_PLACE_OF_SUPPLY;
        const taxRate = parseFloat(invoice.tax_rate) || (existingInvoice.length > 0 ? parseFloat(existingInvoice[0].tax_rate) : null) || DEFAULT_TAX_RATE;

        let taxCalculations;
        if (baseAmount > 0) {
            taxCalculations = calculateTaxAmounts(baseAmount, supplyLocation, taxRate);
        } else if (existingInvoice.length > 0 && parseFloat(existingInvoice[0].total_amount) > 0) {
            taxCalculations = {
                baseAmount: parseFloat(existingInvoice[0].base_amount) || 0,
                sgst: parseFloat(existingInvoice[0].sgst) || 0,
                cgst: parseFloat(existingInvoice[0].cgst) || 0,
                igst: parseFloat(existingInvoice[0].igst) || 0,
                totalAmount: parseFloat(existingInvoice[0].total_amount) || 0,
                taxRate: taxRate
            };
            baseAmount = taxCalculations.baseAmount;
        } else {
            taxCalculations = calculateTaxAmounts(0, supplyLocation, taxRate);
        }

        let tdsAmount = parseFloat(invoice.tds_amount !== undefined ? invoice.tds_amount : invoice.calculated_tds_amount);
        if (isNaN(tdsAmount)) {
            if (existingInvoice.length > 0 && existingInvoice[0].tds_amount !== undefined) {
                tdsAmount = parseFloat(existingInvoice[0].tds_amount) || 0;
            } else {
                tdsAmount = parseFloat((baseAmount * 0.10).toFixed(2));
            }
        }

        let netAmount = taxCalculations.totalAmount - tdsAmount;
        if ((!netAmount || netAmount <= 0) && existingInvoice.length > 0 && parseFloat(existingInvoice[0].net_amount) > 0) {
            netAmount = parseFloat(existingInvoice[0].net_amount);
        }

        let paymentStatus = invoice.payment_status || (existingInvoice.length > 0 ? existingInvoice[0].payment_status : 'unpaid');
        const allowedStatuses = ['paid', 'unpaid', 'cancelled'];

        if (!allowedStatuses.includes(paymentStatus)) {
            paymentStatus = 'unpaid';
        }

        const amountInWords = convertToWords(taxCalculations.totalAmount);
        const itemsJson = JSON.stringify(items);

        const bankName = invoice.bank_name || 'AXIS BANK LIMITED';
        const bankAccountNo = invoice.bank_account_no || '922020060131840';
        const bankIfsc = invoice.bank_ifsc || 'UTIB0000425';
        const accountHolder = invoice.account_holder || 'JAYARAMA ASSOCIATES';
        const businessName = invoice.business_name || DEFAULT_BUSINESS_NAME;
        const businessAddress = invoice.business_address || DEFAULT_BUSINESS_ADDRESS;
        const termsConditions = invoice.terms_conditions || 'Thanks for doing business with us!';
        const authorizedSignatory = invoice.authorized_signatory || 'JAYARAMA ASSOCIATES';

        const clientId = invoice.client_id || null;
        const clientName = invoice.client_name || null;
        const clientAddress = invoice.client_address || null;
        const clientBranch = invoice.client_branch || null;
        const clientGst = invoice.client_gst || null;
        const clientPhone = invoice.client_phone || null;
        const clientEmail = invoice.client_email || null;
        const description = invoice.description || null;
        const currency = invoice.currency || 'INR';
        const paymentDueDate = invoice.payment_due_date || null;
        const remarks = invoice.remarks || null;
        const placeOfSupplyToSave = invoice.place_of_supply || supplyLocation;

        let approvalStatus = invoice.approval_status || 'created';

        let finalReceived = parseFloat(invoice.received);
        if (isNaN(finalReceived)) {
            finalReceived = existingInvoice.length > 0 ? parseFloat(existingInvoice[0].received) || 0 : 0;
        }

        let finalPendingAmount = netAmount - finalReceived;
        let finalPaymentStatus = paymentStatus;

        if (existingInvoice.length === 0) {
            // BRAND NEW INVOICE CREATION: Always lock payment to unpaid and received = 0
            finalPaymentStatus = 'unpaid';
            finalReceived = 0;
            finalPendingAmount = netAmount;
            approvalStatus = 'created';
        } else {
            const currentApproval = existingInvoice[0].approval_status || 'created';
            const currentPayment = existingInvoice[0].payment_status || 'unpaid';
            const isManuallySigned = existingInvoice[0].manual_signature_status === 'Manually Signed' || !!existingInvoice[0].manual_signed_file_id;
            const isApprovedOrSigned = currentApproval === 'final_approved' || isManuallySigned;

            // Once cancelled, permanently locked to cancelled
            if (currentPayment === 'cancelled' && finalPaymentStatus !== 'cancelled') {
                return res.status(400).json({
                    error: 'This invoice is cancelled and its payment status cannot be changed.'
                });
            }

            // Before eSign or Manual Signature upload, payment is locked to unpaid (unless user is cancelling)
            if (!isApprovedOrSigned && finalPaymentStatus !== 'cancelled') {
                if (finalPaymentStatus === 'paid' || finalReceived > 0) {
                    return res.status(400).json({
                        error: 'Payment cannot be recorded until the invoice receives final eSign approval or a manually signed copy is uploaded.'
                    });
                }
                finalPaymentStatus = 'unpaid';
                finalReceived = 0;
                finalPendingAmount = netAmount;
            } else if (isApprovedOrSigned) {
                // Unlocked post-eSign / post-manual-signature phase
                if (finalPaymentStatus === 'paid') {
                    if (finalReceived <= 0 || finalReceived < netAmount) {
                        finalReceived = netAmount;
                    }
                    finalPendingAmount = 0;
                } else if (finalReceived >= netAmount && netAmount > 0 && finalPaymentStatus !== 'cancelled') {
                    finalPaymentStatus = 'paid';
                    finalPendingAmount = 0;
                } else if (finalReceived > 0 && finalReceived < netAmount && finalPaymentStatus !== 'cancelled') {
                    finalPaymentStatus = 'unpaid'; // Frontend renders PARTIAL with balance
                    finalPendingAmount = Math.max(0, netAmount - finalReceived);
                } else if (finalReceived <= 0 && finalPaymentStatus !== 'cancelled') {
                    finalPaymentStatus = 'unpaid';
                    finalPendingAmount = netAmount;
                }
            }
        }

        let manualSignatureStatusToSave = invoice.manual_signature_status || (existingInvoice.length > 0 ? existingInvoice[0].manual_signature_status : 'Not Required');
        if (invoice.manual_signed_file_data || invoice.manual_signed_file_name || invoice.manual_signature_status === 'Manually Signed') {
            manualSignatureStatusToSave = 'Manually Signed';
        }

        // If existing invoice was already signed (digitally or manually), strictly preserve its signature status
        if (existingInvoice.length > 0) {
            if (existingInvoice[0].approval_status === 'final_approved') {
                approvalStatus = 'final_approved';
            }
            if (existingInvoice[0].manual_signature_status === 'Manually Signed') {
                manualSignatureStatusToSave = 'Manually Signed';
            }
        }

        let attachedPdfsJson = null;
        if (invoice.attached_pdfs) {
            attachedPdfsJson = typeof invoice.attached_pdfs === 'string'
                ? invoice.attached_pdfs
                : JSON.stringify(invoice.attached_pdfs);
        }

        if (existingInvoice.length > 0) {
            // Keep original created_by_name if it exists, don't overwrite with editor's name
            const originalCreatedByName = existingInvoice[0].created_by_name || currentUserName;

            // Check if invoice was already signed and has a file in Google Drive/storage
            const targetDriveFileId = existingInvoice[0].google_drive_file_id || existingInvoice[0].manual_signed_file_id;
            const isAlreadySigned = existingInvoice[0].approval_status === 'final_approved' || existingInvoice[0].manual_signature_status === 'Manually Signed' || !!targetDriveFileId;

            let updatedDriveFileId = existingInvoice[0].google_drive_file_id;
            let updatedDriveFileName = existingInvoice[0].google_drive_file_name;

            if (isAlreadySigned && targetDriveFileId) {
                try {
                    console.log(`[GoogleDrive Update] Updating merged PDF bundle for already signed invoice ${existingInvoice[0].invoice_number || invoice.id}...`);
                    const existingSignedBuffer = await googleDrive.getSignedPDFBuffer(targetDriveFileId);

                    if (existingSignedBuffer) {
                        // Extract only Page 1 (the digitally or manually signed invoice)
                        let page1Buffer = existingSignedBuffer;
                        try {
                            const originalDoc = await PDFDocument.load(existingSignedBuffer);
                            if (originalDoc.getPageCount() > 0) {
                                const page1Doc = await PDFDocument.create();
                                const [p1] = await page1Doc.copyPages(originalDoc, [0]);
                                page1Doc.addPage(p1);
                                const page1Bytes = await page1Doc.save();
                                page1Buffer = Buffer.from(page1Bytes);
                            }
                        } catch (pageErr) {
                            console.warn('[PDF Extract] Could not extract single page 1, using full buffer:', pageErr.message);
                        }

                        // Merge Page 1 with the updated attached PDFs
                        const newMergedBuffer = await mergeInvoiceAndAttachedPdfs(page1Buffer, [], attachedPdfsJson);

                        const safeNum = (existingInvoice[0].invoice_number || invoice.invoice_number || `JA-${invoice.id}`).replace(/[/\\?%*:|"<>]/g, '-');
                        const defaultFileName = existingInvoice[0].google_drive_file_name || `Signed_Invoice_${safeNum}.pdf`;

                        const updateRes = await googleDrive.updateSignedPDF(targetDriveFileId, newMergedBuffer, defaultFileName);
                        if (updateRes && updateRes.fileId) {
                            updatedDriveFileId = updateRes.fileId;
                            updatedDriveFileName = updateRes.fileName || defaultFileName;
                            console.log(`[GoogleDrive Update] Successfully replaced file in Google Drive (File ID: ${updatedDriveFileId})`);
                        }
                    }
                } catch (driveUpdateErr) {
                    console.error('[GoogleDrive Update Error]:', driveUpdateErr.message || driveUpdateErr);
                }
            }

            await promiseDb.execute(
                `UPDATE invoices SET
                    invoice_number = ?, date = ?,
                    business_name = ?, business_address = ?,
                    client_id = ?, client_name = ?, client_address = ?, client_branch = ?,
                    client_gst = ?, client_phone = ?, client_email = ?,
                    place_of_supply = ?, description = ?, currency = ?,
                    base_amount = ?, tax_rate = ?, sgst = ?, cgst = ?, igst = ?,
                    total_amount = ?, tds_amount = ?, net_amount = ?,
                    received = ?, pending_amount = ?, payment_status = ?,
                    approval_status = ?, manual_signature_status = ?,
                    google_drive_file_id = ?, google_drive_file_name = ?,
                    payment_due_date = ?, bank_name = ?, bank_account_no = ?,
                    bank_ifsc = ?, account_holder = ?, amount_in_words = ?,
                    terms_conditions = ?, authorized_signatory = ?, remarks = ?,
                    items = ?, attached_pdfs = ?, created_by_name = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [
                    invoice.invoice_number, mysqlDate,
                    businessName, businessAddress,
                    clientId, clientName, clientAddress, clientBranch,
                    clientGst, clientPhone, clientEmail,
                    placeOfSupplyToSave, description, currency,
                    baseAmount, taxRate, taxCalculations.sgst, taxCalculations.cgst, taxCalculations.igst,
                    taxCalculations.totalAmount, tdsAmount, netAmount,
                    finalReceived, finalPendingAmount, finalPaymentStatus,
                    approvalStatus, manualSignatureStatusToSave,
                    updatedDriveFileId, updatedDriveFileName,
                    paymentDueDate, bankName, bankAccountNo,
                    bankIfsc, accountHolder, amountInWords, termsConditions,
                    authorizedSignatory, remarks, itemsJson, attachedPdfsJson,
                    originalCreatedByName,
                    invoice.id
                ]
            );
            console.log('✅ Updated existing invoice:', invoice.id);
        } else {
            const finalUserId = invoice.user_id || req.user.id;

            await promiseDb.execute(
                `INSERT INTO invoices (
                    id, user_id, created_by_name, invoice_number, date,
                    business_name, business_address,
                    client_id, client_name, client_address, client_branch,
                    client_gst, client_phone, client_email,
                    place_of_supply, description, currency,
                    base_amount, tax_rate, sgst, cgst, igst,
                    total_amount, tds_amount, net_amount,
                    received, pending_amount, payment_status,
                    approval_status, manual_signature_status,
                    payment_due_date, bank_name, bank_account_no,
                    bank_ifsc, account_holder, amount_in_words,
                    terms_conditions, authorized_signatory, remarks,
                    items, attached_pdfs, requested_at, requested_by, approved_at, 
                    approved_by, signature_data, signed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    invoice.id,
                    finalUserId,
                    currentUserName,
                    invoice.invoice_number,
                    mysqlDate,
                    businessName,
                    businessAddress,
                    clientId,
                    clientName,
                    clientAddress,
                    clientBranch,
                    clientGst,
                    clientPhone,
                    clientEmail,
                    placeOfSupplyToSave,
                    description,
                    currency,
                    baseAmount,
                    taxRate,
                    taxCalculations.sgst,
                    taxCalculations.cgst,
                    taxCalculations.igst,
                    taxCalculations.totalAmount,
                    tdsAmount,
                    netAmount,
                    finalReceived,
                    finalPendingAmount,
                    finalPaymentStatus,
                    approvalStatus,
                    manualSignatureStatusToSave,
                    paymentDueDate,
                    bankName,
                    bankAccountNo,
                    bankIfsc,
                    accountHolder,
                    amountInWords,
                    termsConditions,
                    authorizedSignatory,
                    remarks,
                    itemsJson,
                    attachedPdfsJson,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null
                ]
            );
            console.log('✅ Created new invoice:', invoice.id);
        }

        res.json({
            success: true,
            id: invoice.id,
            message: 'Invoice saved successfully',
            calculations: {
                baseAmount,
                sgst: taxCalculations.sgst,
                cgst: taxCalculations.cgst,
                igst: taxCalculations.igst,
                totalAmount: taxCalculations.totalAmount,
                netAmount,
                pendingAmount: finalPendingAmount,
                paymentStatus: finalPaymentStatus,
                approvalStatus
            }
        });
    } catch (error) {
        console.error('Save invoice error:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
});


// ========== MULTER CONFIGURATION FOR FILE UPLOADS ==========
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only Excel files are allowed'), false);
        }
    }
});

// 1. Send OTP to ADMIN Email for Invoice Deletion
app.post('/api/invoices/:id/send-delete-otp', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const invoiceId = req.params.id;

        // Check if invoice exists
        const [invoices] = await promiseDb.execute(
            'SELECT id, invoice_number, client_name, total_amount FROM invoices WHERE id = ?',
            [invoiceId]
        );

        if (invoices.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const invoice = invoices[0];
        const adminEmail = process.env.ADMIN_EMAIL || 'jayaramaassociates.info@gmail.com';
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

        // Fetch requesting user's full name from DB
        let requestorName = req.user.full_name || req.user.username || req.user.email;
        if (req.user.id) {
            const [uRows] = await promiseDb.execute('SELECT full_name, username FROM users WHERE id = ?', [req.user.id]);
            if (uRows.length > 0 && uRows[0].full_name) {
                requestorName = uRows[0].full_name;
            }
        }

        // Store deletion OTP in Map
        deleteOtpStore.set(`delete_otp_${invoiceId}`, {
            otp,
            invoiceId,
            invoiceNumber: invoice.invoice_number,
            expiresAt,
            attempts: 0,
            requestedByEmail: req.user.email,
            requestedByName: requestorName
        });

        // Send Email to ADMIN_EMAIL
        const mailOptions = {
            from: `"JAYARAMA Invoice Manager" <${process.env.EMAIL_USER || 'jayaramaassociates.info@gmail.com'}>`,
            to: adminEmail,
            subject: `🗑️ Security Verification: Invoice Deletion Request by ${requestorName} - #${invoice.invoice_number}`,
            html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
                        <div style="background-color: #dc2626; color: white; padding: 15px 20px; border-radius: 8px 8px 0 0; text-align: center;">
                            <h2 style="margin: 0; font-size: 20px;">⚠️ Invoice Deletion Security Verification</h2>
                        </div>
                        <div style="padding: 20px; color: #1e293b;">
                            <p style="font-size: 15px;">A request has been initiated to <strong>permanently delete</strong> an invoice from the system.</p>
                            
                            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px; margin: 15px 0;">
                                <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Invoice Number:</td>
                                        <td style="padding: 6px 0; font-weight: bold; color: #dc2626;">#${invoice.invoice_number}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Client Name:</td>
                                        <td style="padding: 6px 0;">${invoice.client_name || 'N/A'}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Invoice Total:</td>
                                        <td style="padding: 6px 0; font-weight: bold;">₹ ${Number(invoice.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Requested By (Person Name):</td>
                                        <td style="padding: 6px 0; font-weight: bold; color: #0f172a;">${requestorName} <span style="color: #64748b; font-weight: normal;">(${req.user.email})</span></td>
                                    </tr>
                                </table>
                            </div>

                            <p style="font-size: 14px; text-align: center; margin-top: 20px; color: #475569;">
                                Please share the following One-Time Password (OTP) with the user to authorize this deletion:
                            </p>

                            <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #00AEEF; background-color: #f0f9ff; border: 2px dashed #00AEEF; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
                                ${otp}
                            </div>

                            <p style="font-size: 13px; color: #ef4444; text-align: center;">
                                ⏰ This OTP is valid for <strong>10 minutes</strong> only.
                            </p>

                            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                            <p style="font-size: 12px; color: #94a3b8; text-align: center;">
                                If you did not authorize this invoice deletion request, please inspect your system logs immediately.
                            </p>
                        </div>
                    </div>
                `
        };

        await transporter.sendMail(mailOptions);
        console.log(`📧 Deletion OTP sent to ADMIN (${adminEmail}) for invoice #${invoice.invoice_number}`);

        res.json({
            success: true,
            message: 'OTP sent to Admin Email for deletion authorization',
            adminEmail: adminEmail,
            invoiceNumber: invoice.invoice_number
        });
    } catch (error) {
        console.error('Send deletion OTP error:', error);
        res.status(500).json({ error: 'Failed to send deletion OTP email: ' + error.message });
    }
});

// 2. Verify Deletion OTP & Delete Invoice - ADMIN / SUPER ADMIN
app.post('/api/invoices/:id/verify-delete-otp', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const invoiceId = req.params.id;
        const { otp } = req.body;

        if (!otp || !otp.trim()) {
            return res.status(400).json({ error: 'OTP is required for invoice deletion' });
        }

        const key = `delete_otp_${invoiceId}`;
        const storedData = deleteOtpStore.get(key);

        if (!storedData) {
            return res.status(400).json({ error: 'No active deletion OTP request found. Please request a new OTP.' });
        }

        if (Date.now() > storedData.expiresAt) {
            deleteOtpStore.delete(key);
            return res.status(400).json({ error: 'Deletion OTP has expired. Please request a new OTP.' });
        }

        if (storedData.attempts >= 5) {
            deleteOtpStore.delete(key);
            return res.status(400).json({ error: 'Too many failed OTP attempts. Please request a new OTP.' });
        }

        if (storedData.otp !== otp.trim()) {
            storedData.attempts += 1;
            deleteOtpStore.set(key, storedData);
            return res.status(400).json({
                error: `Invalid OTP. ${5 - storedData.attempts} attempts remaining.`
            });
        }

        // OTP verified! Permanently delete the invoice
        const [result] = await promiseDb.execute(
            'DELETE FROM invoices WHERE id = ?',
            [invoiceId]
        );

        deleteOtpStore.delete(key);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        console.log(`🗑️ Invoice #${storedData.invoiceNumber} (ID: ${invoiceId}) deleted by ${req.user.email} after OTP verification.`);

        res.json({
            success: true,
            message: `Invoice #${storedData.invoiceNumber} deleted successfully after OTP verification.`
        });
    } catch (error) {
        console.error('Verify delete OTP error:', error);
        res.status(500).json({ error: 'Internal server error during deletion' });
    }
});

// DELETE invoice - ADMIN only
app.delete('/api/invoices/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const { otp } = req.body || {};
        const invoiceId = req.params.id;

        // If OTP is provided, verify it first
        if (otp) {
            const key = `delete_otp_${invoiceId}`;
            const storedData = deleteOtpStore.get(key);
            if (!storedData || storedData.otp !== otp.trim() || Date.now() > storedData.expiresAt) {
                return res.status(400).json({ error: 'Invalid or expired OTP for invoice deletion' });
            }
            deleteOtpStore.delete(key);
        }

        const [result] = await promiseDb.execute(
            'DELETE FROM invoices WHERE id = ?',
            [invoiceId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        res.json({ success: true, message: 'Invoice deleted successfully' });
    } catch (error) {
        console.error('Delete invoice error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Import invoices from Excel file (SUPER ADMIN only)
app.post('/api/invoices/import-excel', authenticateToken, authorizeSuperAdmin, upload.single('file'), async (req, res) => {
    const startTime = Date.now();

    try {
        // Validate file
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Validate file size (max 20MB)
        if (req.file.size > 20 * 1024 * 1024) {
            return res.status(400).json({ error: 'File too large. Maximum size is 20MB' });
        }

        console.log(`📁 Processing file: ${req.file.originalname} (${(req.file.size / 1024).toFixed(2)} KB)`);

        // Parse Excel file
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.getWorksheet(1);

        if (!worksheet) {
            return res.status(400).json({ error: 'Invalid Excel file - no worksheet found' });
        }

        // Get row count
        const rowCount = worksheet.rowCount;
        console.log(`📊 Worksheet has ${rowCount} rows`);

        if (rowCount < 3) {
            return res.status(400).json({ error: 'Excel file must contain at least 3 rows (header + data)' });
        }

        // Create importer instance
        const importer = new ExcelImporter(promiseDb, req.user.id, req.user.full_name || 'Super Admin');

        // Process the import
        const result = await importer.importFromWorksheet(worksheet);

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        // Prepare response message
        let message = `✅ Successfully imported ${result.totalImported} invoices in ${duration} seconds`;

        if (result.totalWarnings > 0) {
            message += `\n⚠️ ${result.totalWarnings} warnings (check console for details)`;
        }

        if (result.totalErrors > 0) {
            message += `\n❌ ${result.totalErrors} errors encountered`;
        }

        console.log(`🎉 Import completed in ${duration}s`);

        res.json({
            success: true,
            message: message,
            imported: result.imported,
            errors: result.errors.slice(0, 20), // Limit errors in response
            warnings: result.warnings.slice(0, 20),
            totalImported: result.totalImported,
            totalErrors: result.totalErrors,
            totalWarnings: result.totalWarnings,
            duration: duration
        });

    } catch (error) {
        console.error('Excel import error:', error);
        res.status(500).json({
            error: 'Failed to import Excel file: ' + error.message,
            details: error.stack
        });
    }
});

// Optional: Add a route to get import template
app.get('/api/invoices/import-template', authenticateToken, authorizeSuperAdmin, async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Invoice Template');

        // Style for headers
        const headerStyle = {
            font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F4C81' } },
            alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }
        };

        // Add title
        worksheet.mergeCells('A1:O1');
        worksheet.getCell('A1').value = 'JAYARAMA ASSOCIATES - Invoice Import Template';
        worksheet.getCell('A1').font = { bold: true, size: 14 };
        worksheet.getCell('A1').alignment = { horizontal: 'center' };
        worksheet.getRow(1).height = 30;

        // Add headers
        const headers = [
            'Sl.No.', 'Date', 'INVOICE No.', 'BANK NAME', 'CUSTOMER NAME',
            'BRANCH', 'GSTI NO.', 'BASE AMOUNT', 'SGST', 'CGST', 'IGST',
            'Total Amount', 'Net Amount after TDS', 'Payment Status', 'Remarks'
        ];

        headers.forEach((header, index) => {
            const cell = worksheet.getCell(2, index + 1);
            cell.value = header;
            Object.assign(cell, headerStyle);
        });

        // Add example row
        const exampleRow = worksheet.getRow(3);
        exampleRow.getCell(1).value = 1;
        exampleRow.getCell(2).value = '18 May 2026';
        exampleRow.getCell(3).value = 'JA/26-27/001';
        exampleRow.getCell(4).value = 'AXIS BANK LIMITED';
        exampleRow.getCell(5).value = 'Sample Customer';
        exampleRow.getCell(6).value = 'Sanath Nagar';
        exampleRow.getCell(7).value = '36ABCDE1234F1Z';
        exampleRow.getCell(8).value = 10000;
        exampleRow.getCell(9).value = 900;
        exampleRow.getCell(10).value = 900;
        exampleRow.getCell(11).value = 0;
        exampleRow.getCell(12).value = 11800;
        exampleRow.getCell(13).value = 11800;
        exampleRow.getCell(14).value = 'UNPAID';
        exampleRow.getCell(15).value = 'Sample remark';

        // Set column widths
        const columnWidths = [8, 12, 16, 20, 28, 15, 18, 14, 10, 10, 10, 14, 18, 16, 35];
        columnWidths.forEach((width, index) => {
            worksheet.getColumn(index + 1).width = width;
        });

        // Add instructions sheet
        const instructionsSheet = workbook.addWorksheet('Instructions');
        instructionsSheet.getCell('A1').value = 'How to use this template:';
        instructionsSheet.getCell('A1').font = { bold: true, size: 12 };

        const instructions = [
            '',
            '1. Do not modify the header row (row 2)',
            '2. Fill your invoice data starting from row 3',
            '3. Date format: DD Month YYYY (e.g., 18 May 2026) or DD-MM-YYYY',
            '4. Amount fields should be numbers without currency symbols',
            '5. Payment Status can be: PAID, UNPAID, or CANCELLED',
            '6. Save the file as .xlsx format before uploading',
            '7. Maximum file size is 20MB',
            '',
            'Required fields:',
            '- INVOICE No. (must be unique)',
            '- Date',
            '- BASE AMOUNT',
            '',
            'Optional fields will use default values if left empty'
        ];

        instructions.forEach((line, index) => {
            instructionsSheet.getCell(`A${index + 3}`).value = line;
        });

        instructionsSheet.getColumn('A').width = 60;

        // Generate file
        const buffer = await workbook.xlsx.writeBuffer();
        const fileName = `invoice_import_template_${new Date().toISOString().split('T')[0]}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(buffer);

    } catch (error) {
        console.error('Template generation error:', error);
        res.status(500).json({ error: 'Failed to generate template' });
    }
});

// ============= REPORT ROUTES =============

app.get('/api/reports/invoice-summary', authenticateToken, async (req, res) => {
    try {
        const { start_date, end_date, payment_status } = req.query;

        let query = `
                SELECT 
                    DATE(date) as invoice_date,
                    invoice_number,
                    client_name,
                    client_branch,
                    client_gst,
                    base_amount,
                    sgst,
                    cgst,
                    igst,
                    total_amount,
                    tds_amount,
                    net_amount,
                    received,
                    pending_amount,
                    payment_status,
                    approval_status,
                    payment_due_date
                FROM invoices
                WHERE 1=1
            `;
        let params = [];

        if (start_date) {
            query += ` AND date >= ?`;
            params.push(start_date);
        }

        if (end_date) {
            query += ` AND date <= ?`;
            params.push(end_date);
        }

        if (payment_status && payment_status !== 'all') {
            query += ` AND payment_status = ?`;
            params.push(payment_status);
        }

        if (req.user.role === 'user') {
            query += ` AND user_id = ?`;
            params.push(req.user.id);
        }

        query += ` ORDER BY date DESC`;

        const [reports] = await promiseDb.execute(query, params);
        res.json(reports);
    } catch (error) {
        console.error('Report error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/reports/monthly-summary', authenticateToken, async (req, res) => {
    try {
        let query = `
                SELECT 
                    DATE_FORMAT(date, '%Y-%m') as month,
                    COUNT(*) as invoice_count,
                    SUM(base_amount) as total_base_amount,
                    SUM(sgst) as total_sgst,
                    SUM(cgst) as total_cgst,
                    SUM(igst) as total_igst,
                    SUM(total_amount) as total_amount,
                    SUM(tds_amount) as total_tds,
                    SUM(net_amount) as total_net_amount,
                    SUM(received) as total_received,
                    SUM(pending_amount) as total_pending
                FROM invoices
                WHERE 1=1
            `;

        if (req.user.role === 'user') {
            query += ` AND user_id = '${req.user.id}'`;
        }

        query += ` GROUP BY DATE_FORMAT(date, '%Y-%m') ORDER BY month DESC`;

        const [reports] = await promiseDb.execute(query);
        res.json(reports);
    } catch (error) {
        console.error('Monthly summary error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============= CLIENT ROUTES =============

app.get('/api/clients', authenticateToken, async (req, res) => {
    try {
        const [clients] = await promiseDb.execute(`
                SELECT 
                    c.id, c.name, c.address, c.branch, c.gst_number, c.phone, c.email,
                    c.pay_to_bank_id, c.created_by, c.created_at, c.updated_at,
                    b.bank_name as pay_to_bank_name,
                    b.account_number as pay_to_account_number,
                    b.ifsc_code as pay_to_ifsc_code,
                    b.account_holder as pay_to_account_holder,
                    b.branch as pay_to_bank_branch
                FROM clients c
                LEFT JOIN banks b ON c.pay_to_bank_id = b.id
                ORDER BY c.name ASC
            `);
        res.json(clients);
    } catch (error) {
        console.error('Get clients error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/clients/:id', authenticateToken, async (req, res) => {
    try {
        const [clients] = await promiseDb.execute(`
                SELECT 
                    c.id, c.name, c.address, c.branch, c.gst_number, c.phone, c.email,
                    c.pay_to_bank_id, c.created_by, c.created_at, c.updated_at,
                    b.bank_name as pay_to_bank_name,
                    b.account_number as pay_to_account_number,
                    b.ifsc_code as pay_to_ifsc_code,
                    b.account_holder as pay_to_account_holder,
                    b.branch as pay_to_bank_branch
                FROM clients c
                LEFT JOIN banks b ON c.pay_to_bank_id = b.id
                WHERE c.id = ?
            `, [req.params.id]);

        if (clients.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }

        res.json(clients[0]);
    } catch (error) {
        console.error('Get client error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/clients/branch/:branch', authenticateToken, async (req, res) => {
    try {
        const [clients] = await promiseDb.execute(`
                SELECT 
                    c.id, c.name, c.address, c.branch, c.gst_number, c.phone, c.email,
                    c.pay_to_bank_id, c.created_by, c.created_at, c.updated_at,
                    b.bank_name as pay_to_bank_name,
                    b.account_number as pay_to_account_number,
                    b.ifsc_code as pay_to_ifsc_code,
                    b.account_holder as pay_to_account_holder,
                    b.branch as pay_to_bank_branch
                FROM clients c
                LEFT JOIN banks b ON c.pay_to_bank_id = b.id
                WHERE c.branch LIKE ? 
                ORDER BY c.name ASC
            `, [`%${req.params.branch}%`]);
        res.json(clients);
    } catch (error) {
        console.error('Get clients by branch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/clients', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const { name, address, branch, gst_number, phone, email, pay_to_bank_id } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Client name is required' });
        }

        let validBankId = null;
        if (pay_to_bank_id && String(pay_to_bank_id).trim()) {
            const [bankCheck] = await promiseDb.execute(
                'SELECT id FROM banks WHERE id = ?',
                [String(pay_to_bank_id).trim()]
            );
            if (bankCheck.length === 0) {
                return res.status(400).json({ error: 'Selected Pay To Bank profile does not exist in Bank Master' });
            }
            validBankId = bankCheck[0].id;
        }

        const clientId = `cl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        await promiseDb.execute(
            `INSERT INTO clients (id, name, address, branch, gst_number, phone, email, pay_to_bank_id, created_by) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [clientId, name.trim(), address || null, branch || null, gst_number || null, phone || null, email || null, validBankId, req.user.id]
        );

        const [newClient] = await promiseDb.execute(`
                SELECT 
                    c.id, c.name, c.address, c.branch, c.gst_number, c.phone, c.email,
                    c.pay_to_bank_id, c.created_by, c.created_at, c.updated_at,
                    b.bank_name as pay_to_bank_name,
                    b.account_number as pay_to_account_number,
                    b.ifsc_code as pay_to_ifsc_code,
                    b.account_holder as pay_to_account_holder,
                    b.branch as pay_to_bank_branch
                FROM clients c
                LEFT JOIN banks b ON c.pay_to_bank_id = b.id
                WHERE c.id = ?
            `, [clientId]);

        res.status(201).json({
            success: true,
            message: 'Client added successfully',
            client: newClient[0]
        });
    } catch (error) {
        console.error('Add client error:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
});

app.put('/api/clients/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const { name, address, branch, gst_number, phone, email, pay_to_bank_id } = req.body;

        const [existingClient] = await promiseDb.execute('SELECT id FROM clients WHERE id = ?', [req.params.id]);
        if (existingClient.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }

        let validBankId = null;
        if (pay_to_bank_id && String(pay_to_bank_id).trim()) {
            const [bankCheck] = await promiseDb.execute(
                'SELECT id FROM banks WHERE id = ?',
                [String(pay_to_bank_id).trim()]
            );
            if (bankCheck.length === 0) {
                return res.status(400).json({ error: 'Selected Pay To Bank profile does not exist in Bank Master' });
            }
            validBankId = bankCheck[0].id;
        }

        await promiseDb.execute(
            `UPDATE clients SET 
                    name = COALESCE(?, name), 
                    address = ?, 
                    branch = ?, 
                    gst_number = ?, 
                    phone = ?, 
                    email = ?,
                    pay_to_bank_id = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
            [name ? name.trim() : null, address || null, branch || null, gst_number || null, phone || null, email || null, validBankId, req.params.id]
        );

        const [updatedClient] = await promiseDb.execute(`
                SELECT 
                    c.id, c.name, c.address, c.branch, c.gst_number, c.phone, c.email,
                    c.pay_to_bank_id, c.created_by, c.created_at, c.updated_at,
                    b.bank_name as pay_to_bank_name,
                    b.account_number as pay_to_account_number,
                    b.ifsc_code as pay_to_ifsc_code,
                    b.account_holder as pay_to_account_holder,
                    b.branch as pay_to_bank_branch
                FROM clients c
                LEFT JOIN banks b ON c.pay_to_bank_id = b.id
                WHERE c.id = ?
            `, [req.params.id]);

        res.json({
            success: true,
            message: 'Client updated successfully',
            client: updatedClient[0]
        });
    } catch (error) {
        console.error('Update client error:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
});

app.delete('/api/clients/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        await promiseDb.execute('DELETE FROM clients WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Client deleted successfully' });
    } catch (error) {
        console.error('Delete client error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============= BANK ACCOUNT ROUTES =============

app.get('/api/banks', authenticateToken, async (req, res) => {
    try {
        const [banks] = await promiseDb.execute(
            `SELECT id, bank_name, account_number, ifsc_code, account_holder, branch, is_default, status 
                FROM banks WHERE status = "active" ORDER BY is_default DESC, bank_name ASC`
        );
        res.json(banks);
    } catch (error) {
        console.error('Get banks error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/banks/:id', authenticateToken, async (req, res) => {
    try {
        const [banks] = await promiseDb.execute(
            `SELECT id, bank_name, account_number, ifsc_code, account_holder, branch, is_default 
                FROM banks WHERE id = ? AND status = "active"`,
            [req.params.id]
        );

        if (banks.length === 0) {
            return res.status(404).json({ error: 'Bank account not found' });
        }

        res.json(banks[0]);
    } catch (error) {
        console.error('Get bank error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/banks', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const { bank_name, account_number, ifsc_code, account_holder, branch, is_default } = req.body;

        if (!bank_name || !account_number || !ifsc_code || !account_holder) {
            return res.status(400).json({
                error: 'Bank name, account number, IFSC code, and account holder are required'
            });
        }

        const [existing] = await promiseDb.execute(
            'SELECT id FROM banks WHERE account_number = ?',
            [account_number]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'Account number already exists' });
        }

        if (is_default) {
            await promiseDb.execute('UPDATE banks SET is_default = FALSE WHERE is_default = TRUE');
        }

        const bankId = `bank_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        await promiseDb.execute(
            `INSERT INTO banks (id, bank_name, account_number, ifsc_code, account_holder, branch, is_default, created_by) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [bankId, bank_name, account_number, ifsc_code.toUpperCase(), account_holder, branch || null, is_default || false, req.user.id]
        );

        const [newBank] = await promiseDb.execute(
            `SELECT id, bank_name, account_number, ifsc_code, account_holder, branch, is_default 
                FROM banks WHERE id = ?`,
            [bankId]
        );

        res.status(201).json({
            success: true,
            message: 'Bank account added successfully',
            bank: newBank[0]
        });
    } catch (error) {
        console.error('Add bank error:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
});

app.put('/api/banks/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const { bank_name, account_number, ifsc_code, account_holder, branch, is_default } = req.body;

        const [existingBank] = await promiseDb.execute(
            'SELECT * FROM banks WHERE id = ?',
            [req.params.id]
        );

        if (existingBank.length === 0) {
            return res.status(404).json({ error: 'Bank account not found' });
        }

        if (account_number && account_number !== existingBank[0].account_number) {
            const [duplicate] = await promiseDb.execute(
                'SELECT id FROM banks WHERE account_number = ? AND id != ?',
                [account_number, req.params.id]
            );
            if (duplicate.length > 0) {
                return res.status(400).json({ error: 'Account number already exists' });
            }
        }

        if (is_default) {
            await promiseDb.execute('UPDATE banks SET is_default = FALSE WHERE is_default = TRUE AND id != ?', [req.params.id]);
        }

        await promiseDb.execute(
            `UPDATE banks 
                SET bank_name = COALESCE(?, bank_name),
                    account_number = COALESCE(?, account_number),
                    ifsc_code = COALESCE(UPPER(?), ifsc_code),
                    account_holder = COALESCE(?, account_holder),
                    branch = COALESCE(?, branch),
                    is_default = COALESCE(?, is_default),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
            [bank_name, account_number, ifsc_code, account_holder, branch, is_default, req.params.id]
        );

        const [updatedBank] = await promiseDb.execute(
            `SELECT id, bank_name, account_number, ifsc_code, account_holder, branch, is_default 
                FROM banks WHERE id = ?`,
            [req.params.id]
        );

        res.json({
            success: true,
            message: 'Bank account updated successfully',
            bank: updatedBank[0]
        });
    } catch (error) {
        console.error('Update bank error:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
});

app.delete('/api/banks/:id', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const [bank] = await promiseDb.execute('SELECT * FROM banks WHERE id = ?', [req.params.id]);

        if (bank.length === 0) {
            return res.status(404).json({ error: 'Bank account not found' });
        }

        await promiseDb.execute('UPDATE banks SET status = "inactive" WHERE id = ?', [req.params.id]);

        res.json({
            success: true,
            message: 'Bank account deleted successfully'
        });
    } catch (error) {
        console.error('Delete bank error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.patch('/api/banks/:id/set-default', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const [bank] = await promiseDb.execute(
            'SELECT * FROM banks WHERE id = ? AND status = "active"',
            [req.params.id]
        );

        if (bank.length === 0) {
            return res.status(404).json({ error: 'Bank account not found' });
        }

        await promiseDb.execute('UPDATE banks SET is_default = FALSE');
        await promiseDb.execute('UPDATE banks SET is_default = TRUE WHERE id = ?', [req.params.id]);

        const [updatedBank] = await promiseDb.execute(
            `SELECT id, bank_name, account_number, ifsc_code, account_holder, branch, is_default 
                FROM banks WHERE id = ?`,
            [req.params.id]
        );

        res.json({
            success: true,
            message: 'Default bank account set successfully',
            bank: updatedBank[0]
        });
    } catch (error) {
        console.error('Set default bank error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/banks/branch/:branch', authenticateToken, async (req, res) => {
    try {
        const [banks] = await promiseDb.execute(
            `SELECT id, bank_name, account_number, ifsc_code, account_holder, branch, is_default, status 
                FROM banks WHERE status = "active" AND branch LIKE ? ORDER BY bank_name ASC`,
            [`%${req.params.branch}%`]
        );
        res.json(banks);
    } catch (error) {
        console.error('Get banks by branch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============= TAX SETTINGS ROUTES =============

app.get('/api/tax-settings', authenticateToken, async (req, res) => {
    try {
        const [taxSettings] = await promiseDb.execute(
            'SELECT * FROM tax_settings WHERE status = "active" ORDER BY is_default DESC, tax_rate ASC'
        );
        res.json(taxSettings);
    } catch (error) {
        console.error('Get tax settings error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/tax-settings/default', authenticateToken, async (req, res) => {
    try {
        const [taxSettings] = await promiseDb.execute(
            'SELECT * FROM tax_settings WHERE is_default = 1 AND status = "active" LIMIT 1'
        );
        res.json(taxSettings[0] || { tax_rate: 18 });
    } catch (error) {
        console.error('Get default tax error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============= STATE MAPPING ROUTES =============

app.get('/api/state-mapping', authenticateToken, async (req, res) => {
    try {
        const [stateMapping] = await promiseDb.execute(
            'SELECT code, name FROM state_mapping ORDER BY code'
        );
        res.json(stateMapping);
    } catch (error) {
        console.error('Get state mapping error:', error);
        res.json([
            { code: '36', name: 'Telangana' },
            { code: '37', name: 'Andhra Pradesh' }
        ]);
    }
});

app.post('/api/state-mapping', authenticateToken, authorizeAdmin, async (req, res) => {
    try {
        const mapping = req.body;

        await promiseDb.execute('DELETE FROM state_mapping');

        for (const state of mapping) {
            if (state.code && state.name) {
                await promiseDb.execute(
                    'INSERT INTO state_mapping (code, name) VALUES (?, ?)',
                    [state.code, state.name]
                );
            }
        }

        res.json({ success: true, message: 'State mapping saved successfully' });
    } catch (error) {
        console.error('Save state mapping error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Add this NEW endpoint after the existing download-pdf endpoint
// GET single invoice
app.get('/api/invoices/:id', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT i.*, u.full_name as full_name 
            FROM invoices i
            LEFT JOIN users u ON i.user_id = u.id
            WHERE i.id = ?
        `;
        const [invoices] = await promiseDb.execute(query, [req.params.id]);

        if (invoices.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const invoice = invoices[0];

        let items = [];
        try {
            items = typeof invoice.items === 'string' ? JSON.parse(invoice.items) : (invoice.items || []);
        } catch (e) {
            items = [];
        }

        // CRITICAL FIX: If items array is empty but base_amount exists, create a default item
        const baseAmount = parseFloat(invoice.base_amount) || 0;
        const totalAmount = parseFloat(invoice.total_amount) || 0;

        if ((!items || items.length === 0) && baseAmount > 0) {
            items = [{
                description: invoice.description || 'PROFESSIONAL FEE',
                hsn: '998399',
                quantity: 1,
                price: baseAmount,
                amount: baseAmount
            }];
            console.log(`✅ Created default item for invoice ${invoice.invoice_number} with amount ${baseAmount}`);
        }

        // Also check if items have zero price but base_amount exists
        if (items.length > 0 && items[0].price === 0 && baseAmount > 0) {
            items[0].price = baseAmount;
            items[0].amount = baseAmount;
            console.log(`✅ Updated item price for invoice ${invoice.invoice_number} to ${baseAmount}`);
        }

        let dateString = null;
        if (invoice.date) {
            if (invoice.date instanceof Date) {
                const year = invoice.date.getFullYear();
                const month = String(invoice.date.getMonth() + 1).padStart(2, '0');
                const day = String(invoice.date.getDate()).padStart(2, '0');
                dateString = `${year}-${month}-${day}`;
            } else {
                dateString = String(invoice.date).split('T')[0];
            }
        }

        let attachedPdfs = [];
        try {
            attachedPdfs = typeof invoice.attached_pdfs === 'string' ? JSON.parse(invoice.attached_pdfs) : (invoice.attached_pdfs || []);
        } catch (e) {
            attachedPdfs = [];
        }

        // Also ensure numeric values are sent as numbers
        const responseData = {
            ...invoice,
            items: items,
            attached_pdfs: attachedPdfs,
            date: dateString,
            base_amount: baseAmount,
            sgst: parseFloat(invoice.sgst) || 0,
            cgst: parseFloat(invoice.cgst) || 0,
            igst: parseFloat(invoice.igst) || 0,
            total_amount: totalAmount,
            tds_amount: parseFloat(invoice.tds_amount) || 0,
            net_amount: parseFloat(invoice.net_amount) || 0,
            received: parseFloat(invoice.received) || 0,
            pending_amount: parseFloat(invoice.pending_amount) || 0
        };

        console.log(`📤 Sending invoice ${invoice.invoice_number}: base=${baseAmount}, total=${totalAmount}, items=${items.length}`);

        res.json(responseData);
    } catch (error) {
        console.error('Get invoice error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============= TEST ROUTE =============

app.get('/api/test', (req, res) => {
    res.json({
        message: 'API is working with CORS and eSign workflow!',
        corsEnabled: true,
        allowedOrigins: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],
        endpoints: {
            auth: '/api/auth/*',
            invoices: '/api/invoices/*',
            clients: '/api/clients/*',
            banks: '/api/banks/*',
            reports: '/api/reports/*',
            taxSettings: '/api/tax-settings/*',
            invoice: '/api/invoice/*',
            eSign: '/api/invoices/:id/request-esign, /api/invoices/:id/final-esign, /api/invoices/:id/download-signed-pdf'
        }
    });
});

// ============= LIVE CHAT =============
// A message is visible only to its sender, its single recipient, or everyone
// when it is a broadcast (recipient_id IS NULL). All filtering happens here.

app.get('/api/chat/users', authenticateToken, async (req, res) => {
    try {
        const [rows] = await promiseDb.execute(
            'SELECT id, full_name, username, role FROM users WHERE id <> ? ORDER BY full_name, username',
            [req.user.id]
        );
        res.json({ success: true, users: rows });
    } catch (error) {
        console.error('Chat users error:', error);
        res.status(500).json({ error: 'Failed to load users' });
    }
});

app.get('/api/chat/messages', authenticateToken, async (req, res) => {
    try {
        const me = req.user.id;
        const after = parseInt(req.query.after, 10) || 0;

        // The poll itself proves the recipient has the site open -> mark everything addressed to them as delivered.
        await promiseDb.query(
            `INSERT IGNORE INTO chat_receipts (message_id, user_id, delivered_at)
             SELECT m.id, ?, NOW() FROM chat_messages m
             LEFT JOIN chat_receipts r ON r.message_id = m.id AND r.user_id = ?
             WHERE m.sender_id <> ? AND (m.recipient_id = ? OR m.recipient_id IS NULL) AND r.message_id IS NULL`,
            [me, me, me, me]
        );

        const [rows] = await promiseDb.query(
            `SELECT * FROM (
                SELECT m.id, m.sender_id, m.recipient_id, m.body, m.created_at,
                       COALESCE(u.full_name, u.username) AS sender_name
                FROM chat_messages m
                LEFT JOIN users u ON u.id = m.sender_id
                WHERE m.id > ? AND (m.sender_id = ? OR m.recipient_id = ? OR m.recipient_id IS NULL)
                ORDER BY m.id DESC LIMIT 300
            ) t ORDER BY id ASC`,
            [after, me, me]
        );

        // Ticks for my recent sent messages: sent / delivered / read (broadcasts need every recipient).
        const [[{ n: userCount }]] = await promiseDb.query('SELECT COUNT(*) AS n FROM users');
        const [sent] = await promiseDb.query(
            `SELECT m.id, m.recipient_id, COUNT(r.user_id) AS delivered, COALESCE(SUM(r.read_at IS NOT NULL), 0) AS read_count
             FROM (SELECT id, recipient_id FROM chat_messages WHERE sender_id = ? ORDER BY id DESC LIMIT 200) m
             LEFT JOIN chat_receipts r ON r.message_id = m.id
             GROUP BY m.id, m.recipient_id`,
            [me]
        );
        const statuses = {};
        sent.forEach(m => {
            const total = m.recipient_id ? 1 : Math.max(userCount - 1, 1);
            statuses[m.id] = Number(m.read_count) >= total ? 'read' : Number(m.delivered) >= total ? 'delivered' : 'sent';
        });

        res.json({ success: true, messages: rows, statuses });
    } catch (error) {
        console.error('Chat fetch error:', error);
        res.status(500).json({ error: 'Failed to load messages' });
    }
});

// Recipient opened a conversation -> mark its messages as read. thread = 'all' or the other user's id.
app.post('/api/chat/read', authenticateToken, async (req, res) => {
    try {
        const me = req.user.id;
        const thread = String(req.body.thread || '');
        if (!thread) return res.status(400).json({ error: 'thread required' });
        const where = thread === 'all' ? 'm.recipient_id IS NULL AND m.sender_id <> ?' : 'm.recipient_id = ? AND m.sender_id = ?';
        await promiseDb.query(
            `INSERT INTO chat_receipts (message_id, user_id, delivered_at, read_at)
             SELECT m.id, ?, NOW(), NOW() FROM chat_messages m WHERE ${where}
             ON DUPLICATE KEY UPDATE read_at = COALESCE(read_at, VALUES(read_at))`,
            thread === 'all' ? [me, me] : [me, me, thread]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Chat read error:', error);
        res.status(500).json({ error: 'Failed to mark read' });
    }
});

app.post('/api/chat/messages', authenticateToken, async (req, res) => {
    try {
        const body = String(req.body.body || '').trim();
        const recipientId = req.body.recipient_id || null; // null = send to all
        if (!body) return res.status(400).json({ error: 'Message cannot be empty' });
        if (body.length > 2000) return res.status(400).json({ error: 'Message too long (max 2000 characters)' });

        if (recipientId) {
            if (recipientId === req.user.id) return res.status(400).json({ error: 'Cannot message yourself' });
            const [exists] = await promiseDb.execute('SELECT id FROM users WHERE id = ?', [recipientId]);
            if (exists.length === 0) return res.status(404).json({ error: 'Recipient not found' });
        }

        const [result] = await promiseDb.execute(
            'INSERT INTO chat_messages (sender_id, recipient_id, body) VALUES (?, ?, ?)',
            [req.user.id, recipientId, body]
        );
        const [rows] = await promiseDb.execute(
            `SELECT m.id, m.sender_id, m.recipient_id, m.body, m.created_at,
                    COALESCE(u.full_name, u.username) AS sender_name
             FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_id WHERE m.id = ?`,
            [result.insertId]
        );
        res.json({ success: true, message: rows[0] });
    } catch (error) {
        console.error('Chat send error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// ============= SERVER STARTUP =============

const PORT = process.env.PORT || 5000;

// Initialize database and start server
initializeDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`\n=====================================`);
        console.log(`🚀 Server is running!`);
        console.log(`=====================================`);
        console.log(`✅ Server running on port ${PORT}`);
        console.log(`✅ CORS enabled for: http://localhost:3000, http://localhost:3001, http://localhost:5173`);
        console.log(`✅ MySQL connected successfully`);
        console.log(`✅ Puppeteer HTML-to-PDF generation enabled`);
        console.log(`\n📋 Available API Endpoints:`);
        console.log(`   🔐 AUTH:`);
        console.log(`   POST   /api/auth/send-otp - Send OTP to ADMIN email`);
        console.log(`   POST   /api/auth/verify-otp - Verify OTP (admin provides to user)`);
        console.log(`   POST   /api/auth/signup - Complete signup (requires admin verification)`);
        console.log(`   POST   /api/auth/login - Login`);
        console.log(`   GET    /api/auth/me - Get current user`);
        console.log(`\n   📄 INVOICES:`);
        console.log(`   GET    /api/invoices (Role-based: User sees own, Admin sees all, Super Admin sees requested)`);
        console.log(`   GET    /api/invoices/:id - Get single invoice`);
        console.log(`   GET    /api/invoices/next-number - Generate next invoice number`);
        console.log(`   POST   /api/invoices (Create/edit invoices)`);
        console.log(`   DELETE /api/invoices/:id (ADMIN only)`);
        console.log(`\n   ✍️ eSign WORKFLOW:`);
        console.log(`   POST   /api/invoices/:id/request-esign (ADMIN only) - Request eSign approval`);
        console.log(`   POST   /api/invoices/:id/final-esign (SUPER ADMIN only) - Manual eSign approval`);
        console.log(`   POST   /api/invoices/:id/esign (SUPER ADMIN only) - CloudSigner digital approval`);
        console.log(`\n   📑 PDF:`);
        console.log(`   POST   /api/invoice/generate-pdf - Generate PDF from rendered invoice HTML`);
        console.log(`   POST   /api/invoices/:id/download-pdf (ADMIN/SUPER ADMIN only) - Download PDF`);
        console.log(`\n   👥 CLIENTS:`);
        console.log(`   GET    /api/clients (All users can view)`);
        console.log(`   POST   /api/clients (ADMIN only)`);
        console.log(`   PUT    /api/clients/:id (ADMIN only)`);
        console.log(`   DELETE /api/clients/:id (ADMIN only)`);
        console.log(`\n   🏦 BANKS:`);
        console.log(`   GET    /api/banks (All users can view)`);
        console.log(`   POST   /api/banks (ADMIN only)`);
        console.log(`   PUT    /api/banks/:id (ADMIN only)`);
        console.log(`   DELETE /api/banks/:id (ADMIN only)`);
        console.log(`   PATCH  /api/banks/:id/set-default (ADMIN only)`);
        console.log(`\n   📊 REPORTS:`);
        console.log(`   GET    /api/reports/invoice-summary (with filters)`);
        console.log(`   GET    /api/reports/monthly-summary`);
        console.log(`\n   ⚙️ SETTINGS:`);
        console.log(`   GET    /api/tax-settings`);
        console.log(`   GET    /api/tax-settings/default`);
        console.log(`   GET    /api/state-mapping`);
        console.log(`\n🔐 REGISTRATION FLOW:`);
        console.log(`   1️⃣ User fills signup form`);
        console.log(`   2️⃣ OTP sent to ADMIN email with user details`);
        console.log(`   3️⃣ Admin provides OTP to user`);
        console.log(`   4️⃣ User enters OTP to complete registration`);
        console.log(`   5️⃣ Account created only after admin approval`);
        console.log(`   💡 First user automatically becomes SUPER_ADMIN`);
        console.log(`\n💰 PAYMENT STATUS OPTIONS:`);
        console.log(`   ✅ paid - Full payment received`);
        console.log(`   ❌ unpaid - No payment received`);
        console.log(`   🚫 cancelled - Invoice cancelled`);
        console.log(`\n✅ eSign APPROVAL WORKFLOW:`);
        console.log(`   📝 created - Invoice created by User`);
        console.log(`   📨 requested - Admin requested eSign approval`);
        console.log(`   🔏 final_approved - Super Admin approved with eSign`);
        console.log(`\n=====================================\n`);
    });
}).catch(err => {
    console.error('❌ Failed to initialize database:', err);
    process.exit(1);
});


