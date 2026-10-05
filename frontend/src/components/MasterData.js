// src/components/MasterData.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import Sidebar from './Sidebar';
import Notification from './Notification';
import LoadingScreen from './LoadingScreen';

axios.defaults.withCredentials = true;

// ─── DESIGN TOKENS (aligned with DataAnalysis) ─────────────────────────────────
const T = {
  ink: '#0B0F1A',
  inkMid: '#1E2535',
  inkLight: '#3A4259',
  paper: '#F4F2EC',
  paperDark: '#EAE7DE',
  paperLine: '#DDDAD0',
  white: '#FFFFFF',
  cobalt: '#1B4FD8',
  cobaltSoft: 'rgba(27,79,216,0.12)',
  emerald: '#0E7B55',
  emeraldSoft: 'rgba(14,123,85,0.12)',
  crimson: '#C0263D',
  amber: '#C97D00',
  violet: '#5B35CC',
  slate: '#6B7280',
  shadow: '0 2px 12px rgba(11,15,26,0.08)',
  shadowMd: '0 4px 24px rgba(11,15,26,0.12)',
  fontDisplay: "'DM Serif Display', 'Georgia', serif",
  fontMono: "'JetBrains Mono', 'Fira Code', monospace",
  fontBody: "'DM Sans', 'Helvetica Neue', sans-serif",
  radius: '10px',
  radiusLg: '16px',
  radiusPill: '100px',
};

// ─── INJECT GOOGLE FONTS ──────────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('md-fonts')) {
  const link = document.createElement('link');
  link.id = 'md-fonts';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display&family=JetBrains+Mono:wght@400;500;600&display=swap';
  document.head.appendChild(link);
}

