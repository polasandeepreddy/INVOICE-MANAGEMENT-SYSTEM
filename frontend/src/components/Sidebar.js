import React, { useState, useEffect, useRef } from 'react';

const Sidebar = ({ user, onLogout, onCreateNew, userRole, onMasterData }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isPinned, setIsPinned] = useState(false);
    const sidebarRef = useRef(null);
    const hideTimeoutRef = useRef(null);

    // Admin and Super Admin should have hidden sidebar until hover at left edge
    const isPrivileged = userRole === 'admin' || userRole === 'super_admin';

    // Handle mouse movement near left edge - ONLY FOR ADMIN / SUPER ADMIN
    useEffect(() => {
        if (!isPrivileged) return; // Only apply hover effects for admin and super admin

        const handleMouseMove = (e) => {
            // If sidebar is pinned, don't auto-hide
            if (isPinned) return;

            // Check if mouse is within 20px of left edge
            if (e.clientX <= 20 && !isVisible) {
                // Clear any pending hide timeout
                if (hideTimeoutRef.current) {
                    clearTimeout(hideTimeoutRef.current);
                    hideTimeoutRef.current = null;
                }
                setIsVisible(true);
            }
        };

        window.addEventListener('mousemove', handleMouseMove);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
        };
    }, [isVisible, isPinned, isPrivileged]);

    // Handle mouse enter on sidebar - ONLY FOR ADMIN / SUPER ADMIN
    const handleMouseEnter = () => {
        if (!isPrivileged) return;

        // Clear any pending hide timeout
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        }
    };

    // Handle mouse leave from sidebar - ONLY FOR ADMIN / SUPER ADMIN
    const handleMouseLeave = () => {
        if (!isPrivileged) return;

        // Don't auto-hide if pinned
        if (isPinned) return;

        // Set timeout to hide sidebar after mouse leaves
        hideTimeoutRef.current = setTimeout(() => {
            setIsVisible(false);
            hideTimeoutRef.current = null;
        }, 300);
    };

    const togglePin = () => {
        if (!isPrivileged) return; // Only admin and super admin can pin/unpin

        setIsPinned(!isPinned);
        if (!isPinned) {
            // When pinning, make sure sidebar is visible
            setIsVisible(true);
            // Clear any pending hide timeout
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
                hideTimeoutRef.current = null;
            }
        }
    };

    // Handle logout to ensure sidebar doesn't hide before execution
    const handleLogout = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Clear any pending hide timeout
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        }
        // Execute logout
        onLogout();
    };

    // Handle create new invoice
    const handleCreateNew = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Clear any pending hide timeout
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        }
        // Execute create new
        onCreateNew();
    };

    // Handle master data navigation
    const handleMasterData = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Clear any pending hide timeout
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        }
        // Execute master data navigation
        if (onMasterData) {
            onMasterData();
        }
    };

    // For non-privileged users - render static sidebar (always visible)
    if (!isPrivileged) {
        return (
            <aside className="sidebar sidebar-static">
                <div className="sb-header">
                    <div className="sb-brand" onContextMenu={(e) => e.preventDefault()}>
                        <img
                            src="JAYARAMA LOGO1.png"
                            alt="Jayarama Logo"
                            className="company-logo"
                            draggable="false"
                            onContextMenu={(e) => e.preventDefault()}
                            onDragStart={(e) => e.preventDefault()}
                            style={{
                                userSelect: 'none',
                                WebkitUserSelect: 'none',
                                WebkitUserDrag: 'none',
                                pointerEvents: 'none'
                            }}
                        />
                    </div>

                    <nav>
                        <button className="nav-btn active">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="7" height="7" />
                                <rect x="14" y="3" width="7" height="7" />
                                <rect x="14" y="14" width="7" height="7" />
                                <rect x="3" y="14" width="7" height="7" />
                            </svg>
                            Dashboard
                        </button>
                        <button className="nav-btn" onClick={handleCreateNew}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="16" />
                                <line x1="8" y1="12" x2="16" y2="12" />
                            </svg>
                            New Invoice
                        </button>
                    </nav>
                </div>
                <div className="sb-footer">
                    <div className="sb-user">
                        <p>Logged in as:</p>
                        <p className="sb-email">{user?.full_name}</p>
                        <p className="sb-role" style={{
                            fontSize: '0.7rem',
                            color: '#4f46e5',
                            marginTop: '4px',
                            fontWeight: '500'
                        }}>
                            👤 User
                        </p>
                    </div>
                    <button className="logout-btn" onClick={handleLogout}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        Logout Session
                    </button>
                </div>

                <style>{`
                    .sidebar-static {
                        width: 240px;
                        background: white;
                        border-right: 1px solid #e0e0e0;
                        display: flex;
                        flex-direction: column;
                        justify-content: space-between;
                        height: 100vh;
                        position: sticky;
                        top: 0;
                        box-shadow: 2px 0 8px rgba(0,0,0,0.1);
                    }
                    
                    .sb-brand {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 1rem;
                        margin-bottom: 1rem;
                        user-select: none;
                        -webkit-user-select: none;
                    }
                    
                    .company-logo {
                        width: 60%;
                        height: auto;
                        display: block;
                        object-fit: contain;
                        margin: 0 auto;
                        user-select: none;
                        -webkit-user-select: none;
                        -moz-user-select: none;
                        -ms-user-select: none;
                        -webkit-user-drag: none;
                        -khtml-user-drag: none;
                        pointer-events: none;
                    }
                    
                    @media (min-width: 768px) {
                        .company-logo {
                            max-width: 120px;
                        }
                    }
                    
                    .sb-footer {
                        margin-top: auto;
                    }
                    
                    .sb-user {
                        padding: 1rem;
                        border-top: 1px solid #e0e0e0;
                    }
                    
                    .sb-user p {
                        margin: 0;
                        font-size: 0.85rem;
                    }
                    
                    .sb-user .sb-email {
                        font-weight: 600;
                        color: #0072bc;
                        word-break: break-word;
                    }
                    
                    .logout-btn {
                        width: calc(100% - 2rem);
                        margin: 0 1rem 1rem 1rem;
                        padding: 0.75rem;
                        background: #dc3545;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        font-size: 0.9rem;
                        transition: background 0.2s;
                    }
                    
                    .logout-btn:hover {
                        background: #000000;
                    }
                    
                    .nav-btn {
                        width: calc(100% - 1rem);
                        margin: 0.25rem 0.5rem;
                        padding: 0.75rem 1rem;
                        background: transparent;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        font-size: 0.9rem;
                        color: #4a5568;
                        transition: all 0.2s;
                    }
                    
                    .nav-btn:hover {
                        background: #f7fafc;
                    }
                    
                    .nav-btn.active {
                        background: #ebf8ff;
                        color: #0072bc;
                        font-weight: 500;
                    }
                `}</style>
            </aside>
        );
    }

    // For ADMIN users - render sliding sidebar with hover functionality
    return (
        <>
            {/* Edge indicator for admin only */}
            {!isVisible && !isPinned && (
                <div className="sidebar-edge-indicator" />
            )}

            <aside
                ref={sidebarRef}
                className={`sidebar sidebar-sliding ${isVisible || isPinned ? 'visible' : 'hidden'} ${isPinned ? 'pinned' : ''}`}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                <div className="sb-header">
                    <div className="sb-brand" onContextMenu={(e) => e.preventDefault()}>
                        <img
                            src="JAYARAMA LOGO1.png"
                            alt="Jayarama Logo"
                            className="company-logo"
                            draggable="false"
                            onContextMenu={(e) => e.preventDefault()}
                            onDragStart={(e) => e.preventDefault()}
                            style={{
                                userSelect: 'none',
                                WebkitUserSelect: 'none',
                                WebkitUserDrag: 'none',
                                pointerEvents: 'none'
                            }}
                        />
                    </div>

                    {/* Pin/Unpin button for admin only */}
                    <button className="pin-toggle" onClick={togglePin} title={isPinned ? "Unpin sidebar" : "Pin sidebar"}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2v20M2 12h20" />
                        </svg>
                    </button>

                    <nav>
                        <button className="nav-btn active">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="7" height="7" />
                                <rect x="14" y="3" width="7" height="7" />
                                <rect x="14" y="14" width="7" height="7" />
                                <rect x="3" y="14" width="7" height="7" />
                            </svg>
                            Dashboard
                        </button>
                        <button className="nav-btn" onClick={handleCreateNew}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="16" />
                                <line x1="8" y1="12" x2="16" y2="12" />
                            </svg>
                            New Invoice
                        </button>

                        {/* Master Data button - Only for Super Admin */}
                        {userRole === 'super_admin' && (
                            <button className="nav-btn" onClick={handleMasterData}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M4 4v16h16V4H4zm2 4h12v2H6V8zm0 4h12v2H6v-2zm0 4h8v2H6v-2z" />
                                    <path d="M18 8h-4V6h4v2z" />
                                </svg>
                                Master Data
                            </button>
                        )}
                    </nav>
                </div>
                <div className="sb-footer">
                    <div className="sb-user">
                        <p>Logged in as:</p>
                        <p className="sb-email">{user?.full_name}</p>
                        <p className="sb-role" style={{
                            fontSize: '0.7rem',
                            color: userRole === 'super_admin' ? '#8b5cf6' : '#e11d48',
                            marginTop: '4px',
                            fontWeight: '500'
                        }}>
                            {userRole === 'super_admin' ? '⭐ Super Admin' : '👑 Administrator'}
                        </p>
                    </div>
                    <button className="logout-btn" onClick={handleLogout}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        Logout Session
                    </button>
                </div>

                <style>{`
                    .sidebar-sliding {
                        width: 260px;
                        background: white;
                        border-right: 1px solid #e0e0e0;
                        display: flex;
                        flex-direction: column;
                        justify-content: space-between;
                        height: 100vh;
                        position: fixed;
                        top: 0;
                        left: 0;
                        transition: transform 0.3s ease-in-out;
                        z-index: 1000;
                        box-shadow: 2px 0 8px rgba(0,0,0,0.1);
                    }
                    
                    .sidebar-sliding.hidden {
                        transform: translateX(-100%);
                    }
                    
                    .sidebar-sliding.visible {
                        transform: translateX(0);
                    }
                    
                    .sidebar-sliding.pinned {
                        transform: translateX(0);
                    }
                    
                    /* Edge indicator for admin only */
                    .sidebar-edge-indicator {
                        position: fixed;
                        left: 0;
                        top: 0;
                        width: 8px;
                        height: 100vh;
                        background: linear-gradient(90deg, rgba(0,114,188,0.3) 0%, rgba(0,114,188,0) 100%);
                        z-index: 999;
                        pointer-events: none;
                        animation: pulse 2s infinite;
                    }
                    
                    @keyframes pulse {
                        0% { opacity: 0.3; }
                        50% { opacity: 0.7; }
                        100% { opacity: 0.3; }
                    }
                    
                    .pin-toggle {
                        position: absolute;
                        top: 10px;
                        right: 10px;
                        background: transparent;
                        border: none;
                        cursor: pointer;
                        padding: 4px;
                        border-radius: 4px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #666;
                        transition: all 0.2s;
                    }
                    
                    .pin-toggle:hover {
                        background: #f0f0f0;
                        color: #0072bc;
                    }
                    
                    .sb-brand {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 1rem;
                        margin-bottom: 1rem;
                        position: relative;
                        user-select: none;
                        -webkit-user-select: none;
                    }
                    
                    .company-logo {
                        width: 60%;
                        height: auto;
                        display: block;
                        object-fit: contain;
                        margin: 0 auto;
                        user-select: none;
                        -webkit-user-select: none;
                        -moz-user-select: none;
                        -ms-user-select: none;
                        -webkit-user-drag: none;
                        -khtml-user-drag: none;
                        pointer-events: none;
                    }
                    
                    @media (min-width: 768px) {
                        .company-logo {
                            max-width: 120px;
                        }
                    }
                    
                    .sb-footer {
                        margin-top: auto;
                    }
                    
                    .sb-user {
                        padding: 1rem;
                        border-top: 1px solid #e0e0e0;
                    }
                    
                    .sb-user p {
                        margin: 0;
                        font-size: 0.85rem;
                    }
                    
                    .sb-user .sb-email {
                        font-weight: 600;
                        color: #0072bc;
                        word-break: break-word;
                    }
                    
                    .logout-btn {
                        width: calc(100% - 2rem);
                        margin: 0 1rem 1rem 1rem;
                        padding: 0.75rem;
                        background: #dc3545;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        font-size: 0.9rem;
                        transition: background 0.2s;
                    }
                    
                    .logout-btn:hover {
                        background: #000000;
                    }
                    
                    .nav-btn {
                        width: calc(100% - 1rem);
                        margin: 0.25rem 0.5rem;
                        padding: 0.75rem 1rem;
                        background: transparent;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        font-size: 0.9rem;
                        color: #4a5568;
                        transition: all 0.2s;
                    }
                    
                    .nav-btn:hover {
                        background: #f7fafc;
                    }
                    
                    .nav-btn.active {
                        background: #ebf8ff;
                        color: #0072bc;
                        font-weight: 500;
                    }
                `}</style>
            </aside>
        </>
    );
};

export default Sidebar;