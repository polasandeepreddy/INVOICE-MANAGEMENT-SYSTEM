import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import axios from 'axios';
import Sidebar from './Sidebar';
import Notification from './Notification';
import LoadingScreen from './LoadingScreen';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { generateSignedPDF, generateSignedPDFBlob } from '../utils/generateSignedPDF';

axios.defaults.withCredentials = true;

/* ─── Utilities ─────────────────────────────────────────────── */
const formatRupees = (amount) => {
  if (amount === undefined || amount === null) return '₹0.00';
  const n = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(n)) return '₹0.00';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatLargeNumber = (amount) => {
  if (amount === undefined || amount === null || isNaN(amount)) return '₹0';
  const num = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(num)) return '₹0';
  const abs = Math.abs(num);
  if (abs >= 10000000) {
    const cr = num / 10000000;
    const t = Math.floor(cr * 100) / 100;
    return `₹${(t % 1 === 0 ? t.toFixed(0) : t.toFixed(2).replace(/\.?0+$/, ''))} Cr`;
  }
  if (abs >= 100000) {
    const lk = num / 100000;
    const t = Math.floor(lk * 100) / 100;
    return `₹${(t % 1 === 0 ? t.toFixed(0) : t.toFixed(2).replace(/\.?0+$/, ''))} L`;
  }
  return formatRupees(num);
};

const createLocalDate = (dateStr) => {
  if (!dateStr) return null;
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [y, m, d] = dateStr.split('-');
    return new Date(+y, +m - 1, +d);
  }
  if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
    const [d, m, y] = dateStr.split('-');
    return new Date(+y, +m - 1, +d);
  }
  const dt = new Date(dateStr);
  return isNaN(dt.getTime()) ? null : dt;
};

const truncateText = (text, max = 30) => {
  if (!text) return '—';
  return text.length <= max ? text : text.substring(0, max) + '…';
};

const extractReasonOnly = (remarks) => {
  if (!remarks) return '';
  const m = remarks.match(/Reason:\s*(.+?)(?:\n|$)/);
  if (m && m[1]) return m[1].trim().replace(/[-*]+$/, '').trim();
  return '';
};

const extractCancellationDetails = (remarks) => {
  if (!remarks) return null;
  const m = remarks.match(/🔴 \[CANCELLED ON (.*?)\]\s*\n\s*Reason:\s*(.+?)(?:\n|$)\s*Cancelled by:\s*(.+?)(?:\n|$)/);
  if (m) {
    return { date: m[1].trim(), reason: m[2].trim().replace(/[-*]+$/, '').trim(), cancelledBy: m[3].trim().replace(/\s*\([^)]*\)/, '').trim() };
  }
  const rm = remarks.match(/Reason:\s*(.+?)(?:\n|$)/);
  const cbm = remarks.match(/Cancelled by:\s*(.+?)(?:\n|$)/);
  const dm = remarks.match(/CANCELLED ON (.*?)(?:\n|$)/);
  return {
    date: dm ? dm[1].trim() : 'Unknown date',
    reason: rm ? rm[1].trim().replace(/[-*]+$/, '').trim() : 'No reason provided',
    cancelledBy: cbm ? cbm[1].trim().replace(/\s*\([^)]*\)/, '').trim() : 'Unknown user'
  };
};

/* ─── CSS-in-JS Styles ───────────────────────────────────────── */
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Sora:wght@300;400;600;700;800&display=swap');

  :root {
    --brand: #0f172a;
    --brand-mid: #1e293b;
    --brand-light: #2563eb;
    --brand-glow: rgba(15,23,42,0.06);
    --accent: #d97706;
    --accent2: #dc2626;
    --success: #16a34a;
    --danger: #dc2626;
    --warn: #d97706;
    --surface: #ffffff;
    --surface2: #f8fafc;
    --surface3: #f1f5f9;
    --border: #e2e8f0;
    --border-strong: #cbd5e1;
    --text1: #0f172a;
    --text2: #334155;
    --text3: #64748b;
    --shadow-sm: 0 1px 3px rgba(15,23,42,0.05);
    --shadow-md: 0 4px 12px rgba(15,23,42,0.08);
    --shadow-lg: 0 10px 25px rgba(15,23,42,0.12);
    --shadow-xl: 0 20px 40px rgba(15,23,42,0.15);
    --r-sm: 4px;
    --r-md: 6px;
    --r-lg: 6px;
    --r-xl: 6px;
    --r-2xl: 6px;
    --font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --font-display: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    --trans: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .ja-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: #fff;
    animation: spin 0.8s linear infinite;
  }

  .ja-loading-container {
    position: fixed;
    inset: 0;
    background: #f8fafc;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 99999;
    text-align: center;
  }

/* From Uiverse.io by gustavofusco */ 
.pencil {
  display: block;
  width: 10em;
  height: 10em;
  margin: 0 auto 1.5rem auto;
}

.pencil__body1,
.pencil__body2,
.pencil__body3,
.pencil__eraser,
.pencil__eraser-skew,
.pencil__point,
.pencil__rotate,
.pencil__stroke {
  animation-duration: 3s;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}

.pencil__body1,
.pencil__body2,
.pencil__body3 {
  transform: rotate(-90deg);
}

.pencil__body1 {
  animation-name: pencilBody1;
}

.pencil__body2 {
  animation-name: pencilBody2;
}

.pencil__body3 {
  animation-name: pencilBody3;
}

.pencil__eraser {
  animation-name: pencilEraser;
  transform: rotate(-90deg) translate(49px,0);
}

.pencil__eraser-skew {
  animation-name: pencilEraserSkew;
  animation-timing-function: ease-in-out;
}

.pencil__point {
  animation-name: pencilPoint;
  transform: rotate(-90deg) translate(49px,-30px);
}

.pencil__rotate {
  animation-name: pencilRotate;
}

.pencil__stroke {
  animation-name: pencilStroke;
  transform: translate(100px,100px) rotate(-113deg);
}

/* Animations */
@keyframes pencilBody1 {
  from,
  to {
    stroke-dashoffset: 351.86;
    transform: rotate(-90deg);
  }

  50% {
    stroke-dashoffset: 150.8;
    transform: rotate(-225deg);
  }
}

@keyframes pencilBody2 {
  from,
  to {
    stroke-dashoffset: 406.84;
    transform: rotate(-90deg);
  }

  50% {
    stroke-dashoffset: 174.36;
    transform: rotate(-225deg);
  }
}

@keyframes pencilBody3 {
  from,
  to {
    stroke-dashoffset: 296.88;
    transform: rotate(-90deg);
  }

  50% {
    stroke-dashoffset: 127.23;
    transform: rotate(-225deg);
  }
}

@keyframes pencilEraser {
  from,
  to {
    transform: rotate(-45deg) translate(49px,0);
  }

  50% {
    transform: rotate(0deg) translate(49px,0);
  }
}

@keyframes pencilEraserSkew {
  from,
  32.5%,
  67.5%,
  to {
    transform: skewX(0);
  }

  35%,
  65% {
    transform: skewX(-4deg);
  }

  37.5%, 
  62.5% {
    transform: skewX(8deg);
  }

  40%,
  45%,
  50%,
  55%,
  60% {
    transform: skewX(-15deg);
  }

  42.5%,
  47.5%,
  52.5%,
  57.5% {
    transform: skewX(15deg);
  }
}

@keyframes pencilPoint {
  from,
  to {
    transform: rotate(-90deg) translate(49px,-30px);
  }

  50% {
    transform: rotate(-225deg) translate(49px,-30px);
  }
}

@keyframes pencilRotate {
  from {
    transform: translate(100px,100px) rotate(0);
  }

  to {
    transform: translate(100px,100px) rotate(720deg);
  }
}