// ─── GLOBAL STYLES (matching DataAnalysis aesthetics) ────────────────────────
const injectStyles = () => {
  if (typeof document === 'undefined') return;
  const id = 'md-styles';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    .md-root * { box-sizing: border-box; font-family: ${T.fontBody}; }
    .md-root { background: ${T.paper}; min-height: 100vh; }

    /* Scrollbar */
    .md-root ::-webkit-scrollbar { width: 4px; height: 4px; }
    .md-root ::-webkit-scrollbar-track { background: transparent; }
    .md-root ::-webkit-scrollbar-thumb { background: ${T.paperLine}; border-radius: 4px; }

    /* Card style */
    .md-card {
      background: ${T.white};
      border-radius: ${T.radiusLg};
      border: 1px solid ${T.paperLine};
      box-shadow: ${T.shadow};
      transition: box-shadow .2s;
    }
    .md-card:hover { box-shadow: ${T.shadowMd}; }

    /* Table styles */
    .md-table-wrap {
      overflow-x: auto;
      border-radius: ${T.radiusLg};
      background: ${T.white};
      border: 1px solid ${T.paperLine};
    }
    .md-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .md-table thead tr {
      background: ${T.paperDark};
      border-bottom: 1px solid ${T.paperLine};
    }
    .md-table th {
      padding: 14px 16px;
      text-align: left;
      font-weight: 600;
      font-size: 11px;
      color: ${T.inkLight};
      letter-spacing: .05em;
      text-transform: uppercase;
    }
    .md-table td {
      padding: 12px 16px;
      color: ${T.inkMid};
      border-bottom: 1px solid ${T.paperDark};
      font-size: 13px;
    }
    .md-table tr:hover td {
      background: ${T.paperDark};
    }

    /* Badge */
    .md-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: ${T.radiusPill};
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .03em;
    }
    .md-badge.admin { background: ${T.violetSoft}; color: ${T.violet}; }
    .md-badge.super_admin { background: ${T.cobaltSoft}; color: ${T.cobalt}; }
    .md-badge.user { background: ${T.emeraldSoft}; color: ${T.emerald}; }

    /* Buttons */
    .md-btn-primary {
      background: ${T.ink};
      color: ${T.white};
      border: none;
      padding: 8px 18px;
      border-radius: ${T.radiusPill};
      font-size: 12px;
      font-weight: 600;
      font-family: ${T.fontBody};
      cursor: pointer;
      transition: opacity .15s, transform .1s;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .md-btn-primary:hover { opacity: .88; transform: translateY(-1px); }

    .md-btn-secondary {
      background: ${T.white};
      border: 1px solid ${T.paperLine};
      color: ${T.inkMid};
      padding: 7px 16px;
      border-radius: ${T.radiusPill};
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all .15s;
    }
    .md-btn-secondary:hover { background: ${T.paperDark}; }

    .md-btn-edit {
      background: ${T.cobaltSoft};
      color: ${T.cobalt};
      border: none;
      padding: 5px 12px;
      border-radius: ${T.radiusPill};
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      margin-right: 8px;
      transition: opacity .15s;
    }
    .md-btn-edit:hover { opacity: .8; }

    .md-btn-danger {
      background: rgba(192,38,61,0.12);
      color: ${T.crimson};
      border: none;
      padding: 5px 12px;
      border-radius: ${T.radiusPill};
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity .15s;
    }
    .md-btn-danger:hover { opacity: .8; }

    /* Tabs */
    .md-tabs {
      display: flex;
      gap: 6px;
      background: ${T.paperDark};
      border-radius: ${T.radiusPill};
      padding: 4px;
      margin-bottom: 28px;
    }
    .md-tab {
      background: transparent;
      border: none;
      padding: 8px 20px;
      border-radius: ${T.radiusPill};
      font-size: 13px;
      font-weight: 600;
      color: ${T.slate};
      cursor: pointer;
      transition: all .15s;
      font-family: ${T.fontBody};
    }
    .md-tab.active {
      background: ${T.white};
      color: ${T.ink};
      box-shadow: ${T.shadow};
    }
    .md-tab:not(.active):hover { color: ${T.inkMid}; }

    /* Modal */
    .md-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(11,15,26,0.6);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.2s ease;
    }
    .md-modal {
      background: ${T.white};
      border-radius: ${T.radiusLg};
      width: 92%;
      max-width: 520px;
      max-height: 85vh;
      overflow-y: auto;
      box-shadow: 0 8px 48px rgba(11,15,26,0.16);
      animation: scaleIn 0.2s ease;
    }
    .md-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px 8px 24px;
      border-bottom: 1px solid ${T.paperLine};
    }
    .md-modal-header h3 {
      font-family: ${T.fontDisplay};
      font-size: 1.25rem;
      font-weight: 700;
      color: ${T.ink};
      margin: 0;
    }
    .md-modal-close {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: ${T.paperDark};
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: ${T.slate};
      transition: all .15s;
    }
    .md-modal-close:hover { background: ${T.paperLine}; transform: rotate(90deg); }
    .md-form-group {
      padding: 0 24px;
      margin-bottom: 20px;
    }
    .md-form-group label {
      display: block;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .05em;
      color: ${T.slate};
      margin-bottom: 6px;
    }
    .md-input, .md-select, .md-textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid ${T.paperLine};
      border-radius: ${T.radius};
      font-size: 13px;
      font-family: ${T.fontBody};
      background: ${T.paperDark};
      color: ${T.ink};
      outline: none;
      transition: all .15s;
    }
    .md-input:focus, .md-select:focus, .md-textarea:focus {
      border-color: ${T.cobalt};
      box-shadow: 0 0 0 3px ${T.cobaltSoft};
      background: ${T.white};
    }
    .md-textarea { resize: vertical; }
    .md-modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 20px 24px 24px;
      border-top: 1px solid ${T.paperLine};
      margin-top: 8px;
    }
    .md-btn-cancel {
      background: ${T.paperDark};
      border: none;
      padding: 8px 20px;
      border-radius: ${T.radiusPill};
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      color: ${T.inkMid};
    }
    .md-btn-submit {
      background: ${T.ink};
      color: ${T.white};
      border: none;
      padding: 8px 24px;
      border-radius: ${T.radiusPill};
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity .15s;
    }
    .md-btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }

    /* Empty state */
    .md-empty {
      text-align: center;
      padding: 60px 24px;
      color: ${T.slate};
      font-size: 13px;
    }

    /* Animations */
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes scaleIn {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .md-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      margin-right: 8px;
    }

    /* Info box */
    .md-info-box {
      background: ${T.cobaltSoft};
      padding: 12px;
      border-radius: ${T.radius};
      margin-top: 12px;
      font-size: 11px;
      color: ${T.inkMid};
      line-height: 1.5;
    }
    .md-info-box strong { color: ${T.cobalt}; }
    .md-info-box ul { margin-top: 8px; margin-left: 20px; }
    .md-info-box li { margin: 4px 0; }
  `;
  document.head.appendChild(style);
};

const MasterData = ({ user, token, onLogout, onCreateNew, onBack }) => {
  injectStyles();

  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // User form state
  const [userForm, setUserForm] = useState({
    full_name: '',
    username: '',
    email: '',
    password: '',
    role: 'user'
  });

  // Client form state
  const [clientForm, setClientForm] = useState({
    name: '',
    gst_number: '',
    email: '',
    phone: '',
    address: '',
    branch: '',
    pay_to_bank_id: ''
  });
  const [isBankManuallySelected, setIsBankManuallySelected] = useState(false);

  // Bank form state
  const [bankForm, setBankForm] = useState({
    bank_name: '',
    account_number: '',
    ifsc_code: '',
    branch: '',
    account_holder: 'JAYARAMA ASSOCIATES'
  });

  const notifTimerRef = useRef(null);

  useEffect(() => {
    loadAllData();
    return () => {
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showNotification = useCallback((type, message) => {
    if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    setNotification({ type, message });
    notifTimerRef.current = setTimeout(() => setNotification(null), 3000);
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [usersRes, clientsRes, banksRes] = await Promise.all([
        axios.get('/api/auth/users'),
        axios.get('/api/clients'),
        axios.get('/api/banks')
      ]);
      setUsers(usersRes.data);
      setClients(clientsRes.data);
      setBanks(banksRes.data);
    } catch (err) {
      console.error(err);
      showNotification('error', 'Failed to load data');
      if (err.response?.status === 401) onLogout();
    } finally {
      setLoading(false);
    }
  };

  // Dynamic Bank Auto-Matching helper based on Bank Master Data
  const autoMatchBank = (clientName, currentBankId, manualOverride) => {
    if (manualOverride || !clientName || !clientName.trim() || !banks || banks.length === 0) {
      return currentBankId;
    }
    const cleanClient = clientName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const bank of banks) {
      const bankName = (bank.bank_name || '').toLowerCase();
      const cleanBankName = bankName.replace(/[^a-z0-9]/g, '');

      // Dynamic token identification
      const tokens = [];
      if (bankName.includes('sbi') || bankName.includes('state bank')) {
        tokens.push('sbi', 'statebank', 'statebankofindia');
      }
      if (bankName.includes('axis')) {
        tokens.push('axis', 'axisbank');
      }
      if (bankName.includes('hdfc')) {
        tokens.push('hdfc', 'hdfcbank');
      }
      if (bankName.includes('icici')) {
        tokens.push('icici', 'icicibank');
      }
      if (bankName.includes('kotak')) {
        tokens.push('kotak', 'kotakmahindra');
      }
      if (bankName.includes('canara')) {
        tokens.push('canara', 'canarabank');
      }
      if (bankName.includes('punjab') || bankName.includes('pnb')) {
        tokens.push('pnb', 'punjabnational', 'punjab');
      }
      if (bankName.includes('baroda') || bankName.includes('bob')) {
        tokens.push('bob', 'bankofbaroda', 'baroda');
      }
      if (bankName.includes('union')) {
        tokens.push('union', 'unionbank');
      }
      if (bankName.includes('indusind')) {
        tokens.push('indusind', 'indusindbank');
      }
      if (bankName.includes('yes')) {
        tokens.push('yes', 'yesbank');
      }
      if (bankName.includes('idfc')) {
        tokens.push('idfc', 'idfcfirst');
      }
      if (bankName.includes('federal')) {
        tokens.push('federal', 'federalbank');
      }
      if (bankName.includes('bandhan')) {
        tokens.push('bandhan', 'bandhanbank');
      }
      if (bankName.includes('dcb')) {
        tokens.push('dcb', 'dcbbank');
      }

      const matchesToken = tokens.some(t => cleanClient.includes(t));
      const matchesDirect = cleanBankName.length > 2 && (cleanClient.includes(cleanBankName) || cleanBankName.includes(cleanClient));

      if (matchesToken || matchesDirect) {
        return bank.id;
      }
    }
    return currentBankId;
  };

  const handleClientNameChange = (e) => {
    const newName = e.target.value;
    const matchedBankId = !isBankManuallySelected ? autoMatchBank(newName, clientForm.pay_to_bank_id, false) : clientForm.pay_to_bank_id;
    setClientForm(prev => ({
      ...prev,
      name: newName,
      pay_to_bank_id: matchedBankId || ''
    }));
  };

  const handleAddUser = async () => {
    if (!userForm.full_name || !userForm.username || !userForm.email || !userForm.password) {
      showNotification('error', 'Please fill all required fields');
      return;
    }
    setIsSubmitting(true);
    try {
      if (editingItem) {
        const updateData = {
          full_name: userForm.full_name,
          username: userForm.username,
          email: userForm.email,
          role: userForm.role
        };
        if (userForm.password && userForm.password.trim()) {
          updateData.password = userForm.password;
        }
        await axios.put(`/api/auth/users/${editingItem.id}`, updateData);
        showNotification('success', 'User updated successfully');
      } else {
        await axios.post('/api/auth/users', {
          full_name: userForm.full_name,
          username: userForm.username,
          email: userForm.email,
          password: userForm.password,
          role: userForm.role
        });
        showNotification('success', 'User created successfully');
      }
      await loadAllData();
      resetModal();
    } catch (err) {
      console.error('User operation error:', err);
      showNotification('error', err.response?.data?.error || 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddClient = async () => {
    if (!clientForm.name || !clientForm.name.trim()) {
      showNotification('error', 'Client name is required');
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        name: clientForm.name.trim(),
        gst_number: clientForm.gst_number || null,
        email: clientForm.email || null,
        phone: clientForm.phone || null,
        address: clientForm.address || null,
        branch: clientForm.branch || null,
        pay_to_bank_id: clientForm.pay_to_bank_id || null
      };
      if (editingItem) {
        await axios.put(`/api/clients/${editingItem.id}`, payload);
        showNotification('success', 'Client updated successfully');
      } else {
        await axios.post('/api/clients', payload);
        showNotification('success', 'Client added successfully');
      }
      await loadAllData();
      resetModal();
    } catch (err) {
      showNotification('error', err.response?.data?.error || 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddBank = async () => {
    if (!bankForm.bank_name || !bankForm.account_number || !bankForm.ifsc_code) {
      showNotification('error', 'Bank name, account number, and IFSC are required');
      return;
    }
    setIsSubmitting(true);
    try {
      if (editingItem) {
        await axios.put(`/api/banks/${editingItem.id}`, bankForm);
        showNotification('success', 'Bank updated successfully');
      } else {
        await axios.post('/api/banks', bankForm);
        showNotification('success', 'Bank added successfully');
      }
      await loadAllData();
      resetModal();
    } catch (err) {
      showNotification('error', err.response?.data?.error || 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (type, id, name) => {
    if (!window.confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) return;
    try {
      let endpoint = '';
      switch (type) {
        case 'user': endpoint = `/api/auth/users/${id}`; break;
        case 'client': endpoint = `/api/clients/${id}`; break;
        case 'bank': endpoint = `/api/banks/${id}`; break;
        default: return;
      }
      await axios.delete(endpoint);
      showNotification('success', `${name} deleted successfully`);
      await loadAllData();
    } catch (err) {
      console.error('Delete error:', err);
      showNotification('error', err.response?.data?.error || 'Delete failed');
    }
  };

  const handleEdit = (type, item) => {
    setEditingItem(item);
    if (type === 'user') {
      setUserForm({
        full_name: item.full_name || '',
        username: item.username || '',
        email: item.email || '',
        password: '',
        role: item.role || 'user'
      });
    } else if (type === 'client') {
      setClientForm({
        name: item.name || '',
        gst_number: item.gst_number || '',
        email: item.email || '',
        phone: item.phone || '',
        address: item.address || '',
        branch: item.branch || '',
        pay_to_bank_id: item.pay_to_bank_id || ''
      });
      setIsBankManuallySelected(true);
    } else if (type === 'bank') {
      setBankForm({
        bank_name: item.bank_name || '',
        account_number: item.account_number || '',
        ifsc_code: item.ifsc_code || '',
        branch: item.branch || '',
        account_holder: item.account_holder || 'JAYARAMA ASSOCIATES'
      });
    }
    setShowModal(true);
  };

  const resetModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setIsBankManuallySelected(false);
    setUserForm({ full_name: '', username: '', email: '', password: '', role: 'user' });
    setClientForm({ name: '', gst_number: '', email: '', phone: '', address: '', branch: '', pay_to_bank_id: '' });
    setBankForm({ bank_name: '', account_number: '', ifsc_code: '', branch: '', account_holder: 'JAYARAMA ASSOCIATES' });
  };

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'super_admin': return 'super_admin';
      case 'admin': return 'admin';
      default: return 'user';
    }
  };

  const getRoleDisplayName = (role) => {
    switch (role) {
      case 'super_admin': return 'Super Admin';
      case 'admin': return 'Admin';
      default: return 'User';
    }
  };

  const renderUsersTab = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button className="md-btn-primary" onClick={() => setShowModal(true)}>
          + Add User
        </button>
      </div>
      <div className="md-table-wrap">
        <table className="md-table">
          <thead>
            <tr>
              <th>Full Name</th>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Created At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan="6"><div className="md-empty">No users found</div></td></tr>
            ) : (
              users.map(userItem => (
                <tr key={userItem.id}>
                  <td><strong>{userItem.full_name}</strong></td>
                  <td>{userItem.username}</td>
                  <td>{userItem.email}</td>
                  <td>
                    <span className={`md-badge ${getRoleBadgeClass(userItem.role)}`}>
                      {getRoleDisplayName(userItem.role)}
                    </span>
                  </td>
                  <td>{new Date(userItem.created_at).toLocaleDateString()}</td>
                  <td>
                    <button className="md-btn-edit" onClick={() => handleEdit('user', userItem)}>Edit</button>
                    <button className="md-btn-danger" onClick={() => handleDelete('user', userItem.id, userItem.full_name)}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderClientsTab = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button className="md-btn-primary" onClick={() => setShowModal(true)}>
          + Add Client
        </button>
      </div>
      <div className="md-table-wrap">
        <table className="md-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>GSTIN</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Branch</th>
              <th>Pay To Bank</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr><td colSpan="7"><div className="md-empty">No clients found</div></td></tr>
            ) : (
              clients.map(client => (
                <tr key={client.id}>
                  <td><strong>{client.name}</strong></td>
                  <td>{client.gst_number || '—'}</td>
                  <td>{client.email || '—'}</td>
                  <td>{client.phone || '—'}</td>
                  <td>{client.branch || '—'}</td>
                  <td>
                    {client.pay_to_bank_name ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 8px',
                        borderRadius: T.radiusPill,
                        fontSize: '11px',
                        fontWeight: 600,
                        background: 'rgba(27,79,216,0.1)',
                        color: T.cobalt
                      }}>
                        🏦 {client.pay_to_bank_name}
                      </span>
                    ) : (
                      <span style={{ color: T.slate, fontSize: '11px' }}>—</span>
                    )}
                  </td>
                  <td>
                    <button className="md-btn-edit" onClick={() => handleEdit('client', client)}>Edit</button>
                    <button className="md-btn-danger" onClick={() => handleDelete('client', client.id, client.name)}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderBanksTab = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button className="md-btn-primary" onClick={() => setShowModal(true)}>
          + Add Bank
        </button>
      </div>
      <div className="md-table-wrap">
        <table className="md-table">
          <thead>
            <tr>
              <th>Bank Name</th>
              <th>Account Number</th>
              <th>IFSC</th>
              <th>Branch</th>
              <th>Account Holder</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {banks.length === 0 ? (
              <tr><td colSpan="6"><div className="md-empty">No banks found</div></td></tr>
            ) : (
              banks.map(bank => (
                <tr key={bank.id}>
                  <td><strong>{bank.bank_name}</strong></td>
                  <td>{bank.account_number}</td>
                  <td>{bank.ifsc_code}</td>
                  <td>{bank.branch || '—'}</td>
                  <td>{bank.account_holder}</td>
                  <td>
                    <button className="md-btn-edit" onClick={() => handleEdit('bank', bank)}>Edit</button>
                    <button className="md-btn-danger" onClick={() => handleDelete('bank', bank.id, bank.bank_name)}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderModal = () => {
    let title = '';
    let fields = null;
    let onSubmit = null;

    if (activeTab === 'users') {
      title = editingItem ? 'Edit User' : 'Add New User';
      fields = (
        <>
          <div className="md-form-group">
            <label>Full Name *</label>
            <input type="text" className="md-input" value={userForm.full_name}
              onChange={e => setUserForm({ ...userForm, full_name: e.target.value })}
              placeholder="Enter full name" />
          </div>
          <div className="md-form-group">
            <label>Username *</label>
            <input type="text" className="md-input" value={userForm.username}
              onChange={e => setUserForm({ ...userForm, username: e.target.value })}
              placeholder="Enter username" />
          </div>
          <div className="md-form-group">
            <label>Email *</label>
            <input type="email" className="md-input" value={userForm.email}
              onChange={e => setUserForm({ ...userForm, email: e.target.value })}
              placeholder="Enter email address" />
          </div>
          <div className="md-form-group">
            <label>{editingItem ? 'Password (leave blank to keep current)' : 'Password *'}</label>
            <input type="password" className="md-input" value={userForm.password}
              onChange={e => setUserForm({ ...userForm, password: e.target.value })}
              placeholder={editingItem ? 'Enter new password to change' : 'Enter password'} />
          </div>
          <div className="md-form-group">
            <label>Role *</label>
            <select className="md-select" value={userForm.role}
              onChange={e => setUserForm({ ...userForm, role: e.target.value })}>
              <option value="user">👤 User - Can only view own invoices</option>
              <option value="admin">👑 Admin - Can manage all invoices and request eSign</option>
              <option value="super_admin">⭐ Super Admin - Full access including user management</option>
            </select>
          </div>
          <div className="md-info-box">
            <strong>💡 Role Permissions:</strong>
            <ul>
              <li><strong>User:</strong> Create invoices, view own invoices only</li>
              <li><strong>Admin:</strong> View all invoices, update payment status, request eSign approval</li>
              <li><strong>Super Admin:</strong> Full system access, approve eSign requests, manage users</li>
            </ul>
          </div>
        </>
      );
      onSubmit = handleAddUser;
    } else if (activeTab === 'clients') {
      title = editingItem ? 'Edit Client' : 'Add New Client';
      fields = (
        <>
          <div className="md-form-group">
            <label>Client Name *</label>
            <input type="text" className="md-input" value={clientForm.name}
              onChange={handleClientNameChange}
              placeholder="e.g., SBI Bank, Axis Bank, etc." />
          </div>
          <div className="md-form-group">
            <label>GSTIN</label>
            <input type="text" className="md-input" value={clientForm.gst_number}
              onChange={e => setClientForm({ ...clientForm, gst_number: e.target.value })}
              placeholder="e.g., 36AAAAA0000A1Z" />
          </div>
          <div className="md-form-group">
            <label>Email</label>
            <input type="email" className="md-input" value={clientForm.email}
              onChange={e => setClientForm({ ...clientForm, email: e.target.value })}
              placeholder="client@example.com" />
          </div>
          <div className="md-form-group">
            <label>Phone</label>
            <input type="tel" className="md-input" value={clientForm.phone}
              onChange={e => setClientForm({ ...clientForm, phone: e.target.value })}
              placeholder="e.g., 9876543210" />
          </div>
          <div className="md-form-group">
            <label>Branch</label>
            <input type="text" className="md-input" value={clientForm.branch}
              onChange={e => setClientForm({ ...clientForm, branch: e.target.value })}
              placeholder="e.g., Sanath Nagar, Hyderabad" />
          </div>
          <div className="md-form-group">
            <label>Address</label>
            <textarea className="md-textarea" rows="3" value={clientForm.address}
              onChange={e => setClientForm({ ...clientForm, address: e.target.value })}
              placeholder="Full address" />
          </div>
          <div className="md-form-group">
            <label>Pay To Bank / Bank Settlement Profile</label>
            <select
              className="md-select"
              value={clientForm.pay_to_bank_id || ''}
              onChange={e => {
                setIsBankManuallySelected(true);
                setClientForm(prev => ({ ...prev, pay_to_bank_id: e.target.value }));
              }}
            >
              <option value="">-- Select Settlement Bank (Optional) --</option>
              {banks.map(bank => (
                <option key={bank.id} value={bank.id}>
                  {bank.bank_name} {bank.branch ? `(${bank.branch})` : ''} - A/C: {bank.account_number}
                </option>
              ))}
            </select>
          </div>
        </>
      );
      onSubmit = handleAddClient;
    } else if (activeTab === 'banks') {
      title = editingItem ? 'Edit Bank' : 'Add New Bank';
      fields = (
        <>
          <div className="md-form-group">
            <label>Bank Name *</label>
            <input type="text" className="md-input" value={bankForm.bank_name}
              onChange={e => setBankForm({ ...bankForm, bank_name: e.target.value })} />
          </div>
          <div className="md-form-group">
            <label>Account Number *</label>
            <input type="text" className="md-input" value={bankForm.account_number}
              onChange={e => setBankForm({ ...bankForm, account_number: e.target.value })} />
          </div>
          <div className="md-form-group">
            <label>IFSC Code *</label>
            <input type="text" className="md-input" value={bankForm.ifsc_code}
              onChange={e => setBankForm({ ...bankForm, ifsc_code: e.target.value.toUpperCase() })} />
          </div>
          <div className="md-form-group">
            <label>Branch</label>
            <input type="text" className="md-input" value={bankForm.branch}
              onChange={e => setBankForm({ ...bankForm, branch: e.target.value })} />
          </div>
          <div className="md-form-group">
            <label>Account Holder Name</label>
            <input type="text" className="md-input" value={bankForm.account_holder}
              onChange={e => setBankForm({ ...bankForm, account_holder: e.target.value })} />
          </div>
        </>
      );
      onSubmit = handleAddBank;
    }

    return (
      <div className="md-overlay" onClick={resetModal}>
        <div className="md-modal" onClick={e => e.stopPropagation()}>
          <div className="md-modal-header">
            <h3>{title}</h3>
            <button className="md-modal-close" onClick={resetModal}>×</button>
          </div>
          {fields}
          <div className="md-modal-actions">
            <button className="md-btn-cancel" onClick={resetModal}>Cancel</button>
            <button className="md-btn-submit" onClick={onSubmit} disabled={isSubmitting}>
              {isSubmitting && <span className="md-spinner"></span>}
              {editingItem ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return <LoadingScreen message="Loading master data..." />;
  }

  return (
    <div className="md-root" style={{ display: 'flex', width: '100%', minHeight: '100vh' }}>
      <Sidebar user={user} onLogout={onLogout} onCreateNew={onCreateNew} userRole={user?.role} />

      <main style={{ flex: 1, padding: 'clamp(12px, 1.5vw, 20px)', background: T.paper, overflowX: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <div>
            <button className="md-btn-secondary" onClick={onBack} style={{ marginBottom: 8, fontSize: 11 }}>← Back</button>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: T.ink, letterSpacing: '-.03em', fontFamily: T.fontDisplay }}>Master Data Management</h1>
            <p style={{ fontSize: 12, color: T.slate, marginTop: 4 }}>Manage users, clients, and bank information with role-based access control</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="md-tabs">
          <button className={`md-tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => { setActiveTab('users'); resetModal(); }}>
            👥 Users ({users.length})
          </button>
          <button className={`md-tab ${activeTab === 'clients' ? 'active' : ''}`}
            onClick={() => { setActiveTab('clients'); resetModal(); }}>
            🏢 Clients ({clients.length})
          </button>
          <button className={`md-tab ${activeTab === 'banks' ? 'active' : ''}`}
            onClick={() => { setActiveTab('banks'); resetModal(); }}>
            🏦 Banks ({banks.length})
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'users' && renderUsersTab()}
        {activeTab === 'clients' && renderClientsTab()}
        {activeTab === 'banks' && renderBanksTab()}
      </main>

      {showModal && renderModal()}
      {notification && <Notification type={notification.type} message={notification.message} />}
    </div>
  );
};

export default MasterData;