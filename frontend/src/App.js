// src/App.js - FIXED VERSION
import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import axios from 'axios';
import './App.css';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import InvoiceEditor from './components/InvoiceEditor';
import DataAnalysis from './components/DataAnalysis';
import MasterData from './components/MasterData';
import InvoiceChatbot from './components/InvoiceChatbot';
import LoadingScreen from './components/LoadingScreen';

import { API_BASE_URL } from './config';

// Configure axios defaults dynamically
axios.defaults.baseURL = API_BASE_URL;

// Protected Route wrapper component
const ProtectedRoute = ({ children, user }) => {
    if (!user) {
        return <Navigate to="/login" replace />;
    }
    return children;
};

// Super Admin Route wrapper
const SuperAdminRoute = ({ children, user }) => {
    if (!user) {
        return <Navigate to="/login" replace />;
    }
    if (user?.role !== 'super_admin') {
        return <Navigate to="/dashboard" replace />;
    }
    return children;
};

// Wrapper component for editing invoice that fetches the invoice data
const EditInvoiceWrapper = ({ user, token, onSave, onCancel }) => {
    const { id } = useParams();
    const location = useLocation();
    const [invoice, setInvoice] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchInvoice = async () => {
            try {
                setLoading(true);
                // First check if invoice was passed via state (from dashboard click)
                if (location.state?.invoice) {
                    console.log('Using invoice from state:', location.state.invoice);
                    setInvoice(location.state.invoice);
                    setLoading(false);
                    return;
                }

                // Otherwise fetch from API using the ID
                const authToken = localStorage.getItem('token');
                const response = await axios.get(`/api/invoices/${id}`, {
                    headers: { Authorization: `Bearer ${authToken}` }
                });
                console.log('Fetched invoice from API:', response.data);
                setInvoice(response.data);
            } catch (err) {
                console.error('Error fetching invoice:', err);
                setError(err.response?.data?.error || 'Failed to load invoice');
            } finally {
                setLoading(false);
            }
        };

        if (id) {
            fetchInvoice();
        } else {
            setLoading(false);
        }
    }, [id, location.state]);

    if (loading) {
        return <LoadingScreen message="Loading invoice..." />;
    }

    if (error) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ color: 'red' }}>{error}</p>
                <button onClick={() => window.location.href = '/dashboard'} className="back-btn">
                    Back to Dashboard
                </button>
            </div>
        );
    }

    return (
        <InvoiceEditor
            invoice={invoice}
            onSave={onSave}
            onCancel={onCancel}
            user={user}
        />
    );
};

// Main app content with routes
const AppContent = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [loading] = useState(false);

    // Set axios header whenever token changes
    useEffect(() => {
        if (token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        } else {
            delete axios.defaults.headers.common['Authorization'];
        }
    }, [token]);

    // Check for existing session on mount
    useEffect(() => {
        const savedToken = localStorage.getItem('token');
        const savedUser = localStorage.getItem('user');
        
        if (savedToken && savedUser) {
            setToken(savedToken);
            setUser(JSON.parse(savedUser));
        }
    }, []);

    const handleLogin = (userData, authToken) => {
        setUser(userData);
        setToken(authToken);
        // Save to localStorage
        localStorage.setItem('token', authToken);
        localStorage.setItem('user', JSON.stringify(userData));
        navigate('/dashboard');
    };

    const handleLogout = () => {
        setUser(null);
        setToken(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        delete axios.defaults.headers.common['Authorization'];
        navigate('/login');
    };

    const handleSaveInvoice = () => {
        navigate('/dashboard');
    };

    if (loading) {
        return <LoadingScreen message="Loading..." />;
    }

    return (
        <>
            <Routes>
                {/* Auth Routes */}
                <Route path="/login" element={
                    !user ? <Auth onLogin={handleLogin} /> : <Navigate to="/dashboard" />
                } />
                <Route path="/register" element={
                    !user ? <Auth onLogin={handleLogin} /> : <Navigate to="/dashboard" />
                } />
                
                {/* Dashboard Route */}
                <Route path="/dashboard" element={
                    <ProtectedRoute user={user}>
                        <Dashboard
                            user={user}
                            token={token}
                            onLogout={handleLogout}
                            onCreateNew={() => navigate('/invoice/new')}
                            onEditInvoice={(invoice) => navigate(`/invoice/edit/${invoice.id}`, { state: { invoice } })}
                            onShowAnalysis={() => navigate('/analysis')}
                            onShowMasterData={() => navigate('/master-data')}
                        />
                    </ProtectedRoute>
                } />
                
                {/* Invoice Editor Routes */}
                <Route path="/invoice/new" element={
                    <ProtectedRoute user={user}>
                        <InvoiceEditor
                            invoice={null}
                            onSave={handleSaveInvoice}
                            onCancel={() => navigate('/dashboard')}
                            user={user}
                        />
                    </ProtectedRoute>
                } />
                
                <Route path="/invoice/edit/:id" element={
                    <ProtectedRoute user={user}>
                        <EditInvoiceWrapper
                            user={user}
                            token={token}
                            onSave={handleSaveInvoice}
                            onCancel={() => navigate('/dashboard')}
                        />
                    </ProtectedRoute>
                } />
                
                {/* Data Analysis Route */}
                <Route path="/analysis" element={
                    <ProtectedRoute user={user}>
                        <DataAnalysis
                            user={user}
                            token={token}
                            onLogout={handleLogout}
                            onCreateNew={() => navigate('/invoice/new')}
                            onBack={() => navigate('/dashboard')}
                        />
                    </ProtectedRoute>
                } />
                
                {/* Master Data Route (Super Admin only) */}
                <Route path="/master-data" element={
                    <SuperAdminRoute user={user}>
                        <MasterData
                            user={user}
                            token={token}
                            onLogout={handleLogout}
                            onCreateNew={() => navigate('/invoice/new')}
                            onBack={() => navigate('/dashboard')}
                        />
                    </SuperAdminRoute>
                } />
                
                {/* Default redirect */}
                <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} />} />
                <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} />} />
            </Routes>
            <InvoiceChatbot user={user} />
        </>
    );
};

// Main App component with Router
function App() {
    return (
        <BrowserRouter>
            <AppContent />
        </BrowserRouter>
    );
}

export default App;