@keyframes pencilStroke {
  from {
    stroke-dashoffset: 439.82;
    transform: translate(100px,100px) rotate(-113deg);
  }

  50% {
    stroke-dashoffset: 164.93;
    transform: translate(100px,100px) rotate(-113deg);
  }

  75%,
  to {
    stroke-dashoffset: 439.82;
    transform: translate(100px,100px) rotate(112deg);
  }
}

  .ja-loading-text {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .ja-loading-title {
    font-family: var(--font-display);
    font-size: 1.35rem;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.02em;
  }

  .ja-loading-subtitle {
    font-size: 0.85rem;
    font-weight: 600;
    color: #0072bc;
    letter-spacing: 0.01em;
    animation: fadeIn 0.4s ease-in-out;
  }

  .ja-dashboard { display: flex; min-height: 100vh; background: #f8fafc; font-family: var(--font); color: var(--text1); }

  .ja-main {
    flex: 1;
    padding: clamp(20px, 3vw, 36px);
    overflow-x: hidden;
    animation: fadeIn 0.3s ease;
  }

  .ja-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 20px;
    margin-bottom: 32px;
    animation: fadeUp 0.4s ease both;
  }
  .ja-header-title {
    font-family: var(--font-display);
    font-size: clamp(1.5rem, 4vw, 2rem);
    font-weight: 800;
    color: var(--text1);
    letter-spacing: -0.03em;
    line-height: 1.1;
  }
  .ja-header-sub {
    font-size: 0.90rem;
    color: var(--text3);
    margin-top: 4px;
    font-weight: 400;
  }
  .ja-role-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 14px;
    border-radius: 40px;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    margin-top: 10px;
  }
  .ja-role-badge.admin   { background: linear-gradient(135deg,#fce4ec,#f8bbd0); color: #880e4f; }
  .ja-role-badge.super   { background: linear-gradient(135deg,#ede7f6,#d1c4e9); color: #4527a0; }
  .ja-role-badge.user    { background: linear-gradient(135deg,#e3f2fd,#bbdefb); color: #0d47a1; }

  .ja-btn-new {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 22px;
    background: var(--brand);
    color: #fff;
    border: none;
    border-radius: 40px;
    font-family: var(--font);
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    overflow: hidden;
    transition: var(--trans);
    box-shadow: 0 4px 14px rgba(15,76,129,0.35);
  }
  .ja-btn-new:hover { background: var(--brand-mid); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(15,76,129,0.4); }
  .ja-btn-new:active { transform: translateY(0); }

  .ja-btn-analysis {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 22px;
    background: linear-gradient(135deg, #8b5cf6, #6d28d9);
    color: #fff;
    border: none;
    border-radius: 40px;
    font-family: var(--font);
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    overflow: hidden;
    transition: var(--trans);
    box-shadow: 0 4px 14px rgba(139, 92, 246, 0.35);
  }
  .ja-btn-analysis:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(139, 92, 246, 0.4); }
  .ja-btn-analysis:active { transform: translateY(0); }

  .ja-btn-import {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 22px;
    background: linear-gradient(135deg, #059669, #047857);
    color: #fff;
    border: none;
    border-radius: 40px;
    font-family: var(--font);
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    overflow: hidden;
    transition: var(--trans);
    box-shadow: 0 4px 14px rgba(5,150,105,0.35);
  }
  .ja-btn-import:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(5,150,105,0.4); }
  .ja-btn-import:active { transform: translateY(0); }
  .ja-btn-import:disabled { opacity: 0.6; cursor: not-allowed; }

  .ja-stats-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 14px;
    margin-bottom: 24px;
  }
  @media (max-width: 1400px) {
    .ja-stats-grid { grid-template-columns: repeat(3, 1fr); }
  }
  @media (max-width: 768px) {
    .ja-stats-grid { grid-template-columns: repeat(2, 1fr); }
  }
  .ja-stat-card {
    background: #ffffff;
    border-radius: 14px;
    padding: 16px 18px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.03);
    transition: var(--trans);
    user-select: none;
    position: relative;
  }
  .ja-stat-card.clickable {
    cursor: pointer;
  }
  .ja-stat-card.clickable:hover {
    border-color: #0072bc;
    box-shadow: 0 8px 20px rgba(0, 114, 188, 0.12);
    transform: translateY(-2px);
  }
  .ja-stat-card.active {
    border-color: #0072bc;
    background: linear-gradient(180deg, #f0f9ff 0%, #ffffff 100%);
    box-shadow: 0 6px 18px rgba(0, 114, 188, 0.15);
  }
  .ja-stat-card.non-clickable {
    cursor: default;
  }
  .ja-stat-card.non-clickable:hover {
    border-color: #e2e8f0;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.02);
    transform: none;
  }

  .ja-stat-label {
    font-size: 0.65rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 6px;
    color: #64748b;
  }
  .ja-stat-value {
    font-size: 1.3rem;
    font-weight: 800;
    color: #0f172a;
    font-family: tabular-nums, sans-serif;
    line-height: 1.2;
  }
  .ja-stat-sub {
    font-size: 0.66rem;
    color: #64748b;
    margin-top: 4px;
  }

  .ja-filter-bar {
    background: #ffffff;
    border-radius: 16px;
    padding: 12px 20px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.02);
    margin-bottom: 20px;
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
  }
  .ja-filter-group { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

  .ja-select {
    padding: 8px 30px 8px 16px;
    border: 1px solid #cbd5e1;
    border-radius: 9999px;
    font-family: var(--font);
    font-size: 0.78rem;
    font-weight: 600;
    color: #475569;
    background: #ffffff;
    cursor: pointer;
    transition: var(--trans);
    outline: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M1 1l3 3 3-3' stroke='%2364748b' stroke-width='1.3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
  }
  .ja-select:focus { border-color: #0072bc; box-shadow: 0 0 0 3px rgba(0, 114, 188, 0.1); }

  .ja-date-input {
    padding: 7px 14px;
    border: 1px solid #cbd5e1;
    border-radius: 9999px;
    font-family: var(--font);
    font-size: 0.78rem;
    color: #475569;
    background: #ffffff;
    outline: none;
    transition: var(--trans);
  }
  .ja-date-input:focus { border-color: #0072bc; box-shadow: 0 0 0 3px rgba(0, 114, 188, 0.1); }

  .ja-search-wrap {
    position: relative;
    flex: 1;
    min-width: 220px;
    max-width: 320px;
  }
  .ja-search-icon {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: #94a3b8;
    pointer-events: none;
  }
  .ja-search-input {
    width: 100%;
    padding: 8px 16px 8px 36px;
    border: 1px solid #cbd5e1;
    border-radius: 9999px;
    font-family: var(--font);
    font-size: 0.78rem;
    color: #0f172a;
    background: #ffffff;
    outline: none;
    transition: var(--trans);
  }
  .ja-search-input:focus { border-color: #0072bc; box-shadow: 0 0 0 3px rgba(0, 114, 188, 0.1); }

  .ja-btn-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 12px;
    border: 1px solid #cbd5e1;
    border-radius: 9999px;
    font-family: var(--font);
    font-size: 0.72rem;
    font-weight: 600;
    background: #ffffff;
    color: #475569;
    cursor: pointer;
    transition: var(--trans);
  }
  .ja-btn-pill:hover { background: #f8fafc; color: #0f172a; }

  .ja-table-wrap {
    background: #ffffff;
    border-radius: 16px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 4px 16px rgba(15, 23, 42, 0.03);
    overflow: hidden;
  }
  .ja-table-scroll { overflow-x: auto; overflow-y: auto; max-height: 68vh; }
  .ja-table {
    width: 100%;
    min-width: 1550px;
    border-collapse: collapse;
    font-size: 0.78rem;
  }

  .ja-table thead { position: sticky; top: 0; z-index: 10; }
  .ja-table thead tr {
    background: #f8fafc;
    border-bottom: 1.5px solid #e2e8f0;
  }
  .ja-table th {
    padding: 12px 14px;
    text-align: center;
    font-size: 0.68rem;
    font-weight: 800;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }
  .ja-table th:first-child { text-align: left; padding-left: 16px; }

  .ja-table tbody tr {
    border-bottom: 1px solid #f1f5f9;
    background: #ffffff;
    cursor: pointer;
    transition: background 0.12s ease;
  }
  .ja-table tbody tr:last-child { border-bottom: none; }

  .ja-table td {
    padding: 12px 14px;
    text-align: center;
    color: #0f172a;
    font-size: 0.78rem;
    vertical-align: middle;
  }
  .ja-table td:first-child { text-align: left; padding-left: 16px; }

  /* ── APPROVAL Column Badge (Photo-1 Style) ── */
  .ja-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 4px 12px;
    border-radius: 9999px;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    white-space: nowrap;
    border: 1px solid transparent;
  }
  .ja-badge.created   { background: #fef3c7; color: #b45309; border-color: transparent; }
  .ja-badge.requested { background: #e0e7ff; color: #4338ca; border-color: transparent; }
  .ja-badge.approved  { background: #d1fae5; color: #047857; border-color: transparent; }
  .ja-badge.rejected  { background: #fee2e2; color: #b91c1c; border-color: transparent; }
  .ja-badge.unpaid    { background: #ffffff; color: #dc2626; border-color: #fecaca; }

  .ja-status-select {
    padding: 3px 8px;
    border-radius: 9999px;
    font-family: var(--font);
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    outline: none;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    text-align: center;
    text-align-last: center;
    transition: var(--trans);
    box-sizing: border-box;
  }

  /* ── ACTION Column (Photo-1 Style Text Link Buttons) ── */
  .ja-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border: none;
    background: transparent;
    font-family: var(--font);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: var(--trans);
    white-space: nowrap;
    text-decoration: none;
  }
  .ja-action-btn:hover:not(:disabled) { text-decoration: underline; }
  .ja-action-btn.indigo { color: #2563eb; }
  .ja-action-btn.indigo:hover:not(:disabled) { color: #1d4ed8; }
  .ja-action-btn.violet { color: #8b5cf6; font-weight: 700; }
  .ja-action-btn.violet:hover:not(:disabled) { color: #7c3aed; }
  .ja-action-btn.green  { color: #059669; font-weight: 600; }
  .ja-action-btn.green:hover:not(:disabled) { color: #047857; }
  .ja-action-btn:disabled { color: #94a3b8; cursor: default; }

  /* ── REMARKS Column Button (Photo-1 Style Soft Pink Pill) ── */
  .ja-remarks-btn {
    padding: 4px 12px;
    border: none;
    border-radius: 9999px;
    font-family: var(--font);
    font-size: 0.72rem;
    font-weight: 600;
    background: #fee2e2;
    color: #e11d48;
    cursor: pointer;
    transition: var(--trans);
    white-space: nowrap;
  }
  .ja-remarks-btn:hover { background: #fecdd3; color: #be123c; }

  /* ── DELETE Column Button (Photo-1 Style Soft Pink Pill) ── */
  .ja-delete-btn {
    padding: 4px 12px;
    background: #fee2e2;
    color: #e11d48;
    border: none;
    border-radius: 9999px;
    font-family: var(--font);
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    transition: var(--trans);
  }
  .ja-delete-btn:hover { background: #fecdd3; color: #be123c; transform: translateY(-1px); }

  .ja-pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 18px;
    padding: 0 4px;
    background: transparent;
    border: none;
    border-radius: 0;
    box-shadow: none;
  }
  .ja-page-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 32px;
    padding: 0 8px;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #ffffff;
    color: #475569;
    font-family: var(--font);
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    transition: var(--trans);
  }
  .ja-page-btn:hover:not(:disabled) {
    background: #f8fafc;
    border-color: #94a3b8;
    color: #0f172a;
  }
  .ja-page-btn.active {
    background: #003B6D;
    border-color: #003B6D;
    color: #ffffff;
    font-weight: 700;
  }
  .ja-page-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    background: #ffffff;
    border-color: #e2e8f0;
  }
  .ja-items-select {
    padding: 5px 28px 5px 12px;
    border: 1px solid #cbd5e1;
    border-radius: 9999px;
    font-family: var(--font);
    font-size: 0.76rem;
    font-weight: 600;
    color: #475569;
    background: #ffffff;
    cursor: pointer;
    outline: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M1 1l3 3 3-3' stroke='%2364748b' stroke-width='1.3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
  }

  .ja-footer-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 24px;
    padding: 12px 4px 0 4px;
    border-top: none;
  }
  .ja-export-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 22px;
    background: #059669;
    color: #ffffff;
    border: none;
    border-radius: 9999px;
    font-family: var(--font);
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    transition: var(--trans);
    box-shadow: 0 4px 14px rgba(5, 150, 105, 0.22);
  }
  .ja-export-btn:hover { background: #047857; transform: translateY(-1px); box-shadow: 0 6px 18px rgba(5, 150, 105, 0.3); }

  .ja-overlay {
    position: fixed; inset: 0;
    background: rgba(11,30,53,0.55);
    backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.2s ease;
  }
  .ja-modal {
    background: var(--surface);
    border-radius: var(--r-2xl);
    padding: 32px;
    width: 92%;
    max-width: 540px;
    max-height: 92vh;
    overflow-y: auto;
    box-shadow: var(--shadow-xl);
    animation: scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    border: 1px solid var(--border);
  }
  .ja-modal-lg { max-width: 640px; }
  .ja-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }
  .ja-modal-title {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text1);
  }
  .ja-modal-close {
    width: 32px; height: 32px;
    background: var(--surface3);
    border: none;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    font-size: 18px;
    color: var(--text3);
    transition: var(--trans);
  }
  .ja-modal-close:hover { background: var(--surface3); color: var(--text1); transform: rotate(90deg); }

  .ja-field-label {
    display: block;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text2);
    margin-bottom: 8px;
  }
  .ja-textarea {
    width: 100%;
    padding: 12px 14px;
    border: 1px solid var(--border-strong);
    border-radius: var(--r-md);
    font-family: var(--font);
    font-size: 0.84rem;
    color: var(--text1);
    background: var(--surface2);
    resize: vertical;
    outline: none;
    transition: var(--trans);
    line-height: 1.6;
  }
  .ja-textarea:focus { border-color: var(--brand-light); background: var(--surface); box-shadow: 0 0 0 3px rgba(15,76,129,0.1); }

  .ja-text-input {
    width: 100%;
    padding: 12px 14px;
    border: 1.5px solid var(--border-strong);
    border-radius: var(--r-md);
    font-family: var(--font);
    font-size: 1rem;
    color: var(--text1);
    background: var(--surface2);
    outline: none;
    transition: var(--trans);
  }
  .ja-text-input:focus { border-color: var(--brand-light); background: var(--surface); }

  .ja-modal-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px; }

  .ja-btn-cancel-act {
    padding: 10px 22px;
    background: var(--surface3);
    border: none;
    border-radius: 12px;
    font-family: var(--font);
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text2);
    cursor: pointer;
    transition: var(--trans);
  }
  .ja-btn-cancel-act:hover { background: #dde5ef; }

  .ja-btn-confirm-danger {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 24px;
    background: var(--danger);
    border: none;
    border-radius: 12px;
    font-family: var(--font);
    font-size: 0.82rem;
    font-weight: 600;
    color: #fff;
    cursor: pointer;
    transition: var(--trans);
    box-shadow: 0 4px 12px rgba(232,57,79,0.3);
  }
  .ja-btn-confirm-danger:hover:not(:disabled) { background: #dc2626; transform: translateY(-1px); }
  .ja-btn-confirm-danger:disabled { background: #f87171; cursor: not-allowed; }

  .ja-btn-confirm-success {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 24px;
    background: var(--success);
    border: none;
    border-radius: 12px;
    font-family: var(--font);
    font-size: 0.82rem;
    font-weight: 600;
    color: #fff;
    cursor: pointer;
    transition: var(--trans);
    box-shadow: 0 4px 12px rgba(26,185,122,0.3);
  }
  .ja-btn-confirm-success:hover:not(:disabled) { background: #0d9060; transform: translateY(-1px); }
  .ja-btn-confirm-success:disabled { background: #6ee7b7; cursor: not-allowed; }

  .ja-radio-group { display: flex; flex-direction: column; gap: 10px; }
  .ja-radio-option {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 16px;
    border: 1.5px solid var(--border-strong);
    border-radius: var(--r-md);
    cursor: pointer;
    transition: var(--trans);
  }
  .ja-radio-option:hover { border-color: var(--brand-light); background: #f0f6ff; }
  .ja-radio-option.selected { border-color: var(--brand); background: #f0f6ff; }
  .ja-radio-option input { accent-color: var(--brand); }

  .ja-sig-pad {
    border: 1.5px solid var(--border-strong);
    border-radius: var(--r-md);
    overflow: hidden;
    background: #fafbfc;
    position: relative;
  }
  .ja-sig-pad canvas { display: block; }

  .ja-cloud-box {
    background: var(--surface2);
    border: 1.5px dashed var(--border-strong);
    border-radius: var(--r-lg);
    padding: 20px;
  }

  .ja-cancel-details {
    background: #fff7f7;
    border: 1px solid #ffd0d0;
    border-radius: var(--r-lg);
    padding: 20px;
  }
  .ja-cancel-row {
    display: flex; gap: 12px; margin-bottom: 14px;
    padding-bottom: 14px; border-bottom: 1px solid #ffd0d0;
  }
  .ja-cancel-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
  .ja-cancel-label { font-size: 0.78rem; font-weight: 700; color: #991b1b; min-width: 110px; }
  .ja-cancel-value { font-size: 0.84rem; color: #7f1d1d; }
  .ja-cancel-reason-box {
    font-size: 0.84rem; line-height: 1.7;
    color: #7f1d1d; background: #fff;
    padding: 12px 14px; border-radius: 10px;
    white-space: pre-wrap; word-break: break-word;
  }

  .ja-remarks-box {
    background: var(--surface2);
    border: 1px solid var(--border-strong);
    border-radius: var(--r-md);
    padding: 18px;
    font-size: 0.84rem;
    line-height: 1.7;
    color: var(--text1);
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* Full Page PDF Preview Styles */
  .pdf-full-page {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: #1a1a2e;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    animation: fadeIn 0.3s ease;
  }

  .pdf-toolbar {
    background: #0f4c81;
    color: white;
    padding: 12px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  }

  .pdf-title {
    font-size: 1rem;
    font-weight: 600;
  }

  .pdf-buttons {
    display: flex;
    gap: 12px;
  }

  .pdf-btn {
    padding: 8px 20px;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.85rem;
  }

  .pdf-btn-primary {
    background: #1ab97a;
    color: white;
  }

  .pdf-btn-primary:hover {
    background: #0d9060;
    transform: translateY(-1px);
  }

  .pdf-btn-secondary {
    background: #475569;
    color: white;
  }

  .pdf-btn-secondary:hover {
    background: #334155;
  }

  .pdf-btn-danger {
    background: #e8394f;
    color: white;
  }

  .pdf-btn-danger:hover {
    background: #dc2626;
  }

  .pdf-container {
    flex: 1;
    background: #e2e8f0;
    overflow: auto;
    display: flex;
    justify-content: center;
    padding: 20px;
  }

  .pdf-iframe {
    width: 100%;
    height: 100%;
    border: none;
    background: white;
    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    border-radius: 8px;
  }

  .pdf-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 20px;
  }

  .pdf-loading-spinner {
    width: 50px;
    height: 50px;
    border: 4px solid #e2e8f0;
    border-top-color: #0f4c81;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @media (max-width: 768px) {
    .ja-main { padding: 16px; }
    .ja-table th, .ja-table td { padding: 10px 8px !important; font-size: 0.7rem !important; }
    .ja-filter-bar { padding: 12px; }
    .ja-stat-card { padding: 16px; }
    .ja-modal { padding: 24px; }
    .pencil { width: 6em; height: 6em; }
    .ja-loading-title { font-size: 1rem; }
    .ja-loading-subtitle { font-size: 0.75rem; }
    .pdf-toolbar { padding: 10px 16px; }
    .pdf-title { font-size: 0.85rem; }
    .pdf-btn { padding: 6px 12px; font-size: 0.75rem; }
  }
  @media (max-width: 520px) {
    .ja-stats-grid { grid-template-columns: repeat(2, 1fr); }
  }
`;

/* ─── Mini Icon Components ────────────────────────────────── */
const Icon = ({ d, size = 16, strokeWidth = 1.8, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d={d} />
  </svg>
);

const PlusIcon = (p) => <Icon d="M12 5v14M5 12h14" {...p} />;
const SearchIcon = (p) => <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
const FileIcon = (p) => <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
const DownloadIcon = (p) => <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
const UploadIcon = (p) => <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>;


/* ─── Stats Cards ──────────────────────────────────────────── */
const StatsCards = ({ stats, userRole, activeCardFilter, onCardClick }) => {
  const isAdminOrSuper = userRole === 'admin' || userRole === 'super_admin';

  const cards = [
    {
      key: 'total', label: 'TOTAL INVOICES', value: stats.totalInvoices, labelColor: '#6366f1', valueColor: '#0f172a',
      sub: `Paid: ${stats.paidInvoices}  ·  Unpaid: ${stats.unpaidInvoices}  ·  Cancelled: ${stats.cancelledInvoices}`, clickable: true
    },
    { key: 'base', label: 'BASE REVENUE', value: formatLargeNumber(stats.totalBaseAmount), labelColor: '#2d8fd1ff', valueColor: '#0f172a', sub: 'Before tax', clickable: false },
    { key: 'gst', label: 'TOTAL WITH GST', value: formatLargeNumber(Math.round(stats.totalWithGST)), labelColor: '#a23cbfff', valueColor: '#0f172a', sub: 'All taxes included', clickable: false },
  ];

  // Only show payment-related cards for admin/super admin
  if (isAdminOrSuper) {
    cards.push(
      { key: 'paid', label: 'AMOUNT RECEIVED', value: formatLargeNumber(Math.round(stats.totalPaid)), labelColor: '#10b981', valueColor: '#10b981', sub: 'Total collected', clickable: true },
      { key: 'pending', label: 'PENDING AMOUNT', value: formatLargeNumber(Math.round(stats.totalPending)), labelColor: '#ef4444', valueColor: '#ef4444', sub: 'Yet to receive', clickable: true },
      { key: 'esign_requested', label: 'ESIGN REQUESTED', value: stats.requestedInvoices, labelColor: '#0284c7', valueColor: '#0284c7', sub: 'Waiting for Super Admin', clickable: true }
    );
  } else {
    // For regular users, show pending amount
    cards.push(
      { key: 'pending', label: 'PENDING AMOUNT', value: formatLargeNumber(Math.round(stats.totalPending)), labelColor: '#ef4444', valueColor: '#ef4444', sub: 'Yet to receive', clickable: true }
    );
  }

  return (
    <div className="ja-stats-grid">
      {cards.map((c, i) => {
        const isActive = c.clickable && activeCardFilter === c.key;
        return (
          <div
            key={i}
            className={`ja-stat-card ${c.clickable ? 'clickable' : 'non-clickable'} ${isActive ? 'active' : ''}`}
            onClick={() => {
              if (c.clickable) onCardClick(c.key);
            }}
            title={c.clickable ? `Click to filter list by ${c.label}` : c.label}
          >
            <div className="ja-stat-label" style={{ color: c.labelColor, fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.05em' }}>{c.label}</div>
            <div className="ja-stat-value" style={{ fontSize: '1.35rem', fontWeight: 800, color: c.valueColor }}>{c.value}</div>
            {c.sub && <div className="ja-stat-sub" style={{ color: '#64748b', fontSize: '0.66rem', marginTop: 4 }}>{c.sub}</div>}
          </div>
        );
      })}
    </div>
  );
};

const getYearBounds = () => {
  const cy = new Date().getFullYear();
  return {
    min: '2010-01-01',
    max: `${cy + 1}-12-31`
  };
};

/* ─── Filter Bar ───────────────────────────────────────────── */
const FilterBar = ({
  searchTerm, setSearchTerm,
  selectedStatusFilter, setSelectedStatusFilter,
  selectedApprovalFilter, setSelectedApprovalFilter,
  selectedFY, setSelectedFY, availableFinancialYears,
  startDate, setStartDate, endDate, setEndDate,
  userRole, clearSearchFilter, clearDateFilter, clearAllFilters,
  activeCardFilter, setActiveCardFilter
}) => {
  const anyFilter = Boolean(startDate) || Boolean(endDate) || selectedStatusFilter !== 'all'
    || ((userRole === 'admin' || userRole === 'super_admin') && selectedApprovalFilter !== 'all')
    || selectedFY !== 'all'
    || searchTerm || (activeCardFilter !== null);

  const yearBounds = getYearBounds();
  const minEndDate = startDate || yearBounds.min;
  const maxStartDate = endDate || yearBounds.max;

  const handleStartDateChange = (e) => {
    const val = e.target.value;
    setStartDate(val);
    if (val && endDate && endDate < val) {
      setEndDate(val);
    }
  };

  const handleEndDateChange = (e) => {
    const val = e.target.value;
    setEndDate(val);
  };

  return (
    <div className="ja-filter-bar">
      <div className="ja-filter-group">
        <select className="ja-select" value={selectedStatusFilter} onChange={e => { setActiveCardFilter(null); setSelectedStatusFilter(e.target.value); }}>
          <option value="all">All Payment Status</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
          <option value="cancelled">Cancelled</option>
        </select>

        {(userRole === 'admin' || userRole === 'super_admin') && (
          <select className="ja-select" value={selectedApprovalFilter} onChange={e => { setActiveCardFilter(null); setSelectedApprovalFilter(e.target.value); }}>
            <option value="all">All Approval Status</option>
            <option value="created">Created</option>
            <option value="requested">Requested</option>
            <option value="final_approved">Final Approved</option>
          </select>
        )}

        <select className="ja-select" value={selectedFY} onChange={e => { setActiveCardFilter(null); setSelectedFY(e.target.value); }}>
          <option value="all">All Financial Years</option>
          {(availableFinancialYears || []).map(fy => (
            <option key={fy} value={fy}>
              FY 20{fy.replace('-', '-20')} ({fy})
            </option>
          ))}
        </select>

        {activeCardFilter !== null && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '9999px', fontSize: '0.72rem', fontWeight: 600, color: '#1d4ed8' }}>
            <span>Card Filter: {activeCardFilter === 'total' ? 'Total Invoices' : activeCardFilter === 'paid' ? 'Amount Received (Paid Invoices)' : activeCardFilter === 'pending' ? 'Pending Amount (Partial / Unpaid / Cancelled)' : activeCardFilter === 'esign_requested' ? 'eSign Requested / Pending Approval' : 'All Invoices'}</span>
            <button style={{ border: 'none', background: 'none', color: '#1d4ed8', cursor: 'pointer', fontWeight: 800, fontSize: '0.8rem', marginLeft: 4 }} onClick={clearAllFilters}>✕</button>
          </div>
        )}
      </div>

      <div className="ja-filter-group" style={{ marginLeft: 'auto', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="date" className="ja-date-input" style={{ padding: '5px 8px', fontSize: '0.7rem', width: '130px' }}
            value={startDate} min={yearBounds.min} max={maxStartDate} onChange={handleStartDateChange} title="Start Date" />
          <span style={{ fontSize: '0.7rem', color: 'var(--text3)' }}>→</span>
          <input type="date" className="ja-date-input" style={{ padding: '5px 8px', fontSize: '0.7rem', width: '130px' }}
            value={endDate} min={minEndDate} max={yearBounds.max} onChange={handleEndDateChange} title="End Date (On or after Start Date)" />
          {(startDate || endDate) && (
            <button className="ja-btn-pill slate" style={{ padding: '4px 10px', fontSize: '0.7rem' }} onClick={clearDateFilter}>✕</button>
          )}
        </div>
        <div className="ja-search-wrap" style={{ width: '200px' }}>
          <SearchIcon size={13} className="ja-search-icon" />
          <input type="text" className="ja-search-input" style={{ padding: '6px 12px 6px 32px', fontSize: '0.75rem' }}
            placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        {searchTerm && (
          <button className="ja-btn-pill red" style={{ padding: '4px 10px', fontSize: '0.7rem' }} onClick={clearSearchFilter}>✕</button>
        )}
        {anyFilter && (
          <button className="ja-btn-pill slate" style={{ padding: '4px 12px', fontSize: '0.7rem' }} onClick={clearAllFilters}>↺ Reset</button>
        )}
      </div>
    </div>
  );
};

/* ─── Pagination ───────────────────────────────────────────── */
const Pagination = ({ currentPage, totalPages, itemsPerPage, setItemsPerPage, onPageChange, totalItems, startIndex, endIndex }) => {
  const getPageNumbers = () => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 3) {
      return [1, 2, 3, '...', totalPages];
    }
    if (currentPage >= totalPages - 2) {
      return [1, '...', totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="ja-pagination">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text3)' }}>
          Showing {totalItems === 0 ? 0 : startIndex + 1}–{Math.min(endIndex, totalItems)} of {totalItems}
        </span>
        <select className="ja-items-select" value={itemsPerPage} onChange={e => setItemsPerPage(+e.target.value)}>
          <option value={10}>10 / page</option>
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
        </select>
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="ja-page-btn" disabled={currentPage === 1} onClick={() => onPageChange(1)}>«</button>
        <button className="ja-page-btn" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)}>‹</button>

        {pageNumbers.map((item, idx) => {
          if (item === '...') {
            return (
              <span key={`ellipsis-${idx}`} style={{ color: 'var(--text3)', padding: '0 4px', fontSize: '0.82rem', fontWeight: 600, userSelect: 'none' }}>
                .....
              </span>
            );
          }
          return (
            <button
              key={item}
              className={`ja-page-btn ${item === currentPage ? 'active' : ''}`}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          );
        })}

        <button className="ja-page-btn" disabled={currentPage === totalPages || totalPages === 0} onClick={() => onPageChange(currentPage + 1)}>›</button>
        <button className="ja-page-btn" disabled={currentPage === totalPages || totalPages === 0} onClick={() => onPageChange(totalPages)}>»</button>
      </div>
    </div>
  );
};

/* ─── eSign Modal (Streamlined Super Admin eSign Approval) ──────────────────────────────────── */
const ESignModal = ({ isOpen, onClose, onConfirm, invoice, loading, onPreview }) => {
  if (!isOpen || !invoice) return null;

  let attachedCount = 0;
  if (invoice.attached_pdfs) {
    try {
      const parsed = typeof invoice.attached_pdfs === 'string' ? JSON.parse(invoice.attached_pdfs) : invoice.attached_pdfs;
      attachedCount = Array.isArray(parsed) ? parsed.length : 0;
    } catch (e) {
      attachedCount = 0;
    }
  }

  return (
    <div className="ja-overlay" onClick={onClose}>
      <div className="ja-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, borderRadius: 12, overflow: 'hidden' }}>
        <div className="ja-modal-header" style={{ padding: '16px 20px', background: '#0f172a', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="ja-modal-title" style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 600 }}>✍️ Digital eSign Approval</div>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 2 }}>Invoice #{invoice.invoice_number}</div>
          </div>
          <button className="ja-modal-close" onClick={onClose} style={{ color: '#94a3b8', background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: '20px' }}>
          {/* Invoice Details Card */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.84rem' }}>
              <span style={{ color: '#64748b' }}>Customer Name:</span>
              <strong style={{ color: '#0f172a' }}>{invoice.client_name || 'N/A'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.84rem' }}>
              <span style={{ color: '#64748b' }}>Total Amount:</span>
              <strong style={{ color: '#059669' }}>₹ {(invoice.calculated_total_amount || invoice.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem' }}>
              <span style={{ color: '#64748b' }}>Attached Supporting PDFs:</span>
              <span style={{ fontWeight: 600, color: attachedCount > 0 ? '#2563eb' : '#64748b' }}>
                {attachedCount > 0 ? `📎 ${attachedCount} File(s) Attached` : 'None'}
              </span>
            </div>
          </div>

          <div style={{ fontSize: '0.78rem', color: '#475569', lineHeight: 1.4, marginBottom: 20 }}>
            🔒 This action will digitally sign the invoice using your CloudSigner DSC service. The eSign stamp will be applied at the bottom-right corner of the main invoice and all attached supporting documents.
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="ja-btn-pill slate"
              onClick={onClose}
              disabled={loading}
              style={{ padding: '8px 16px', fontSize: '0.8rem', borderRadius: 6, background: '#f1f5f9', border: '1px solid #cbd5e1', cursor: 'pointer' }}
            >
              Cancel
            </button>
            {onPreview && (
              <button
                type="button"
                className="ja-btn-pill slate"
                onClick={() => onPreview(invoice.id)}
                disabled={loading}
                style={{ padding: '8px 16px', fontSize: '0.8rem', borderRadius: 6, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontWeight: 600, cursor: 'pointer' }}
              >
                👁️ Preview PDF
              </button>
            )}
            <button
              type="button"
              className="ja-btn-confirm-success"
              onClick={() => onConfirm()}
              disabled={loading}
              style={{ padding: '8px 18px', fontSize: '0.8rem', borderRadius: 6, background: '#059669', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
            >
              {loading ? '⏳ Signing...' : '🔒 Sign Digitally'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── Amount Received Modal ─────────────────────────────────────────── */
const AmountReceivedModal = ({ isOpen, onClose, onConfirm, invoice, currentReceived, isSubmitting }) => {
  const [amountInput, setAmountInput] = useState('');
  const [remarksInput, setRemarksInput] = useState('');
  const [error, setError] = useState('');

  const totalNet = invoice ? (invoice.calculated_net_amount || invoice.calculated_total_amount || invoice.total_amount || 0) : 0;
  const previousReceived = invoice ? (parseFloat(invoice.received) || 0) : 0;
  const currentBalance = Math.max(0, totalNet - previousReceived);

  const baseAmount = invoice ? (invoice.calculated_base_amount || parseFloat(invoice.base_amount) || parseFloat(invoice.amount) || 0) : 0;
  const sgst = invoice ? (invoice.calculated_sgst || parseFloat(invoice.sgst) || 0) : 0;
  const cgst = invoice ? (invoice.calculated_cgst || parseFloat(invoice.cgst) || 0) : 0;
  const igst = invoice ? (invoice.calculated_igst || parseFloat(invoice.igst) || 0) : 0;
  let gstAmount = sgst + cgst + igst;
  if (gstAmount === 0 && totalNet > baseAmount && baseAmount > 0) {
    gstAmount = totalNet - baseAmount;
  }
  const fullAmount = currentBalance > 0 ? currentBalance : totalNet;

  useEffect(() => {
    if (isOpen) {
      setAmountInput('');
      setRemarksInput(invoice?.remarks || '');
      setError('');
    }
  }, [isOpen, invoice]);

  if (!isOpen || !invoice) return null;

  const invoiceNumber = invoice.invoice_number || `INV-${invoice.id}`;
  const invoiceDate = invoice.date ? (createLocalDate(invoice.date)?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) || invoice.date) : 'N/A';

  const bankName = invoice.bank_name || 'AXIS BANK LIMITED';
  const bankAccountNo = invoice.bank_account_no || invoice.account_number || '922020060131840';
  const bankIfsc = invoice.bank_ifsc || invoice.ifsc_code || 'UTIB0000425';

  const enteredAmount = parseFloat(String(amountInput).replace(/,/g, '')) || 0;
  const totalReceivedAfter = previousReceived + enteredAmount;
  const remainingBalanceAfter = Math.max(0, currentBalance - enteredAmount);

  const formatNumStr = (num) => {
    if (!num || num <= 0) return '0.00';
    return Number(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleSelectOption = (optionType) => {
    setError('');
    if (optionType === 'only_gst') {
      const formatted = Number(gstAmount).toLocaleString('en-IN');
      setAmountInput(formatted);
      setRemarksInput('Only GST is Paid');
    } else if (optionType === 'only_base') {
      const formatted = Number(baseAmount).toLocaleString('en-IN');
      setAmountInput(formatted);
      setRemarksInput('Only Base Amount is Paid');
    } else if (optionType === 'paid_completely') {
      const formatted = Number(fullAmount).toLocaleString('en-IN');
      setAmountInput(formatted);
      setRemarksInput('Paid Completely');
    }
  };

  const handleAmountChange = (val) => {
    const cleaned = val.replace(/[^0-9.]/g, '');
    if (!cleaned) {
      setAmountInput('');
      return;
    }
    const parts = cleaned.split('.');
    let integerPart = parts[0];
    if (integerPart.length > 1 && integerPart.startsWith('0')) {
      integerPart = integerPart.replace(/^0+/, '') || '0';
    }
    const formattedInteger = integerPart !== '' ? Number(integerPart).toLocaleString('en-IN') : (parts.length > 1 ? '0' : '');
    const formatted = parts.length > 1 ? `${formattedInteger}.${parts[1]}` : formattedInteger;
    setAmountInput(formatted);
    setError('');

    const valNum = parseFloat(cleaned) || 0;
    if (valNum > 0) {
      if (Math.abs(valNum - gstAmount) < 0.05 && gstAmount > 0) {
        setRemarksInput('Only GST is Paid');
      } else if (Math.abs(valNum - baseAmount) < 0.05 && baseAmount > 0) {
        setRemarksInput('Only Base Amount is Paid');
      } else if (Math.abs(valNum - fullAmount) < 0.05 && fullAmount > 0) {
        setRemarksInput('Paid Completely');
      }
    }
  };

  const handleConfirm = () => {
    if (enteredAmount <= 0) {
      setError('Please enter a valid payment amount greater than 0');
      return;
    }
    if (!remarksInput.trim()) {
      setError('Please select an option or enter a remark message');
      return;
    }
    onConfirm(enteredAmount, totalReceivedAfter, remarksInput.trim());
  };

  return (
    <div className="ja-overlay" onClick={onClose}>
      <div className="ja-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, borderRadius: 8, overflow: 'hidden', border: '1px solid #cbd5e1', boxShadow: '0 12px 28px -4px rgba(15, 23, 42, 0.15)' }}>
        {/* Enterprise Header */}
        <div className="ja-modal-header" style={{ background: '#0f172a', color: '#ffffff', padding: '16px 20px', borderBottom: '1px solid #1e293b' }}>
          <div>
            <div className="ja-modal-title" style={{ color: '#ffffff', fontSize: '1.05rem', fontWeight: 600, letterSpacing: '-0.2px' }}>
              Receive Payment
            </div>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 3 }}>
              Invoice #{invoiceNumber} • {invoiceDate}
            </div>
          </div>
          <button className="ja-modal-close" onClick={onClose} style={{ color: '#94a3b8', fontSize: '1.2rem', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px', background: '#ffffff' }}>
          {/* Invoice & Bank Info Card */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '12px 14px', marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', fontSize: '0.82rem' }}>
              <div>
                <span style={{ color: '#64748b', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Invoice Number</span>
                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.9rem' }}>#{invoiceNumber}</div>
              </div>
              <div>
                <span style={{ color: '#64748b', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Invoice Date</span>
                <div style={{ fontWeight: 500, color: '#334155' }}>{invoiceDate}</div>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ color: '#64748b', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Bank Account Details</span>
                <div style={{ fontWeight: 500, color: '#1e293b', marginTop: 2, fontSize: '0.8rem' }}>
                  {bankName} • A/C: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{bankAccountNo}</span> • IFSC: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{bankIfsc}</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#475569', fontSize: '0.8rem', fontWeight: 500 }}>Current Outstanding Balance</span>
              <strong style={{ fontSize: '0.98rem', color: currentBalance > 0 ? '#b45309' : '#15803d', fontWeight: 700, fontFamily: 'monospace' }}>
                {formatRupees(currentBalance)}
              </strong>
            </div>
          </div>

          {/* Quick Option Buttons */}
          <div style={{ marginBottom: 16 }}>
            <label className="ja-field-label" style={{ fontWeight: 600, color: '#0f172a', margin: 0, fontSize: '0.8rem', marginBottom: 6, display: 'block' }}>
              Select Payment Mode / Quick Options
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                onClick={() => handleSelectOption('only_gst')}
                style={{
                  padding: '8px 6px',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  borderRadius: 6,
                  border: remarksInput === 'Only GST is Paid' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  background: remarksInput === 'Only GST is Paid' ? '#eff6ff' : '#ffffff',
                  color: remarksInput === 'Only GST is Paid' ? '#1e40af' : '#334155',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                <div>Only GST is Paid</div>
                <div style={{ fontSize: '0.68rem', fontWeight: 500, color: '#64748b', marginTop: 2 }}>
                  ₹ {formatNumStr(gstAmount)}
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectOption('only_base')}
                style={{
                  padding: '8px 6px',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  borderRadius: 6,
                  border: remarksInput === 'Only Base Amount is Paid' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  background: remarksInput === 'Only Base Amount is Paid' ? '#eff6ff' : '#ffffff',
                  color: remarksInput === 'Only Base Amount is Paid' ? '#1e40af' : '#334155',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                <div>Only Base Amount is Paid</div>
                <div style={{ fontSize: '0.68rem', fontWeight: 500, color: '#64748b', marginTop: 2 }}>
                  ₹ {formatNumStr(baseAmount)}
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectOption('paid_completely')}
                style={{
                  padding: '8px 6px',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  borderRadius: 6,
                  border: remarksInput === 'Paid Completely' ? '2px solid #16a34a' : '1px solid #cbd5e1',
                  background: remarksInput === 'Paid Completely' ? '#f0fdf4' : '#ffffff',
                  color: remarksInput === 'Paid Completely' ? '#15803d' : '#334155',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                <div>Paid Completely</div>
                <div style={{ fontSize: '0.68rem', fontWeight: 500, color: '#64748b', marginTop: 2 }}>
                  ₹ {formatNumStr(fullAmount)}
                </div>
              </button>
            </div>
          </div>

          {/* Amount Paid Input Section */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label className="ja-field-label" style={{ fontWeight: 600, color: '#0f172a', margin: 0, fontSize: '0.82rem' }}>
                Amount Paid (₹) <span style={{ color: '#dc2626' }}>*</span>
              </label>
            </div>

            <input
              type="text"
              inputMode="decimal"
              className="ja-text-input"
              style={{
                fontSize: '1.1rem',
                fontWeight: 600,
                padding: '8px 12px',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                width: '100%',
                boxSizing: 'border-box',
                color: '#0f172a'
              }}
              value={amountInput}
              onChange={e => handleAmountChange(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
          </div>

          {/* Payment Remarks Textbox */}
          <div style={{ marginBottom: 16 }}>
            <label className="ja-field-label" style={{ fontWeight: 600, color: '#0f172a', margin: 0, fontSize: '0.82rem', marginBottom: 4, display: 'block' }}>
              Payment Remark / Message <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <textarea
              className="ja-textarea"
              rows={2}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                fontSize: '0.84rem',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                outline: 'none'
              }}
              value={remarksInput}
              onChange={e => { setRemarksInput(e.target.value); setError(''); }}
              placeholder="Message for remarks column (e.g. Only GST is Paid, Only Base Amount is Paid, Paid Completely)..."
            />
          </div>

          {error && <div style={{ color: '#dc2626', fontSize: '0.78rem', marginBottom: 12, fontWeight: 500 }}>⚠ {error}</div>}

          {/* Live Breakdown Summary Box */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            padding: '12px 14px',
            marginBottom: 18
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Payment Breakdown
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px', fontSize: '0.82rem' }}>
              <div>
                <span style={{ color: '#64748b' }}>Total Invoice Amount:</span>
                <div style={{ fontWeight: 600, color: '#0f172a', fontFamily: 'monospace' }}>{formatRupees(totalNet)}</div>
              </div>

              <div>
                <span style={{ color: '#64748b' }}>Previously Received:</span>
                <div style={{ fontWeight: 500, color: '#475569', fontFamily: 'monospace' }}>{formatRupees(previousReceived)}</div>
              </div>

              <div>
                <span style={{ color: '#0f172a', fontWeight: 600 }}>Amount Paid Now:</span>
                <div style={{ fontWeight: 700, color: '#2563eb', fontFamily: 'monospace' }}>+ {formatRupees(enteredAmount)}</div>
              </div>

              <div>
                <span style={{ color: remainingBalanceAfter === 0 ? '#15803d' : '#b45309', fontWeight: 600 }}>
                  Remaining Balance:
                </span>
                <div style={{
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  fontFamily: 'monospace',
                  color: remainingBalanceAfter === 0 ? '#15803d' : '#b45309'
                }}>
                  {formatRupees(remainingBalanceAfter)}
                </div>
              </div>
            </div>

            {enteredAmount > 0 && (
              <div style={{
                marginTop: 8,
                paddingTop: 6,
                borderTop: '1px solid #f1f5f9',
                fontSize: '0.76rem',
                fontWeight: 600,
                color: remainingBalanceAfter === 0 ? '#15803d' : '#1e40af'
              }}>
                {remainingBalanceAfter === 0 ? (
                  <span>✓ Invoice status will change to <strong>PAID</strong></span>
                ) : (
                  <span>ℹ Status will remain <strong>PARTIALLY PAID</strong> (Remaining: {formatRupees(remainingBalanceAfter)})</span>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="ja-modal-actions" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '8px 16px',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                background: '#ffffff',
                color: '#475569',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isSubmitting || enteredAmount <= 0}
              style={{
                padding: '8px 18px',
                border: 'none',
                borderRadius: 6,
                background: (isSubmitting || enteredAmount <= 0) ? '#94a3b8' : '#0f172a',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: (isSubmitting || enteredAmount <= 0) ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {isSubmitting ? (
                <><span className="ja-spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Saving…</>
              ) : (
                'Confirm Payment'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── Remarks Modal ────────────────────────────────────────── */
const RemarksModal = ({ isOpen, onClose, invoiceNumber, isCancelled, cancellationDetails, remarks }) => {
  if (!isOpen) return null;
  return (
    <div className="ja-overlay" onClick={onClose}>
      <div className="ja-modal" onClick={e => e.stopPropagation()}>
        <div className="ja-modal-header">
          <div className="ja-modal-title">{isCancelled ? 'Cancellation Details' : 'Remarks'} — #{invoiceNumber}</div>
          <button className="ja-modal-close" onClick={onClose}>×</button>
        </div>
        {isCancelled && cancellationDetails ? (
          <div className="ja-cancel-details">
            <div className="ja-cancel-row">
              <div className="ja-cancel-label">Cancelled On</div>
              <div className="ja-cancel-value">{cancellationDetails.date || 'Unknown'}</div>
            </div>
            <div className="ja-cancel-row">
              <div className="ja-cancel-label">Cancelled By</div>
              <div className="ja-cancel-value">{cancellationDetails.cancelledBy || 'Unknown'}</div>
            </div>
            <div>
              <div className="ja-cancel-label" style={{ marginBottom: 8 }}>Reason</div>
              <div className="ja-cancel-reason-box">{cancellationDetails.reason || 'No reason provided'}</div>
            </div>
          </div>
        ) : (
          <div className="ja-remarks-box">{remarks || 'No remarks available'}</div>
        )}
        <div className="ja-modal-actions">
          <button className="ja-btn-confirm-success" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

/* ─── Cancel Modal ─────────────────────────────────────────── */
const CancelModal = ({ isOpen, onClose, onConfirm, isSubmitting, cancelReason, setCancelReason }) => {
  if (!isOpen) return null;
  return (
    <div className="ja-overlay" onClick={onClose}>
      <div className="ja-modal" onClick={e => e.stopPropagation()}>
        <div className="ja-modal-header">
          <div className="ja-modal-title" style={{ color: 'var(--danger)' }}>Cancel Invoice</div>
          <button className="ja-modal-close" onClick={onClose}>×</button>
        </div>
        <p style={{ fontSize: '0.84rem', color: 'var(--text2)', marginBottom: 20, lineHeight: 1.6 }}>
          Please provide a reason for cancellation. This will be permanently saved to the database with timestamp and your name.
        </p>
        <label className="ja-field-label">Cancellation Reason <span style={{ color: 'var(--danger)' }}>*</span></label>
        <textarea className="ja-textarea" rows={4} value={cancelReason} onChange={e => setCancelReason(e.target.value)}
          placeholder="e.g. Duplicate invoice, Client requested cancellation, Incorrect amount…" autoFocus />
        <div className="ja-modal-actions">
          <button className="ja-btn-cancel-act" onClick={onClose}>Cancel</button>
          <button className="ja-btn-confirm-danger" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? <><span className="ja-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />Saving…</> : '✓ Confirm Cancellation'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─── Delete OTP Verification Modal ─────────────────────────────────────────── */
const DeleteOTPModal = ({
  isOpen,
  onClose,
  onRequestOTP,
  onVerifyAndDelete,
  isSendingOtp,
  otpRequested,
  isSubmitting,
  otp,
  setOtp,
  invoiceId,
  invoices,
  targetAdminEmail,
  requestorName
}) => {
  useEffect(() => {
    if (isOpen) {
      setOtp('');
    }
  }, [isOpen, setOtp]);

  if (!isOpen) return null;
  const invoice = invoices ? invoices.find(i => i.id === invoiceId) : null;
  const invoiceNumber = invoice?.invoice_number || invoice?.invoice_no || invoiceId;
  const clientName = invoice?.client_name || 'N/A';
  const totalAmount = invoice?.total_amount ? `₹ ${Number(invoice.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'N/A';
  const displayAdminEmail = targetAdminEmail || 'jayaramaassociates.info@gmail.com';

  return (
    <div className="ja-overlay" onClick={onClose}>
      <div className="ja-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
        {/* Header */}
        <div className="ja-modal-header" style={{ background: '#fff1f2', borderBottom: '1px solid #ffe4e6', padding: '18px 24px' }}>
          <div className="ja-modal-title" style={{ color: '#e11d48', fontSize: '1.15rem', fontWeight: 700, letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🗑️</span>
            <span>Confirm Invoice Deletion</span>
          </div>
          <button className="ja-modal-close" onClick={onClose} style={{ color: '#9f1239' }}>×</button>
        </div>

        <div style={{ padding: '24px' }}>
          {/* SINGLE Unified Warning & Details Card (NO REPETITION) */}
          <div style={{ background: '#ffffff', border: '1.5px solid #fecdd3', borderRadius: 10, overflow: 'hidden', marginBottom: 22, boxShadow: '0 2px 4px rgba(225, 29, 72, 0.05)' }}>
            <div style={{ background: '#fff1f2', color: '#9f1239', padding: '10px 14px', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #ffe4e6' }}>
              <span style={{ fontSize: '1.1rem' }}>⚠️</span>
              <span>Permanent Deletion Action</span>
            </div>

            <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', fontSize: '0.88rem' }}>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.76rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Invoice Number</span>
                <strong style={{ color: '#e11d48', fontSize: '0.98rem', fontFamily: 'monospace', letterSpacing: '0.5px' }}>#{invoiceNumber}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.76rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Client Name</span>
                <strong style={{ color: '#1e293b', fontSize: '0.95rem' }}>{clientName}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.76rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Requested By</span>
                <strong style={{ color: '#0f172a', fontSize: '0.92rem' }}>👤 {requestorName || 'Admin'}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.76rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Amount</span>
                <strong style={{ fontSize: '1.05rem', color: '#0f172a', fontWeight: 800 }}>{totalAmount}</strong>
              </div>
            </div>
          </div>

          {!otpRequested ? (
            /* STEP 1: PRE-REQUEST OTP PROMPT */
            <div>
              <div style={{ background: '#f0f9ff', border: '1.5px solid #bae6fd', borderRadius: 8, padding: '14px 16px', marginBottom: 24, color: '#0369a1', fontSize: '0.88rem', lineHeight: 1.6, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ fontSize: '1.3rem', marginTop: 2 }}>🔐</span>
                <div>
                  <strong>Security Verification:</strong> An OTP will be sent to Admin Email (<strong>{displayAdminEmail}</strong>) to authorize deletion.
                </div>
              </div>

              <div className="ja-modal-actions" style={{ display: 'flex', gap: 12, marginTop: 28, justifyContent: 'flex-end' }}>
                <button className="ja-btn-cancel-act" onClick={onClose} disabled={isSendingOtp}
                  style={{ padding: '10px 20px', border: '1.5px solid #cbd5e1', borderRadius: 6, background: 'white', color: '#475569', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
                  Cancel
                </button>
                <button className="ja-btn-confirm-danger" onClick={onRequestOTP} disabled={isSendingOtp}
                  style={{ padding: '11px 24px', border: 'none', borderRadius: 6, background: isSendingOtp ? '#93c5fd' : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', color: 'white', fontWeight: 600, cursor: isSendingOtp ? 'not-allowed' : 'pointer', boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.2)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8, minWidth: 180, justifyContent: 'center' }}>
                  {isSendingOtp ? (<><span className="ja-spinner" style={{ width: 15, height: 15, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} /><span>Sending OTP…</span></>) : (<><span>📩</span><span>Request OTP</span></>)}
                </button>
              </div>
            </div>
          ) : (
            /* STEP 2: ENTER OTP & VERIFY DELETE */
            <div>
              <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 8, padding: '14px 16px', marginBottom: 24, color: '#15803d', fontSize: '0.88rem', lineHeight: 1.6, display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: '1.3rem' }}>✅</span>
                <div>
                  <strong>OTP Sent!</strong> Check Admin Email (<strong>{displayAdminEmail}</strong>) and enter the 6-digit code.
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="ja-field-label" style={{ fontWeight: 600, color: '#334155', margin: 0 }}>
                    Enter 6-Digit Admin OTP <span style={{ color: '#e11d48', marginLeft: 4, fontWeight: 700 }}>*</span>
                  </label>
                  <button
                    type="button"
                    onClick={onRequestOTP}
                    disabled={isSendingOtp || isSubmitting}
                    style={{ background: 'none', border: 'none', color: '#0284c7', fontWeight: 600, fontSize: '0.82rem', cursor: (isSendingOtp || isSubmitting) ? 'not-allowed' : 'pointer', textDecoration: 'underline' }}>
                    {isSendingOtp ? 'Sending...' : '↻ Resend OTP'}
                  </button>
                </div>
                <input
                  type="text"
                  maxLength={6}
                  className="ja-input"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="• • • • • •"
                  disabled={isSubmitting || isSendingOtp}
                  autoFocus
                  autoComplete="off"
                  name="delete_invoice_otp_input"
                  onKeyPress={e => e.key === 'Enter' && !isSubmitting && otp.length === 6 && onVerifyAndDelete()}
                  style={{ width: '100%', padding: '12px', border: '2px solid #0284c7', borderRadius: 8, fontSize: '1.25rem', fontWeight: 700, textAlign: 'center', letterSpacing: '10px', boxSizing: 'border-box', boxShadow: '0 2px 4px rgba(2, 132, 199, 0.08)' }}
                />
              </div>

              <div className="ja-modal-actions" style={{ display: 'flex', gap: 12, marginTop: 28, justifyContent: 'flex-end' }}>
                <button className="ja-btn-cancel-act" onClick={onClose} disabled={isSubmitting}
                  style={{ padding: '10px 20px', border: '1.5px solid #cbd5e1', borderRadius: 6, background: 'white', color: '#475569', fontWeight: 600, cursor: isSubmitting ? 'not-allowed' : 'pointer', opacity: isSubmitting ? 0.6 : 1 }}>
                  Cancel
                </button>
                <button className="ja-btn-confirm-danger" onClick={onVerifyAndDelete} disabled={isSubmitting || isSendingOtp || otp.trim().length !== 6}
                  style={{ padding: '11px 24px', border: 'none', borderRadius: 6, background: isSubmitting || isSendingOtp || otp.trim().length !== 6 ? '#fca5a5' : 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)', color: 'white', fontWeight: 600, cursor: isSubmitting || isSendingOtp || otp.trim().length !== 6 ? 'not-allowed' : 'pointer', opacity: isSubmitting || isSendingOtp || otp.trim().length !== 6 ? 0.7 : 1, boxShadow: '0 4px 6px -1px rgba(225, 29, 72, 0.2)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8, minWidth: 170, justifyContent: 'center' }}>
                  {isSubmitting ? (<><span className="ja-spinner" style={{ width: 15, height: 15, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} /><span>Verifying…</span></>) : (<><span>🗑️</span><span>Verify & Delete</span></>)}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─── Full Page PDF Preview Component ─────────────────────────────────────────── */
const FullPagePDFPreview = ({ invoice, userRole, onClose, showNotification }) => {
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let currentBlobUrl = null;

    const loadPDF = async () => {
      if (!invoice) return;

      setIsLoading(true);
      setError(null);

      try {
        let invoiceData = { ...invoice };

        if (!invoiceData.calculated_base_amount || invoiceData.calculated_base_amount === 0) {
          const rawItems = invoiceData.items || [];
          const dbBase = parseFloat(invoiceData.base_amount || 0);
          const dbTotal = parseFloat(invoiceData.total_amount || 0);
          const effectiveBase = dbBase > 0 ? dbBase : (dbTotal > 0 ? dbTotal / 1.18 : 0);

          const items = rawItems.map(item => {
            const qty = +item.quantity || 1;
            let pr = +item.price;
            if (isNaN(pr) || pr <= 0) {
              pr = effectiveBase > 0 ? effectiveBase / qty : 0;
            }
            return { ...item, quantity: qty, price: pr };
          });

          let base = items.reduce((s, i) => s + ((+i.quantity || 0) * (+i.price || 0)), 0);
          if (base === 0 && effectiveBase > 0) base = effectiveBase;

          const same = invoiceData.place_of_supply?.includes('36-Telangana') || false;
          const sgst = same ? base * 0.09 : 0;
          const cgst = same ? base * 0.09 : 0;
          const igst = same ? 0 : base * 0.18;
          const total = base + sgst + cgst + igst;
          const tds = +invoiceData.tds_amount || 0;
          const net = total - tds;
          const received = +invoiceData.received || 0;

          invoiceData = {
            ...invoiceData,
            items: items.length > 0 ? items : invoiceData.items,
            calculated_base_amount: base,
            calculated_sgst: sgst,
            calculated_cgst: cgst,
            calculated_igst: igst,
            calculated_total_amount: total,
            calculated_net_amount: net,
            calculated_pending: net - received
          };
        }

        const blob = await generateSignedPDFBlob(invoiceData, 'completed', {
          timestamp: invoice.signed_at || new Date().toISOString()
        });

        currentBlobUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(currentBlobUrl);
      } catch (err) {
        console.error('PDF generation error:', err);
        setError('Failed to generate PDF preview: ' + (err.message || 'Unknown error'));
        if (showNotification) showNotification('error', 'Failed to generate PDF preview');
      } finally {
        setIsLoading(false);
      }
    };

    loadPDF();

    return () => {
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
      }
    };
  }, [invoice, showNotification]);

  const handleDownload = async () => {
    if (!invoice) return;

    try {
      showNotification('info', 'Preparing signed PDF download...');
      const token = localStorage.getItem('token');

      const res = await axios.get(`/api/invoices/${invoice.id}/download-signed-pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      const blob = new Blob([res.data], { type: 'application/pdf' });
      const blobUrl = window.URL.createObjectURL(blob);

      window.open(blobUrl, '_blank');

      const link = document.createElement('a');
      link.href = blobUrl;
      const safeNum = (invoice.invoice_number || `INV-${invoice.id}`).replace(/[/\\?%*:|"<>]/g, '-');
      link.setAttribute('download', `${safeNum}-SIGNED.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      showNotification('success', 'Signed PDF downloaded successfully!');
    } catch (err) {
      console.error('Download error:', err);
      try {
        let invoiceData = { ...invoice };
        await generateSignedPDF(invoiceData, userRole, showNotification);
      } catch (genErr) {
        showNotification('error', 'Failed to download PDF: ' + (err.message || 'Unknown error'));
      }
    }
  };

  return (
    <div className="pdf-full-page">
      <div className="pdf-toolbar">
        <div className="pdf-title">
          📄 Signed Invoice Preview - #{invoice?.invoice_number || 'N/A'}
          {invoice?.manual_signature_status === 'Manually Signed' || invoice?.manual_signed_file_id ? (
            <span style={{ marginLeft: '12px', fontSize: '0.75rem', background: '#059669', color: '#ffffff', padding: '4px 10px', borderRadius: '20px', fontWeight: 600 }}>
              ✍️ Manually Signed
            </span>
          ) : invoice?.approval_status === 'final_approved' ? (
            <span style={{ marginLeft: '12px', fontSize: '0.75rem', background: '#1ab97a', color: '#ffffff', padding: '4px 10px', borderRadius: '20px' }}>
              ✓ Digitally Signed
            </span>
          ) : null}
        </div>
        <div className="pdf-buttons">
          {(userRole === 'admin' || userRole === 'super_admin') && (
            <button className="pdf-btn pdf-btn-primary" onClick={handleDownload}>
              <DownloadIcon size={14} style={{ marginRight: '6px' }} />
              Download PDF
            </button>
          )}
          <button className="pdf-btn pdf-btn-danger" onClick={onClose}>
            Close Preview
          </button>
        </div>
      </div>
      <div className="pdf-container">
        {isLoading ? (
          <div className="pdf-loading">
            <div className="pdf-loading-spinner"></div>
            <div style={{ color: '#475569' }}>Generating signed PDF preview...</div>
          </div>
        ) : error ? (
          <div className="pdf-loading">
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <div style={{ color: '#e8394f' }}>{error}</div>
          </div>
        ) : pdfBlobUrl ? (
          <iframe
            src={pdfBlobUrl}
            className="pdf-iframe"
            title="Signed Invoice Preview"
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        ) : null}
      </div>
    </div>
  );
};

// eslint-disable-next-line no-unused-vars
const getDefaultBillingCycleDates = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const startDateObj = new Date(year, month, 10);
  const endDateObj = new Date(year, month + 1, 10);

  const formatYMD = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return {
    startDate: formatYMD(startDateObj),
    endDate: formatYMD(endDateObj)
  };
};

const getFinancialYearCode = (dateStr, invoiceNumber) => {
  if (invoiceNumber) {
    const match = invoiceNumber.match(/JA\/(\d{2}-\d{2})\//i);
    if (match && match[1]) return match[1];
  }
  if (dateStr) {
    const d = createLocalDate(dateStr);
    if (d && !isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      if (month >= 4) {
        return `${year.toString().slice(-2)}-${(year + 1).toString().slice(-2)}`;
      } else {
        return `${(year - 1).toString().slice(-2)}-${year.toString().slice(-2)}`;
      }
    }
  }
  return null;
};

/* ─── Main Dashboard ───────────────────────────────────────── */
const Dashboard = ({ user, onLogout, onCreateNew, onEditInvoice, onShowAnalysis, onShowMasterData }) => {
  const [invoices, setInvoices] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const [userRole, setUserRole] = useState('user');
  const [, setUserId] = useState(null);
  const [userName, setUserName] = useState('');
  const [clients, setClients] = useState([]);
  const [, setBanks] = useState([]);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [selectedApprovalFilter, setSelectedApprovalFilter] = useState('all');
  const [selectedFY, setSelectedFY] = useState('all');
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedMonthCycle, setSelectedMonthCycle] = useState('all');
  const [activeCardFilter, setActiveCardFilter] = useState(null);
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
  const [, setRequestingESignId] = useState(null);
  const [, setIsDownloadingPreviewPDF] = useState(false);
  const [showAmountReceivedModal, setShowAmountReceivedModal] = useState(false);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [showDeleteOTPModal, setShowDeleteOTPModal] = useState(false);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState(null);
  const [deleteOtp, setDeleteOtp] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [isSendingDeleteOtp, setIsSendingDeleteOtp] = useState(false);
  const [isVerifyingDeleteOtp, setIsVerifyingDeleteOtp] = useState(false);
  const [targetAdminEmail, setTargetAdminEmail] = useState('');
  const [showPDFPreview, setShowPDFPreview] = useState(false);
  const [previewInvoiceData, setPreviewInvoiceData] = useState(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalModalInvoiceNumber, setApprovalModalInvoiceNumber] = useState('');
  const [isUploadingExcel, setIsUploadingExcel] = useState(false);
  const fileInputRef = useRef(null);
  const notifTimerRef = useRef(null);

  useEffect(() => () => { if (notifTimerRef.current) clearTimeout(notifTimerRef.current); }, []);

  const handleAnalysisClick = () => {
    if (onShowAnalysis) {
      onShowAnalysis();
    }
  };

  const formatDateForDisplay = useCallback((ds) => {
    if (!ds) return '—';
    try {
      let d;
      if (typeof ds === 'string' && ds.match(/^\d{2}-\d{2}-\d{4}$/)) {
        const [day, mo, yr] = ds.split('-');
        d = new Date(+yr, +mo - 1, +day);
      } else if (typeof ds === 'string' && ds.match(/^\d{4}-\d{2}-\d{2}/)) {
        const clean = ds.split('T')[0].split(' ')[0];
        const [yr, mo, day] = clean.split('-');
        d = new Date(+yr, +mo - 1, +day);
      } else {
        d = new Date(ds);
      }
      if (isNaN(d.getTime())) return '—';
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch { return '—'; }
  }, []);

  const showNotification = useCallback((type, message) => {
    if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    setNotification({ type, message });
    notifTimerRef.current = setTimeout(() => setNotification(null), 3000);
  }, []);

  const getDisplayBankName = useCallback((invoice) => {
    if (invoice.client_id) {
      const c = clients.find(c => c.id === invoice.client_id);
      if (c) return c.name;
    }
    return invoice.bank_name || '—';
  }, [clients]);

  const getApprovalBadge = useCallback((status, invoice) => {
    if (invoice?.manual_signature_status === 'Manually Signed' || invoice?.manual_signed_file_id) {
      return { cls: 'approved', label: 'Manually Signed' };
    }
    const mapAdmin = {
      created: { cls: 'created', label: '• Created' },
      requested: { cls: 'requested', label: '• Requested' },
      final_approved: { cls: 'approved', label: '• Approved' }
    };
    const mapUser = {
      created: { cls: 'created', label: '• Created' },
      requested: { cls: 'requested', label: '• eSign Requested' },
      final_approved: { cls: 'approved', label: '• Verified' }
    };
    const map = (userRole === 'admin' || userRole === 'super_admin') ? mapAdmin : mapUser;
    return map[status] || { cls: 'created', label: `• ${status}` };
  }, [userRole]);

  const getApprovalActionButton = useCallback((invoice) => {
    if (invoice.payment_status === 'cancelled') {
      return { text: 'Cancelled', action: 'none', color: 'red', disabled: true };
    }

    // Check if manually signed
    if (invoice.manual_signature_status === 'Manually Signed' || invoice.manual_signed_file_id) {
      return { text: 'View Signed PDF', action: 'preview', color: 'green', disabled: false };
    }

    const status = invoice.approval_status || 'created';

    // Regular users can also request eSign and view PDFs
    if (status === 'created') {
      return { text: 'Request eSign', action: 'request', color: 'indigo', disabled: false };
    }
    if (status === 'requested') {
      // Only super admin can do final eSign, others see "Pending Approval"
      if (userRole === 'super_admin') {
        return { text: 'Final eSign', action: 'esign', color: 'violet', disabled: false };
      }
      return { text: 'Pending Approval', action: 'none', color: 'indigo', disabled: true };
    }
    if (status === 'final_approved') {
      return { text: 'View Signed PDF', action: 'preview', color: 'green', disabled: false };
    }

    return null;
  }, [userRole]);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No token');

      const [userData, invoicesRes, clientsRes, banksRes] = await Promise.all([
        axios.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } }),
        axios.get('/api/invoices', { headers: { Authorization: `Bearer ${token}` } }),
        axios.get('/api/clients', { headers: { Authorization: `Bearer ${token}` } }),
        axios.get('/api/banks', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      const role = userData.data.role, uid = userData.data.id, uname = userData.data.full_name || 'Unknown';
      setUserRole(role);
      setUserId(uid);
      setUserName(uname);
      setClients(clientsRes.data);
      setBanks(banksRes.data);
      let raw = invoicesRes.data;
      if (role !== 'admin' && role !== 'super_admin') raw = raw.filter(i => i.user_id === uid);

      const processed = raw.map(invoice => {
        const base = parseFloat(invoice.base_amount) || 0;
        const sgst = parseFloat(invoice.sgst) || 0;
        const cgst = parseFloat(invoice.cgst) || 0;
        const igst = parseFloat(invoice.igst) || 0;
        const total = parseFloat(invoice.total_amount) || (base + sgst + cgst + igst);

        const tds = base * 0.10;
        const net = total - tds;
        const received = parseFloat(invoice.received) || 0;
        let ps = invoice.payment_status || 'unpaid';
        if (ps === 'partial' || ps === 'overdue') ps = 'unpaid';

        return {
          ...invoice,
          calculated_base_amount: base,
          calculated_sgst: sgst,
          calculated_cgst: cgst,
          calculated_igst: igst,
          calculated_total_amount: total,
          calculated_tds_amount: tds,
          calculated_net_amount: net,
          calculated_pending: net - received,
          calculated_payment_status: ps,
          received: received,
          created_by_name: invoice.full_name || invoice.user_full_name || invoice.created_by_name || (invoice.user_id === uid ? uname : 'Unknown'),
          remarks: invoice.remarks || null,
          approval_status: invoice.approval_status || 'created'
        };
      });

      setInvoices(processed);
      setCurrentPage(1);

    } catch (err) {
      console.error('Load data error:', err);
      showNotification('error', 'Failed to load data from database');
      if (err.response?.status === 401) onLogout();
    } finally {
      setLoading(false);
    }
  }, [onLogout, showNotification]);

  const availableFinancialYears = useMemo(() => {
    const fySet = new Set();
    const currentCode = getFinancialYearCode(new Date().toISOString());
    if (currentCode) fySet.add(currentCode);

    invoices.forEach(inv => {
      const code = getFinancialYearCode(inv.date, inv.invoice_number);
      if (code) fySet.add(code);
    });

    return Array.from(fySet).sort((a, b) => {
      const numA = parseInt(a.split('-')[0], 10);
      const numB = parseInt(b.split('-')[0], 10);
      return numB - numA;
    });
  }, [invoices]);

  const handleExcelUpload = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const fileExtension = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls'].includes(fileExtension)) {
      showNotification('error', 'Please upload an Excel file (.xlsx or .xls)');
      return;
    }

    setIsUploadingExcel(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/invoices/import-excel', formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        },
        timeout: 120000
      });

      if (response.data.success) {
        let message = `✅ Imported ${response.data.totalImported} invoices successfully`;

        if (response.data.totalWarnings > 0) {
          message += `\n⚠️ ${response.data.totalWarnings} warnings detected`;
        }

        if (response.data.totalErrors > 0) {
          message += `\n❌ ${response.data.totalErrors} errors encountered`;
        }

        if (response.data.duration) {
          message += `\n⏱️ Completed in ${response.data.duration} seconds`;
        }

        showNotification('success', message);

        if (response.data.errors && response.data.errors.length > 0) {
          console.error('Import errors:', response.data.errors);
          setTimeout(() => {
            alert(`Import completed with ${response.data.errors.length} errors:\n${response.data.errors.slice(0, 5).join('\n')}${response.data.errors.length > 5 ? '\n...' : ''}`);
          }, 500);
        }

        await loadAllData();
      } else {
        showNotification('error', response.data.message || 'Import failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      let errorMessage = 'Failed to upload Excel file';
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Upload timeout. File may be too large.';
      }
      showNotification('error', errorMessage);
    } finally {
      setIsUploadingExcel(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [loadAllData, showNotification]);

  const handleRequestESign = useCallback(async (invoiceId, e) => {
    e.stopPropagation();
    // Allow all users (including regular users) to request eSign
    setRequestingESignId(invoiceId);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`/api/invoices/${invoiceId}/request-esign`, {}, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data.success) {
        await loadAllData();
        showNotification('success', 'eSign request sent to Super Admin!');
      }
    } catch (err) {
      showNotification('error', 'Failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setRequestingESignId(null);
    }
  }, [loadAllData, showNotification]);

  const handleFinalESign = useCallback(async (invoiceId, attachedPdfFiles = []) => {
    setIsSubmittingESign(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      if (Array.isArray(attachedPdfFiles)) {
        attachedPdfFiles.forEach(file => {
          formData.append('attached_pdfs', file);
        });
      }

      const res = await axios.post(`/api/invoices/${invoiceId}/esign`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      if (res.data.success) {
        await loadAllData();
        showNotification('success', '✅ Signed via CloudSigner (Digital Certificate)!');
        setShowESignModal(false);
        setESignInvoiceId(null);
      }
    } catch (err) {
      showNotification('error', err.response?.data?.error || err.message);
    } finally {
      setIsSubmittingESign(false);
    }
  }, [loadAllData, showNotification]);

  const handlePreviewPDF = useCallback(async (invoiceId, e) => {
    if (e && e.stopPropagation) e.stopPropagation();

    setIsDownloadingPreviewPDF(true);

    try {
      const token = localStorage.getItem('token');

      const response = await axios.get(`/api/invoices/${invoiceId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const latestInvoice = response.data;

      if (!latestInvoice) {
        showNotification('error', 'Invoice not found');
        return;
      }

      let invoiceData = { ...latestInvoice };

      let rawItems = invoiceData.items;
      if (typeof rawItems === 'string') {
        try { rawItems = JSON.parse(rawItems); } catch (e) { rawItems = []; }
      }
      const items = Array.isArray(rawItems) ? rawItems : [];
      const same = invoiceData.place_of_supply ? invoiceData.place_of_supply.includes('36-Telangana') : true;

      const dbBase = parseFloat(invoiceData.base_amount || invoiceData.calculated_base_amount || invoiceData.amount || 0);
      const dbSgst = parseFloat(invoiceData.sgst || invoiceData.calculated_sgst || 0);
      const dbCgst = parseFloat(invoiceData.cgst || invoiceData.calculated_cgst || 0);
      const dbIgst = parseFloat(invoiceData.igst || invoiceData.calculated_igst || 0);
      const dbTotal = parseFloat(invoiceData.total_amount || invoiceData.calculated_total_amount || 0);

      const effectiveBase = dbBase > 0 ? dbBase : (dbTotal > 0 ? (dbSgst || dbCgst || dbIgst ? dbTotal - (dbSgst + dbCgst + dbIgst) : dbTotal / 1.18) : 0);

      const sanitizedItems = items.map(item => {
        const qty = +item.quantity || 1;
        let pr = +item.price;
        if (isNaN(pr) || pr <= 0) {
          pr = effectiveBase > 0 ? effectiveBase / qty : 0;
        }
        return { ...item, quantity: qty, price: pr };
      });

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
        items: sanitizedItems.length > 0 ? sanitizedItems : items,
        calculated_base_amount: base,
        calculated_sgst: sgst,
        calculated_cgst: cgst,
        calculated_igst: igst,
        calculated_total_amount: total,
        calculated_net_amount: net,
        calculated_pending: net - received
      };

      setPreviewInvoiceData(invoiceData);
      setShowPDFPreview(true);

    } catch (error) {
      console.error('Preview error:', error);
      showNotification('error', 'Failed to prepare PDF preview: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsDownloadingPreviewPDF(false);
    }
  }, [showNotification]);

  const handleConfirmPayment = useCallback(async (amountNow, totalReceivedAfter, partialRemarks) => {
    setIsSubmittingPayment(true);
    try {
      const invoice = invoices.find(i => i.id === paymentInvoiceId);
      if (!invoice) throw new Error('Invoice not found');

      const isManuallySigned = invoice.manual_signature_status === 'Manually Signed' || !!invoice.manual_signed_file_id;
      const isApprovedOrSigned = invoice.approval_status === 'final_approved' || isManuallySigned;

      if (!isApprovedOrSigned) {
        showNotification('error', '🔒 eSign or Manual Signature Required! You cannot record payment until final eSign approval or manual signature upload is complete.');
        setIsSubmittingPayment(false);
        return;
      }

      const totalNet = invoice.calculated_net_amount || invoice.calculated_total_amount || invoice.total_amount || 0;
      const newReceived = totalReceivedAfter !== undefined ? totalReceivedAfter : amountNow;
      const isFull = newReceived >= totalNet;
      const newStatus = isFull ? 'paid' : 'unpaid';
      const newRemarks = partialRemarks !== undefined && partialRemarks !== null ? partialRemarks : (invoice.remarks || null);

      const token = localStorage.getItem('token');
      const res = await axios.post('/api/invoices',
        { ...invoice, payment_status: newStatus, received: newReceived, remarks: newRemarks },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res?.data?.success) {
        await loadAllData();
        if (isFull) {
          showNotification('success', `Payment of ${formatRupees(amountNow)} received! Invoice is now FULLY PAID 🎉`);
        } else {
          const rem = Math.max(0, totalNet - newReceived);
          showNotification('success', `Payment of ${formatRupees(amountNow)} recorded! Remaining balance: ${formatRupees(rem)}`);
        }
        setShowAmountReceivedModal(false);
        setPaymentInvoiceId(null);
        setPaymentAmount(0);
      }
    } catch (err) {
      showNotification('error', 'Payment update failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsSubmittingPayment(false);
    }
  }, [paymentInvoiceId, invoices, loadAllData, showNotification]);

  const handleUpdatePaymentStatus = useCallback(async (invoiceId, newStatus, e) => {
    e.stopPropagation();
    if (userRole !== 'admin' && userRole !== 'super_admin') {
      showNotification('error', 'Admin access required');
      return;
    }

    const invoice = invoices.find(i => i.id === invoiceId);
    if (!invoice) return;

    if (invoice.payment_status === 'cancelled') {
      showNotification('error', '🔒 Invoice is Cancelled and locked!');
      return;
    }

    const isManuallySigned = invoice.manual_signature_status === 'Manually Signed' || !!invoice.manual_signed_file_id;
    const isApprovedOrSigned = invoice.approval_status === 'final_approved' || isManuallySigned;

    if (!isApprovedOrSigned && newStatus !== 'cancelled') {
      showNotification('error', '🔒 eSign or Manual Signature Required! You cannot update payment status until final eSign approval or manual signature upload is complete.');
      return;
    }

    if (newStatus === 'cancelled') {
      setCancelInvoiceId(invoiceId);
      setCancelReason('');
      setShowCancelModal(true);
      return;
    }

    if (newStatus === 'paid') {
      setPaymentInvoiceId(invoiceId);
      setPaymentAmount(invoice.received || 0);
      setShowAmountReceivedModal(true);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/invoices', { ...invoice, payment_status: newStatus }, { headers: { Authorization: `Bearer ${token}` } });
      if (res?.data?.success) {
        await loadAllData();
        showNotification('success', `Status updated to ${newStatus.toUpperCase()}`);
      }
    } catch (err) {
      showNotification('error', 'Update failed: ' + (err.response?.data?.error || err.message));
    }
  }, [userRole, invoices, loadAllData, showNotification]);

  const handleApprovalAction = useCallback((invoice, action, e) => {
    e.stopPropagation();
    if (action === 'request') handleRequestESign(invoice.id, e);
    else if (action === 'esign') {
      setESignInvoiceId(invoice.id);
      setShowESignModal(true);
    } else if (action === 'preview') handlePreviewPDF(invoice.id, e);
  }, [handleRequestESign, handlePreviewPDF]);

  const handleCardClick = useCallback((key) => {
    setCurrentPage(1);

    // If re-clicking the active card -> cancel filter automatically
    if (activeCardFilter === key) {
      setActiveCardFilter(null);
      setSelectedStatusFilter('all');
      setSelectedApprovalFilter('all');
      showNotification('success', 'Card filter cancelled');
      return;
    }

    if (key === 'total') {
      setActiveCardFilter('total');
      setSelectedStatusFilter('all');
      setSelectedApprovalFilter('all');
      showNotification('success', 'Filtered: Showing all invoices');
    } else if (key === 'paid') {
      setActiveCardFilter('paid');
      setSelectedStatusFilter('paid');
      setSelectedApprovalFilter('all');
      showNotification('success', 'Filtered: Amount Received (Paid Invoices)');
    } else if (key === 'pending') {
      setActiveCardFilter('pending');
      setSelectedStatusFilter('all');
      setSelectedApprovalFilter('all');
      showNotification('success', 'Filtered: Pending Amount (Partial, Unpaid & Cancelled)');
    } else if (key === 'esign_requested') {
      setActiveCardFilter('esign_requested');
      setSelectedStatusFilter('all');
      setSelectedApprovalFilter('requested');
      showNotification('success', 'Filtered: eSign Requested & Pending Approvals');
    }
  }, [activeCardFilter, showNotification]);

  const filteredInvoices = useMemo(() => {
    let f = [...invoices];
    if (searchTerm.trim()) {
      const sl = searchTerm.toLowerCase().trim();
      f = f.filter(inv => {
        const fields = [inv.client_name, inv.invoice_number, inv.client_gst, inv.bank_name, inv.client_branch, inv.description, inv.remarks, inv.full_name, inv.created_by_name];
        return fields.some(x => x?.toLowerCase().includes(sl));
      });
    }
    if (startDate && endDate) {
      const s = createLocalDate(startDate), e2 = createLocalDate(endDate);
      if (s && e2) {
        e2.setHours(23, 59, 59, 999);
        f = f.filter(inv => {
          const d = createLocalDate(inv.date);
          return d && d >= s && d <= e2;
        });
      }
    } else if (startDate) {
      const s = createLocalDate(startDate);
      if (s) f = f.filter(inv => {
        const d = createLocalDate(inv.date);
        return d && d >= s;
      });
    } else if (endDate) {
      const e2 = createLocalDate(endDate);
      if (e2) {
        e2.setHours(23, 59, 59, 999);
        f = f.filter(inv => {
          const d = createLocalDate(inv.date);
          return d && d <= e2;
        });
      }
    }

    if (selectedFY !== 'all') {
      f = f.filter(i => getFinancialYearCode(i.date, i.invoice_number) === selectedFY);
    }

    if (activeCardFilter === 'total') {
      // Show all invoices
    } else if (activeCardFilter === 'paid') {
      f = f.filter(i => {
        const totalNet = i.calculated_net_amount || i.calculated_total_amount || i.total_amount || 0;
        const receivedAmt = parseFloat(i.received) || 0;
        const pendingAmt = Math.max(0, totalNet - receivedAmt);
        const isCancelled = i.payment_status === 'cancelled';
        return (i.payment_status === 'paid' || (receivedAmt > 0 && pendingAmt <= 0)) && !isCancelled;
      });
    } else if (activeCardFilter === 'pending') {
      f = f.filter(i => {
        const totalNet = i.calculated_net_amount || i.calculated_total_amount || i.total_amount || 0;
        const receivedAmt = parseFloat(i.received) || 0;
        const pendingAmt = Math.max(0, totalNet - receivedAmt);
        const isCancelled = i.payment_status === 'cancelled';
        const isUnpaid = i.payment_status === 'unpaid' || (!i.payment_status || i.payment_status === '');
        const isPartiallyPaid = receivedAmt > 0 && pendingAmt > 0 && !isCancelled;
        return isUnpaid || isCancelled || isPartiallyPaid;
      });
    } else if (activeCardFilter === 'esign_requested') {
      f = f.filter(i => i.approval_status === 'requested' || i.approval_status === 'created' || i.approval_status !== 'final_approved');
    } else {
      if (selectedStatusFilter !== 'all') f = f.filter(i => i.payment_status === selectedStatusFilter);
      if (selectedApprovalFilter !== 'all') f = f.filter(i => i.approval_status === selectedApprovalFilter);
    }

    return f.sort((a, b) => {
      const da = createLocalDate(a.date), db = createLocalDate(b.date);
      return (da && db) ? (db - da) : (b.id - a.id);
    });
  }, [invoices, searchTerm, selectedStatusFilter, selectedApprovalFilter, selectedFY, startDate, endDate, activeCardFilter]);

  const exportToExcel = useCallback(async () => {
    if (!filteredInvoices.length) {
      showNotification('error', 'No invoices to export');
      return;
    }
    try {
      const exportInvoices = [...filteredInvoices].sort((a, b) => {
        const dateA = createLocalDate(a.date);
        const dateB = createLocalDate(b.date);

        if (dateA && dateB) {
          const comparison = dateA - dateB;
          if (comparison !== 0) return comparison;
          const invNumA = a.invoice_number || '';
          const invNumB = b.invoice_number || '';
          return invNumA.localeCompare(invNumB);
        }
        if (dateA) return -1;
        if (dateB) return 1;
        return 0;
      });

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Invoices', {
        pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
      });

      ws.mergeCells('A1:O1');
      const titleCell = ws.getCell('A1');
      titleCell.value = 'JAYARAMA ASSOCIATES';
      titleCell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF6EA6D5' }
      };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 30;

      ws.getRow(2).height = 25;
      const headers = [
        'Sl.No.', 'Date', 'INVOICE No.', 'BANK NAME', 'CUSTOMER NAME',
        'BRANCH', 'GSTI NO.', 'BASE AMOUNT', 'SGST', 'CGST', 'IGST',
        'Total Amount', 'Net Amount after TDS', 'Payment Status', 'Remarks'
      ];

      headers.forEach((h, i) => {
        const cell = ws.getCell(2, i + 1);
        cell.value = h;
        cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF6EA6D5' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      ws.getColumn(1).width = 8;
      ws.getColumn(2).width = 12;
      ws.getColumn(3).width = 16;
      ws.getColumn(4).width = 20;
      ws.getColumn(5).width = 28;
      ws.getColumn(6).width = 15;
      ws.getColumn(7).width = 18;
      ws.getColumn(8).width = 14;
      ws.getColumn(9).width = 10;
      ws.getColumn(10).width = 10;
      ws.getColumn(11).width = 10;
      ws.getColumn(12).width = 14;
      ws.getColumn(13).width = 18;
      ws.getColumn(14).width = 16;
      ws.getColumn(15).width = 35;

      exportInvoices.forEach((inv, idx) => {
        const rowNum = idx + 3;
        const row = ws.getRow(rowNum);
        row.height = 20;

        row.getCell(1).value = idx + 1;
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(2).value = formatDateForDisplay(inv.date);
        row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(3).value = inv.invoice_number || '—';
        row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(4).value = getDisplayBankName(inv);
        row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };

        let customerName = inv.description || inv.client_name || '—';
        if (customerName.length > 40) customerName = customerName.substring(0, 37) + '...';
        row.getCell(5).value = customerName;
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(6).value = inv.client_branch || '—';
        row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };

        row.getCell(7).value = inv.client_gst || '—';
        row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };

        const baseAmount = inv.calculated_base_amount || 0;
        row.getCell(8).value = baseAmount;
        row.getCell(8).numFmt = '#,##0.00';
        row.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };

        const sgst = inv.calculated_sgst || 0;
        row.getCell(9).value = sgst;
        row.getCell(9).numFmt = '#,##0.00';
        row.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };

        const cgst = inv.calculated_cgst || 0;
        row.getCell(10).value = cgst;
        row.getCell(10).numFmt = '#,##0.00';
        row.getCell(10).alignment = { horizontal: 'center', vertical: 'middle' };

        const igst = inv.calculated_igst || 0;
        row.getCell(11).value = igst;
        row.getCell(11).numFmt = '#,##0.00';
        row.getCell(11).alignment = { horizontal: 'center', vertical: 'middle' };

        const totalAmount = inv.calculated_total_amount || (baseAmount + sgst + cgst + igst);
        row.getCell(12).value = totalAmount;
        row.getCell(12).numFmt = '#,##0.00';
        row.getCell(12).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(12).font = { bold: true };

        const netAmountFormula = `=L${rowNum}-(H${rowNum}*0.1)`;
        row.getCell(13).value = { formula: netAmountFormula, result: totalAmount - (baseAmount * 0.10) };
        row.getCell(13).numFmt = '#,##0.00';
        row.getCell(13).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(13).font = { bold: true };

        const isCancelled = inv.payment_status === 'cancelled';
        const isPaid = inv.payment_status === 'paid';
        const totalNet = inv.calculated_net_amount || inv.calculated_total_amount || inv.total_amount || 0;
        const receivedAmt = parseFloat(inv.received) || 0;
        const pendingAmt = Math.max(0, totalNet - receivedAmt);
        const isPartiallyPaid = receivedAmt > 0 && pendingAmt > 0 && !isCancelled;

        const paymentStatusText = isPaid ? 'PAID' : (isCancelled ? 'CANCELLED' : (isPartiallyPaid ? 'PARTIAL' : 'UNPAID'));
        row.getCell(14).value = paymentStatusText;
        row.getCell(14).alignment = { horizontal: 'center', vertical: 'middle' };

        let remarksText = inv.remarks ? (extractReasonOnly(inv.remarks) || inv.remarks) : 'None';
        if (remarksText.length > 50) remarksText = remarksText.substring(0, 47) + '...';
        row.getCell(15).value = remarksText;
        row.getCell(15).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

        for (let i = 1; i <= 15; i++) {
          const cell = row.getCell(i);
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };

          if (isCancelled) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC4C4' } };
            cell.font = { ...(cell.font || {}), color: { argb: 'FF991B1B' } };
          } else if (isPartiallyPaid) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
            cell.font = { ...(cell.font || {}), color: { argb: 'FF1E40AF' } };
          } else if (i === 14 && isPaid) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6F7D0' } };
            cell.font = { ...(cell.font || {}), color: { argb: 'FF065F46' } };
          }
        }
      });

      for (let i = 1; i <= 15; i++) {
        let maxLength = 0;
        const column = ws.getColumn(i);

        column.eachCell({ includeEmpty: true }, (cell, rowNumber) => {
          if (rowNumber <= 2) return;
          const cellValue = cell.value ? cell.value.toString() : '';
          let length = cellValue.length;

          if (i >= 8 && i <= 13) {
            length = Math.min(length, 15);
          }
          if (i === 5 || i === 15) {
            length = Math.min(length, 35);
          }

          maxLength = Math.max(maxLength, length);
        });

        const minWidth = [8, 10, 12, 12, 20, 10, 15, 12, 8, 8, 8, 12, 12, 10, 25][i - 1];
        const maxWidth = [8, 12, 16, 20, 35, 15, 20, 14, 10, 10, 10, 14, 18, 16, 40][i - 1];
        let newWidth = Math.max(minWidth, Math.min(maxLength + 2, maxWidth));

        if (i === 5) newWidth = Math.min(newWidth, 35);
        if (i === 15) newWidth = Math.min(newWidth, 40);
        if (i === 3) newWidth = Math.min(newWidth, 16);

        column.width = newWidth;
      }

      ws.pageSetup = {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        horizontalCentered: true,
        verticalCentered: false
      };

      ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

      const buf = await wb.xlsx.writeBuffer();
      const fileName = `Invoices_${new Date().toISOString().split('T')[0]}.xlsx`;
      saveAs(new Blob([buf]), fileName);
      showNotification('success', `Exported ${exportInvoices.length} invoices (sorted by date - oldest to newest)`);
    } catch (err) {
      console.error('Export error:', err);
      showNotification('error', 'Export failed: ' + (err.message || 'Unknown error'));
    }
  }, [filteredInvoices, getDisplayBankName, showNotification, formatDateForDisplay]);

  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
  const indexOfLast = currentPage * itemsPerPage;
  const indexOfFirst = indexOfLast - itemsPerPage;
  const currentInvoices = filteredInvoices.slice(indexOfFirst, indexOfLast);

  const handlePageChange = (n) => {
    setCurrentPage(n);
    document.querySelector('.ja-table-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearDateFilter = useCallback(() => {
    setStartDate('');
    setEndDate('');
    setSelectedYear('all');
    setSelectedMonthCycle('all');
    setCurrentPage(1);
    showNotification('success', 'Date filter cleared');
  }, [showNotification]);

  const clearSearchFilter = useCallback(() => {
    setSearchTerm('');
    setCurrentPage(1);
    showNotification('success', 'Search cleared');
  }, [showNotification]);

  const clearAllFilters = useCallback(() => {
    setSearchTerm('');
    setSelectedStatusFilter('all');
    setSelectedApprovalFilter('all');
    setSelectedFY('all');
    setSelectedYear('all');
    setSelectedMonthCycle('all');
    setStartDate('');
    setEndDate('');
    setActiveCardFilter(null);
    setCurrentPage(1);
    showNotification('success', 'All filters reset');
  }, [showNotification]);

  // 1. Open Invoice Deletion Details Modal (Pre-OTP)
  const handleDeleteInvoice = useCallback(async (id, e) => {
    if (e) e.stopPropagation();
    if (userRole !== 'admin' && userRole !== 'super_admin') {
      showNotification('error', 'Admin access required');
      return;
    }

    setDeleteInvoiceId(id);
    setDeleteOtp('');
    setOtpRequested(false);
    setShowDeleteOTPModal(true);
  }, [userRole, showNotification]);

  // 2. User clicks "Request OTP": Send OTP to Admin Email
  const handleRequestDeleteOTP = useCallback(async () => {
    if (!deleteInvoiceId) return;
    setIsSendingDeleteOtp(true);

    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`/api/invoices/${deleteInvoiceId}/send-delete-otp`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setOtpRequested(true);
        setTargetAdminEmail(res.data.adminEmail || 'jayaramaassociates.info@gmail.com');
        showNotification('success', `📧 OTP sent to Admin Email (${res.data.adminEmail || 'Admin Email'})`);
      }
    } catch (err) {
      console.error('Error sending deletion OTP:', err);
      showNotification('error', err.response?.data?.error || 'Failed to send OTP to Admin email');
    } finally {
      setIsSendingDeleteOtp(false);
    }
  }, [deleteInvoiceId, showNotification]);

  // 3. Verify OTP & Delete Invoice
  const handleVerifyDeleteOTP = useCallback(async () => {
    if (!deleteOtp || deleteOtp.trim().length !== 6) {
      showNotification('error', 'Please enter a valid 6-digit OTP');
      return;
    }
    setIsVerifyingDeleteOtp(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`/api/invoices/${deleteInvoiceId}/verify-delete-otp`,
        { otp: deleteOtp.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.success) {
        await loadAllData();
        showNotification('success', res.data.message || 'Invoice verified and deleted successfully');
        setShowDeleteOTPModal(false);
        setDeleteInvoiceId(null);
        setDeleteOtp('');
        setOtpRequested(false);
      }
    } catch (err) {
      console.error('Delete OTP verification error:', err);
      showNotification('error', err.response?.data?.error || 'Failed to verify OTP');
    } finally {
      setIsVerifyingDeleteOtp(false);
    }
  }, [deleteInvoiceId, deleteOtp, loadAllData, showNotification]);

  const handleConfirmCancel = useCallback(async () => {
    if (!cancelReason.trim()) {
      showNotification('error', 'Please provide a cancellation reason');
      return;
    }
    setIsSubmittingCancel(true);
    try {
      const invoice = invoices.find(i => i.id === cancelInvoiceId);
      if (!invoice) return;
      const ts = new Date().toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      const note = `\n🔴 [CANCELLED ON ${ts}] \n   Reason: ${cancelReason}\n   Cancelled by: ${userName}\n   ${'-'.repeat(50)}\n`;
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/invoices',
        { ...invoice, payment_status: 'cancelled', remarks: (invoice.remarks || '') + note },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res?.data?.success) {
        await loadAllData();
        showNotification('success', 'Invoice cancelled.');
        setShowCancelModal(false);
        setCancelInvoiceId(null);
        setCancelReason('');
      }
    } catch (err) {
      showNotification('error', 'Cancel failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsSubmittingCancel(false);
    }
  }, [cancelInvoiceId, cancelReason, userName, invoices, loadAllData, showNotification]);

  const handleViewRemarks = useCallback((invoice, e) => {
    e.stopPropagation();
    if (invoice.payment_status === 'cancelled') {
      setCancellationDetails(extractCancellationDetails(invoice.remarks));
      setIsCancelledInvoice(true);
    } else {
      let clean = invoice.remarks || 'No remarks';
      const m = clean.match(/Reason:\s*(.+?)(?:\n|$)/);
      if (m?.[1]) clean = m[1].trim().replace(/[-*]+$/, '').trim();
      else {
        clean = clean.replace(/🔴.*?CANCELLED ON.*?\n/g, '').replace(/Cancelled by:.*?\n/g, '').replace(/-{10,}/g, '').replace(/\n/g, ' ').trim();
      }
      setSelectedRemarks(clean || 'No remarks');
      setIsCancelledInvoice(false);
      setCancellationDetails(null);
    }
    setSelectedInvoiceNumber(invoice.invoice_number);
    setShowRemarksModal(true);
  }, []);

  useEffect(() => {
    setActiveCardFilter(null);
    setSelectedStatusFilter('all');
    setSelectedApprovalFilter('all');
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
    loadAllData();
  }, [user?.id, user?.role, loadAllData]);

  const stats = useMemo(() => {
    const f = filteredInvoices;
    return {
      totalInvoices: f.length,
      totalBaseAmount: f.reduce((s, i) => s + (i.calculated_base_amount || 0), 0),
      totalWithGST: f.reduce((s, i) => s + (i.calculated_total_amount || 0), 0),
      totalPaid: f.reduce((s, i) => s + (i.received || 0), 0),
      totalPending: f.reduce((s, i) => s + (i.calculated_pending || 0), 0),
      paidInvoices: f.filter(i => i.payment_status === 'paid').length,
      unpaidInvoices: f.filter(i => i.payment_status === 'unpaid').length,
      cancelledInvoices: f.filter(i => i.payment_status === 'cancelled').length,
      requestedInvoices: f.filter(i => i.approval_status === 'requested').length,
      approvedInvoices: f.filter(i => i.approval_status === 'final_approved').length,
    };
  }, [filteredInvoices]);



  if (loading) return <LoadingScreen />;

  const isAdminOrSuper = userRole === 'admin' || userRole === 'super_admin';

  return (
    <div className="ja-dashboard">
      <style>{STYLES}</style>
      <Sidebar user={user} onLogout={onLogout} onCreateNew={onCreateNew} userRole={userRole} onMasterData={onShowMasterData} />

      <main className="ja-main">
        <div className="ja-header">
          <div>
            <div className="ja-header-title">Jayarama Associates</div>
            <div className="ja-header-sub">Invoice Management System</div>
            <div>
              {userRole === 'admin' && <span className="ja-role-badge admin">👑 Administrator</span>}
              {userRole === 'super_admin' && <span className="ja-role-badge super">⭐ Super Admin</span>}
              {userRole === 'user' && <span className="ja-role-badge user">👤 User</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {userRole === 'super_admin' && (
              <button className="ja-btn-analysis" onClick={handleAnalysisClick}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9h-4m-7 9A9 9 0 0 1 3 12m9 9v-4M3 12a9 9 0 0 1 9-9m-9 9h4m7-9a9 9 0 0 1 9 9" />
                </svg>
                Data Analysis
              </button>
            )}
            {userRole === 'super_admin' && (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleExcelUpload}
                  accept=".xlsx,.xls"
                  style={{ display: 'none' }}
                />
                <button
                  className="ja-btn-import"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingExcel}
                >
                  {isUploadingExcel ? (
                    <><span className="ja-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Uploading...</>
                  ) : (
                    <><UploadIcon size={14} /> Import Excel</>
                  )}
                </button>
              </>
            )}
            <button className="ja-btn-new" onClick={onCreateNew}>
              <PlusIcon size={14} /> New Invoice
            </button>
          </div>
        </div>

        {userRole === 'super_admin' && <StatsCards stats={stats} userRole={userRole} activeCardFilter={activeCardFilter} onCardClick={handleCardClick} />}

        <FilterBar
          searchTerm={searchTerm} setSearchTerm={setSearchTerm}
          selectedStatusFilter={selectedStatusFilter} setSelectedStatusFilter={setSelectedStatusFilter}
          selectedApprovalFilter={selectedApprovalFilter} setSelectedApprovalFilter={setSelectedApprovalFilter}
          selectedFY={selectedFY} setSelectedFY={setSelectedFY} availableFinancialYears={availableFinancialYears}
          startDate={startDate} setStartDate={setStartDate} endDate={endDate} setEndDate={setEndDate}
          selectedYear={selectedYear} setSelectedYear={setSelectedYear}
          selectedMonthCycle={selectedMonthCycle} setSelectedMonthCycle={setSelectedMonthCycle}
          userRole={userRole} clearSearchFilter={clearSearchFilter}
          clearDateFilter={clearDateFilter} clearAllFilters={clearAllFilters}
          activeCardFilter={activeCardFilter} setActiveCardFilter={setActiveCardFilter}
          showNotification={showNotification}
        />

        <div className="ja-table-wrap">
          <div className="ja-table-scroll">
            <table className="ja-table">
              <thead>
                <tr>
                  <th style={{ minWidth: '110px', textAlign: 'left', paddingLeft: '16px' }}>Date</th>
                  <th style={{ minWidth: '135px' }}>Invoice No.</th>
                  <th style={{ minWidth: '175px' }}>Bank Name</th>
                  <th style={{ minWidth: '200px' }}>Customer</th>
                  <th style={{ minWidth: '150px' }}>GSTIN</th>
                  <th style={{ minWidth: '130px' }}>Base Amount</th>
                  <th style={{ minWidth: '130px' }}>Total Amount</th>
                  <th style={{ minWidth: '120px' }}>Action</th>
                  <th style={{ minWidth: '120px' }}>Approval</th>
                  {isAdminOrSuper && <th style={{ minWidth: '120px' }}>Payment</th>}
                  <th style={{ minWidth: '120px' }}>Remarks</th>
                  {isAdminOrSuper && <th style={{ minWidth: '180px' }}>Created By</th>}
                  {isAdminOrSuper && <th style={{ minWidth: '100px' }}>Delete</th>}
                </tr>
              </thead>
              <tbody>
                {currentInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={isAdminOrSuper ? 13 : 10} style={{ padding: 0 }}>
                      <div className="ja-empty">
                        <FileIcon size={64} className="ja-empty-icon" />
                        <div className="ja-empty-text">
                          {searchTerm ? `No invoices match "${searchTerm}"` : 'No invoices found'}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : currentInvoices.map(invoice => {
                  const ps = invoice.payment_status || 'unpaid';
                  const as = invoice.approval_status || 'created';
                  const ab = getApprovalBadge(as, invoice);
                  const actionBtn = getApprovalActionButton(invoice);

                  const totalNet = invoice.calculated_net_amount || invoice.calculated_total_amount || invoice.total_amount || 0;
                  const receivedAmt = parseFloat(invoice.received) || 0;
                  const pendingAmt = Math.max(0, totalNet - receivedAmt);

                  const isCancelled = ps === 'cancelled';
                  const isManuallySigned = invoice.manual_signature_status === 'Manually Signed' || !!invoice.manual_signed_file_id;
                  const isApprovedOrSigned = as === 'final_approved' || isManuallySigned;
                  const isFullyPaid = (ps === 'paid' || (receivedAmt > 0 && pendingAmt <= 0)) && !isCancelled;
                  const isPartiallyPaid = receivedAmt > 0 && pendingAmt > 0 && !isCancelled;

                  return (
                    <tr key={invoice.id}
                      style={isAdminOrSuper ? {
                        backgroundColor: isCancelled ? '#fef2f2' : (isFullyPaid && !isApprovedOrSigned) ? '#eff6ff' : (isFullyPaid && isApprovedOrSigned) ? '#ecfdf5' : isPartiallyPaid ? '#eff6ff' : '#ffffff',
                        color: isCancelled ? '#991b1b' : 'var(--text1)',
                        transition: 'background-color 0.15s ease'
                      } : {
                        backgroundColor: isCancelled ? '#fef2f2' : isApprovedOrSigned ? '#ecfdf5' : as === 'requested' ? '#eff6ff' : '#ffffff',
                        color: isCancelled ? '#991b1b' : isApprovedOrSigned ? '#065f46' : as === 'requested' ? '#1e40af' : 'var(--text1)',
                        transition: 'background-color 0.15s ease'
                      }}
                      onClick={() => onEditInvoice(invoice)}
                    >
                      <td style={{ fontWeight: 500, minWidth: '110px' }}>{formatDateForDisplay(invoice.date)}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, minWidth: '135px' }}>{invoice.invoice_number || '—'}</td>
                      <td style={{ fontWeight: 600, minWidth: '175px' }}>{truncateText(getDisplayBankName(invoice), 35)}</td>
                      <td style={{ fontWeight: 500, minWidth: '200px' }}>{truncateText(invoice.description || invoice.client_name || '—', 45)}</td>
                      <td>{invoice.client_gst || '—'}</td>
                      {(() => {
                        const displayBase = invoice.calculated_base_amount || parseFloat(invoice.base_amount) || parseFloat(invoice.amount) || 0;
                        const displayTotal = invoice.calculated_total_amount || parseFloat(invoice.total_amount) || (displayBase > 0 ? displayBase * 1.18 : 0);
                        return (
                          <>
                            <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{formatRupees(displayBase)}</td>
                            <td style={{ fontWeight: 700 }}>{formatRupees(displayTotal)}</td>
                          </>
                        );
                      })()}
                      {/* Action Cell */}
                      <td>
                        {actionBtn && (
                          <button
                            className={`ja-action-btn ${actionBtn.color}`}
                            onClick={e => handleApprovalAction(invoice, actionBtn.action, e)}
                            disabled={actionBtn.disabled}
                          >
                            {actionBtn.text}
                          </button>
                        )}
                      </td>
                      {/* Approval Cell */}
                      <td><span className={`ja-badge ${ab.cls}`}>{ab.label}</span></td>
                      {/* Payment Cell */}
                      {isAdminOrSuper && (() => {
                        const isSignRemaining = as !== 'final_approved' && !isManuallySigned;

                        return (
                          <td style={{
                            backgroundColor: 'transparent',
                            border: 'none',
                            padding: '6px 12px',
                            textAlign: 'center'
                          }}>
                            {ps === 'cancelled' ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '1px 0' }}>
                                <span
                                  className="ja-badge cancelled"
                                  onClick={(e) => handleViewRemarks(invoice, e)}
                                  style={{
                                    background: '#fef2f2',
                                    color: '#dc2626',
                                    border: '1px solid #fecaca',
                                    padding: '4px 12px',
                                    borderRadius: '20px',
                                    fontWeight: 600,
                                    fontSize: '0.7rem',
                                    letterSpacing: '0.02em',
                                    display: 'inline-block',
                                    cursor: 'pointer'
                                  }}
                                  title="Click to view cancellation details"
                                >
                                  CANCELLED
                                </span>
                              </div>
                            ) : isSignRemaining ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '1px 0' }}>
                                <span
                                  className="ja-badge unpaid"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setApprovalModalInvoiceNumber(invoice.invoice_number || 'N/A');
                                    setShowApprovalModal(true);
                                  }}
                                  style={{
                                    background: '#f8fafc',
                                    color: '#64748b',
                                    border: '1px solid #cbd5e1',
                                    padding: '3px 12px',
                                    borderRadius: '20px',
                                    fontWeight: 600,
                                    fontSize: '0.72rem',
                                    display: 'inline-block',
                                    whiteSpace: 'nowrap',
                                    cursor: 'pointer'
                                  }}
                                  title="Click to view approval requirements"
                                >
                                  None
                                </span>
                              </div>
                            ) : isAdminOrSuper ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                {isPartiallyPaid ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '1px 0' }}>
                                    {/* PARTIAL Button */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPaymentInvoiceId(invoice.id);
                                        setPaymentAmount(invoice.received || 0);
                                        setShowAmountReceivedModal(true);
                                      }}
                                      style={{
                                        background: '#1e40af',
                                        color: '#ffffff',
                                        border: 'none',
                                        borderRadius: '20px',
                                        padding: '3px 12px',
                                        fontSize: '0.68rem',
                                        fontWeight: 600,
                                        letterSpacing: '0.03em',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
                                        transition: 'all 0.15s ease'
                                      }}
                                      title="Click to add payment"
                                    >
                                      PARTIAL
                                    </button>

                                    {/* Below Button: Balance */}
                                    <div style={{ fontSize: '0.65rem', color: '#b45309', fontWeight: 600, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                      Bal: {formatRupees(pendingAmt)}
                                    </div>
                                  </div>
                                ) : isFullyPaid ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '1px 0' }}>
                                    <span
                                      className="ja-badge paid"
                                      style={{
                                        background: '#15803d',
                                        color: '#ffffff',
                                        border: 'none',
                                        padding: '4px 12px',
                                        borderRadius: '20px',
                                        fontWeight: 600,
                                        fontSize: '0.7rem',
                                        letterSpacing: '0.02em',
                                        display: 'inline-block'
                                      }}
                                    >
                                      ✓ PAID
                                    </span>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <select className="ja-status-select"
                                      value={ps}
                                      onChange={e => handleUpdatePaymentStatus(invoice.id, e.target.value, e)}
                                      onClick={e => e.stopPropagation()}
                                      style={{
                                        border: ps === 'unpaid' ? '1px solid #fecaca' : '1px solid #cbd5e1',
                                        borderRadius: '9999px',
                                        padding: '3px 8px',
                                        fontWeight: 600,
                                        fontSize: '0.72rem',
                                        background: '#ffffff',
                                        color: ps === 'unpaid' ? '#dc2626' : '#334155',
                                        width: ps === 'unpaid' ? '65px' : '52px',
                                        textAlign: 'center',
                                        textAlignLast: 'center',
                                        boxSizing: 'border-box'
                                      }}
                                    >
                                      <option value="unpaid">Unpaid</option>
                                      <option value="paid">Paid</option>
                                      <option value="cancelled">Cancelled</option>
                                    </select>
                                    {receivedAmt > 0 && (
                                      <div style={{ fontSize: '0.62rem', color: '#6366f1', fontWeight: 500, marginTop: 2 }}>
                                        Received: {formatRupees(receivedAmt)}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className={`ja-badge ${isFullyPaid ? 'paid' : isPartiallyPaid ? 'partial' : 'unpaid'}`}
                                style={
                                  isFullyPaid ? { background: '#15803d', color: '#ffffff', fontWeight: 600, borderRadius: '20px', padding: '3px 10px', fontSize: '0.7rem', border: 'none', width: 'fit-content' } :
                                    isPartiallyPaid ? { background: '#1e40af', color: '#ffffff', fontWeight: 600, borderRadius: '20px', padding: '3px 10px', fontSize: '0.7rem', border: 'none', width: 'fit-content' } :
                                      { padding: '3px 10px', fontSize: '0.7rem', width: 'fit-content' }
                                }
                              >
                                {isFullyPaid ? 'PAID' : isPartiallyPaid ? 'PARTIAL' : 'UNPAID'}
                              </span>
                            )}
                          </td>
                        );
                      })()}
                      <td>
                        {ps === 'cancelled' ? (
                          invoice.remarks ? (
                            <button className="ja-remarks-btn cancelled" onClick={e => handleViewRemarks(invoice, e)}>
                              View Reason
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.68rem', color: 'var(--text3)', fontStyle: 'italic' }}>None</span>
                          )
                        ) : !invoice.remarks ? (
                          <span style={{ fontSize: '0.68rem', color: 'var(--text3)', fontStyle: 'italic' }}>None</span>
                        ) : (
                          <span
                            style={{ fontSize: '0.68rem', color: 'var(--text3)', fontStyle: 'italic', cursor: 'pointer' }}
                            title={invoice.remarks}
                            onClick={e => handleViewRemarks(invoice, e)}
                          >
                            {truncateText(invoice.remarks, 30)}
                          </span>
                        )}
                      </td>
                      {isAdminOrSuper && <td style={{ minWidth: '180px', fontWeight: 600 }}>{truncateText(invoice.full_name || invoice.created_by_name || 'Unknown', 35)}</td>}
                      {(userRole === 'admin' || userRole === 'super_admin') && (
                        <td style={{ minWidth: '100px' }}><button className="ja-delete-btn" onClick={e => handleDeleteInvoice(invoice.id, e)}>Delete</button></td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {filteredInvoices.length > 0 && (
          <Pagination
            currentPage={currentPage} totalPages={totalPages}
            itemsPerPage={itemsPerPage} setItemsPerPage={n => { setItemsPerPage(n); setCurrentPage(1); }}
            onPageChange={handlePageChange} totalItems={filteredInvoices.length}
            startIndex={indexOfFirst} endIndex={indexOfLast}
          />
        )}

        <div className="ja-footer-bar">
          <div style={{ fontSize: '0.78rem', color: 'var(--text3)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span><strong style={{ color: 'var(--text1)' }}>{filteredInvoices.length}</strong> records</span>
            {filteredInvoices.length !== invoices.length && (
              <span style={{ background: '#eef2ff', color: '#4338ca', padding: '2px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600 }}>
                filtered from {invoices.length}
              </span>
            )}
          </div>
          <button className="ja-export-btn" onClick={exportToExcel}>
            <DownloadIcon size={15} /> Export to Excel
          </button>
        </div>
      </main>

      <AmountReceivedModal
        isOpen={showAmountReceivedModal}
        onClose={() => { setShowAmountReceivedModal(false); setPaymentInvoiceId(null); setPaymentAmount(0); }}
        onConfirm={handleConfirmPayment}
        invoice={invoices.find(i => i.id === paymentInvoiceId)}
        currentReceived={paymentAmount}
        isSubmitting={isSubmittingPayment}
      />

      <DeleteOTPModal
        isOpen={showDeleteOTPModal}
        onClose={() => { setShowDeleteOTPModal(false); setDeleteInvoiceId(null); setDeleteOtp(''); setOtpRequested(false); }}
        onRequestOTP={handleRequestDeleteOTP}
        onVerifyAndDelete={handleVerifyDeleteOTP}
        isSendingOtp={isSendingDeleteOtp}
        otpRequested={otpRequested}
        isSubmitting={isVerifyingDeleteOtp}
        otp={deleteOtp}
        setOtp={setDeleteOtp}
        invoiceId={deleteInvoiceId}
        invoices={invoices}
        targetAdminEmail={targetAdminEmail}
        requestorName={userName}
      />

      <CancelModal isOpen={showCancelModal} onClose={() => { setShowCancelModal(false); setCancelInvoiceId(null); setCancelReason(''); }}
        onConfirm={handleConfirmCancel} isSubmitting={isSubmittingCancel}
        cancelReason={cancelReason} setCancelReason={setCancelReason} />

      <RemarksModal isOpen={showRemarksModal} onClose={() => setShowRemarksModal(false)}
        invoiceNumber={selectedInvoiceNumber} isCancelled={isCancelledInvoice}
        cancellationDetails={cancellationDetails} remarks={selectedRemarks} />

      <ESignModal
        isOpen={showESignModal}
        onClose={() => { setShowESignModal(false); setESignInvoiceId(null); }}
        onConfirm={() => handleFinalESign(eSignInvoiceId)}
        invoice={invoices.find(i => i.id === eSignInvoiceId)}
        loading={isSubmittingESign}
        onPreview={(id) => handlePreviewPDF(id)}
      />

      {showPDFPreview && previewInvoiceData && (
        <FullPagePDFPreview
          invoice={previewInvoiceData}
          userRole={userRole}
          onClose={() => {
            setShowPDFPreview(false);
            setPreviewInvoiceData(null);
          }}
          showNotification={showNotification}
        />
      )}

      {showApprovalModal && (
        <div className="ja-overlay" onClick={() => setShowApprovalModal(false)}>
          <div className="ja-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px', textAlign: 'center', padding: '24px' }}>
            <div style={{ fontSize: '42px', marginBottom: '12px' }}>🔒</div>
            <h3 style={{ margin: '0 0 8px 0', color: '#1e293b', fontSize: '1.15rem', fontWeight: 700 }}>
              Approval is required
            </h3>
            <p style={{ fontSize: '0.88rem', color: '#64748b', lineHeight: 1.5, marginBottom: '22px' }}>
              Invoice <strong>#{approvalModalInvoiceNumber}</strong> requires final eSign approval from Super Admin before payment can be updated.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={() => setShowApprovalModal(false)}
                style={{
                  background: '#0f4c81',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 24px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                OK, Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {notification && <Notification type={notification.type} message={notification.message} />}
    </div>
  );
};

export default Dashboard;

