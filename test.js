import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import axios from 'axios';
import Sidebar from './Sidebar';
import Notification from './Notification';
import InvoicePreview from './InvoicePreview';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import SignaturePad from 'react-signature-canvas';

axios.defaults.withCredentials = true;

const TAX_RATES = {
    SGST: 0.09,
    CGST: 0.09,
    IGST: 0.18
};

const formatRupees = (amount) => {
    if (amount === undefined || amount === null) return '₹0.00';
    const numAmount = typeof amount === 'number' ? amount : parseFloat(amount);
    if (isNaN(numAmount)) return '₹0.00';
    return `₹${numAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatLargeNumber = (amount) => {
    if (amount === undefined || amount === null || isNaN(amount)) return '₹0';
    const num = typeof amount === 'number' ? amount : parseFloat(amount);
    if (isNaN(num)) return '₹0';
    const absAmount = Math.abs(num);
    if (absAmount >= 10000000) {
        const crores = num / 10000000;
        const truncated = Math.floor(crores * 100) / 100;
        const formatted = truncated % 1 === 0 ? truncated.toFixed(0) : truncated.toFixed(2).replace(/\.?0+$/, '');
        return `₹${formatted} Cr`;
    }
    if (absAmount >= 100000) {
        const lakhs = num / 100000;
        const truncated = Math.floor(lakhs * 100) / 100;
        const formatted = truncated % 1 === 0 ? truncated.toFixed(0) : truncated.toFixed(2).replace(/\.?0+$/, '');
        return `₹${formatted} L`;
    }
    return formatRupees(num);
};

const createLocalDate = (dateStr) => {
    if (!dateStr) return null;
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = dateStr.split('-');
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
        const [day, month, year] = dateStr.split('-');
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date;
    return null;
};

const truncateText = (text, maxLength = 30) => {
    if (!text) return '—';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
};

const formatIndianCurrencyForExcel = (amount) => {
    if (amount === undefined || amount === null) return '0';
    const num = typeof amount === 'number' ? amount : parseFloat(amount);
    if (isNaN(num)) return '0';
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const buildInvoicePreviewData = (invoice) => {
    let items = invoice.items || [];
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch { items = []; }
    }
    return {
        ...invoice,
        business_name: invoice.business_name || invoice.full_name || 'JAYARAMA ASSOCIATES',
        invoice_number: invoice.invoice_number || invoice.invoice_no || invoice.id,
        date: invoice.date || invoice.invoice_date,
        items,
        client_name: invoice.client_name || invoice.description || 'Customer',
        client_address: invoice.client_address || '',
        client_phone: invoice.client_phone || '',
        client_email: invoice.client_email || '',
        client_gst: invoice.client_gst || '',
        client_branch: invoice.client_branch || '',
        place_of_supply: invoice.place_of_supply || invoice.client_state || '',
        description: invoice.description || '',
        currency: invoice.currency || 'INR',
        received: parseFloat(invoice.received) || 0,
        tds_amount: parseFloat(invoice.tds_amount) || 0,
        bank_name: invoice.bank_name || '',
        bank_account_no: invoice.bank_account_no || '',
        bank_ifsc: invoice.bank_ifsc || '',
        account_holder: invoice.account_holder || '',
        amount_in_words: invoice.amount_in_words || '',
        terms_conditions: invoice.terms_conditions || '',
        authorized_signatory: invoice.authorized_signatory || '',
        signature_data: invoice.signature_data || invoice.signature || invoice.signatureData || invoice.esign_signature || null,
        signed_at: invoice.signed_at,
        approval_status: invoice.approval_status
    };
};

const extractReasonOnly = (remarks) => {
    if (!remarks) return '';
    const reasonMatch = remarks.match(/Reason:\s*(.+?)(?:\n|$)/);
    if (reasonMatch && reasonMatch[1]) {
        let cleanReason = reasonMatch[1].trim();
        cleanReason = cleanReason.replace(/[-*]+$/, '').trim();
        return cleanReason;
    }
    return '';
};

const extractCancellationDetails = (remarks) => {
    if (!remarks) return null;
    const cancellationMatch = remarks.match(/🔴 \[CANCELLED ON (.*?)\]\s*\n\s*Reason:\s*(.+?)(?:\n|$)\s*Cancelled by:\s*(.+?)(?:\n|$)/);
    if (cancellationMatch) {
        let cancelledBy = cancellationMatch[3].trim();
        cancelledBy = cancelledBy.replace(/\s*\([^)]*\)/, '').trim();
        return {
            date: cancellationMatch[1].trim(),
            reason: cancellationMatch[2].trim().replace(/[-*]+$/, '').trim(),
            cancelledBy
        };
    }
    const reasonMatch = remarks.match(/Reason:\s*(.+?)(?:\n|$)/);
    let cancelledByMatch = remarks.match(/Cancelled by:\s*(.+?)(?:\n|$)/);
    let cancelledBy = cancelledByMatch ? cancelledByMatch[1].trim() : 'Unknown user';
    cancelledBy = cancelledBy.replace(/\s*\([^)]*\)/, '').trim();
    const dateMatch = remarks.match(/CANCELLED ON (.*?)(?:\n|$)/);
    return {
        date: dateMatch ? dateMatch[1].trim() : 'Unknown date',
        reason: reasonMatch ? reasonMatch[1].trim().replace(/[-*]+$/, '').trim() : 'No reason provided',
        cancelledBy
    };
};

// ─── SVG Icons ───────────────────────────────────────────────────────────────
const IconSend = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"/>
        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
);
const IconPen = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9"/>
        <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
);
const IconDownload = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="12" y1="11" x2="12" y2="17"/>
        <polyline points="9 14 12 17 15 14"/>
    </svg>
);
const IconClock = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
    </svg>
);
const IconSpinner = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M12 2a10 10 0 0110 10" style={{ opacity: 0.3 }}/>
        <path d="M12 2a10 10 0 0110 10" style={{ animation: 'spinIcon 0.7s linear infinite', transformOrigin: '12px 12px' }}/>
    </svg>
);

// ─── Animated Action Button ───────────────────────────────────────────────────
const ActionButton = ({ action, text, color, disabled, loading, onClick }) => {
    const btnClass = disabled
        ? 'ab ab-disabled'
        : action === 'request'  ? 'ab ab-request'
        : action === 'esign'    ? 'ab ab-esign'
        : action === 'download' ? 'ab ab-download'
        : 'ab';

    const icon = loading
        ? <IconSpinner />
        : action === 'request'  ? <IconSend />
        : action === 'esign'    ? <IconPen />
        : action === 'download' ? <IconDownload />
        : <IconClock />;

    const label = loading
        ? (action === 'request' ? 'Sending...' : 'Preparing...')
        : text.replace(/^[^\s]+\s/, ''); // strip emoji prefix, icon handles it

    return (
        <button
            className={btnClass}
            onClick={onClick}
            disabled={disabled || loading}
            style={{ background: color }}
        >
            <span className="ab-icon">{icon}</span>
            <span className="ab-label">{label}</span>
        </button>
    );
};

// ─── Stats Cards ──────────────────────────────────────────────────────────────
const StatsCards = ({ stats, userRole }) => (
    <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 'clamp(12px, 2vw, 20px)',
        marginBottom: 'clamp(24px, 4vw, 32px)'
    }}>
        {[
            { label: 'Total Invoices', value: stats.totalInvoices, color: '#6366f1', sub: `Paid: ${stats.paidInvoices} | Unpaid: ${stats.unpaidInvoices} | Cancelled: ${stats.cancelledInvoices}` },
            { label: 'Base Revenue', value: formatLargeNumber(stats.totalBaseAmount), color: '#3b82f6', sub: 'Before tax' },
            { label: 'Total with GST', value: formatLargeNumber(Math.round(stats.totalWithGST)), color: '#8b5cf6', sub: 'Including all taxes' },
            { label: 'Amount Received', value: formatLargeNumber(Math.round(stats.totalPaid)), color: '#10b981', sub: 'Total collected' },
            { label: 'Pending Amount', value: formatLargeNumber(Math.round(stats.totalPending)), color: '#ef4444', sub: 'Yet to receive' },
            ...(userRole === 'admin' ? [
                { label: 'eSign Requested', value: stats.requestedInvoices, color: '#3b82f6', sub: 'Waiting for Super Admin' },
                { label: 'Final Approved', value: stats.approvedInvoices, color: '#10b981', sub: 'Ready for download' }
            ] : [])
        ].map(({ label, value, color, sub }) => (
            <div key={label} style={{ background: 'white', borderRadius: 'clamp(16px,3vw,24px)', padding: 'clamp(16px,2.5vw,20px)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', border: '1px solid #eef2ff' }}>
                <div style={{ color, fontSize: 'clamp(0.7rem,2vw,0.75rem)', fontWeight: '600', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: 'clamp(1.2rem,4vw,1.6rem)', fontWeight: '800', color: '#1e293b', marginTop: '8px' }}>{value}</div>
                <div style={{ fontSize: 'clamp(0.6rem,1.8vw,0.7rem)', color: '#94a3b8', marginTop: '4px' }}>{sub}</div>
            </div>
        ))}
    </div>
);

// ─── Filter Bar ───────────────────────────────────────────────────────────────
const FilterBar = ({ searchTerm, setSearchTerm, selectedStatusFilter, setSelectedStatusFilter, selectedApprovalFilter, setSelectedApprovalFilter, startDate, setStartDate, endDate, setEndDate, userRole, clearSearchFilter, clearDateFilter, clearAllFilters }) => (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'white', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={selectedStatusFilter} onChange={(e) => setSelectedStatusFilter(e.target.value)} style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer', background: 'white' }} aria-label="Filter by payment status">
                <option value="all">All Payment Status</option>
                <option value="paid">✅ Paid</option>
                <option value="unpaid">❌ Unpaid</option>
                <option value="cancelled">🚫 Cancelled</option>
            </select>
            {(userRole === 'admin' || userRole === 'super_admin') && (
                <select value={selectedApprovalFilter} onChange={(e) => setSelectedApprovalFilter(e.target.value)} style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer', background: 'white' }} aria-label="Filter by approval status">
                    <option value="all">All Approval Status</option>
                    <option value="created">📝 Created</option>
                    <option value="requested">📨 Requested</option>
                    <option value="final_approved">✅ Final Approved</option>
                </select>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.8rem' }} aria-label="Start date" />
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>to</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.8rem' }} aria-label="End date" />
                {(startDate || endDate) && (
                    <button onClick={clearDateFilter} style={{ padding: '6px 12px', background: '#e2e8f0', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: '500' }} aria-label="Clear date filter">✕ Clear Dates</button>
                )}
            </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', minWidth: '250px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}>
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input type="text" placeholder="Search by customer, invoice #, GST, bank, remarks..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: '8px 16px 8px 36px', border: '1px solid #e2e8f0', borderRadius: '40px', width: '100%', fontSize: '0.8rem', background: 'white', outline: 'none', transition: 'all 0.2s', minWidth: '250px' }} aria-label="Search invoices" />
            </div>
            {searchTerm && (
                <button onClick={clearSearchFilter} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '40px', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }} aria-label="Clear search">✕ Clear Search</button>
            )}
            {(startDate || endDate || selectedStatusFilter !== 'all' || (selectedApprovalFilter !== 'all' && (userRole === 'admin' || userRole === 'super_admin')) || searchTerm) && (
                <button onClick={clearAllFilters} style={{ background: '#64748b', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '40px', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }} aria-label="Clear all filters">🔄 Clear All Filters</button>
            )}
        </div>
    </div>
);

// ─── Pagination ───────────────────────────────────────────────────────────────
const Pagination = ({ currentPage, totalPages, itemsPerPage, setItemsPerPage, onPageChange, totalItems, startIndex, endIndex }) => {
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    if (endPage - startPage + 1 < maxVisiblePages) startPage = Math.max(1, endPage - maxVisiblePages + 1);
    const pageNumbers = [];
    for (let i = startPage; i <= endPage; i++) pageNumbers.push(i);

    const btnStyle = (disabled) => ({ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', background: 'white', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, fontSize: '0.8rem' });

    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginTop: '20px', padding: '16px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Showing {startIndex + 1} to {Math.min(endIndex, totalItems)} of {totalItems} entries</span>
                <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer', background: 'white' }} aria-label="Items per page">
                    <option value={10}>10 per page</option>
                    <option value={25}>25 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => onPageChange(1)} disabled={currentPage === 1} style={btnStyle(currentPage === 1)} aria-label="First page">First</button>
                <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} style={btnStyle(currentPage === 1)} aria-label="Previous page">Previous</button>
                {startPage > 1 && (<><button onClick={() => onPageChange(1)} style={btnStyle(false)}>1</button>{startPage > 2 && <span style={{ padding: '0 4px' }}>...</span>}</>)}
                {pageNumbers.map(n => (
                    <button key={n} onClick={() => onPageChange(n)} style={{ padding: '6px 12px', border: currentPage === n ? 'none' : '1px solid #e2e8f0', borderRadius: '8px', background: currentPage === n ? '#4f46e5' : 'white', color: currentPage === n ? 'white' : '#475569', cursor: 'pointer', fontWeight: currentPage === n ? '600' : '400', fontSize: '0.8rem' }} aria-label={`Page ${n}`} aria-current={currentPage === n ? 'page' : undefined}>{n}</button>
                ))}
                {endPage < totalPages && (<>{endPage < totalPages - 1 && <span style={{ padding: '0 4px' }}>...</span>}<button onClick={() => onPageChange(totalPages)} style={btnStyle(false)}>{totalPages}</button></>)}
                <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} style={btnStyle(currentPage === totalPages)} aria-label="Next page">Next</button>
                <button onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages} style={btnStyle(currentPage === totalPages)} aria-label="Last page">Last</button>
            </div>
        </div>
    );
};

// ─── ESign Modal ──────────────────────────────────────────────────────────────
const ESignModal = ({ isOpen, onClose, onConfirm, invoiceNumber, loading }) => {
    const signaturePadRef = useRef(null);
    const [signatureData, setSignatureData] = useState(null);
    const [signatureMode, setSignatureMode] = useState('draw');
    const [typedName, setTypedName] = useState('');
    const [typedSignaturePreview, setTypedSignaturePreview] = useState('');
    const [esignError, setEsignError] = useState('');

    const generateTypedSignatureImage = (name) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 500; canvas.height = 180;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = 'italic 32px "Brush Script MT", cursive';
        ctx.fillStyle = '#000'; ctx.textBaseline = 'middle';
        ctx.fillText(name, 20, 70);
        ctx.font = '12px Arial'; ctx.fillStyle = '#666';
        ctx.fillText(`Signed by: ${name}`, 20, 120);
        ctx.fillText(new Date().toLocaleString(), 20, 145);
        return canvas.toDataURL('image/png');
    };

    useEffect(() => {
        if (!isOpen) {
            setSignatureData(null); setTypedName(''); setTypedSignaturePreview('');
            setSignatureMode('draw'); setEsignError('');
            if (signaturePadRef.current) signaturePadRef.current.clear();
        }
    }, [isOpen]);

    useEffect(() => {
        if (signatureMode === 'type' && typedName.trim()) setTypedSignaturePreview(generateTypedSignatureImage(typedName.trim()));
        else setTypedSignaturePreview('');
    }, [signatureMode, typedName]);

    const clearSignature = () => {
        if (signaturePadRef.current) { signaturePadRef.current.clear(); setSignatureData(null); }
        setEsignError('');
    };

    const saveSignature = () => {
        if (signatureMode === 'cloud') { setEsignError(''); return 'CLOUDSIGNER'; }
        if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
            const data = signaturePadRef.current.toDataURL();
            setSignatureData(data); setEsignError(''); return data;
        }
        if (signatureMode === 'type' && typedName.trim()) {
            const data = generateTypedSignatureImage(typedName.trim());
            setSignatureData(data); setEsignError(''); return data;
        }
        setEsignError('Please provide a signature (draw or type your name), or select CloudSigner');
        return null;
    };

    const handleConfirm = () => { const result = saveSignature(); if (result) onConfirm(result, signatureMode); };

    if (!isOpen) return null;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(4px)' }} onClick={onClose}>
            <div style={{ background: 'white', borderRadius: '20px', padding: '28px', width: '90%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#4f46e5' }}>✍️ Final eSign Approval</h2>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#64748b' }} aria-label="Close modal">×</button>
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <p style={{ color: '#475569', marginBottom: '16px' }}>Invoice <strong>#{invoiceNumber}</strong> requires your final eSignature for approval.</p>
                    <div style={{ marginBottom: '16px' }}>
                        {['draw', 'type', 'cloud'].map(mode => (
                            <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                                <input type="radio" checked={signatureMode === mode} onChange={() => setSignatureMode(mode)} />
                                <span>{mode === 'draw' ? 'Draw Signature' : mode === 'type' ? 'Type Signature' : 'Digital Signature (CloudSigner)'}</span>
                            </label>
                        ))}
                    </div>
                    {signatureMode === 'cloud' ? (
                        <div style={{ padding: '20px', borderRadius: '16px', background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
                            <div style={{ fontSize: '0.95rem', color: '#0f172a', marginBottom: '8px', fontWeight: '600' }}>CloudSigner Digital Signature</div>
                            <div style={{ fontSize: '0.9rem', color: '#475569' }}>Your invoice will be digitally signed using the Linux CloudSigner service.</div>
                        </div>
                    ) : signatureMode === 'type' ? (
                        <div>
                            <input type="text" value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="Type your full name as signature" style={{ width: '100%', padding: '12px', border: '2px solid #e2e8f0', borderRadius: '12px', fontFamily: '"Brush Script MT", cursive', fontSize: '24px' }} aria-label="Type your signature" />
                            {typedSignaturePreview && (
                                <div style={{ marginTop: '16px', padding: '12px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #cbd5e1' }}>
                                    <div style={{ marginBottom: '8px', fontSize: '0.95rem', color: '#334155', fontWeight: '600' }}>Preview</div>
                                    <img src={typedSignaturePreview} alt="Typed signature preview" style={{ width: '100%', display: 'block', borderRadius: '10px' }} />
                                </div>
                            )}
                            {!typedSignaturePreview && typedName && <div style={{ marginTop: '12px', color: '#475569', fontSize: '0.95rem' }}>Generating preview...</div>}
                        </div>
                    ) : (
                        <div>
                            <div style={{ border: '2px solid #e2e8f0', borderRadius: '12px', marginBottom: '12px', background: 'transparent' }}>
                                <SignaturePad ref={signaturePadRef} penColor="black" backgroundColor="transparent" canvasProps={{ width: 500, height: 200, style: { width: '100%', height: 'auto', border: 'none', background: 'transparent' }, 'aria-label': 'Signature drawing canvas' }} />
                            </div>
                            <button onClick={clearSignature} style={{ padding: '6px 12px', background: '#e2e8f0', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }} aria-label="Clear signature">Clear Signature</button>
                        </div>
                    )}
                    {esignError && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '12px' }} role="alert">⚠️ {esignError}</div>}
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ padding: '10px 20px', background: '#e2e8f0', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleConfirm} disabled={loading} style={{ padding: '10px 24px', background: loading ? '#94a3b8' : '#10b981', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', color: 'white' }}>
                        {loading ? 'Processing...' : '✓ Confirm eSign'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Cancel Modal ─────────────────────────────────────────────────────────────
const CancelModal = ({ isOpen, onClose, onConfirm, isSubmitting, cancelReason, setCancelReason }) => {
    if (!isOpen) return null;
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }} onClick={onClose}>
            <div style={{ background: 'white', borderRadius: '20px', padding: '28px', width: '90%', maxWidth: '500px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', animation: 'slideIn 0.3s ease-out' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#dc2626', margin: 0 }}>🚫 Cancel Invoice</h2>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#64748b', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }} aria-label="Close modal">×</button>
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <p style={{ color: '#475569', marginBottom: '16px', fontSize: '0.9rem' }}>⚠️ Please provide a reason for cancelling this invoice.</p>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1e293b', fontSize: '0.85rem' }}>Cancellation Reason <span style={{ color: '#ef4444' }}>*</span></label>
                    <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="e.g., Duplicate invoice, Client requested cancellation, Incorrect amount..." rows="4" style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} autoFocus aria-label="Cancellation reason" />
                    <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '8px' }}>✅ This reason will be permanently saved to the database with timestamp and your name</p>
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ padding: '10px 20px', background: '#e2e8f0', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer', color: '#475569' }}>Cancel</button>
                    <button onClick={onConfirm} disabled={isSubmitting} style={{ padding: '10px 24px', background: isSubmitting ? '#f87171' : '#dc2626', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: isSubmitting ? 'not-allowed' : 'pointer', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isSubmitting ? (<><div style={{ width: '16px', height: '16px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }}></div>Saving...</>) : '✓ Confirm & Save to Database'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Remarks Modal ────────────────────────────────────────────────────────────
const RemarksModal = ({ isOpen, onClose, invoiceNumber, isCancelled, cancellationDetails, remarks }) => {
    if (!isOpen) return null;
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }} onClick={onClose}>
            <div style={{ background: 'white', borderRadius: '20px', padding: '28px', width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', animation: 'slideIn 0.3s ease-out' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: isCancelled ? '#dc2626' : '#1e293b', margin: 0 }}>
                        {isCancelled ? '🚫 Cancellation Details' : '📝 Remarks'} - Invoice #{invoiceNumber}
                    </h2>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#64748b', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }} aria-label="Close modal">×</button>
                </div>
                {isCancelled && cancellationDetails ? (
                    <div style={{ background: '#fef2f2', padding: '20px', borderRadius: '12px', border: '1px solid #fecaca' }}>
                        <div style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #fecaca' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#991b1b', minWidth: '100px' }}>📅 Cancelled On:</span>
                                <span style={{ fontSize: '0.9rem', color: '#7f1d1d', fontWeight: '500' }}>{cancellationDetails.date || 'Unknown date'}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#991b1b', minWidth: '100px' }}>👤 Cancelled By:</span>
                                <span style={{ fontSize: '0.9rem', color: '#7f1d1d', fontWeight: '500' }}>{cancellationDetails.cancelledBy || 'Unknown user'}</span>
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#991b1b', marginBottom: '8px' }}>📝 Reason:</div>
                            <div style={{ fontSize: '0.9rem', lineHeight: '1.6', color: '#7f1d1d', background: '#fff5f5', padding: '12px', borderRadius: '8px', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>{cancellationDetails.reason || 'No reason provided'}</div>
                        </div>
                    </div>
                ) : (
                    <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap', wordWrap: 'break-word', fontSize: '0.9rem', lineHeight: '1.6', color: '#334155' }}>{remarks || 'No remarks available'}</div>
                )}
                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ padding: '8px 20px', background: '#4f46e5', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer', color: 'white' }}>Close</button>
                </div>
            </div>
        </div>
    );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────
const Dashboard = ({ user, onLogout, onCreateNew, onEditInvoice }) => {
    const [invoices, setInvoices] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [notification, setNotification] = useState(null);
    const [userRole, setUserRole] = useState('user');
    const [userId, setUserId] = useState(null);
    const [userName, setUserName] = useState('');
    const [clients, setClients] = useState([]);
    const [banks, setBanks] = useState([]);
    const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
    const [selectedApprovalFilter, setSelectedApprovalFilter] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelInvoiceId, setCancelInvoiceId] = useState(null);
    const [cancelReason, setCancelReason] = useState('');
    const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
    const [showRemarksModal, setShowRemarksModal] = useState(false);
    const [selectedRemarks, setSelectedRemarks] = useState('');
    const [selectedInvoiceNumber, setSelectedInvoiceNumber] = useState('');
    const [isCancelledInvoice, setIsCancelledInvoice] = useState(false);
    const [cancellationDetails, setCancellationDetails] = useState(null);
    const [showESignModal, setShowESignModal] = useState(false);
    const [eSignInvoiceId, setESignInvoiceId] = useState(null);
    const [isSubmittingESign, setIsSubmittingESign] = useState(false);
    const [requestingESignId, setRequestingESignId] = useState(null);
    const [downloadPreviewInvoice, setDownloadPreviewInvoice] = useState(null);
    const [isDownloadingPreviewPDF, setIsDownloadingPreviewPDF] = useState(false);
    const hiddenInvoicePreviewRef = useRef(null);
    const notificationTimeoutRef = useRef(null);

    useEffect(() => { return () => { if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current); }; }, []);

    const formatDateForDisplay = useCallback((dateString) => {
        if (!dateString) return '—';
        try {
            let date;
            if (typeof dateString === 'string' && dateString.match(/^\d{2}-\d{2}-\d{4}$/)) {
                const [day, month, year] = dateString.split('-');
                date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            } else if (typeof dateString === 'string' && dateString.match(/^\d{4}-\d{2}-\d{2}/)) {
                let cleanDate = dateString.split('T')[0].split(' ')[0];
                const [year, month, day] = cleanDate.split('-');
                date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            } else {
                date = new Date(dateString);
            }
            if (isNaN(date.getTime())) return '—';
            const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            return `${date.getDate()}-${monthNames[date.getMonth()]}-${date.getFullYear()}`;
        } catch { return '—'; }
    }, []);

    const showNotification = useCallback((type, message) => {
        if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
        setNotification({ type, message });
        notificationTimeoutRef.current = setTimeout(() => { setNotification(null); notificationTimeoutRef.current = null; }, 3000);
    }, []);

    const getBankName = useCallback((accountNo) => {
        if (!accountNo) return '—';
        const bank = banks.find(b => b.account_number === accountNo);
        return bank ? bank.bank_name : accountNo;
    }, [banks]);

    const getDisplayBankName = useCallback((invoice) => {
        if (invoice.client_id) {
            const client = clients.find(c => c.id === invoice.client_id);
            if (client) return client.name;
        }
        if (invoice.bank_name && invoice.bank_name.startsWith('cl_')) {
            const client = clients.find(c => c.id === invoice.bank_name);
            if (client) return client.name;
        }
        return invoice.bank_name || getBankName(invoice.bank_account_no) || '—';
    }, [clients, getBankName]);

    const getClientBranch = useCallback((clientId) => {
        const client = clients.find(c => c.id === clientId);
        return client?.branch || '—';
    }, [clients]);

    const getApprovalStatusBadge = useCallback((status) => {
        const badges = {
            created: { bg: '#f59e0b', text: 'Created', icon: '📝', lightBg: '#fffbeb' },
            requested: { bg: '#3b82f6', text: 'Requested', icon: '📨', lightBg: '#eff6ff' },
            final_approved: { bg: '#10b981', text: 'Final Approved', icon: '✅', lightBg: '#f0fdf4' }
        };
        return badges[status] || { bg: '#6b7280', text: status, icon: '📋', lightBg: '#f9fafb' };
    }, []);

    const getApprovalActionButton = useCallback((invoice) => {
        const status = invoice.approval_status || 'created';
        if (userRole === 'admin') {
            if (status === 'created') return { text: 'Request eSign', action: 'request', disabled: false, color: '#4f46e5' };
            if (status === 'requested') return { text: 'Request Sent', action: 'none', disabled: true, color: '#94a3b8' };
            if (status === 'final_approved') return { text: 'Download PDF', action: 'download', disabled: false, color: '#10b981' };
        }
        if (userRole === 'super_admin') {
            if (status === 'requested') return { text: 'Final eSign', action: 'esign', disabled: false, color: '#8b5cf6' };
            if (status === 'final_approved') return { text: 'Download PDF', action: 'download', disabled: false, color: '#10b981' };
        }
        return null;
    }, [userRole]);

    const loadAllDataFromMySQL = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error('No authentication token found');

            const [userData, invoicesRes, clientsRes, banksRes] = await Promise.all([
                axios.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } }),
                axios.get('/api/invoices', { headers: { Authorization: `Bearer ${token}` } }),
                axios.get('/api/clients', { headers: { Authorization: `Bearer ${token}` } }),
                axios.get('/api/banks', { headers: { Authorization: `Bearer ${token}` } })
            ]);

            const role = userData.data.role;
            const currentUserId = userData.data.id;
            const currentUserName = userData.data.full_name || 'Unknown';

            setUserRole(role); setUserId(currentUserId); setUserName(currentUserName);
            setClients(clientsRes.data); setBanks(banksRes.data);

            let rawInvoices = invoicesRes.data;
            if (role !== 'admin' && role !== 'super_admin') rawInvoices = rawInvoices.filter(inv => inv.user_id === currentUserId);

            const processedInvoices = rawInvoices.map(invoice => {
                const items = invoice.items || [];
                const baseAmount = items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0), 0);
                const isSameState = invoice.place_of_supply?.includes('36-Telangana') || false;
                let sgst = 0, cgst = 0, igst = 0;
                if (isSameState) { sgst = baseAmount * TAX_RATES.SGST; cgst = baseAmount * TAX_RATES.CGST; }
                else { igst = baseAmount * TAX_RATES.IGST; }
                const totalAmount = baseAmount + sgst + cgst + igst;
                const tdsAmount = parseFloat(invoice.tds_amount) || 0;
                const netAmount = totalAmount - tdsAmount;
                const received = parseFloat(invoice.received) || 0;
                let paymentStatus = invoice.payment_status || 'unpaid';
                if (paymentStatus === 'partial' || paymentStatus === 'overdue') paymentStatus = 'unpaid';
                return {
                    ...invoice,
                    calculated_base_amount: baseAmount,
                    calculated_sgst: sgst,
                    calculated_cgst: cgst,
                    calculated_igst: igst,
                    calculated_total_amount: totalAmount,
                    calculated_net_amount: netAmount,
                    calculated_pending: netAmount - received,
                    calculated_payment_status: paymentStatus,
                    created_by_name: invoice.full_name || invoice.created_by_name || (invoice.user_id === currentUserId ? currentUserName : 'Unknown'),
                    remarks: invoice.remarks || null,
                    approval_status: invoice.approval_status || 'created'
                };
            });

            setInvoices(processedInvoices);
            setCurrentPage(1);
        } catch (error) {
            console.error('Failed to load data:', error);
            showNotification('error', 'Failed to load data from database');
            if (error.response?.status === 401) onLogout();
        } finally { setLoading(false); }
    }, [onLogout, showNotification]);

    const handleRequestESign = useCallback(async (invoiceId, event) => {
        event.stopPropagation();
        if (userRole !== 'admin') { showNotification('error', 'Only administrators can request eSign'); return; }
        setRequestingESignId(invoiceId);
        try {
            const token = localStorage.getItem('token');
            const response = await axios.post(`/api/invoices/${invoiceId}/request-esign`, {}, { headers: { Authorization: `Bearer ${token}` } });
            if (response.data.success) { await loadAllDataFromMySQL(); showNotification('success', 'eSign request sent to Super Admin successfully!'); }
        } catch (error) {
            showNotification('error', 'Failed to send eSign request: ' + (error.response?.data?.error || error.message));
        } finally { setRequestingESignId(null); }
    }, [userRole, loadAllDataFromMySQL, showNotification]);

    const handleFinalESign = useCallback(async (invoiceId, signatureData, signatureMode = 'draw') => {
        setIsSubmittingESign(true);
        try {
            const token = localStorage.getItem('token');
            if (signatureMode === 'cloud') {
                const response = await axios.post(`/api/invoices/${invoiceId}/esign`, {}, { headers: { Authorization: `Bearer ${token}` } });
                if (response.data.success) { await loadAllDataFromMySQL(); showNotification('success', 'Invoice digitally signed via CloudSigner!'); setShowESignModal(false); setESignInvoiceId(null); }
            } else {
                const response = await axios.post(`/api/invoices/${invoiceId}/final-esign`, { signature_data: signatureData, signed_at: new Date().toISOString() }, { headers: { Authorization: `Bearer ${token}` } });
                if (response.data.success) { await loadAllDataFromMySQL(); showNotification('success', 'Invoice final approved with eSignature!'); setShowESignModal(false); setESignInvoiceId(null); }
            }
        } catch (error) {
            showNotification('error', 'Failed to final approve invoice: ' + (error.response?.data?.error || error.message));
        } finally { setIsSubmittingESign(false); }
    }, [loadAllDataFromMySQL, showNotification]);

    const handleDownloadPDF = useCallback((invoiceId, event) => {
        event.stopPropagation();
        if (userRole !== 'admin' && userRole !== 'super_admin') { showNotification('error', 'Only administrators can download approved invoices'); return; }
        const invoice = invoices.find(inv => inv.id === invoiceId);
        if (!invoice) { showNotification('error', 'Invoice not found'); return; }
        setIsDownloadingPreviewPDF(true);
        setDownloadPreviewInvoice(buildInvoicePreviewData(invoice));
    }, [userRole, invoices, showNotification]);

    useEffect(() => {
        const downloadPreparedPreview = async () => {
            if (!downloadPreviewInvoice) return;
            const node = hiddenInvoicePreviewRef.current;
            if (!node) return;
            try {
                const originalOverflow = node.style.overflow;
                const originalHeight = node.style.height;
                node.style.overflow = 'visible'; node.style.height = 'auto';
                const canvas = await html2canvas(node, { scale: 3, useCORS: true, logging: false, backgroundColor: '#ffffff', allowTaint: false, foreignObjectRendering: false });
                node.style.overflow = originalOverflow; node.style.height = originalHeight;
                const imgWidth = 210;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;
                const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
                pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, imgWidth, imgHeight);
                pdf.save(`Invoice_${downloadPreviewInvoice.invoice_number || 'JA'}_${downloadPreviewInvoice.date || new Date().toISOString().split('T')[0]}.pdf`);
                showNotification('success', 'PDF downloaded successfully!');
            } catch (error) {
                showNotification('error', 'Failed to generate PDF: ' + (error.message || 'Unexpected error'));
            } finally { setDownloadPreviewInvoice(null); setIsDownloadingPreviewPDF(false); }
        };
        downloadPreparedPreview();
    }, [downloadPreviewInvoice, showNotification]);

    const handleApprovalAction = useCallback((invoice, action, event) => {
        event.stopPropagation();
        switch (action) {
            case 'request': handleRequestESign(invoice.id, event); break;
            case 'esign': setESignInvoiceId(invoice.id); setShowESignModal(true); break;
            case 'download': handleDownloadPDF(invoice.id, event); break;
            default: break;
        }
    }, [handleRequestESign, handleDownloadPDF]);

    const filteredInvoices = useMemo(() => {
        let filtered = [...invoices];
        if (searchTerm.trim()) {
            const s = searchTerm.toLowerCase().trim();
            filtered = filtered.filter(inv => {
                const fields = [inv.client_name, inv.invoice_number, inv.client_gst, inv.bank_name, inv.client_branch, inv.description, inv.remarks, inv.full_name, inv.created_by_name];
                return fields.some(f => f && f.toLowerCase().includes(s))
                    || (clients.find(c => c.id === inv.client_id)?.name || '').toLowerCase().includes(s)
                    || getDisplayBankName(inv).toLowerCase().includes(s);
            });
        }
        if (startDate || endDate) {
            const startObj = startDate ? createLocalDate(startDate) : null;
            const endObj = endDate ? createLocalDate(endDate) : null;
            if (endObj) endObj.setHours(23, 59, 59, 999);
            filtered = filtered.filter(inv => {
                const invDate = createLocalDate(inv.date);
                if (!invDate) return false;
                if (startObj && invDate < startObj) return false;
                if (endObj && invDate > endObj) return false;
                return true;
            });
        }
        if (selectedStatusFilter !== 'all') filtered = filtered.filter(inv => inv.payment_status === selectedStatusFilter);
        if (selectedApprovalFilter !== 'all') filtered = filtered.filter(inv => inv.approval_status === selectedApprovalFilter);
        filtered.sort((a, b) => {
            const dA = createLocalDate(a.date), dB = createLocalDate(b.date);
            return (dA && dB) ? dB - dA : b.id - a.id;
        });
        return filtered;
    }, [invoices, searchTerm, selectedStatusFilter, selectedApprovalFilter, startDate, endDate, clients, getDisplayBankName]);

    const exportToExcelJS = useCallback(async () => {
        if (!filteredInvoices.length) { showNotification('error', 'No invoices to export'); return; }
        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Invoices', { properties: { tabColor: { argb: '4F46E5' } }, pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true } });
            worksheet.columns = [
                { header: 'Sl.No.', key: 'slNo', width: 8 }, { header: 'Date', key: 'date', width: 15 },
                { header: 'INVOICE No.', key: 'invoiceNo', width: 16 }, { header: 'BANK NAME', key: 'bankName', width: 20 },
                { header: 'CUSTOMER NAME', key: 'customerName', width: 30 }, { header: 'BRANCH', key: 'branch', width: 15 },
                { header: 'GSTIN No.', key: 'gstin', width: 18 }, { header: 'Base Amount', key: 'baseAmount', width: 14 },
                { header: 'SGST', key: 'sgst', width: 10 }, { header: 'CGST', key: 'cgst', width: 10 },
                { header: 'IGST', key: 'igst', width: 10 }, { header: 'Total Amount', key: 'totalAmount', width: 14 },
                { header: 'Net Amount after TDS', key: 'netAmount', width: 18 }, { header: 'Payment Status', key: 'paymentStatus', width: 16 },
                { header: 'Approval Status', key: 'approvalStatus', width: 16 }, { header: 'Remarks', key: 'remarks', width: 35 }
            ];
            worksheet.mergeCells('A1:P1');
            const titleCell = worksheet.getCell('A1');
            titleCell.value = 'JAYARAMA ASSOCIATES';
            titleCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF1A3A5C' } };
            titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
            titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBCD5EC' } };
            titleCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

            const headers = ['Sl.No.','Date','INVOICE No.','BANK NAME','CUSTOMER NAME','BRANCH','GSTIN No.','Base Amount','SGST','CGST','IGST','Total Amount','Net Amount after TDS','Payment Status','Approval Status','Remarks'];
            const headerRow = worksheet.getRow(2);
            headers.forEach((h, i) => {
                const cell = headerRow.getCell(i + 1);
                cell.value = h;
                cell.font = { bold: true, size: 11, name: 'Calibri', color: { argb: 'FF000000' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBCD5EC' } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });
            headerRow.height = 25;

            const dataRows = filteredInvoices.map((invoice, index) => ({
                slNo: index + 1, date: formatDateForDisplay(invoice.date),
                invoiceNo: invoice.invoice_number || '—', bankName: getDisplayBankName(invoice),
                customerName: invoice.description || invoice.client_name || '—',
                branch: invoice.client_branch || getClientBranch(invoice.client_id) || '—',
                gstin: invoice.client_gst || '—',
                baseAmount: invoice.calculated_base_amount || 0, sgst: invoice.calculated_sgst || 0,
                cgst: invoice.calculated_cgst || 0, igst: invoice.calculated_igst || 0,
                totalAmount: invoice.calculated_total_amount || 0,
                netAmount: invoice.calculated_net_amount || invoice.calculated_total_amount || 0,
                paymentStatus: invoice.payment_status === 'paid' ? 'PAID' : invoice.payment_status === 'cancelled' ? 'CANCELLED' : 'UNPAID',
                approvalStatus: invoice.approval_status === 'created' ? 'CREATED' : invoice.approval_status === 'requested' ? 'REQUESTED' : invoice.approval_status === 'final_approved' ? 'FINAL APPROVED' : '—',
                remarks: extractReasonOnly(invoice.remarks)
            }));

            dataRows.forEach((rowData, rowIndex) => {
                const row = worksheet.getRow(rowIndex + 3);
                Object.keys(rowData).forEach((key, colIndex) => {
                    const cell = row.getCell(colIndex + 1);
                    let value = rowData[key];
                    const amountCols = ['baseAmount','sgst','cgst','igst','totalAmount','netAmount'];
                    if (amountCols.includes(key) && typeof value === 'number') { value = formatIndianCurrencyForExcel(value); cell.numFmt = '#,##0.00'; }
                    cell.value = value;
                    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    if (key === 'paymentStatus') {
                        cell.font = { color: { argb: value === 'PAID' ? 'FF10B981' : 'FFDC2626' }, bold: true, size: 11, name: 'Calibri' };
                    } else if (key === 'approvalStatus') {
                        cell.font = { color: { argb: value === 'FINAL APPROVED' ? 'FF10B981' : value === 'REQUESTED' ? 'FF3B82F6' : 'FF000000' }, bold: value !== '—', size: 11, name: 'Calibri' };
                    } else {
                        cell.font = { name: 'Calibri', size: 11 };
                    }
                });
                row.height = 20;
            });

            worksheet.columns.forEach((col, i) => {
                let max = headers[i] ? headers[i].length : 0;
                dataRows.forEach(r => { const v = Object.values(r)[i]; if (v && String(v).length > max) max = String(v).length; });
                col.width = Math.min(Math.max(max + 2, 8), 50);
            });
            worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

            const buffer = await workbook.xlsx.writeBuffer();
            saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Jayarama_Invoices_${new Date().toISOString().split('T')[0]}.xlsx`);
            showNotification('success', `✓ Successfully exported ${filteredInvoices.length} invoices to Excel`);
        } catch (error) {
            console.error('Excel export error:', error);
            showNotification('error', 'Failed to export invoices to Excel');
        }
    }, [filteredInvoices, getDisplayBankName, getClientBranch, showNotification, formatDateForDisplay]);

    const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentInvoices = filteredInvoices.slice(indexOfFirstItem, indexOfLastItem);

    const handlePageChange = (n) => { setCurrentPage(n); document.querySelector('.invoice-table-container')?.scrollIntoView({ behavior: 'smooth' }); };

    const clearDateFilter = useCallback(() => { setStartDate(''); setEndDate(''); setCurrentPage(1); showNotification('success', 'Date filter cleared'); }, [showNotification]);
    const clearSearchFilter = useCallback(() => { setSearchTerm(''); setCurrentPage(1); showNotification('success', 'Search filter cleared'); }, [showNotification]);
    const clearAllFilters = useCallback(() => { setSearchTerm(''); setSelectedStatusFilter('all'); setSelectedApprovalFilter('all'); setStartDate(''); setEndDate(''); setCurrentPage(1); showNotification('success', 'All filters cleared'); }, [showNotification]);

    const handleUpdatePaymentStatus = useCallback(async (invoiceId, newStatus, event) => {
        event.stopPropagation();
        if (userRole !== 'admin' && userRole !== 'super_admin') { showNotification('error', 'Only administrators can change payment status'); return; }
        if (newStatus === 'partial' || newStatus === 'overdue') { showNotification('error', 'Partial and Overdue status are not allowed.'); return; }
        if (newStatus === 'cancelled') { setCancelInvoiceId(invoiceId); setCancelReason(''); setShowCancelModal(true); return; }
        try {
            const invoice = invoices.find(inv => inv.id === invoiceId);
            if (!invoice) { showNotification('error', 'Invoice not found'); return; }
            const token = localStorage.getItem('token');
            const response = await axios.post('/api/invoices', { ...invoice, payment_status: newStatus, items: invoice.items || [], currency: invoice.currency || 'INR' }, { headers: { Authorization: `Bearer ${token}` } });
            if (response?.data?.success) { await loadAllDataFromMySQL(); showNotification('success', `Payment status updated to ${newStatus.toUpperCase()}`); }
            else showNotification('error', 'Failed to update payment status');
        } catch (error) {
            showNotification('error', 'Failed to update payment status: ' + (error.response?.data?.error || error.message));
        }
    }, [userRole, invoices, loadAllDataFromMySQL, showNotification]);

    const handleConfirmCancel = useCallback(async () => {
        if (!cancelReason.trim()) { showNotification('error', 'Please provide a reason for cancellation'); return; }
        setIsSubmittingCancel(true);
        try {
            const invoice = invoices.find(inv => inv.id === cancelInvoiceId);
            if (!invoice) { showNotification('error', 'Invoice not found'); return; }
            const timestamp = new Date().toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
            const cancellationNote = `\n🔴 [CANCELLED ON ${timestamp}] \n   Reason: ${cancelReason}\n   Cancelled by: ${userName}\n   ${'-'.repeat(50)}\n`;
            const token = localStorage.getItem('token');
            const response = await axios.post('/api/invoices', { ...invoice, payment_status: 'cancelled', remarks: (invoice.remarks || '') + cancellationNote, items: invoice.items || [], currency: invoice.currency || 'INR' }, { headers: { Authorization: `Bearer ${token}` } });
            if (response?.data?.success) {
                await loadAllDataFromMySQL();
                showNotification('success', 'Invoice cancelled successfully! Reason saved to database.');
                setShowCancelModal(false); setCancelInvoiceId(null); setCancelReason('');
            } else showNotification('error', 'Failed to cancel invoice in database');
        } catch (error) {
            showNotification('error', 'Failed to cancel invoice: ' + (error.response?.data?.error || error.message));
        } finally { setIsSubmittingCancel(false); }
    }, [cancelInvoiceId, cancelReason, userName, invoices, loadAllDataFromMySQL, showNotification]);

    const handleCancelModalClose = useCallback(() => { setShowCancelModal(false); setCancelInvoiceId(null); setCancelReason(''); setIsSubmittingCancel(false); }, []);

    const handleViewRemarks = useCallback((invoice, event) => {
        event.stopPropagation();
        if (invoice.payment_status === 'cancelled') {
            setCancellationDetails(extractCancellationDetails(invoice.remarks));
            setIsCancelledInvoice(true);
        } else {
            let cleanRemarks = invoice.remarks || 'No remarks available';
            const m = cleanRemarks.match(/Reason:\s*(.+?)(?:\n|$)/);
            cleanRemarks = m ? m[1].trim().replace(/[-*]+$/, '').trim() : cleanRemarks.replace(/🔴.*?CANCELLED ON.*?\n/g, '').replace(/Cancelled by:.*?\n/g, '').replace(/-{10,}/g, '').replace(/\n/g, ' ').trim();
            setSelectedRemarks(cleanRemarks || 'No remarks available');
            setIsCancelledInvoice(false);
            setCancellationDetails(null);
        }
        setSelectedInvoiceNumber(invoice.invoice_number);
        setShowRemarksModal(true);
    }, []);

    const handleDeleteInvoice = useCallback(async (id, event) => {
        event.stopPropagation();
        if (userRole !== 'admin') { showNotification('error', 'Only administrators can delete invoices'); return; }
        const invoice = invoices.find(inv => inv.id === id);
        if (invoice && invoice.approval_status !== 'created') { showNotification('error', 'Cannot delete invoice after eSign request has been sent'); return; }
        if (!window.confirm('⚠️ ADMIN ACTION: Are you sure you want to DELETE this invoice? This action cannot be undone!')) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`/api/invoices/${id}`, { headers: { Authorization: `Bearer ${token}` } });
            await loadAllDataFromMySQL();
            showNotification('success', 'Invoice deleted successfully from database');
        } catch (error) {
            showNotification('error', error.response?.status === 403 ? 'Access denied. Admin privileges required.' : 'Failed to delete invoice');
        }
    }, [userRole, invoices, loadAllDataFromMySQL, showNotification]);

    useEffect(() => { loadAllDataFromMySQL(); }, [loadAllDataFromMySQL]);

    const stats = useMemo(() => ({
        totalInvoices: filteredInvoices.length,
        totalBaseAmount: filteredInvoices.reduce((s, i) => s + (i.calculated_base_amount || 0), 0),
        totalWithGST: filteredInvoices.reduce((s, i) => s + (i.calculated_total_amount || 0), 0),
        totalPaid: filteredInvoices.reduce((s, i) => s + (i.received || 0), 0),
        totalPending: filteredInvoices.reduce((s, i) => s + (i.calculated_pending || 0), 0),
        paidInvoices: filteredInvoices.filter(i => i.payment_status === 'paid').length,
        unpaidInvoices: filteredInvoices.filter(i => i.payment_status === 'unpaid').length,
        cancelledInvoices: filteredInvoices.filter(i => i.payment_status === 'cancelled').length,
        requestedInvoices: filteredInvoices.filter(i => i.approval_status === 'requested').length,
        approvedInvoices: filteredInvoices.filter(i => i.approval_status === 'final_approved').length
    }), [filteredInvoices]);

    const getStatusBadge = useCallback((status) => ({
        paid: { bg: '#10b981', text: 'PAID', icon: '✅', lightBg: '#ecfdf5' },
        unpaid: { bg: '#ef4444', text: 'UNPAID', icon: '❌', lightBg: '#fef2f2' },
        cancelled: { bg: '#dc2626', text: 'CANCELLED', icon: '🚫', lightBg: '#fef2f2' }
    }[status] || { bg: '#6b7280', text: status.toUpperCase(), icon: '📋', lightBg: '#f9fafb' }), []);

    const getRowBgColor = useCallback((paymentStatus, isCancelled, approvalStatus) => {
        if (isCancelled) return '#fef2f2';
        if (approvalStatus === 'requested') return '#eff6ff';
        if (approvalStatus === 'final_approved') return '#f0fdf4';
        return paymentStatus === 'paid' ? '#f0fdf4' : '#ffffff';
    }, []);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f1f5f9' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: '50px', height: '50px', border: '4px solid #e2e8f0', borderTopColor: '#4f46e5', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }}></div>
                    <p style={{ color: '#475569' }}>Loading dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9' }}>
            <Sidebar user={user} onLogout={onLogout} onCreateNew={onCreateNew} userRole={userRole} />

            <main style={{ flex: 1, padding: 'clamp(16px, 4vw, 32px)', overflowX: 'auto' }}>
                <style>{`
                    /* ── Animated action buttons ── */
                    @keyframes pulseRing {
                        0%   { box-shadow: 0 0 0 0   rgba(79,70,229,.45), 0 3px 10px rgba(79,70,229,.25); }
                        60%  { box-shadow: 0 0 0 7px rgba(79,70,229,0),   0 6px 16px rgba(79,70,229,.4); }
                        100% { box-shadow: 0 0 0 0   rgba(79,70,229,0),   0 3px 10px rgba(79,70,229,.25); }
                    }
                    @keyframes greenRing {
                        0%   { box-shadow: 0 0 0 0   rgba(16,185,129,.45), 0 3px 10px rgba(16,185,129,.25); }
                        60%  { box-shadow: 0 0 0 7px rgba(16,185,129,0),   0 6px 16px rgba(16,185,129,.4); }
                        100% { box-shadow: 0 0 0 0   rgba(16,185,129,0),   0 3px 10px rgba(16,185,129,.25); }
                    }
                    @keyframes purpleRing {
                        0%   { box-shadow: 0 0 0 0   rgba(139,92,246,.45), 0 3px 10px rgba(139,92,246,.25); }
                        60%  { box-shadow: 0 0 0 7px rgba(139,92,246,0),   0 6px 16px rgba(139,92,246,.4); }
                        100% { box-shadow: 0 0 0 0   rgba(139,92,246,0),   0 3px 10px rgba(139,92,246,.25); }
                    }
                    @keyframes breathe  { 0%,100% { transform: scale(1); }    50% { transform: scale(1.04); } }
                    @keyframes shimmer  { 0% { left: -100%; } 100% { left: 160%; } }
                    @keyframes iconBounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
                    @keyframes spinIcon { to { transform: rotate(360deg); } }
                    @keyframes slideIn  { from { opacity:0; transform:translateY(-20px); } to { opacity:1; transform:translateY(0); } }
                    @keyframes spin     { to { transform: rotate(360deg); } }

                    .ab {
                        position: relative;
                        overflow: hidden;
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                        padding: 5px 12px;
                        border: none;
                        border-radius: 999px;
                        color: #fff;
                        font-size: 0.65rem;
                        font-weight: 700;
                        cursor: pointer;
                        white-space: nowrap;
                        min-width: 108px;
                        letter-spacing: .01em;
                        transition: transform .12s, filter .12s;
                    }
                    .ab::after {
                        content: '';
                        position: absolute;
                        top: 0; left: -100%;
                        width: 60%; height: 100%;
                        background: linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent);
                        animation: shimmer 2.2s linear infinite;
                        pointer-events: none;
                    }
                    .ab:hover  { transform: scale(1.06); filter: brightness(1.08); }
                    .ab:active { transform: scale(.97); }
                    .ab-icon { display: inline-flex; align-items: center; animation: iconBounce 1.7s ease-in-out infinite; }
                    .ab-request  { animation: pulseRing  1.9s ease-in-out infinite, breathe 1.9s ease-in-out infinite; }
                    .ab-esign    { animation: purpleRing 2s   ease-in-out infinite, breathe 2.1s ease-in-out infinite; }
                    .ab-download { animation: greenRing  2s   ease-in-out infinite, breathe 2.3s ease-in-out infinite; }
                    .ab-disabled { animation: none; opacity: .6; cursor: not-allowed; }
                    .ab-disabled .ab-icon { animation: none; }

                    .dashboard-table-row { transition: all 0.2s ease !important; }
                    .dashboard-table-row:hover { filter: brightness(0.97); }

                    @media (max-width: 768px) {
                        .invoice-table-container { border-radius: 16px; }
                        th, td { padding: 10px 8px !important; font-size: 0.7rem !important; }
                    }
                    @media (max-width: 640px) { main { padding: 16px !important; } }
                `}</style>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px', marginBottom: 'clamp(20px, 4vw, 28px)' }}>
                    <div>
                        <h1 style={{ fontSize: 'clamp(1.4rem, 5vw, 1.8rem)', fontWeight: '700', background: 'linear-gradient(135deg, #0f172a, #1e293b)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', marginBottom: '4px' }}>JAYARAMA ASSOCIATES</h1>
                        <p style={{ color: '#64748b', fontSize: 'clamp(0.75rem, 2vw, 0.875rem)' }}>Invoice Management System with eSign Workflow</p>
                        <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {userRole === 'admin' && <span style={{ background: 'linear-gradient(95deg, #f43f5e, #e11d48)', color: 'white', padding: '4px 14px', borderRadius: '40px', fontSize: '0.7rem', fontWeight: '700' }}>👑 Administrator Access</span>}
                            {userRole === 'super_admin' && <span style={{ background: 'linear-gradient(95deg, #8b5cf6, #7c3aed)', color: 'white', padding: '4px 14px', borderRadius: '40px', fontSize: '0.7rem', fontWeight: '700' }}>⭐ Super Admin Access</span>}
                            {userRole === 'user' && <span style={{ background: '#4f46e5', color: 'white', padding: '4px 14px', borderRadius: '40px', fontSize: '0.7rem', fontWeight: '700' }}>👤 User Access</span>}
                        </div>
                    </div>
                    <button onClick={onCreateNew} style={{ background: '#4f46e5', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '40px', fontWeight: '600', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(79,70,229,0.25)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                        New Invoice
                    </button>
                </div>

                {(userRole === 'admin' || userRole === 'super_admin') && <StatsCards stats={stats} userRole={userRole} />}

                <FilterBar searchTerm={searchTerm} setSearchTerm={setSearchTerm} selectedStatusFilter={selectedStatusFilter} setSelectedStatusFilter={setSelectedStatusFilter} selectedApprovalFilter={selectedApprovalFilter} setSelectedApprovalFilter={setSelectedApprovalFilter} startDate={startDate} setStartDate={setStartDate} endDate={endDate} setEndDate={setEndDate} userRole={userRole} clearSearchFilter={clearSearchFilter} clearDateFilter={clearDateFilter} clearAllFilters={clearAllFilters} />

                {/* Table */}
                <div className="invoice-table-container" style={{ background: 'white', borderRadius: '24px', boxShadow: '0 8px 24px rgba(0,0,0,0.04)', overflowX: 'auto', border: '1px solid #edf2f7' }}>
                    <table style={{ width: '100%', minWidth: '1600px', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                {[
                                    ['Date', '9%'], ['Invoice No.', '9%'], ['Bank Name', '11%'], ['Customer Name', '13%'],
                                    ...(userRole !== 'user' ? [['GSTIN No.', '10%'], ['Base Amount', '10%']] : []),
                                    ['Total Amount', '9%'], ['Payment', '9%'],
                                    ...(userRole !== 'user' ? [['Approval', '9%'], ['Action', '11%']] : []),
                                    ['Remarks', '11%'],
                                    ...(userRole !== 'user' ? [['Created By', '10%']] : []),
                                    ...(userRole === 'admin' ? [['Actions', '7%']] : [])
                                ].map(([label, width]) => (
                                    <th key={label} style={{ padding: '16px 12px', textAlign: 'center', fontSize: '0.75rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase', width }}>{label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {currentInvoices.length === 0 ? (
                                <tr>
                                    <td colSpan={userRole === 'admin' ? 13 : userRole === 'super_admin' ? 12 : 7} style={{ padding: '60px', textAlign: 'center' }}>
                                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" style={{ margin: '0 auto 16px', display: 'block' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                                        <p style={{ color: '#64748b' }}>{searchTerm ? 'No invoices match your search.' : (startDate || endDate) ? 'No invoices in this date range.' : 'No invoices found.'}</p>
                                        {searchTerm && <button onClick={clearSearchFilter} style={{ marginTop: '16px', background: '#4f46e5', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '30px', cursor: 'pointer' }}>Clear Search</button>}
                                    </td>
                                </tr>
                            ) : currentInvoices.map(invoice => {
                                const paymentStatus = invoice.payment_status || 'unpaid';
                                const approvalStatus = invoice.approval_status || 'created';
                                const isCancelled = paymentStatus === 'cancelled';
                                const statusBadge = getStatusBadge(paymentStatus);
                                const approvalBadge = getApprovalStatusBadge(approvalStatus);
                                const actionButton = getApprovalActionButton(invoice);
                                const hasRemarks = invoice.remarks?.trim().length > 0;
                                const isRequestingThis = requestingESignId === invoice.id;
                                const isDownloadingThis = isDownloadingPreviewPDF;

                                return (
                                    <tr key={invoice.id} onClick={() => onEditInvoice(invoice)} style={{ cursor: 'pointer', backgroundColor: getRowBgColor(paymentStatus, isCancelled, approvalStatus), color: isCancelled ? '#991b1b' : '#1e293b', borderBottom: '1px solid #f1f5f9' }} className="dashboard-table-row">
                                        <td style={{ padding: '14px 12px', textAlign: 'center', fontSize: '0.8rem', fontWeight: '500' }}>{formatDateForDisplay(invoice.date)}</td>
                                        <td style={{ padding: '14px 12px', textAlign: 'center', fontWeight: '600', fontFamily: 'monospace', fontSize: '0.8rem' }}>{invoice.invoice_number || '—'}</td>
                                        <td style={{ padding: '14px 12px', textAlign: 'center', fontSize: '0.75rem' }}><strong>{truncateText(getDisplayBankName(invoice), 25)}</strong></td>
                                        <td style={{ padding: '14px 12px', textAlign: 'center', fontWeight: '500', fontSize: '0.8rem' }}>{truncateText(invoice.description || invoice.client_name || '—', 30)}</td>

                                        {(userRole === 'admin' || userRole === 'super_admin') && (
                                            <td style={{ padding: '14px 12px', textAlign: 'center', fontSize: '0.75rem' }}>{invoice.client_gst || '—'}</td>
                                        )}
                                        {(userRole === 'admin' || userRole === 'super_admin') && (
                                            <td style={{ padding: '14px 12px', textAlign: 'center', fontWeight: '700' }}>{formatRupees(invoice.calculated_base_amount || 0)}</td>
                                        )}

                                        <td style={{ padding: '14px 12px', textAlign: 'center', fontWeight: '700' }}>{formatRupees(invoice.calculated_total_amount || 0)}</td>

                                        <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                                            {(userRole === 'admin' || userRole === 'super_admin') ? (
                                                <select value={paymentStatus} onChange={(e) => handleUpdatePaymentStatus(invoice.id, e.target.value, e)} onClick={(e) => e.stopPropagation()} style={{ padding: '5px 10px', borderRadius: '30px', border: `1px solid ${statusBadge.bg}`, fontSize: '0.7rem', fontWeight: '600', background: 'white', cursor: 'pointer' }} aria-label="Update payment status">
                                                    <option value="paid">✅ Paid</option>
                                                    <option value="unpaid">❌ Unpaid</option>
                                                    <option value="cancelled">🚫 Cancelled</option>
                                                </select>
                                            ) : (
                                                <span style={{ background: statusBadge.bg, color: 'white', padding: '4px 12px', borderRadius: '30px', fontSize: '0.7rem', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>{statusBadge.icon} {statusBadge.text}</span>
                                            )}
                                        </td>

                                        {(userRole === 'admin' || userRole === 'super_admin') && (
                                            <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                                                <span style={{ background: approvalBadge.lightBg, color: approvalBadge.bg, padding: '4px 10px', borderRadius: '30px', fontSize: '0.7rem', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                    {approvalBadge.icon} {approvalBadge.text}
                                                </span>
                                            </td>
                                        )}

                                        {(userRole === 'admin' || userRole === 'super_admin') && (
                                            <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                                                {actionButton && (
                                                    <ActionButton
                                                        action={actionButton.action}
                                                        text={actionButton.text}
                                                        color={actionButton.color}
                                                        disabled={actionButton.disabled}
                                                        loading={
                                                            (actionButton.action === 'request' && isRequestingThis) ||
                                                            (actionButton.action === 'download' && isDownloadingThis)
                                                        }
                                                        onClick={(e) => handleApprovalAction(invoice, actionButton.action, e)}
                                                    />
                                                )}
                                            </td>
                                        )}

                                        <td style={{ padding: '14px 12px', textAlign: 'center', fontSize: '0.75rem' }}>
                                            {hasRemarks ? (
                                                <button onClick={(e) => handleViewRemarks(invoice, e)} style={{ background: isCancelled ? '#fee2e2' : '#f1f5f9', border: 'none', padding: '4px 10px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: '600', cursor: 'pointer', color: isCancelled ? '#dc2626' : '#4f46e5', display: 'inline-flex', alignItems: 'center', gap: '4px' }} aria-label="View remarks">
                                                    {isCancelled ? '🚫 View Cancellation' : '📝 View Remarks'}
                                                </button>
                                            ) : (
                                                <span style={{ color: '#94a3b8', fontSize: '0.7rem', fontStyle: 'italic' }}>No remarks</span>
                                            )}
                                        </td>

                                        {(userRole === 'admin' || userRole === 'super_admin') && (
                                            <td style={{ padding: '14px 12px', textAlign: 'center', fontSize: '0.8rem', fontWeight: '600', color: '#4f46e5' }}>
                                                {truncateText(invoice.full_name || invoice.created_by_name || 'Unknown', 20)}
                                            </td>
                                        )}

                                        {userRole === 'admin' && (
                                            <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                                                {approvalStatus === 'created' ? (
                                                    <button onClick={(e) => handleDeleteInvoice(invoice.id, e)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '5px 14px', borderRadius: '30px', fontSize: '0.7rem', fontWeight: '600', cursor: 'pointer' }} aria-label="Delete invoice">Delete</button>
                                                ) : (
                                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>—</span>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {filteredInvoices.length > 0 && (
                    <Pagination currentPage={currentPage} totalPages={totalPages} itemsPerPage={itemsPerPage} setItemsPerPage={setItemsPerPage} onPageChange={handlePageChange} totalItems={filteredInvoices.length} startIndex={indexOfFirstItem} endIndex={indexOfLastItem} />
                )}

                {/* Footer */}
                <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', padding: '16px 0' }}>
                    <div style={{ fontSize: 'clamp(0.7rem, 2vw, 0.8rem)', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                        <span><strong>Total Records:</strong> <span style={{ fontWeight: '800', color: '#1e293b' }}>{filteredInvoices.length}</span>
                            {filteredInvoices.length !== invoices.length && <span style={{ fontSize: '0.7rem', color: '#64748b' }}> (filtered from {invoices.length})</span>}
                        </span>
                        {(userRole === 'admin' || userRole === 'super_admin') && invoices.length > 0 && (
                            <span style={{ fontSize: '0.7rem', color: '#e11d48', background: '#fff1f2', padding: '2px 8px', borderRadius: '20px' }}>👑 {userRole === 'admin' ? 'Admin' : 'Super Admin'} view: All {invoices.length} records</span>
                        )}
                        {(startDate || endDate) && (
                            <span style={{ fontSize: '0.7rem', color: '#4f46e5', background: '#eef2ff', padding: '2px 8px', borderRadius: '20px' }}>
                                📅 {startDate && formatDateForDisplay(startDate)}{startDate && endDate && ' to '}{endDate && formatDateForDisplay(endDate)}
                            </span>
                        )}
                        {searchTerm && <span style={{ fontSize: '0.7rem', color: '#10b981', background: '#ecfdf5', padding: '2px 8px', borderRadius: '20px' }}>🔍 "{searchTerm}"</span>}
                    </div>
                    <button onClick={exportToExcelJS} style={{ background: '#10b981', color: 'white', border: 'none', padding: '8px 24px', borderRadius: '40px', fontWeight: '600', cursor: 'pointer', fontSize: 'clamp(0.7rem, 2vw, 0.8rem)' }}>
                        📎 Export to Excel (.xlsx)
                    </button>
                </div>
            </main>

            {/* Modals */}
            <CancelModal isOpen={showCancelModal} onClose={handleCancelModalClose} onConfirm={handleConfirmCancel} isSubmitting={isSubmittingCancel} cancelReason={cancelReason} setCancelReason={setCancelReason} />
            <RemarksModal isOpen={showRemarksModal} onClose={() => setShowRemarksModal(false)} invoiceNumber={selectedInvoiceNumber} isCancelled={isCancelledInvoice} cancellationDetails={cancellationDetails} remarks={selectedRemarks} />
            <ESignModal isOpen={showESignModal} onClose={() => { setShowESignModal(false); setESignInvoiceId(null); }} onConfirm={(sig, mode) => handleFinalESign(eSignInvoiceId, sig, mode)} invoiceNumber={invoices.find(inv => inv.id === eSignInvoiceId)?.invoice_number} loading={isSubmittingESign} />

            {downloadPreviewInvoice && (
                <div style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '210mm', opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
                    <InvoicePreview ref={hiddenInvoicePreviewRef} formData={downloadPreviewInvoice} hideActions={true} />
                </div>
            )}

            {notification && <Notification type={notification.type} message={notification.message} />}
        </div>
    );
};

export default Dashboard;