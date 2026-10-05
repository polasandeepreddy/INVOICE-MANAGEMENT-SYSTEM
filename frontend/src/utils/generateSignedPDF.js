// utils/generateSignedPDF.js

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import axios from 'axios';
import { PDFDocument } from 'pdf-lib';

const COMPANY_LOGO_URL = "/JAYARAMA LOGO1.png";

const FALLBACK_LOGO = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNzAiIGhlaWdodD0iNzAiIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik01MCA1IEw5NSA4NSBMNSA4NSBaIiBmaWxsPSJub25lIiBzdHJva2U9IiMwMDcyYmMiIHN0cm9rZVdpZHRoPSI0Ii8+PHBhdGggZD0iTTUwIDI1IEw3NSA3NSBMMjUgNzUgWiIgZmlsbD0iI2VkMWMyNCIgb3BhY2l0eT0iMC44Ii8+PHJlY3QgeD0iNDAiIHk9IjU1IiB3aWR0aD0iNSIgaGVpZ2h0PSIxNSIgZmlsbD0id2hpdGUiLz48cmVjdCB4PSI1MCIgeT0iNTAiIHdpZHRoPSI1IiBoZWlnaHQ9IjIwIiBmaWxsPSJ3aGl0ZSIvPjxyZWN0IHg9IjU1IiB5PSI2MCIgd2lkdGg9IjUiIGhlaWdodD0iMTAiIGZpbGw9IndoaXRlIi8+PC9zdmc+`;

const COMPLETE_BUSINESS_ADDRESS = `Plot No: 12, Road No: 1A, Czech Colony,
Sanath Nagar, Hyderabad - 500018
Phone No. : 9866669777
Email : jayaramassociates@yahoo.com
PAN : AMIPM2958D
GSTIN : 36AMIPM2958D1ZY
State: 36-Telangana`;

const parseNum = (val) => {
    if (val === undefined || val === null || val === '') return 0;
    const clean = String(val).replace(/,/g, '').trim();
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
};

// Helper function to format currency (matches InvoicePreview.js)
const formatCurrency = (value) => {
    const num = parseNum(value);
    return `₹ ${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Helper function to convert number to words (matches InvoicePreview.js)
const numberToWords = (numVal) => {
    const num = parseNum(numVal);
    if (!num || num === 0) return 'Zero Rupees only';

    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const convert = (n) => {
        if (n === 0) return '';
        if (n < 20) return a[n];
        if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
        if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + convert(n % 100) : '');
        if (n < 100000) {
            const thousands = Math.floor(n / 1000);
            const remainder = n % 1000;
            const thousandsWord = 'Thousand';
            return convert(thousands) + ' ' + thousandsWord + (remainder ? ' ' + convert(remainder) : '');
        }
        if (n < 10000000) {
            const lakhs = Math.floor(n / 100000);
            const remainder = n % 100000;
            const lakhsWord = lakhs === 1 ? 'Lakh' : 'Lakhs';
            return convert(lakhs) + ' ' + lakhsWord + (remainder ? ' ' + convert(remainder) : '');
        }
        if (n < 1000000000) {
            const crores = Math.floor(n / 10000000);
            const remainder = n % 10000000;
            const croresWord = crores === 1 ? 'Crore' : 'Crores';
            return convert(crores) + ' ' + croresWord + (remainder ? ' ' + convert(remainder) : '');
        }
        return 'Large Amount';
    };

    const rupees = Math.floor(num);
    const paise = Math.round((num - rupees) * 100);

    let words = convert(rupees) + ' Rupees';
    if (paise > 0) {
        const paiseWord = 'Paise';
        words += ' and ' + convert(paise) + ' ' + paiseWord;
    }
    return words + ' only';
};

// Helper function to get business address
const getBusinessAddress = (formData) => {
    if (!formData.business_address) return COMPLETE_BUSINESS_ADDRESS;
    if (formData.business_address.includes('PAN')) return formData.business_address;
    return COMPLETE_BUSINESS_ADDRESS;
};

// Helper function to get state code
const getStateCode = (stateString) => {
    if (!stateString) return '';
    const match = stateString.match(/^(\d+)/);
    return match ? match[1] : '';
};

