import React, { useState, useEffect } from 'react';
import axios from 'axios';
import LoadingScreen from './LoadingScreen';

const PDFPreviewModal = ({ isOpen, onClose, invoice, userRole, showNotification, generateSignedPDF, generateSignedPDFDataUrl }) => {
  const [pdfDataUrl, setPdfDataUrl] = useState(null);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (isOpen && invoice) {
      generatePreviewPDF();
    }
    return () => {
      if (pdfDataUrl && pdfDataUrl.startsWith('blob:')) {
        URL.revokeObjectURL(pdfDataUrl);
      }
    };
  }, [isOpen, invoice, retryCount]);

  const generatePreviewPDF = async () => {
    if (!invoice) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      
      // Fetch the full merged signed PDF directly from backend
      const response = await axios.get(`/api/invoices/${invoice.id}/open-signed-pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      if (response.data) {
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        setPdfBlob(blob);
        setPdfDataUrl(blobUrl);
      } else {
        throw new Error('No PDF data received');
      }
    } catch (err) {
      console.warn('Backend signed PDF fetch failed, trying fallback:', err);
      try {
        let invoiceData = { ...invoice };
        let rawItems = invoiceData.items;
        if (typeof rawItems === 'string') {
          try { rawItems = JSON.parse(rawItems); } catch(e) { rawItems = []; }
        }
        const items = Array.isArray(rawItems) ? rawItems : [];
        const same = invoiceData.place_of_supply ? invoiceData.place_of_supply.includes('36-Telangana') : true;

        const dbBase = parseFloat(invoiceData.base_amount || invoiceData.calculated_base_amount || invoiceData.amount || 0);
        const dbSgst = parseFloat(invoiceData.sgst || invoiceData.calculated_sgst || 0);
        const dbCgst = parseFloat(invoiceData.cgst || invoiceData.calculated_cgst || 0);
        const dbIgst = parseFloat(invoiceData.igst || invoiceData.calculated_igst || 0);
        const dbTotal = parseFloat(invoiceData.total_amount || invoiceData.calculated_total_amount || 0);
        const effectiveBase = dbBase > 0 ? dbBase : (dbTotal > 0 ? (dbSgst || dbCgst || dbIgst ? dbTotal - (dbSgst + dbCgst + dbIgst) : dbTotal / 1.18) : 0);

        let sanitizedItems = items;
        if (sanitizedItems.length > 0) {
          sanitizedItems = sanitizedItems.map(item => {
            const qty = +item.quantity || 1;
            let pr = +item.price;
            if (isNaN(pr) || pr <= 0) {
              pr = effectiveBase > 0 ? effectiveBase / qty : 0;
            }
            return { ...item, quantity: qty, price: pr };
          });
        }

        let base = 0;
        if (sanitizedItems.length > 0) {
          base = sanitizedItems.reduce((s, i) => s + ((+i.quantity || 0) * (+i.price || 0)), 0);
          if (base === 0 && effectiveBase > 0) base = effectiveBase;
        } else {
          base = effectiveBase;
        }

        let sgst = dbSgst, cgst = dbCgst, igst = dbIgst, total = dbTotal;
        if (total === 0 || (sgst === 0 && cgst === 0 && igst === 0)) {
          sgst = same ? base * 0.09 : 0;
          cgst = same ? base * 0.09 : 0;
          igst = same ? 0 : base * 0.18;
          total = base + sgst + cgst + igst;
        }

        const tds = +invoiceData.tds_amount || 0;
        const net = total - tds;
        const received = +invoiceData.received || 0;
        
        invoiceData = {
          ...invoiceData,
          items: sanitizedItems,
          calculated_base_amount: base,
          calculated_sgst: sgst,
          calculated_cgst: cgst,
          calculated_igst: igst,
          calculated_total_amount: total,
          calculated_net_amount: net,
          calculated_pending: net - received
        };

        const dataUrl = await generateSignedPDFDataUrl(invoiceData, 'completed', {
          timestamp: invoice.signed_at || new Date().toISOString()
        });
        setPdfDataUrl(dataUrl);
      } catch (fallbackErr) {
        console.error('Preview error:', fallbackErr);
        setError('Failed to generate PDF preview');
        if (showNotification) showNotification('error', 'Failed to generate PDF preview');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!invoice) return;
    
    try {
      if (showNotification) {
        showNotification('info', 'Downloading complete signed PDF...');
      }
      const token = localStorage.getItem('token');

      const res = await axios.get(`/api/invoices/${invoice.id}/download-signed-pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      const blob = new Blob([res.data], { type: 'application/pdf' });
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      const safeNum = (invoice.invoice_number || `INV-${invoice.id}`).replace(/[/\\?%*:|"<>]/g, '-');
      link.setAttribute('download', `${safeNum}-SIGNED.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      if (showNotification) {
        showNotification('success', 'Signed PDF downloaded successfully!');
      }
    } catch (err) {
      console.error('Download error:', err);
      if (pdfBlob) {
        const blobUrl = window.URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = blobUrl;
        const safeNum = (invoice.invoice_number || `INV-${invoice.id}`).replace(/[/\\?%*:|"<>]/g, '-');
        link.setAttribute('download', `${safeNum}-SIGNED.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else if (showNotification) {
        showNotification('error', 'Failed to download PDF');
      }
    }
  };

  const handleOpenInNewTab = () => {
    if (pdfDataUrl) {
      window.open(pdfDataUrl, '_blank');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="ja-overlay" onClick={onClose}>
      <div className="ja-modal ja-modal-pdf" onClick={e => e.stopPropagation()} style={{ maxWidth: 850, width: '90%' }}>
        <div className="ja-modal-header" style={{ background: '#0f172a', color: '#fff', padding: '16px 20px' }}>
          <div>
            <div className="ja-modal-title" style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 600 }}>📄 PDF Preview - Invoice #{invoice?.invoice_number}</div>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 3 }}>
              {invoice?.approval_status === 'final_approved' ? '✓ Digitally Signed Multi-Page PDF Bundle' : 'Preview Mode'}
            </div>
          </div>
          <button className="ja-modal-close" onClick={onClose} style={{ color: '#94a3b8' }}>×</button>
        </div>

        <div style={{ 
          maxHeight: 'calc(85vh - 120px)', 
          overflow: 'auto',
          background: '#f8fafc',
          borderRadius: '8px',
          padding: '10px'
        }}>
          {isLoading ? (
            <LoadingScreen message="Loading PDF preview..." />
          ) : error ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '60px 20px',
              color: '#dc2626'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
              <div>{error}</div>
              <button 
                onClick={() => setRetryCount(prev => prev + 1)}
                style={{
                  marginTop: '20px',
                  padding: '8px 20px',
                  background: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Try Again
              </button>
            </div>
          ) : pdfDataUrl ? (
            <iframe
              src={pdfDataUrl}
              style={{
                width: '100%',
                height: '620px',
                border: 'none',
                borderRadius: '6px'
              }}
              title="PDF Preview"
            />
          ) : (
            <div style={{ 
              textAlign: 'center', 
              padding: '60px 20px',
              color: '#94a3b8'
            }}>
              No preview available
            </div>
          )}
        </div>

        <div className="ja-modal-actions" style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="ja-btn-cancel-act" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6 }}>
            Close
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="ja-btn-pill slate"
              onClick={handleOpenInNewTab}
              disabled={isLoading || !pdfDataUrl}
              style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '8px 14px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', borderRadius: 6 }}
            >
              ↗️ Open in New Tab
            </button>
            <button 
              className="ja-btn-confirm-success" 
              onClick={handleDownload}
              disabled={isLoading || !pdfDataUrl}
              style={{
                background: '#15803d',
                color: '#fff',
                border: 'none',
                padding: '8px 18px',
                borderRadius: 6,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              📥 Download Signed PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PDFPreviewModal;