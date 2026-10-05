import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

/* ─── Format Rupees ─────────────────────────────────────────── */
const formatRupees = (amount) => {
  if (amount === undefined || amount === null) return '₹0.00';
  const n = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(n)) return '₹0.00';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/* ─── Format Date ───────────────────────────────────────────── */
const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const InvoiceChatbot = ({ user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'bot',
      type: 'greeting',
      text: 'Hello! 👋 I am your Invoice Lookup Assistant.\n\nPlease enter an Invoice Number (e.g. 1042 for current year, or 23-24/1042 for a specific financial year) to search for its complete details.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Auto scroll to bottom of chat
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Focus input continuously when open
  useEffect(() => {
    if (isOpen && !loading) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, loading, messages]);

  // Reset chatbot when switching user accounts
  useEffect(() => {
    setMessages([
      {
        id: Date.now(),
        sender: 'bot',
        type: 'greeting',
        text: 'Hello! 👋 I am your Invoice Lookup Assistant.\n\nPlease enter an Invoice Number (e.g. 1042 for current year, or 23-24/1042 for a specific financial year) to search for its complete details.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  }, [user?.id]);

  const handleSendMessage = async (customQuery = null) => {
    const query = (customQuery !== null ? customQuery : inputMessage).trim();
    if (!query || loading) return;

    const userMessageId = Date.now();
    const userMsg = {
      id: userMessageId,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (customQuery === null) setInputMessage('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/invoices/lookup?invoice_number=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data && res.data.success && res.data.invoice) {
        const inv = res.data.invoice;
        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: 'bot',
            type: 'invoice_details',
            invoice: inv,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + 1,
            sender: 'bot',
            type: 'text',
            text: 'Invoice not found.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    } catch (err) {
      console.error('Invoice lookup error:', err);
      // Fallback search if network or search query format
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'bot',
          type: 'text',
          text: 'Invoice not found.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: Date.now(),
        sender: 'bot',
        type: 'greeting',
        text: 'Hello! 👋 I am your Invoice Lookup Assistant.\n\nPlease enter an Invoice Number (e.g. JA/26-27/035 or 035) to search for its complete details in the system database.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  const handleOpenInvoice = (invoice) => {
    setIsOpen(false);
    navigate(`/invoice/edit/${invoice.id}`, { state: { invoice } });
  };

  if (!user) return null;

  return (
    <>
      <style>{`
        .ja-chatbot-fab-container {
          position: fixed;
          bottom: 0;
          right: 0;
          width: 80px;
          height: 80px;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: auto;
        }
        .ja-chatbot-fab {
          position: fixed;
          bottom: -18px;
          right: -18px;
          width: 58px;
          height: 58px;
          border-radius: 50%;
          background: linear-gradient(135deg, #0072bc, #0284c7);
          color: #ffffff;
          border: 2px solid #ffffff;
          box-shadow: -2px -2px 12px rgba(0, 114, 188, 0.35);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          opacity: 0.88;
        }
        .ja-chatbot-fab-container:hover .ja-chatbot-fab,
        .ja-chatbot-fab:hover,
        .ja-chatbot-fab.is-open {
          bottom: 24px;
          right: 24px;
          opacity: 1;
          transform: scale(1.06);
          box-shadow: 0 12px 28px rgba(0, 114, 188, 0.55);
        }
        .ja-chatbot-fab-pulse {
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          border: 2px solid rgba(0, 114, 188, 0.6);
          animation: fabPulse 2s infinite;
          pointer-events: none;
        }
        @keyframes fabPulse {
          0% { transform: scale(0.95); opacity: 0.8; }
          70% { transform: scale(1.25); opacity: 0; }
          100% { transform: scale(1.25); opacity: 0; }
        }
        .ja-chatbot-window {
          position: fixed;
          bottom: 92px;
          right: 24px;
          width: 390px;
          max-width: calc(100vw - 32px);
          height: 540px;
          max-height: calc(100vh - 120px);
          background: #ffffff;
          border-radius: 20px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 20px 50px rgba(15, 23, 42, 0.22);
          display: flex;
          flex-direction: column;
          z-index: 9999;
          overflow: hidden;
          animation: botWindowSlide 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes botWindowSlide {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .ja-chatbot-header {
          background: #0f172a;
          color: #ffffff;
          padding: 14px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #1e293b;
        }
        .ja-chatbot-header-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ja-chatbot-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, #0284c7, #0072bc);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .ja-chatbot-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: #ffffff;
          line-height: 1.1;
        }
        .ja-chatbot-sub {
          font-size: 0.68rem;
          color: #38bdf8;
          margin-top: 2px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .ja-chatbot-sub-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #4ade80;
          display: inline-block;
        }
        .ja-chatbot-header-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .ja-chatbot-icon-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 4px 6px;
          border-radius: 6px;
          font-size: 14px;
          transition: all 0.15s ease;
        }
        .ja-chatbot-icon-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.1);
        }
        .ja-chatbot-body {
          flex: 1;
          padding: 16px;
          overflow-y: auto;
          background: #f8fafc;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .ja-chat-msg {
          display: flex;
          flex-direction: column;
          max-width: 88%;
        }
        .ja-chat-msg.user {
          align-self: flex-end;
          align-items: flex-end;
        }
        .ja-chat-msg.bot {
          align-self: flex-start;
          align-items: flex-start;
        }
        .ja-chat-bubble {
          padding: 10px 14px;
          border-radius: 14px;
          font-size: 0.82rem;
          line-height: 1.5;
          word-break: break-word;
          white-space: pre-wrap;
        }
        .ja-chat-msg.user .ja-chat-bubble {
          background: #0072bc;
          color: #ffffff;
          border-bottom-right-radius: 4px;
        }
        .ja-chat-msg.bot .ja-chat-bubble {
          background: #ffffff;
          color: #0f172a;
          border: 1px solid #e2e8f0;
          border-bottom-left-radius: 4px;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
        }
        .ja-chat-time {
          font-size: 0.62rem;
          color: #94a3b8;
          margin-top: 3px;
          padding: 0 4px;
        }
        .ja-inv-card {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          padding: 14px;
          width: 100%;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
        }
        .ja-inv-card-hdr {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 8px;
          border-bottom: 1px solid #e2e8f0;
          margin-bottom: 10px;
        }
        .ja-inv-card-num {
          font-family: monospace;
          font-weight: 800;
          font-size: 0.92rem;
          color: #0072bc;
        }
        .ja-inv-card-badge {
          padding: 2px 8px;
          border-radius: 9999px;
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
        }
        .ja-inv-card-badge.paid { background: #dcfce7; color: #15803d; }
        .ja-inv-card-badge.unpaid { background: #fee2e2; color: #b91c1c; }
        .ja-inv-card-badge.cancelled { background: #f1f5f9; color: #475569; }
        .ja-inv-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.76rem;
          margin-bottom: 5px;
        }
        .ja-inv-lbl {
          color: #64748b;
          font-weight: 500;
        }
        .ja-inv-val {
          color: #0f172a;
          font-weight: 600;
          text-align: right;
        }
        .ja-inv-open-btn {
          width: 100%;
          margin-top: 10px;
          padding: 7px;
          background: #f0f9ff;
          color: #0072bc;
          border: 1px solid #bae6fd;
          border-radius: 8px;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
        .ja-inv-open-btn:hover {
          background: #0072bc;
          color: #ffffff;
          border-color: #0072bc;
        }
        .ja-chatbot-footer {
          padding: 12px;
          background: #ffffff;
          border-top: 1px solid #e2e8f0;
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .ja-chatbot-input {
          flex: 1;
          padding: 9px 14px;
          border: 1.5px solid #cbd5e1;
          border-radius: 9999px;
          font-size: 0.8rem;
          outline: none;
          transition: all 0.15s ease;
        }
        .ja-chatbot-input:focus {
          border-color: #0072bc;
          box-shadow: 0 0 0 3px rgba(0, 114, 188, 0.1);
        }
        .ja-chatbot-send-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #0072bc;
          color: #ffffff;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
          flex-shrink: 0;
        }
        .ja-chatbot-send-btn:hover:not(:disabled) {
          background: #005fa3;
          transform: scale(1.05);
        }
        .ja-chatbot-send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .ja-typing {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 8px 12px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          width: fit-content;
        }
        .ja-typing-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #94a3b8;
          animation: typingDot 1.4s infinite ease-in-out;
        }
        .ja-typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .ja-typing-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes typingDot {
          0%, 100% { transform: scale(0.8); opacity: 0.4; }
          50% { transform: scale(1.2); opacity: 1; }
        }
      `}</style>

      {/* Floating Trigger Button */}
      <div className="ja-chatbot-fab-container">
        <button
          className={`ja-chatbot-fab ${isOpen ? 'is-open' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
          title="Invoice Lookup AI Assistant"
        >
          {!isOpen && <div className="ja-chatbot-fab-pulse" />}
          {isOpen ? (
            <span style={{ fontSize: 22, fontWeight: 700 }}>✕</span>
          ) : (
            <span style={{ fontSize: 24 }}>🤖</span>
          )}
        </button>
      </div>

      {/* Chatbot Window */}
      {isOpen && (
        <div className="ja-chatbot-window">
          {/* Header */}
          <div className="ja-chatbot-header">
            <div className="ja-chatbot-header-info">
              <div className="ja-chatbot-avatar">🤖</div>
              <div>
                <div className="ja-chatbot-title">Invoice Assistant</div>
                <div className="ja-chatbot-sub">
                  <span className="ja-chatbot-sub-dot" /> Live System Database Search
                </div>
              </div>
            </div>
            <div className="ja-chatbot-header-actions">
              <button
                className="ja-chatbot-icon-btn"
                onClick={handleResetChat}
                title="Reset Chat"
              >
                ↺
              </button>
              <button
                className="ja-chatbot-icon-btn"
                onClick={() => setIsOpen(false)}
                title="Close Assistant"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Body / Messages */}
          <div className="ja-chatbot-body">
            {messages.map(msg => (
              <div key={msg.id} className={`ja-chat-msg ${msg.sender}`}>
                {msg.type === 'invoice_details' && msg.invoice ? (
                  <div className="ja-inv-card">
                    <div className="ja-inv-card-hdr">
                      <div className="ja-inv-card-num">{msg.invoice.invoice_number}</div>
                      <span className={`ja-inv-card-badge ${msg.invoice.payment_status || 'unpaid'}`}>
                        {msg.invoice.payment_status === 'paid' ? '✓ PAID' : msg.invoice.payment_status === 'cancelled' ? 'CANCELLED' : 'UNPAID'}
                      </span>
                    </div>

                    <div className="ja-inv-row">
                      <span className="ja-inv-lbl">Date:</span>
                      <span className="ja-inv-val">{formatDate(msg.invoice.date)}</span>
                    </div>
                    <div className="ja-inv-row">
                      <span className="ja-inv-lbl">Customer:</span>
                      <span className="ja-inv-val">{msg.invoice.client_name || msg.invoice.description || 'N/A'}</span>
                    </div>
                    <div className="ja-inv-row">
                      <span className="ja-inv-lbl">GSTIN:</span>
                      <span className="ja-inv-val" style={{ fontFamily: 'monospace' }}>{msg.invoice.client_gst || 'N/A'}</span>
                    </div>
                    <div className="ja-inv-row">
                      <span className="ja-inv-lbl">Bank Name:</span>
                      <span className="ja-inv-val">{msg.invoice.bank_name || msg.invoice.client_bank_name || 'AXIS BANK'}</span>
                    </div>
                    <div className="ja-inv-row">
                      <span className="ja-inv-lbl">Base Amount:</span>
                      <span className="ja-inv-val">{formatRupees(msg.invoice.calculated_base_amount || msg.invoice.base_amount || 0)}</span>
                    </div>
                    <div className="ja-inv-row">
                      <span className="ja-inv-lbl">Total Amount:</span>
                      <span className="ja-inv-val" style={{ color: '#0072bc', fontWeight: 800 }}>
                        {formatRupees(msg.invoice.calculated_total_amount || msg.invoice.total_amount || 0)}
                      </span>
                    </div>
                    <div className="ja-inv-row">
                      <span className="ja-inv-lbl">Amount Received:</span>
                      <span className="ja-inv-val" style={{ color: '#15803d' }}>
                        {formatRupees(msg.invoice.received || 0)}
                      </span>
                    </div>
                    <div className="ja-inv-row">
                      <span className="ja-inv-lbl">Pending Balance:</span>
                      <span className="ja-inv-val" style={{ color: '#b45309' }}>
                        {formatRupees(msg.invoice.calculated_pending || 0)}
                      </span>
                    </div>
                    <div className="ja-inv-row">
                      <span className="ja-inv-lbl">Approval Status:</span>
                      <span className="ja-inv-val" style={{ textTransform: 'capitalize' }}>
                        {msg.invoice.approval_status === 'final_approved' ? 'Approved' : msg.invoice.approval_status || 'Created'}
                      </span>
                    </div>
                    <div className="ja-inv-row">
                      <span className="ja-inv-lbl">Created By:</span>
                      <span className="ja-inv-val">{msg.invoice.created_by_name || msg.invoice.full_name || 'User'}</span>
                    </div>
                    {msg.invoice.remarks && (
                      <div className="ja-inv-row" style={{ flexDirection: 'column', gap: 2, marginTop: 4 }}>
                        <span className="ja-inv-lbl">Remarks:</span>
                        <span className="ja-inv-val" style={{ textAlign: 'left', fontSize: '0.7rem', color: '#475569', fontStyle: 'italic', background: '#f1f5f9', padding: '4px 6px', borderRadius: 4 }}>
                          {msg.invoice.remarks}
                        </span>
                      </div>
                    )}

                    <button
                      className="ja-inv-open-btn"
                      onClick={() => handleOpenInvoice(msg.invoice)}
                    >
                      👁️ View / Edit Complete Invoice
                    </button>
                  </div>
                ) : (
                  <div className="ja-chat-bubble">{msg.text}</div>
                )}
                <span className="ja-chat-time">{msg.timestamp}</span>
              </div>
            ))}

            {loading && (
              <div className="ja-chat-msg bot">
                <div className="ja-typing">
                  <div className="ja-typing-dot" />
                  <div className="ja-typing-dot" />
                  <div className="ja-typing-dot" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input */}
          <div className="ja-chatbot-footer">
            <input
              ref={inputRef}
              type="text"
              className="ja-chatbot-input"
              placeholder="Enter Invoice No (e.g. 1042 or 23-24/1042)..."
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <button
              className="ja-chatbot-send-btn"
              onClick={() => handleSendMessage()}
              disabled={!inputMessage.trim() || loading}
              title="Search Invoice"
            >
              ➔
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default InvoiceChatbot;