// Helper function to check if same state - matches InvoicePreview.js logic
const isSameState = (formData) => {
    const sgst = parseFloat(formData.calculated_sgst || formData.sgst || 0);
    const cgst = parseFloat(formData.calculated_cgst || formData.cgst || 0);
    const igst = parseFloat(formData.calculated_igst || formData.igst || 0);

    if (sgst > 0 || cgst > 0) return true;
    if (igst > 0) return false;

    const clientStateCode = getStateCode(formData.client_state);
    const placeOfSupplyCode = getStateCode(formData.place_of_supply);

    if (!clientStateCode || !placeOfSupplyCode) return true;

    return clientStateCode === placeOfSupplyCode;
};

// Helper function to calculate totals - matches InvoicePreview.js logic
const calculateTotals = (formData) => {
    let rawItems = formData.items;
    if (typeof rawItems === 'string') {
        try { rawItems = JSON.parse(rawItems); } catch (e) { rawItems = []; }
    }
    const items = Array.isArray(rawItems) ? rawItems : [];

    const dbBase = parseFloat(formData.calculated_base_amount || formData.base_amount || formData.amount || 0);
    const dbSgst = parseFloat(formData.calculated_sgst || formData.sgst || 0);
    const dbCgst = parseFloat(formData.calculated_cgst || formData.cgst || 0);
    const dbIgst = parseFloat(formData.calculated_igst || formData.igst || 0);
    const dbTotal = parseFloat(formData.calculated_total_amount || formData.total_amount || 0);

    const effectiveBase = dbBase > 0 ? dbBase : (dbTotal > 0 ? (dbSgst || dbCgst || dbIgst ? dbTotal - (dbSgst + dbCgst + dbIgst) : dbTotal / 1.18) : 0);

    const getItemPrice = (item) => {
        const pr = parseFloat(String(item.price || 0).replace(/,/g, '')) || 0;
        if (pr > 0) return pr;
        const qty = parseFloat(String(item.quantity || 0).replace(/,/g, '')) || 1;
        return effectiveBase > 0 ? effectiveBase / qty : 0;
    };

    const sameState = isSameState(formData);

    let subtotal = 0;
    let sgst = 0;
    let cgst = 0;
    let igst = 0;
    let total = 0;

    if (items.length > 0) {
        subtotal = items.reduce((sum, item) => {
            const quantity = parseFloat(String(item.quantity || 0).replace(/,/g, '')) || 1;
            const price = getItemPrice(item);
            return sum + (quantity * price);
        }, 0);
        if (subtotal === 0 && effectiveBase > 0) subtotal = effectiveBase;
    } else {
        subtotal = effectiveBase;
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
            sgst = subtotal * 0.09;
            cgst = subtotal * 0.09;
            igst = 0;
        } else {
            sgst = 0;
            cgst = 0;
            igst = subtotal * 0.18;
        }
        total = subtotal + sgst + cgst + igst;
    } else if (dbTotal > 0) {
        total = dbTotal;
        subtotal = dbTotal;
    }

    const received = parseFloat(String(formData.received || 0).replace(/,/g, '')) || 0;
    const balance = total - received;

    return {
        subtotal, sgst, cgst, igst, total, balance,
        sameState
    };
};

