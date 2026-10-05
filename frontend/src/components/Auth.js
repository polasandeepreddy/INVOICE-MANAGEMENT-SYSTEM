import React, { useState, useEffect } from 'react';
import axios from 'axios';

import { API_BASE_URL } from '../config';

// Configure axios globally - DO THIS OUTSIDE COMPONENT
axios.defaults.baseURL = API_BASE_URL;
axios.defaults.withCredentials = true;
axios.defaults.headers.common['Content-Type'] = 'application/json';

// Admin email - must match the backend
const ADMIN_EMAIL = 'jayaramaassociates.info@gmail.com';

const Auth = ({ onLogin }) => {
    const [mode, setMode] = useState('login');

    // Login fields
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // Signup fields
    const [fullName, setFullName] = useState('');
    const [username, setUsername] = useState('');
    const [emailSignup, setEmailSignup] = useState('');
    const [passwordSignup, setPasswordSignup] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Step 1: User Email OTP Verification fields
    const [userEmailOtp, setUserEmailOtp] = useState(['', '', '', '', '', '']);
    const [userEmailOtpSent, setUserEmailOtpSent] = useState(false);
    const [isEmailVerified, setIsEmailVerified] = useState(false);
    const [emailOtpLoading, setEmailOtpLoading] = useState(false);
    const [emailResendCooldown, setEmailResendCooldown] = useState(0);

    // Step 3: Admin Approval OTP fields
    const [adminOtp, setAdminOtp] = useState(['', '', '', '', '', '']);
    const [adminOtpSent, setAdminOtpSent] = useState(false);
    const [adminOtpVerified, setAdminOtpVerified] = useState(false);
    const [adminOtpLoading, setAdminOtpLoading] = useState(false);
    const [adminResendCooldown, setAdminResendCooldown] = useState(0);
    const [signupData, setSignupData] = useState(null);

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    // Cooldown timers
    useEffect(() => {
        let timer;
        if (emailResendCooldown > 0) {
            timer = setTimeout(() => {
                setEmailResendCooldown(emailResendCooldown - 1);
            }, 1000);
        }
        return () => clearTimeout(timer);
    }, [emailResendCooldown]);

    useEffect(() => {
        let timer;
        if (adminResendCooldown > 0) {
            timer = setTimeout(() => {
                setAdminResendCooldown(adminResendCooldown - 1);
            }, 1000);
        }
        return () => clearTimeout(timer);
    }, [adminResendCooldown]);

    // Auto-clear messages after 5 seconds
    useEffect(() => {
        if (successMessage || error) {
            const timer = setTimeout(() => {
                setSuccessMessage('');
                if (!adminOtpSent && !userEmailOtpSent) setError('');
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [successMessage, error, adminOtpSent, userEmailOtpSent]);

    // Username validation pattern
    const validateUsername = (username) => {
        const usernameRegex = /^[A-Z][A-Za-z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]*$/;

        if (!username || !username.trim()) {
            return { valid: false, message: 'Username is required' };
        }

        if (username.length < 2) {
            return { valid: false, message: 'Username must be at least 2 characters' };
        }

        if (username.length > 30) {
            return { valid: false, message: 'Username must be less than 30 characters' };
        }

        if (!usernameRegex.test(username)) {
            return {
                valid: false,
                message: 'Username must start with a capital letter, followed by letters, numbers, or symbols (e.g., Sandeep@123)'
            };
        }

        return { valid: true, message: '' };
    };

    // Email validation pattern: supports all standard domains (gmail.com, yahoo.com, .co.in, corporate domains, subdomains, etc.)
    // Explicitly rejects invalid random text without valid domain / @ (e.g., 'bhsdfebfjh.uihjhjbhudsiufhie')
    const validateEmail = (emailToTest) => {
        if (!emailToTest || !emailToTest.trim()) {
            return { valid: false, message: 'A valid email ID is required' };
        }

        const trimmed = emailToTest.trim();
        const emailRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

        if (!emailRegex.test(trimmed)) {
            return {
                valid: false,
                message: 'A valid email ID is required (e.g., name@gmail.com, name@yahoo.co.in, user@company.com)'
            };
        }

        return { valid: true, message: '' };
    };

    // Validate details before sending User Email OTP
    const validateForEmailOtp = () => {
        if (!fullName || !fullName.trim()) {
            setError('Full name is required');
            return false;
        }

        if (fullName.trim().length < 3) {
            setError('Full name must be at least 3 characters');
            return false;
        }

        if (fullName.trim().length > 50) {
            setError('Full name must be less than 50 characters');
            return false;
        }

        const usernameValidation = validateUsername(username);
        if (!usernameValidation.valid) {
            setError(usernameValidation.message);
            return false;
        }

        const emailValidation = validateEmail(emailSignup);
        if (!emailValidation.valid) {
            setError(emailValidation.message);
            return false;
        }

        return true;
    };

    // Validate passwords before requesting admin approval
    const validateForAdminApproval = () => {
        if (!isEmailVerified) {
            setError('Please verify your email address first');
            return false;
        }

        if (!passwordSignup) {
            setError('Password is required');
            return false;
        }

        if (passwordSignup.length < 6) {
            setError('Password must be at least 6 characters');
            return false;
        }

        if (passwordSignup.length > 50) {
            setError('Password must be less than 50 characters');
            return false;
        }

        if (!confirmPassword) {
            setError('Please confirm your password');
            return false;
        }

        if (passwordSignup !== confirmPassword) {
            setError('Passwords do not match');
            return false;
        }

        return true;
    };

    const validateLogin = () => {
        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
            setError(emailValidation.message);
            return false;
        }

        if (!password) {
            setError('Password is required');
            return false;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return false;
        }

        return true;
    };

    // ============= STEP 1: SEND & VERIFY USER EMAIL OTP =============

    // Send OTP to User's Email
    const handleSendUserEmailOTP = async () => {
        if (!validateForEmailOtp()) {
            return;
        }

        setEmailOtpLoading(true);
        setError('');
        setSuccessMessage('');

        try {
            const response = await axios.post('/api/auth/send-user-email-otp', {
                fullName: fullName.trim(),
                username: username.trim(),
                email: emailSignup.trim()
            });

            if (response.data.success) {
                setUserEmailOtpSent(true);
                setUserEmailOtp(['', '', '', '', '', '']);
                setSuccessMessage(`📧 Verification OTP sent to ${emailSignup.trim()}! Please enter the 6-digit code below.`);
                setEmailResendCooldown(60);
            } else {
                setError(response.data.message || 'Failed to send OTP to your email');
            }
        } catch (err) {
            console.error('Send User Email OTP error:', err);
            if (err.response) {
                setError(err.response.data?.message || err.response.data?.error || 'Failed to send OTP to your email');
            } else if (err.request) {
                setError('Cannot connect to server. Please check if backend is running on port 5000.');
            } else {
                setError('An error occurred. Please try again.');
            }
        } finally {
            setEmailOtpLoading(false);
        }
    };

    // Handle User Email OTP digit input
    const handleUserOtpChange = (index, value) => {
        if (value.length <= 1 && /^\d*$/.test(value)) {
            const newOtp = [...userEmailOtp];
            newOtp[index] = value;
            setUserEmailOtp(newOtp);

            // Auto-focus next input
            if (value && index < 5) {
                const nextInput = document.getElementById(`user-otp-input-${index + 1}`);
                if (nextInput) nextInput.focus();
            }
        }
    };

    // Handle User Email OTP paste
    const handleUserOtpPaste = (e) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').slice(0, 6);
        if (/^\d{6}$/.test(pastedData)) {
            const otpArray = pastedData.split('');
            setUserEmailOtp(otpArray);
        }
    };

    // Verify User Email OTP
    const handleVerifyUserEmailOTP = async () => {
        const otpString = userEmailOtp.join('');
        if (otpString.length !== 6) {
            setError('Please enter a valid 6-digit OTP received in your email');
            return;
        }

        setEmailOtpLoading(true);
        setError('');

        try {
            const response = await axios.post('/api/auth/verify-user-email-otp', {
                email: emailSignup.trim(),
                otp: otpString
            });

            if (response.data.success) {
                setIsEmailVerified(true);
                setUserEmailOtpSent(false);
                setSuccessMessage('✓ Email verified successfully! You can now set your password below.');
            } else {
                setError(response.data.message || 'Invalid OTP');
            }
        } catch (err) {
            console.error('Verify User Email OTP error:', err);
            if (err.response) {
                setError(err.response.data?.message || 'OTP verification failed');
            } else {
                setError('An error occurred. Please try again.');
            }
        } finally {
            setEmailOtpLoading(false);
        }
    };

    // Reset email verification to change email
    const handleChangeEmail = () => {
        setIsEmailVerified(false);
        setUserEmailOtpSent(false);
        setUserEmailOtp(['', '', '', '', '', '']);
        setPasswordSignup('');
        setConfirmPassword('');
        setError('');
        setSuccessMessage('You can now edit your email address.');
    };

    // ============= STEP 3: REQUEST ADMIN APPROVAL & VERIFY ADMIN OTP =============

    // Send OTP to Super Admin Email
    const handleRequestAdminApproval = async () => {
        if (!validateForAdminApproval()) {
            return;
        }

        setAdminOtpLoading(true);
        setError('');
        setSuccessMessage('');

        try {
            const response = await axios.post('/api/auth/send-otp', {
                adminEmail: ADMIN_EMAIL,
                userEmail: emailSignup.trim(),
                fullName: fullName.trim(),
                username: username.trim()
            });

            if (response.data.success) {
                setAdminOtpSent(true);
                setSuccessMessage(`🛡️ Registration approval request sent to administrator! Please get the Admin OTP from the administrator.`);
                setAdminResendCooldown(60);

                // Store signup data temporarily
                setSignupData({
                    fullName: fullName.trim(),
                    username: username.trim(),
                    email: emailSignup.trim(),
                    password: passwordSignup
                });
            } else {
                setError(response.data.message || 'Failed to send registration request to admin');
            }
        } catch (err) {
            console.error('Send Admin OTP error:', err);
            if (err.response) {
                setError(err.response.data?.message || err.response.data?.error || 'Failed to send registration request');
            } else if (err.request) {
                setError('Cannot connect to server. Please check if backend is running on port 5000.');
            } else {
                setError('An error occurred. Please try again.');
            }
        } finally {
            setAdminOtpLoading(false);
        }
    };

    // Handle Admin OTP digit input
    const handleAdminOtpChange = (index, value) => {
        if (value.length <= 1 && /^\d*$/.test(value)) {
            const newOtp = [...adminOtp];
            newOtp[index] = value;
            setAdminOtp(newOtp);

            // Auto-focus next input
            if (value && index < 5) {
                const nextInput = document.getElementById(`admin-otp-input-${index + 1}`);
                if (nextInput) nextInput.focus();
            }
        }
    };

    // Handle Admin OTP paste
    const handleAdminOtpPaste = (e) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').slice(0, 6);
        if (/^\d{6}$/.test(pastedData)) {
            const otpArray = pastedData.split('');
            setAdminOtp(otpArray);
        }
    };

    // Verify Admin OTP
    const handleVerifyAdminOTP = async () => {
        const otpString = adminOtp.join('');
        if (otpString.length !== 6) {
            setError('Please enter the 6-digit Admin OTP provided by the administrator');
            return;
        }

        setAdminOtpLoading(true);
        setError('');

        try {
            const response = await axios.post('/api/auth/verify-otp', {
                adminEmail: ADMIN_EMAIL,
                otp: otpString,
                userEmail: emailSignup.trim()
            });

            if (response.data.success) {
                setAdminOtpVerified(true);
                setSuccessMessage('✓ Admin OTP verified successfully! Creating your account...');
                await completeSignup();
            } else {
                setError(response.data.message || 'Invalid Admin OTP');
            }
        } catch (err) {
            console.error('Verify Admin OTP error:', err);
            if (err.response) {
                setError(err.response.data?.message || 'Admin OTP verification failed');
            } else {
                setError('An error occurred. Please try again.');
            }
        } finally {
            setAdminOtpLoading(false);
        }
    };

    // Complete signup after Admin OTP verification
    const completeSignup = async () => {
        setLoading(true);

        try {
            const payload = signupData || {
                fullName: fullName.trim(),
                username: username.trim(),
                email: emailSignup.trim(),
                password: passwordSignup
            };

            const response = await axios.post('/api/auth/signup', {
                ...payload,
                otpVerified: true
            });

            if (response.data && response.data.token) {
                const { user, token } = response.data;

                localStorage.setItem('token', token);
                localStorage.setItem('user', JSON.stringify(user));

                axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

                onLogin(user, token);
            } else if (response.data && response.data.success) {
                onLogin(response.data.user, response.data.token);
            } else {
                setError(response.data?.error || response.data?.message || 'Signup failed');
            }
        } catch (err) {
            console.error('Signup error:', err);

            if (err.response) {
                setError(err.response.data?.error || err.response.data?.message || 'Signup failed');
            } else if (err.request) {
                setError('Cannot connect to server. Please make sure the backend is running on port 5000');
            } else {
                setError('An error occurred. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    // Real-time checks on blur
    const handleCheckUsernameBlur = async () => {
        if (!username || !username.trim()) return;
        const validation = validateUsername(username);
        if (!validation.valid) return;

        try {
            const res = await axios.post('/api/auth/check-user-exists', { username: username.trim() });
            if (res.data && res.data.exists && res.data.field === 'username') {
                setError(res.data.message || 'This username already exists');
            } else if (error === 'This username already exists') {
                setError('');
            }
        } catch (err) {
            console.error('Check username error:', err);
        }
    };

    const handleCheckEmailBlur = async () => {
        if (!emailSignup || !emailSignup.trim()) return;
        const emailValidation = validateEmail(emailSignup);
        if (!emailValidation.valid) {
            setError(emailValidation.message);
            return;
        }

        try {
            const res = await axios.post('/api/auth/check-user-exists', { email: emailSignup.trim() });
            if (res.data && res.data.exists && res.data.field === 'email') {
                setError(res.data.message || 'This email ID already exists');
            } else if (error === 'This email ID already exists' || (error && error.includes('valid email ID'))) {
                setError('');
            }
        } catch (err) {
            console.error('Check email error:', err);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (mode === 'login') {
            if (!validateLogin()) {
                return;
            }
            await handleLogin();
        }
    };

    const handleLogin = async () => {
        setLoading(true);

        try {
            const response = await axios.post('/api/auth/login', {
                email: email.trim(),
                password
            });

            if (response.data && response.data.token) {
                const { user, token } = response.data;

                localStorage.setItem('token', token);
                localStorage.setItem('user', JSON.stringify(user));

                axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

                onLogin(user, token);
            } else if (response.data && response.data.success) {
                onLogin(response.data.user, response.data.token);
            } else {
                setError(response.data?.error || response.data?.message || 'Authentication failed');
            }
        } catch (err) {
            console.error('Auth error:', err);

            if (err.response) {
                setError(err.response.data?.error || err.response.data?.message || 'Authentication failed');
            } else if (err.request) {
                setError('Cannot connect to server. Please make sure the backend is running on port 5000');
            } else {
                setError('An error occurred. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    const switchMode = () => {
        setMode(mode === 'login' ? 'signup' : 'login');
        setError('');
        setSuccessMessage('');
        setEmail('');
        setPassword('');
        setFullName('');
        setUsername('');
        setEmailSignup('');
        setPasswordSignup('');
        setConfirmPassword('');
        setUserEmailOtp(['', '', '', '', '', '']);
        setUserEmailOtpSent(false);
        setIsEmailVerified(false);
        setAdminOtp(['', '', '', '', '', '']);
        setAdminOtpSent(false);
        setAdminOtpVerified(false);
        setSignupData(null);
        setEmailResendCooldown(0);
        setAdminResendCooldown(0);
    };

    // Styles
    const styles = {
        container: {
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            padding: '20px',
            fontFamily: 'Arial, sans-serif'
        },
        card: {
            background: 'white',
            borderRadius: '15px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
            padding: mode === 'signup' ? '25px' : '30px',
            width: '100%',
            maxWidth: mode === 'signup' ? '680px' : '380px',
            transition: 'all 0.3s ease'
        },
        logo: {
            textAlign: 'center',
            marginBottom: '15px',
            userSelect: 'none',
            WebkitUserSelect: 'none'
        },
        logoImage: {
            width: '140px',
            height: 'auto',
            marginBottom: '10px',
            display: 'block',
            margin: '0 auto 10px auto',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitUserDrag: 'none',
            pointerEvents: 'none'
        },
        tabBar: {
            display: 'flex',
            gap: '8px',
            marginBottom: '18px',
            background: '#f1f5f9',
            padding: '4px',
            borderRadius: '8px'
        },
        tabBtn: {
            flex: 1,
            padding: '8px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            borderRadius: '6px',
            transition: 'all 0.3s ease',
            color: '#64748b'
        },
        tabBtnActive: {
            background: 'white',
            color: '#0072bc',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        },
        stepsBar: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '18px',
            padding: '10px 14px',
            background: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            fontSize: '12px',
            fontWeight: '600'
        },
        stepItem: (active, completed) => ({
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            color: completed ? '#16a34a' : active ? '#0072bc' : '#94a3b8',
            fontWeight: active || completed ? 'bold' : 'normal'
        }),
        errorBox: {
            background: '#fee2e2',
            color: '#dc2626',
            padding: '10px 14px',
            borderRadius: '6px',
            marginBottom: '15px',
            fontSize: '13px',
            borderLeft: '4px solid #dc2626'
        },
        successBox: {
            background: '#dcfce7',
            color: '#15803d',
            padding: '10px 14px',
            borderRadius: '6px',
            marginBottom: '15px',
            fontSize: '13px',
            borderLeft: '4px solid #15803d'
        },
        formRow: {
            display: 'flex',
            gap: '15px',
            marginBottom: '12px',
            flexWrap: 'wrap'
        },
        formGroup: {
            flex: 1,
            minWidth: '220px'
        },
        formGroupFull: {
            marginBottom: '14px'
        },
        label: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '5px',
            fontWeight: '600',
            color: '#334155',
            fontSize: '12px'
        },
        input: {
            width: '100%',
            padding: '9px 12px',
            border: '1.5px solid #cbd5e1',
            borderRadius: '6px',
            fontSize: '13px',
            transition: 'border-color 0.2s ease, background-color 0.2s ease',
            boxSizing: 'border-box',
            outline: 'none'
        },
        inputVerified: {
            borderColor: '#86efac',
            backgroundColor: '#f0fdf4',
            color: '#15803d',
            fontWeight: '500'
        },
        smallText: {
            fontSize: '11px',
            color: '#64748b',
            marginTop: '3px',
            display: 'block'
        },
        button: {
            width: '100%',
            padding: '11px',
            background: 'linear-gradient(135deg, #0072bc 0%, #005691 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            marginTop: '15px'
        },
        buttonDisabled: {
            opacity: 0.6,
            cursor: 'not-allowed'
        },
        buttonSecondary: {
            background: '#e2e8f0',
            color: '#334155',
            marginTop: '10px'
        },
        buttonOutline: {
            padding: '8px 14px',
            background: '#0072bc',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'background 0.2s ease'
        },
        switchText: {
            textAlign: 'center',
            marginTop: '15px',
            fontSize: '13px',
            color: '#64748b'
        },
        switchLink: {
            background: 'none',
            border: 'none',
            color: '#0072bc',
            cursor: 'pointer',
            textDecoration: 'underline',
            fontSize: '13px',
            fontWeight: '600'
        },
        otpBox: {
            marginTop: '12px',
            padding: '14px',
            background: '#f8fafc',
            borderRadius: '8px',
            border: '1.5px solid #cbd5e1'
        },
        otpInputGroup: {
            display: 'flex',
            gap: '8px',
            justifyContent: 'center',
            marginBottom: '15px',
            flexWrap: 'wrap'
        },
        otpInput: {
            width: '45px',
            height: '48px',
            textAlign: 'center',
            fontSize: '20px',
            fontWeight: 'bold',
            border: '2px solid #cbd5e1',
            borderRadius: '8px',
            outline: 'none',
            transition: 'border-color 0.2s ease'
        },
        passwordSectionLocked: {
            marginTop: '15px',
            padding: '15px',
            background: '#f1f5f9',
            borderRadius: '8px',
            border: '1.5px dashed #cbd5e1',
            opacity: 0.75,
            transition: 'all 0.3s ease'
        },
        passwordSectionUnlocked: {
            marginTop: '15px',
            padding: '15px',
            background: '#ffffff',
            borderRadius: '8px',
            border: '1.5px solid #93c5fd',
            boxShadow: '0 2px 8px rgba(0, 114, 188, 0.08)',
            transition: 'all 0.3s ease'
        },
        lockBadge: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '12px',
            fontWeight: 'bold',
            padding: '3px 8px',
            borderRadius: '4px',
            background: '#fee2e2',
            color: '#b91c1c',
            marginBottom: '10px'
        },
        unlockBadge: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '12px',
            fontWeight: 'bold',
            padding: '3px 8px',
            borderRadius: '4px',
            background: '#dcfce7',
            color: '#15803d',
            marginBottom: '10px'
        },
        verifiedBadge: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            fontWeight: 'bold',
            color: '#16a34a',
            background: '#dcfce7',
            padding: '2px 6px',
            borderRadius: '4px'
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <div style={styles.logo} onContextMenu={(e) => e.preventDefault()}>
                    <img
                        src="/JAYARAMA LOGO1.png"
                        alt="Jayarama Logo"
                        style={styles.logoImage}
                        draggable="false"
                        onContextMenu={(e) => e.preventDefault()}
                        onDragStart={(e) => e.preventDefault()}
                    />
                </div>

                <div style={styles.tabBar}>
                    <button
                        style={{ ...styles.tabBtn, ...(mode === 'login' ? styles.tabBtnActive : {}) }}
                        onClick={() => switchMode()}
                        type="button"
                    >
                        Login
                    </button>
                    <button
                        style={{ ...styles.tabBtn, ...(mode === 'signup' ? styles.tabBtnActive : {}) }}
                        onClick={() => switchMode()}
                        type="button"
                    >
                        Sign Up
                    </button>
                </div>

                {error && (
                    <div style={styles.errorBox}>
                        ⚠️ {error}
                    </div>
                )}

                {successMessage && !error && (
                    <div style={styles.successBox}>
                        {successMessage}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    {mode === 'signup' ? (
                        <>
                            {/* Steps Indicator for Signup */}
                            <div style={styles.stepsBar}>
                                <span style={styles.stepItem(!isEmailVerified, isEmailVerified)}>
                                    {isEmailVerified ? '✓ 1. Email Verified' : '1. Verify Email'}
                                </span>
                                <span style={{ color: '#cbd5e1' }}>➔</span>
                                <span style={styles.stepItem(isEmailVerified && !adminOtpSent, adminOtpSent)}>
                                    {adminOtpSent ? '✓ 2. Password Set' : '2. Set Password'}
                                </span>
                                <span style={{ color: '#cbd5e1' }}>➔</span>
                                <span style={styles.stepItem(adminOtpSent, adminOtpVerified)}>
                                    3. Admin Approval
                                </span>
                            </div>

                            {!adminOtpSent ? (
                                <>
                                    {/* SECTION 1: USER DETAILS & EMAIL VERIFICATION */}
                                    <div style={styles.formRow}>
                                        <div style={styles.formGroup}>
                                            <label style={styles.label}>Full Name *</label>
                                            <input
                                                type="text"
                                                style={styles.input}
                                                
                                                value={fullName}
                                                onChange={(e) => setFullName(e.target.value)}
                                                disabled={loading || emailOtpLoading || isEmailVerified}
                                                required
                                            />
                                            <small style={styles.smallText}>Min 3 characters</small>
                                        </div>

                                        <div style={styles.formGroup}>
                                            <label style={styles.label}>Username *</label>
                                            <input
                                                type="text"
                                                style={styles.input}
                                              
                                                value={username}
                                                onChange={(e) => setUsername(e.target.value)}
                                                onBlur={handleCheckUsernameBlur}
                                                disabled={loading || emailOtpLoading || isEmailVerified}
                                                required
                                            />
                                            <small style={styles.smallText}>
                                                Capital 1st letter + alphanumeric/symbols
                                            </small>
                                        </div>
                                    </div>

                                    {/* Email Address & Get OTP Row */}
                                    <div style={styles.formGroupFull}>
                                        <label style={styles.label}>
                                            <span>Email Address *</span>
                                            {isEmailVerified && (
                                                <span style={styles.verifiedBadge}>✓ Email Verified</span>
                                            )}
                                        </label>

                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <input
                                                type="email"
                                                style={{
                                                    ...styles.input,
                                                    ...(isEmailVerified ? styles.inputVerified : {})
                                                }}
                                                placeholder="you@example.com"
                                                value={emailSignup}
                                                onChange={(e) => {
                                                    setEmailSignup(e.target.value);
                                                    if (error === 'This email ID already exists') setError('');
                                                }}
                                                onBlur={handleCheckEmailBlur}
                                                disabled={loading || emailOtpLoading || isEmailVerified}
                                                required
                                            />

                                            {!isEmailVerified ? (
                                                <button
                                                    type="button"
                                                    style={{
                                                        ...styles.buttonOutline,
                                                        ...((emailOtpLoading || emailResendCooldown > 0) ? styles.buttonDisabled : {})
                                                    }}
                                                    onClick={handleSendUserEmailOTP}
                                                    disabled={emailOtpLoading || emailResendCooldown > 0}
                                                >
                                                    {emailOtpLoading
                                                        ? 'Sending...'
                                                        : emailResendCooldown > 0
                                                        ? `Resend (${emailResendCooldown}s)`
                                                        : userEmailOtpSent
                                                        ? 'Resend OTP'
                                                        : 'Get OTP'}
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    style={{
                                                        ...styles.buttonOutline,
                                                        background: '#64748b',
                                                        fontSize: '11px',
                                                        padding: '6px 10px'
                                                    }}
                                                    onClick={handleChangeEmail}
                                                >
                                                    Change Email
                                                </button>
                                            )}
                                        </div>
                                        <small style={styles.smallText}>
                                            {isEmailVerified
                                                ? 'Email verified. You can now set your password below.'
                                                : 'Click "Get OTP" to receive a 6-digit verification code in your email.'}
                                        </small>
                                    </div>

                                    {/* Inline User Email OTP Verification Box */}
                                    {userEmailOtpSent && !isEmailVerified && (
                                        <div style={styles.otpBox}>
                                            <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#0072bc', marginBottom: '8px', textAlign: 'center' }}>
                                                📩 Enter 6-Digit Code Sent to Your Email
                                            </div>
                                            <div style={styles.otpInputGroup}>
                                                {userEmailOtp.map((digit, index) => (
                                                    <input
                                                        key={index}
                                                        id={`user-otp-input-${index}`}
                                                        type="text"
                                                        style={styles.otpInput}
                                                        maxLength="1"
                                                        value={digit}
                                                        onChange={(e) => handleUserOtpChange(index, e.target.value)}
                                                        onPaste={index === 0 ? handleUserOtpPaste : undefined}
                                                        disabled={emailOtpLoading}
                                                        autoFocus={index === 0}
                                                    />
                                                ))}
                                            </div>

                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <button
                                                    type="button"
                                                    style={{
                                                        ...styles.button,
                                                        marginTop: 0,
                                                        flex: 1,
                                                        ...(emailOtpLoading ? styles.buttonDisabled : {})
                                                    }}
                                                    onClick={handleVerifyUserEmailOTP}
                                                    disabled={emailOtpLoading}
                                                >
                                                    {emailOtpLoading ? 'Verifying OTP...' : '✓ Verify Email OTP'}
                                                </button>

                                                <button
                                                    type="button"
                                                    style={{
                                                        ...styles.button,
                                                        ...styles.buttonSecondary,
                                                        marginTop: 0,
                                                        flex: 1,
                                                        ...(emailResendCooldown > 0 ? styles.buttonDisabled : {})
                                                    }}
                                                    onClick={handleSendUserEmailOTP}
                                                    disabled={emailResendCooldown > 0 || emailOtpLoading}
                                                >
                                                    {emailResendCooldown > 0
                                                        ? `Resend in ${emailResendCooldown}s`
                                                        : 'Resend OTP'}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* SECTION 2: PASSWORD CREATION (ONLY SHOWN ONCE EMAIL IS VERIFIED) */}
                                    {isEmailVerified && (
                                        <div style={styles.passwordSectionUnlocked}>
                                            <div style={styles.unlockBadge}>
                                                🔓 Step 2: Set Your Password
                                            </div>

                                            <div style={styles.formRow}>
                                                <div style={styles.formGroup}>
                                                    <label style={styles.label}>Password *</label>
                                                    <input
                                                        type="password"
                                                        style={styles.input}
                                                        placeholder="••••••••"
                                                        value={passwordSignup}
                                                        onChange={(e) => setPasswordSignup(e.target.value)}
                                                        disabled={loading || adminOtpLoading}
                                                        required
                                                        autoComplete="new-password"
                                                    />
                                                    <small style={styles.smallText}>Min 6 characters</small>
                                                </div>

                                                <div style={styles.formGroup}>
                                                    <label style={styles.label}>Confirm Password *</label>
                                                    <input
                                                        type="password"
                                                        style={styles.input}
                                                        placeholder="••••••••"
                                                        value={confirmPassword}
                                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                                        disabled={loading || adminOtpLoading}
                                                        required
                                                        autoComplete="new-password"
                                                    />
                                                    <small style={{
                                                        ...styles.smallText,
                                                        color: confirmPassword && passwordSignup === confirmPassword
                                                            ? '#16a34a'
                                                            : confirmPassword && passwordSignup !== confirmPassword
                                                            ? '#dc2626'
                                                            : '#64748b'
                                                    }}>
                                                        {confirmPassword && passwordSignup === confirmPassword
                                                            ? '✓ Passwords match'
                                                            : confirmPassword && passwordSignup !== confirmPassword
                                                            ? '⚠️ Passwords do not match'
                                                            : 'Re-enter password'}
                                                    </small>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                style={{
                                                    ...styles.button,
                                                    ...((!passwordSignup || passwordSignup !== confirmPassword || passwordSignup.length < 6 || adminOtpLoading)
                                                        ? styles.buttonDisabled
                                                        : {})
                                                }}
                                                onClick={handleRequestAdminApproval}
                                                disabled={!passwordSignup || passwordSignup !== confirmPassword || passwordSignup.length < 6 || adminOtpLoading}
                                            >
                                                {adminOtpLoading ? 'Sending Admin Request...' : '🛡️ Request Admin Approval'}
                                            </button>
                                        </div>
                                    )}
                                </>
                            ) : !adminOtpVerified ? (
                                /* SECTION 3: SUPER ADMIN APPROVAL OTP SCREEN */
                                <div style={styles.otpBox}>
                                    <div style={{
                                        background: '#1e293b',
                                        color: 'white',
                                        padding: '12px 16px',
                                        borderRadius: '8px',
                                        marginBottom: '15px',
                                        textAlign: 'center'
                                    }}>
                                        <h3 style={{ margin: 0, fontSize: '15px' }}>🛡️ Step 3: Super Admin Approval</h3>
                                        <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                                            An approval OTP has been sent to the Super Administrator's email.
                                        </p>
                                    </div>

                                    <div style={styles.formGroupFull}>
                                        <label style={styles.label}>Enter Admin Approval OTP</label>
                                        <div style={styles.otpInputGroup}>
                                            {adminOtp.map((digit, index) => (
                                                <input
                                                    key={index}
                                                    id={`admin-otp-input-${index}`}
                                                    type="text"
                                                    style={styles.otpInput}
                                                    maxLength="1"
                                                    value={digit}
                                                    onChange={(e) => handleAdminOtpChange(index, e.target.value)}
                                                    onPaste={index === 0 ? handleAdminOtpPaste : undefined}
                                                    disabled={loading || adminOtpLoading}
                                                    autoFocus={index === 0}
                                                />
                                            ))}
                                        </div>
                                        <small style={{ ...styles.smallText, textAlign: 'center' }}>
                                            Enter the 6-digit approval code provided by the administrator
                                        </small>
                                    </div>

                                    <button
                                        type="button"
                                        style={{
                                            ...styles.button,
                                            ...((loading || adminOtpLoading) ? styles.buttonDisabled : {})
                                        }}
                                        onClick={handleVerifyAdminOTP}
                                        disabled={loading || adminOtpLoading}
                                    >
                                        {adminOtpLoading ? 'Verifying Admin OTP...' : 'Verify Admin OTP & Complete Registration'}
                                    </button>

                                    <button
                                        type="button"
                                        style={{
                                            ...styles.button,
                                            ...styles.buttonSecondary,
                                            ...(adminResendCooldown > 0 ? styles.buttonDisabled : {})
                                        }}
                                        onClick={handleRequestAdminApproval}
                                        disabled={adminResendCooldown > 0 || adminOtpLoading}
                                    >
                                        {adminResendCooldown > 0
                                            ? `Resend Request to Admin in ${adminResendCooldown}s`
                                            : 'Resend Request to Admin'}
                                    </button>

                                    <button
                                        type="button"
                                        style={{
                                            ...styles.switchLink,
                                            display: 'block',
                                            marginTop: '12px',
                                            textAlign: 'center'
                                        }}
                                        onClick={() => {
                                            setAdminOtpSent(false);
                                            setAdminOtp(['', '', '', '', '', '']);
                                            setError('');
                                            setSuccessMessage('');
                                        }}
                                    >
                                        ← Back to signup form
                                    </button>
                                </div>
                            ) : (
                                <div style={styles.otpBox}>
                                    <div style={styles.successBox}>
                                        ✓ Admin approval confirmed! Setting up your account...
                                    </div>
                                    <div style={{ textAlign: 'center', padding: '15px' }}>
                                        <div>Please wait while we finalize your account</div>
                                        {loading && <div style={{ marginTop: '10px', color: '#0072bc', fontWeight: 'bold' }}>Logging in...</div>}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        /* LOGIN FORM */
                        <>
                            <div style={styles.formGroupFull}>
                                <label style={styles.label}>Email Address *</label>
                                <input
                                    type="email"
                                    style={styles.input}
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={loading}
                                    required
                                />
                            </div>

                            <div style={styles.formGroupFull}>
                                <label style={styles.label}>Password *</label>
                                <input
                                    type="password"
                                    style={styles.input}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={loading}
                                    required
                                />
                                <small style={styles.smallText}>Minimum 6 characters</small>
                            </div>

                            <button
                                type="submit"
                                style={{
                                    ...styles.button,
                                    ...(loading ? styles.buttonDisabled : {})
                                }}
                                disabled={loading}
                            >
                                {loading ? 'Please wait...' : 'Login'}
                            </button>
                        </>
                    )}
                </form>

                {mode === 'signup' && !adminOtpSent && (
                    <p style={styles.switchText}>
                        Already have an account?{' '}
                        <button
                            onClick={switchMode}
                            style={styles.switchLink}
                            type="button"
                        >
                            Login
                        </button>
                    </p>
                )}
            </div>
        </div>
    );
};

export default Auth;