// Build exact HTML template string identical to InvoicePreview.js
const buildInvoiceHTMLString = (formData) => {
    const totals = calculateTotals(formData);

    const hasSignature = !!(
        (formData.signature_data && formData.signature_data !== 'CloudSigner_Digital_Signature') ||
        (formData.cloud_signer_signature_url && formData.cloud_signer_signature_url !== 'null' && formData.cloud_signer_signature_url !== '') ||
        (formData.esign_signature && formData.esign_signature !== 'CloudSigner_Digital_Signature')
    );

    let signatureSrc = '';
    if (hasSignature) {
        signatureSrc = formData.cloud_signer_signature_url || formData.signature_data || formData.esign_signature;
    }

    let rawItems = formData.items;
    if (typeof rawItems === 'string') {
        try { rawItems = JSON.parse(rawItems); } catch (e) { rawItems = []; }
    }

    const items = Array.isArray(rawItems) && rawItems.length > 0
        ? rawItems
        : [{
            description: formData.description || 'PROFESSIONAL FEE',
            hsn: '998399',
            quantity: 1,
            price: totals.subtotal
        }];

    const dbBase = parseFloat(formData.calculated_base_amount || formData.base_amount || formData.amount || 0);
    const dbTotal = parseFloat(formData.calculated_total_amount || formData.total_amount || 0);
    const dbSgst = parseFloat(formData.calculated_sgst || formData.sgst || 0);
    const dbCgst = parseFloat(formData.calculated_cgst || formData.cgst || 0);
    const dbIgst = parseFloat(formData.calculated_igst || formData.igst || 0);
    const effectiveBase = dbBase > 0 ? dbBase : (dbTotal > 0 ? (dbSgst || dbCgst || dbIgst ? dbTotal - (dbSgst + dbCgst + dbIgst) : dbTotal / 1.18) : 0);

    const rowsHTML = items.length > 0 ? items.map((item, index) => {
        const qty = parseNum(item.quantity) || 1;
        let price = parseNum(item.price);
        if (price <= 0) {
            price = effectiveBase > 0 ? effectiveBase / qty : 0;
        }
        const amt = parseNum(item.amount) || (qty * price);
        return `
            <tr>
                <td style="text-align: center; padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 12px; border: 1px solid #ddd; color: #000000;">${index + 1}.</td>
                <td style="padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 12px; border: 1px solid #ddd; color: #000000;">${item.description || 'PROFESSIONAL FEE'}</td>
                <td style="text-align: center; padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 12px; border: 1px solid #ddd; color: #000000;">${item.hsn || '998399'}</td>
                <td style="text-align: center; padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 12px; border: 1px solid #ddd; color: #000000;">${qty}</td>
                <td style="text-align: center; padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 12px; border: 1px solid #ddd; color: #000000;">${formatCurrency(price)}</td>
                <td style="text-align: left; padding: 8px; font-family: 'Times New Roman', Times, serif; font-size: 12px; border: 1px solid #ddd; color: #000000;">${formatCurrency(amt)}</td>
            </tr>
        `;
    }).join('') : `
        <tr>
            <td colspan="6" style="text-align: center; padding: 40px; color: #000000; font-family: 'Times New Roman', Times, serif; font-size: 12px; border: 1px solid #ddd;">
                No items added
            </td>
        </tr>
    `;

    return `
        <div class="invoice-doc" style="font-family: 'Times New Roman', Times, serif; background: white; padding: 1.5cm; width: 210mm; min-width: 210mm; max-width: 210mm; margin: 0 auto; box-sizing: border-box; color: #000000;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                <div>
                    <div style="font-family: 'Times New Roman', Times, serif; font-size: 18px; color: #000000; font-weight: bold;">
                        ${formData.business_name || 'JAYARAMA ASSOCIATES'}
                    </div>
                    <div style="font-family: 'Times New Roman', Times, serif; white-space: pre-line; font-size: 11px; color: #000000; margin-top: 5px; line-height: 1.5;">
                        ${getBusinessAddress(formData)}
                    </div>
                </div>
                <div style="text-align: center;">
                    <img 
                        src="${COMPANY_LOGO_URL}" 
                        alt="Company Logo" 
                        style="max-width: 140px; max-height: 120px; object-fit: contain; margin-bottom: 5px; transform: translate(-40px, 10px);"
                        onerror="this.onerror=null; this.src='${FALLBACK_LOGO}';"
                    />
                </div>
            </div>

            <div style="text-align: center; margin-bottom: 5px;">
                <div style="font-family: 'Times New Roman', Times, serif; font-size: 20px; text-align: center; display: inline-block; margin-top: -10px; color: #00AEEF; border-bottom: none; letter-spacing: 0px; text-transform: capitalize; font-weight: bold;">
                    tax invoice
                </div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin: 20px 0;">
                <div style="flex: 1;">
                    <div style="font-family: 'Times New Roman', Times, serif; font-size: 10px; letter-spacing: 0px; color: #000000; border-bottom: 1px solid #f1f5f9; margin-bottom: 8px; margin-top: 1px; display: inline-block; font-weight: bold;">
                        Bill To
                    </div>
                    <div style="font-family: 'Times New Roman', Times, serif; font-size: 14px; margin-bottom: 5px; color: #000000; font-weight: bold;">
                        ${formData.client_name || ''}
                    </div>
                    <div style="font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000000; white-space: pre-line;">
                        ${(formData.client_address || '').toLowerCase().replace(/\b\w/g, char => char.toUpperCase())}
                    </div>
                    ${formData.client_phone ? `<div style="font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000000; margin-top: 3px;">Phone: ${formData.client_phone}</div>` : ''}
                    ${formData.client_gst ? `<div style="font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000000; margin-top: 3px;">GSTIN: ${formData.client_gst}</div>` : ''}
                    ${formData.client_email ? `<div style="font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000000; margin-top: 3px;">Email: ${formData.client_email}</div>` : ''}
                    <div style="font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000000; margin-top: 3px;">
                        State: ${formData.client_state || '36-Telangana'}
                    </div>
                </div>
                <div style="text-align: right; color: #000000;">
                    <p style="font-family: 'Times New Roman', Times, serif; font-size: 13px; color: #000000; margin: 2px 0; font-weight: normal;">
                        Place of supply: ${formData.place_of_supply || '36-Telangana'}
                    </p>
                    <p style="font-family: 'Times New Roman', Times, serif; font-size: 13px; margin-top: 10px; margin-bottom: 5px; color: #000000; font-weight: bold;">
                        Invoice No: ${formData.invoice_number || ''}
                    </p>
                    <p style="font-family: 'Times New Roman', Times, serif; font-size: 12px; margin-top: 5px; color: #000000; font-weight: bold;">
                        Date: ${formData.date || ''}
                    </p>
                </div>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-family: 'Times New Roman', Times, serif;">
                <thead>
                    <tr style="background: #00AEEF; background-color: #00AEEF;">
                        <th style="width: 42px; padding: 10px; color: white; text-align: center; font-family: 'Times New Roman', Times, serif; font-size: 11px; background: #00AEEF; border: 1px solid #00AEEF;">S.No.</th>
                        <th style="padding: 10px; color: white; text-align: left; font-family: 'Times New Roman', Times, serif; font-size: 11px; background: #00AEEF; border: 1px solid #00AEEF;">Item Name</th>
                        <th style="width: 80px; padding: 10px; color: white; text-align: center; font-family: 'Times New Roman', Times, serif; font-size: 11px; background: #00AEEF; border: 1px solid #00AEEF;">HSN/SAC</th>
                        <th style="width: 60px; padding: 10px; color: white; text-align: center; font-family: 'Times New Roman', Times, serif; font-size: 11px; background: #00AEEF; border: 1px solid #00AEEF;">Qty</th>
                        <th style="width: 110px; padding: 10px; color: white; text-align: center; font-family: 'Times New Roman', Times, serif; font-size: 11px; background: #00AEEF; border: 1px solid #00AEEF;">Price/Unit</th>
                        <th style="width: 110px; padding: 10px; color: white; text-align: left; font-family: 'Times New Roman', Times, serif; font-size: 11px; background: #00AEEF; border: 1px solid #00AEEF;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHTML}
                </tbody>
            </table>

            <div style="display: flex; justify-content: space-between; margin-top: 20px;">
                <div style="flex: 1; margin-right: 20px;">
                    <div style="font-family: 'Times New Roman', Times, serif; font-size: 12px; margin-top: 20px; text-transform: capitalize; margin-bottom: 5px; color: #000000; font-weight: bold;">
                        Description
                    </div>
                    <div style="font-family: 'Times New Roman', Times, serif; font-size: 11px; color: #000000; text-transform: uppercase; border-left: none; padding-left: 1px; font-style: normal; font-weight: normal; width: 100%; white-space: pre-wrap; word-break: break-word;">
                        ${formData.description || ''}
                    </div>
                    <div style="font-family: 'Times New Roman', Times, serif; font-size: 12px; text-transform: capitalize; margin-top: 40px; margin-bottom: 5px; color: #000000; font-weight: bold;">
                        Invoice Amount in Words
                    </div>
                    <div style="font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000000; font-style: normal; font-weight: normal;">
                        ${numberToWords(totals.total)}
                    </div>
                </div>
                <div style="width: 250px;">
                    <div style="display: flex; justify-content: space-between; padding: 5px 0; font-family: 'Times New Roman', Times, serif; font-size: 12px; font-weight: bold;">
                        <span>Sub Total</span>
                        <span>${formatCurrency(totals.subtotal)}</span>
                    </div>
                    ${totals.sameState ? `
                        <div style="display: flex; justify-content: space-between; padding: 5px 0; font-family: 'Times New Roman', Times, serif; font-size: 12px;">
                            <span>SGST @ 9%</span>
                            <span>${formatCurrency(totals.sgst)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 5px 0; font-family: 'Times New Roman', Times, serif; font-size: 12px;">
                            <span>CGST @ 9%</span>
                            <span>${formatCurrency(totals.cgst)}</span>
                        </div>
                    ` : `
                        <div style="display: flex; justify-content: space-between; padding: 5px 0; font-family: 'Times New Roman', Times, serif; font-size: 12px;">
                            <span>IGST @ 18%</span>
                            <span>${formatCurrency(totals.igst)}</span>
                        </div>
                    `}
                    <div style="background: #00AEEF; background-color: #00AEEF; color: black; display: flex; justify-content: space-between; padding: 10px; border-radius: 5px; margin: 10px 0; font-family: 'Times New Roman', Times, serif; font-size: 13px;">
                        <span style="font-weight: bold;">TOTAL</span>
                        <span style="font-weight: bold;">${formatCurrency(totals.total)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 5px 0; color: #000000; font-family: 'Times New Roman', Times, serif; font-size: 12px;">
                        <span>Received</span>
                        <span>${formatCurrency(formData.received || 0)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 5px 0; border-top: none; margin-top: 5px; padding-top: 10px; font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000000; font-weight: bold;">
                        <span style="font-weight: bold;">Balance Due</span>
                        <span style="font-weight: bold;">${formatCurrency(totals.balance)}</span>
                    </div>
                </div>
            </div>

            <div style="margin-top: 20px;">
                <div style="font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #000000; text-transform: capitalize; font-weight: bold;">
                    Terms and Conditions
                </div>
                <div style="font-family: 'Times New Roman', Times, serif; font-size: 11px; color: #000000; line-height: 1.3; font-weight: normal;">
                    ${formData.terms_conditions || 'Thanks for doing business with us!'}
                </div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 10px; border-top: none; padding-top: 5px;">
                <div style="flex: 1;">
                    <div style="font-family: 'Times New Roman', Times, serif; margin-bottom: 10px; text-decoration: underline; font-size: 11px; color: #000000;">
                        Pay To-
                    </div>
                    <div style="margin-bottom: 5px; font-size: 11px; font-family: 'Times New Roman', Times, serif; color: #000000;">
                        Bank Name : <b>${formData.bank_name || 'POLA SANDEEP REDDY'}</b>
                    </div>
                    <div style="margin-bottom: 5px; font-size: 11px; font-family: 'Times New Roman', Times, serif; color: #000000;">
                        Bank Account No : <b>${formData.bank_account_no || '922020060131840'}</b>
                    </div>
                    <div style="margin-bottom: 5px; font-size: 11px; font-family: 'Times New Roman', Times, serif; color: #000000;">
                        Bank IFSC code : <b>${formData.bank_ifsc || 'UTIB0000425'}</b>
                    </div>
                    <div style="margin-bottom: 5px; font-size: 11px; font-family: 'Times New Roman', Times, serif; color: #000000;">
                        Account holder's name : <b>${formData.account_holder || 'JAYARAMA ASSOCIATES'}</b>
                    </div>
                </div>
                
                <div style="text-align: center; min-width: 200px; padding-right: 20px;">
                    <div style="font-family: 'Times New Roman', Times, serif; font-size: 12px; margin-bottom: 8px; color: #000000; font-weight: normal; text-align: center;">
                        For : JAYARAMA ASSOCIATES
                    </div>
                    
                    ${hasSignature && signatureSrc ? `
                    <div style="display: flex; justify-content: center; align-items: center; margin-bottom: 4px; min-height: 50px;">
                        <img src="${signatureSrc}" alt="Digital Signature" style="max-width: 130px; max-height: 48px; width: auto; height: auto; object-fit: contain; background: transparent; border: none;" />
                    </div>
                    ` : ''}
                    
                    <div style="font-family: 'Times New Roman', Times, serif; text-align: center; font-size: 12px; margin-top: ${hasSignature ? '4px' : '65px'}; margin-bottom: 0px; letter-spacing: 1px; color: #000000; font-weight: normal; text-transform: capitalize; line-height: 1.2;">
                        Authorized Signatory
                    </div>
                    
                    ${formData.signed_at ? `
                    <div style="font-size: 9px; color: #555; margin-top: 3px; text-align: center; line-height: 1.2;">
                        Signed: ${new Date(formData.signed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
};

// Core function to render HTML into a canvas and return jsPDF instance
const renderInvoicePDFDoc = async (formData) => {
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.width = '210mm';
    container.style.background = '#ffffff';
    container.style.zIndex = '-9999';

    container.innerHTML = buildInvoiceHTMLString(formData);
    document.body.appendChild(container);

    try {
        const images = container.querySelectorAll('img');
        await Promise.all(Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
                img.onload = resolve;
                img.onerror = resolve;
            });
        }));

        const invoiceElement = container.firstElementChild || container;

        const canvas = await html2canvas(invoiceElement, {
            scale: 3,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            allowTaint: false,
            foreignObjectRendering: false
        });

        const imgWidth = 210;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        const pdf = new jsPDF({
            unit: 'mm',
            format: 'a4',
            orientation: 'portrait'
        });

        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);

        return pdf;
    } finally {
        if (container.parentNode) {
            container.parentNode.removeChild(container);
        }
    }
};

// Main function to generate signed PDF and save file
const generateSignedPDF = async (formData, userRole, showNotification) => {
    try {
        if (!formData) throw new Error('No form data provided');

        // If invoice is manually signed, retrieve the Manually Signed PDF from backend/Google Drive
        if (formData.id && formData.manual_signed_file_id) {
            try {
                const token = localStorage.getItem('token');
                const response = await axios.get(`/api/invoices/${formData.id}/manual-signature/download`, {
                    headers: { Authorization: `Bearer ${token}` },
                    responseType: 'blob'
                });

                const blob = new Blob([response.data], { type: 'application/pdf' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const safeNum = (formData.invoice_number || `INV-${formData.id}`).replace(/[/\\?%*:|"<>]/g, '_');
                const fileName = formData.manual_signed_file_name || `${safeNum}_Manually_Signed.pdf`;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);

                if (showNotification) {
                    showNotification('success', 'Manually Signed PDF downloaded successfully');
                }
                return { success: true };
            } catch (backendErr) {
                console.warn('Backend manual signed PDF fetch failed, falling back to client render:', backendErr);
            }
        }

        // If invoice is digitally signed, retrieve the REAL CloudSigner DSC Token Signed PDF from backend
        if (formData.id && (formData.approval_status === 'final_approved' || formData.signature_data === 'CloudSigner_Digital_Signature')) {
            try {
                const token = localStorage.getItem('token');
                const response = await axios.get(`/api/invoices/${formData.id}/download-signed-pdf`, {
                    headers: { Authorization: `Bearer ${token}` },
                    responseType: 'blob'
                });

                const blob = new Blob([response.data], { type: 'application/pdf' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const safeNum = (formData.invoice_number || `INV-${formData.id}`).replace(/[/\\?%*:|"<>]/g, '-');
                a.download = `${safeNum}-SIGNED.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);

                if (showNotification) {
                    showNotification('success', 'Real CloudSigner DSC Signed PDF downloaded successfully');
                }
                return { success: true };
            } catch (backendErr) {
                console.warn('Backend signed PDF fetch failed, falling back to client render:', backendErr);
            }
        }

        const pdf = await renderInvoicePDFDoc(formData);
        const fileName = `Invoice_${formData.invoice_number || 'JA'}_${formData.date || new Date().toISOString().split('T')[0]}.pdf`;
        pdf.save(fileName);

        if (showNotification) {
            showNotification('success', 'PDF downloaded successfully');
        }
        return { success: true };
    } catch (error) {
        console.error('PDF Generation Error:', error);
        if (showNotification) {
            showNotification('error', 'Failed to generate PDF: ' + error.message);
        }
        return { success: false, message: error.message };
    }
};

// Helper function to merge attached PDFs if present on invoice
const mergeAttachedPDFsIfPresent = async (mainPdfBytes, attachedPdfsInput) => {
    if (!attachedPdfsInput) return mainPdfBytes;

    let attachedList = [];
    try {
        attachedList = typeof attachedPdfsInput === 'string' ? JSON.parse(attachedPdfsInput) : attachedPdfsInput;
    } catch (e) {
        attachedList = [];
    }

    if (!Array.isArray(attachedList) || attachedList.length === 0) {
        return mainPdfBytes;
    }

    try {
        const mergedDoc = await PDFDocument.create();

        // 1. Copy pages from Main Invoice PDF
        const mainDoc = await PDFDocument.load(mainPdfBytes);
        const mainPages = await mergedDoc.copyPages(mainDoc, mainDoc.getPageIndices());
        mainPages.forEach(p => mergedDoc.addPage(p));

        // 2. Process each attached PDF in order
        for (let i = 0; i < attachedList.length; i++) {
            const att = attachedList[i];
            let bytes = att.arrayBuffer;
            if (!bytes && att.data) {
                const base64Str = att.data.replace(/^data:application\/pdf;base64,/, '');
                const binaryStr = window.atob(base64Str);
                const len = binaryStr.length;
                bytes = new Uint8Array(len);
                for (let j = 0; j < len; j++) {
                    bytes[j] = binaryStr.charCodeAt(j);
                }
            }

            if (bytes) {
                const attDoc = await PDFDocument.load(bytes);
                const pageIndices = attDoc.getPageIndices();
                const copiedPages = await mergedDoc.copyPages(attDoc, pageIndices);

                copiedPages.forEach((page) => {
                    mergedDoc.addPage(page);
                });
            }
        }

        const mergedBytes = await mergedDoc.save();
        return mergedBytes;
    } catch (err) {
        console.error('Error merging attached PDFs in preview:', err);
        return mainPdfBytes;
    }
};

// Function to generate PDF and return as blob
const generateSignedPDFBlob = async (formData, signatureStatus, signatureDetails) => {
    try {
        if (!formData) throw new Error('No form data provided');

        // If invoice is manually signed, stream the manually signed PDF from backend
        if (formData.id && formData.manual_signed_file_id) {
            try {
                const token = localStorage.getItem('token');
                const response = await axios.get(`/api/invoices/${formData.id}/manual-signature/view`, {
                    headers: { Authorization: `Bearer ${token}` },
                    responseType: 'blob'
                });
                if (response.data && response.data.type === 'application/pdf' && response.data.size > 200) {
                    return response.data;
                }
            } catch (backendErr) {
                console.warn('Backend manual signed PDF fetch failed, falling back to client canvas:', backendErr);
            }
        }

        // If invoice is digitally signed, retrieve the signed PDF from backend
        if (formData.id && (formData.approval_status === 'final_approved' || formData.signature_data === 'CloudSigner_Digital_Signature')) {
            try {
                const token = localStorage.getItem('token');
                const response = await axios.get(`/api/invoices/${formData.id}/open-signed-pdf`, {
                    headers: { Authorization: `Bearer ${token}` },
                    responseType: 'blob'
                });
                if (response.data && response.data.type === 'application/pdf' && response.data.size > 200) {
                    return response.data;
                }
            } catch (backendErr) {
                console.warn('Backend signed PDF fetch failed, falling back to client canvas:', backendErr);
            }
        }

        const pdfDoc = await renderInvoicePDFDoc(formData);
        const mainPdfBytes = pdfDoc.output('arraybuffer');
        const finalPdfBytes = await mergeAttachedPDFsIfPresent(mainPdfBytes, formData.attached_pdfs);
        return new Blob([finalPdfBytes], { type: 'application/pdf' });
    } catch (error) {
        console.error('PDF Generation Error:', error);
        throw error;
    }
};

// Function to get PDF as data URL (for preview)
const generateSignedPDFDataUrl = async (formData, signatureStatus, signatureDetails) => {
    try {
        const blob = await generateSignedPDFBlob(formData, signatureStatus, signatureDetails);
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('PDF Generation Error:', error);
        throw error;
    }
};

export { generateSignedPDF, generateSignedPDFBlob, generateSignedPDFDataUrl, renderInvoicePDFDoc };
