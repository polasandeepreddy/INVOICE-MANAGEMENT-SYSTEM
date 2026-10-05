// src/components/DataAnalysis.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import Sidebar from './Sidebar';
import LoadingScreen from './LoadingScreen';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  RadialLinearScale,
  Filler
} from 'chart.js';
import { Bar, Pie, Line, Doughnut, PolarArea } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend,
  ArcElement, PointElement, LineElement, RadialLinearScale, Filler
);

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const T = {
  // Base palette — deep navy ink + warm paper + sharp accent
  ink:       '#0B0F1A',
  inkMid:    '#1E2535',
  inkLight:  '#3A4259',
  paper:     '#F4F2EC',
  paperDark: '#EAE7DE',
  paperLine: '#DDDAD0',
  white:     '#FFFFFF',

  // Accents
  cobalt:    '#1B4FD8',
  cobaltSoft:'rgba(27,79,216,0.12)',
  cobaltMid: 'rgba(27,79,216,0.35)',
  emerald:   '#0E7B55',
  emeraldSoft:'rgba(14,123,85,0.12)',
  crimson:   '#C0263D',
  crimsonSoft:'rgba(192,38,61,0.12)',
  amber:     '#C97D00',
  amberSoft: 'rgba(201,125,0,0.12)',
  violet:    '#5B35CC',
  violetSoft:'rgba(91,53,204,0.12)',
  slate:     '#6B7280',

  // Chart palette
  chartPalette: [
    '#1B4FD8','#0E7B55','#C0263D','#C97D00','#5B35CC',
    '#0891B2','#059669','#DC2626','#D97706','#7C3AED',
  ],

  // Shadows
  shadow:    '0 2px 12px rgba(11,15,26,0.08)',
  shadowMd:  '0 4px 24px rgba(11,15,26,0.12)',
  shadowLg:  '0 8px 48px rgba(11,15,26,0.16)',

  // Typography
  fontDisplay: "'DM Serif Display', 'Georgia', serif",
  fontMono:    "'JetBrains Mono', 'Fira Code', monospace",
  fontBody:    "'DM Sans', 'Helvetica Neue', sans-serif",

  // Radii
  radius:    '10px',
  radiusSm:  '6px',
  radiusLg:  '16px',
  radiusPill:'100px',
};

// ─── INJECT GOOGLE FONTS ──────────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('da-fonts')) {
  const link = document.createElement('link');
  link.id = 'da-fonts';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display&family=JetBrains+Mono:wght@400;500;600&display=swap';
  document.head.appendChild(link);
}

// ─── GLOBAL STYLES (including pencil loading animation) ────────────────────────────────────────────────────────────
const injectStyles = () => {
  if (typeof document === 'undefined') return;
  const id = 'da-styles';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    .da-root * { box-sizing: border-box; font-family: ${T.fontBody}; }
    .da-root { background: ${T.paper}; }

    /* Scrollbar */
    .da-root ::-webkit-scrollbar { width: 4px; height: 4px; }
    .da-root ::-webkit-scrollbar-track { background: transparent; }
    .da-root ::-webkit-scrollbar-thumb { background: ${T.paperLine}; border-radius: 4px; }

    /* KPI Card */
    .da-kpi {
      background: ${T.white};
      border-radius: ${T.radiusLg};
      border: 1px solid ${T.paperLine};
      padding: 18px 20px;
      display: flex; flex-direction: column; gap: 6px;
      box-shadow: ${T.shadow};
      transition: transform .2s, box-shadow .2s;
      position: relative; overflow: hidden;
    }
    .da-kpi::before {
      content: '';
      position: absolute; top: 0; left: 0; right: 0; height: 3px;
      border-radius: ${T.radiusLg} ${T.radiusLg} 0 0;
    }
    .da-kpi:hover { transform: translateY(-2px); box-shadow: ${T.shadowMd}; }
    .da-kpi.cobalt::before { background: ${T.cobalt}; }
    .da-kpi.emerald::before { background: ${T.emerald}; }
    .da-kpi.crimson::before { background: ${T.crimson}; }
    .da-kpi.violet::before { background: ${T.violet}; }
    .da-kpi.amber::before { background: ${T.amber}; }

    /* Chart Card */
    .da-card {
      background: ${T.white};
      border-radius: ${T.radiusLg};
      border: 1px solid ${T.paperLine};
      padding: 16px 18px;
      box-shadow: ${T.shadow};
      display: flex; flex-direction: column; gap: 12px;
      height: 100%;
      transition: box-shadow .2s;
    }
    .da-card:hover { box-shadow: ${T.shadowMd}; }

    /* Toggle Pill */
    .da-toggle {
      display: flex; gap: 2px;
      background: ${T.paperDark};
      border-radius: ${T.radiusPill};
      padding: 3px;
    }
    .da-toggle button {
      border: none; cursor: pointer;
      padding: 3px 10px; border-radius: ${T.radiusPill};
      font-size: 10px; font-weight: 600; letter-spacing: .04em;
      text-transform: uppercase;
      transition: all .15s;
      font-family: ${T.fontBody};
    }
    .da-toggle button.active {
      background: ${T.white}; color: ${T.ink};
      box-shadow: 0 1px 3px rgba(0,0,0,.12);
    }
    .da-toggle button:not(.active) {
      background: transparent; color: ${T.slate};
    }
    .da-toggle button:not(.active):hover { color: ${T.inkMid}; }

    /* Table */
    .da-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .da-table thead tr { background: ${T.paperDark}; position: sticky; top: 0; z-index: 1; }
    .da-table thead th {
      padding: 9px 12px; text-align: right; font-weight: 600;
      font-size: 10px; color: ${T.inkLight}; letter-spacing: .05em; text-transform: uppercase;
      border-bottom: 1px solid ${T.paperLine};
    }
    .da-table thead th:first-child { text-align: left; }
    .da-table tbody tr { border-bottom: 1px solid ${T.paperDark}; transition: background .12s; }
    .da-table tbody tr:hover { background: ${T.paperDark}; }
    .da-table tbody td { padding: 8px 12px; text-align: right; color: ${T.inkMid}; font-size: 11px; }
    .da-table tbody td:first-child { text-align: left; font-weight: 600; color: ${T.ink}; font-family: ${T.fontMono}; font-size: 10px; }

    /* Badge */
    .da-badge {
      display: inline-block; padding: 2px 8px; border-radius: ${T.radiusPill};
      font-size: 9px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
    }

    /* Rate Badge */
    .da-rate-high { background: rgba(14,123,85,.12); color: ${T.emerald}; }
    .da-rate-mid  { background: rgba(201,125,0,.12);  color: ${T.amber}; }
    .da-rate-low  { background: rgba(192,38,61,.12);  color: ${T.crimson}; }

    /* Monospaced numbers */
    .da-mono { font-family: ${T.fontMono}; font-size: 10px; }

    /* Sparkline trend indicator */
    .da-trend-up   { color: ${T.emerald}; font-size: 10px; font-weight: 700; }
    .da-trend-down { color: ${T.crimson}; font-size: 10px; font-weight: 700; }

    /* Input / Select */
    .da-input {
      padding: 7px 12px;
      border: 1px solid ${T.paperLine};
      border-radius: ${T.radiusSm};
      font-size: 12px; font-family: ${T.fontBody};
      background: ${T.paperDark}; color: ${T.ink};
      outline: none; transition: border-color .15s, box-shadow .15s;
    }
    .da-input:focus { border-color: ${T.cobalt}; box-shadow: 0 0 0 3px ${T.cobaltSoft}; }

    /* Btn */
    .da-btn {
      padding: 7px 16px; border-radius: ${T.radiusPill};
      border: none; cursor: pointer; font-family: ${T.fontBody};
      font-size: 11px; font-weight: 600; letter-spacing: .04em;
      display: inline-flex; align-items: center; gap: 6px;
      transition: opacity .15s, transform .1s, box-shadow .15s;
    }
    .da-btn:hover  { opacity: .88; transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,.15); }
    .da-btn:active { transform: translateY(0); }
    .da-btn-primary { background: ${T.ink}; color: ${T.white}; }
    .da-btn-emerald { background: ${T.emerald}; color: ${T.white}; }
    .da-btn-ghost   { background: ${T.white}; color: ${T.inkMid}; border: 1px solid ${T.paperLine}; }

    /* Section heading */
    .da-section-label {
      font-size: 9px; font-weight: 700; letter-spacing: .12em;
      text-transform: uppercase; color: ${T.slate};
    }

    /* Progress bar */
    .da-bar-bg { background: ${T.paperDark}; border-radius: 4px; height: 5px; overflow: hidden; }
    .da-bar-fill { height: 100%; border-radius: 4px; transition: width .6s cubic-bezier(.4,0,.2,1); }

    /* Skeleton loader */
    @keyframes da-shimmer {
      0%   { background-position: -400px 0; }
      100% { background-position:  400px 0; }
    }
    .da-skeleton {
      background: linear-gradient(90deg, ${T.paperDark} 25%, ${T.paperLine} 50%, ${T.paperDark} 75%);
      background-size: 800px 100%;
      animation: da-shimmer 1.4s infinite;
      border-radius: ${T.radiusSm};
    }

    /* Notification dot */
    .da-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }

    /* Fade-in for sections */
    @keyframes da-fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
    .da-animate { animation: da-fadeUp .35s ease both; }
    .da-delay-1 { animation-delay: .05s; }
    .da-delay-2 { animation-delay: .10s; }
    .da-delay-3 { animation-delay: .15s; }
    .da-delay-4 { animation-delay: .20s; }

    /* ===== PENCIL LOADING ANIMATION STYLES ===== */
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    @keyframes pencilBody1 {
      from, to {
        stroke-dashoffset: 351.86;
        transform: rotate(-90deg);
      }
      50% {
        stroke-dashoffset: 150.8;
        transform: rotate(-225deg);
      }
    }

    @keyframes pencilBody2 {
      from, to {
        stroke-dashoffset: 406.84;
        transform: rotate(-90deg);
      }
      50% {
        stroke-dashoffset: 174.36;
        transform: rotate(-225deg);
      }
    }

    @keyframes pencilBody3 {
      from, to {
        stroke-dashoffset: 296.88;
        transform: rotate(-90deg);
      }
      50% {
        stroke-dashoffset: 127.23;
        transform: rotate(-225deg);
      }
    }

    @keyframes pencilEraser {
      from, to {
        transform: rotate(-45deg) translate(49px,0);
      }
      50% {
        transform: rotate(0deg) translate(49px,0);
      }
    }

    @keyframes pencilEraserSkew {
      from, 32.5%, 67.5%, to {
        transform: skewX(0);
      }
      35%, 65% {
        transform: skewX(-4deg);
      }
      37.5%, 62.5% {
        transform: skewX(8deg);
      }
      40%, 45%, 50%, 55%, 60% {
        transform: skewX(-15deg);
      }
      42.5%, 47.5%, 52.5%, 57.5% {
        transform: skewX(15deg);
      }
    }

    @keyframes pencilPoint {
      from, to {
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
      75%, to {
        stroke-dashoffset: 439.82;
        transform: translate(100px,100px) rotate(112deg);
      }
    }

    .pencil {
      display: block;
      width: 10em;
      height: 10em;
      color: ${T.cobalt};
      margin: 0 auto;
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

    .da-loading-container {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      background: linear-gradient(135deg, ${T.paper} 0%, ${T.white} 100%);
      z-index: 9999;
    }

    .da-loading-text {
      margin-top: 30px;
      text-align: center;
      font-family: ${T.fontBody};
    }

    .da-loading-title {
      font-size: 1.2rem;
      font-weight: 700;
      color: ${T.ink};
      margin-bottom: 8px;
      font-family: ${T.fontDisplay};
    }

    .da-loading-subtitle {
      font-size: 0.85rem;
      color: ${T.slate};
    }
  `;
  document.head.appendChild(style);
};



// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmtINR = (v) => {
  if (!v && v !== 0) return '₹0';
  const abs = Math.abs(v);
  if (abs >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000)   return `₹${(v / 100000).toFixed(2)}L`;
  if (abs >= 1000)     return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
};

const getWeekNumber = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
};

const calcTaxes = (invoice) => {
  const items = invoice.items || [];
  const base = items.reduce((s, it) => s + ((+it.quantity || 0) * (+it.price || 0)), 0);
  const same  = invoice.place_of_supply?.includes('36-Telangana') ?? false;
  const sgst  = same ? base * 0.09 : 0;
  const cgst  = same ? base * 0.09 : 0;
  const igst  = same ? 0 : base * 0.18;
  const total = base + sgst + cgst + igst;
  const tds   = +invoice.tds_amount || 0;
  return { base, sgst, cgst, igst, total, net: total - tds, received: +invoice.received || 0 };
};

const trendIcon = (vals) => {
  if (!vals || vals.length < 2) return null;
  const last = vals[vals.length - 1];
  const prev = vals[vals.length - 2];
  if (!prev) return null;
  const pct = ((last - prev) / Math.abs(prev)) * 100;
  const cls = pct >= 0 ? 'da-trend-up' : 'da-trend-down';
  const icon = pct >= 0 ? '▲' : '▼';
  return <span className={cls}>{icon} {Math.abs(pct).toFixed(1)}%</span>;
};

// ─── BASE CHART OPTIONS ───────────────────────────────────────────────────────
const baseTooltip = {
  backgroundColor: T.inkMid,
  titleFont: { size: 11, family: T.fontBody, weight: '600' },
  bodyFont:  { size: 11, family: T.fontBody },
  padding: 10, cornerRadius: 8, borderWidth: 0,
  displayColors: true, boxWidth: 8, boxHeight: 8, boxPadding: 4,
};

const basePlugins = {
  legend: { display: false },
  tooltip: baseTooltip,
};

const makeAxisOpts = (yFmt = v => fmtINR(v)) => ({
  responsive: true, maintainAspectRatio: false,
  plugins: { ...basePlugins },
  scales: {
    y: {
      ticks: { callback: yFmt, font: { size: 10, family: T.fontMono }, color: T.slate },
      grid:  { color: 'rgba(0,0,0,0.04)', drawBorder: false },
    },
    x: {
      ticks: { font: { size: 9, family: T.fontBody }, color: T.slate, maxRotation: 30 },
      grid:  { display: false },
    },
  },
});

const makePieOpts = (labelFn) => ({
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { display: true, position: 'bottom', labels: { font: { size: 10, family: T.fontBody }, boxWidth: 9, padding: 12 } },
    tooltip: { ...baseTooltip, callbacks: { label: labelFn } },
  },
});

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

const Toggle = ({ opts, value, onChange }) => (
  <div className="da-toggle">
    {opts.map(o => (
      <button key={o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
        {o.label}
      </button>
    ))}
  </div>
);

const Badge = ({ label, color }) => {
  const colors = {
    green:  { bg: T.emeraldSoft, text: T.emerald },
    red:    { bg: T.crimsonSoft, text: T.crimson },
    amber:  { bg: T.amberSoft,  text: T.amber },
    blue:   { bg: T.cobaltSoft, text: T.cobalt },
    violet: { bg: T.violetSoft, text: T.violet },
  };
  const c = colors[color] || colors.blue;
  return (
    <span className="da-badge" style={{ background: c.bg, color: c.text }}>
      {label}
    </span>
  );
};

const ProgressBar = ({ pct, color }) => {
  const clamp = Math.min(Math.max(+pct || 0, 0), 100);
  return (
    <div className="da-bar-bg" style={{ marginTop: 4 }}>
      <div className="da-bar-fill" style={{ width: `${clamp}%`, background: color || T.cobalt }} />
    </div>
  );
};

const KpiCard = ({ label, value, sub, accent = 'cobalt', trend, badge, progress, children }) => {
  const accMap = { cobalt: T.cobalt, emerald: T.emerald, crimson: T.crimson, amber: T.amber, violet: T.violet };
  const color = accMap[accent] || T.cobalt;
  const accentKey = { cobalt: 'cobalt', emerald: 'emerald', crimson: 'crimson', amber: 'amber', violet: 'violet' }[accent] || 'cobalt';
  return (
    <div className={`da-kpi ${accentKey} da-animate`}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: T.slate }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1, fontFamily: T.fontMono, letterSpacing: '-.02em' }}>
          {value}
        </div>
        {trend}
      </div>
      {sub && <div style={{ fontSize: 10, color: T.slate }}>{sub}</div>}
      {progress !== undefined && <ProgressBar pct={progress} color={color} />}
      {children}
    </div>
  );
};

const CardHeader = ({ title, icon, toggle, action }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: T.ink, letterSpacing: '-.01em' }}>{title}</span>
    </div>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {action}
      {toggle}
    </div>
  </div>
);

const ChartCard = ({ title, icon, toggle, action, height = 240, children, className = '' }) => (
  <div className={`da-card ${className}`}>
    <CardHeader title={title} icon={icon} toggle={toggle} action={action} />
    <div style={{ position: 'relative', width: '100%', height, minHeight: height, flex: 1 }}>
      {children}
    </div>
  </div>
);

// Inline metric row inside a card
// eslint-disable-next-line no-unused-vars
const MetricRow = ({ label, value, pct, color }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: `1px solid ${T.paperDark}` }}>
    <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
    <div style={{ flex: 1, fontSize: 11, color: T.inkMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
    <div style={{ fontSize: 11, fontWeight: 700, color: T.ink, fontFamily: T.fontMono, whiteSpace: 'nowrap' }}>{value}</div>
    {pct !== undefined && (
      <div style={{ fontSize: 9, color: T.slate, minWidth: 32, textAlign: 'right' }}>{pct}%</div>
    )}
  </div>
);

// ─── SPARKLINE (pure SVG) ─────────────────────────────────────────────────────
const Sparkline = ({ data = [], color = T.cobalt, width = 80, height = 28 }) => {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
    </svg>
  );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
const DataAnalysis = ({ user, token, onLogout, onCreateNew, onBack }) => {
  injectStyles();

  const [invoices, setInvoices]         = useState([]);
  const [clients, setClients]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [dateRange, setDateRange]       = useState({ start: '', end: '' });
  const [selectedClient, setSelClient]  = useState('all');
  const [exportLoading, setExportLoading] = useState(false);

  // Per-card view states
  const [revView,    setRevView]    = useState('monthly');
  const [collView,   setCollView]   = useState('monthly');
  const [tableView,  setTableView]  = useState('monthly');
  const [clientView, setClientView] = useState('revenue');
  const [payMode,    setPayMode]    = useState('count');
  const [taxType,    setTaxType]    = useState('pie');
  const [clientTop,  setClientTop]  = useState(10);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invRes, cliRes] = await Promise.all([
        axios.get('/api/invoices', { headers: { Authorization: `Bearer ${token}` } }),
        axios.get('/api/clients', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setInvoices(invRes.data);
      setClients(cliRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // ── filtered invoices ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let arr = [...invoices];
    if (dateRange.start && dateRange.end) {
      const s = new Date(dateRange.start);
      const e = new Date(dateRange.end); e.setHours(23, 59, 59, 999);
      arr = arr.filter(inv => { const d = new Date(inv.date); return d >= s && d <= e; });
    }
    if (selectedClient !== 'all') arr = arr.filter(inv => inv.client_id === selectedClient);
    return arr;
  }, [invoices, dateRange, selectedClient]);

  // ── time bucketing ──────────────────────────────────────────────────────────
  const bucket = useCallback((view, data = filtered) => {
    const map = {};
    data.forEach(inv => {
      const dt = new Date(inv.date);
      const { total, received, sgst, cgst, igst } = calcTaxes(inv);
      let key;
      if      (view === 'daily')   key = dt.toISOString().split('T')[0];
      else if (view === 'weekly')  key = `${dt.getFullYear()}-W${String(getWeekNumber(dt)).padStart(2,'0')}`;
      else if (view === 'monthly') key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      else                         key = String(dt.getFullYear());
      if (!map[key]) map[key] = { key, revenue: 0, received: 0, count: 0, sgst: 0, cgst: 0, igst: 0 };
      map[key].revenue  += total;
      map[key].received += received;
      map[key].count    += 1;
      map[key].sgst     += sgst;
      map[key].cgst     += cgst;
      map[key].igst     += igst;
    });
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
  }, [filtered]);

  const revData   = useMemo(() => bucket(revView),   [bucket, revView]);
  const collData  = useMemo(() => bucket(collView),  [bucket, collView]);
  const tableData = useMemo(() => bucket(tableView), [bucket, tableView]);

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    let totalRevenue = 0, totalReceived = 0, paidN = 0, unpaidN = 0, cancelledN = 0;
    let totalSGST = 0, totalCGST = 0, totalIGST = 0;
    const invoiceValues = [];
    filtered.forEach(inv => {
      const t = calcTaxes(inv);
      totalRevenue  += t.total;
      totalReceived += t.received;
      totalSGST     += t.sgst;
      totalCGST     += t.cgst;
      totalIGST     += t.igst;
      invoiceValues.push(t.total);
      if      (inv.payment_status === 'paid')      paidN++;
      else if (inv.payment_status === 'cancelled') cancelledN++;
      else                                         unpaidN++;
    });
    const n = filtered.length;
    const sorted = [...invoiceValues].sort((a, b) => a - b);
    const medVal = n > 0 ? sorted[Math.floor(n / 2)] : 0;
    return {
      n, totalRevenue, totalReceived,
      totalPending: totalRevenue - totalReceived,
      paidN, unpaidN, cancelledN,
      avgValue:  n > 0 ? totalRevenue / n : 0,
      medValue:  medVal,
      collRate:  totalRevenue > 0 ? (totalReceived / totalRevenue) * 100 : 0,
      totalSGST, totalCGST, totalIGST,
      totalTax:  totalSGST + totalCGST + totalIGST,
    };
  }, [filtered]);

  // ── trend data for KPI mini-sparklines ──────────────────────────────────────
  const monthlyRevTrend  = useMemo(() => bucket('monthly').slice(-6).map(d => d.revenue),  [bucket]);
  const monthlyCollTrend = useMemo(() => bucket('monthly').slice(-6).map(d => d.received), [bucket]);

  // ── top clients ─────────────────────────────────────────────────────────────
  const topClients = useMemo(() => {
    const map = {};
    filtered.forEach(inv => {
      const name = inv.client_name || 'Unknown';
      const { total, received } = calcTaxes(inv);
      if (!map[name]) map[name] = { revenue: 0, received: 0, count: 0 };
      map[name].revenue  += total;
      map[name].received += received;
      map[name].count    += 1;
    });
    return Object.entries(map)
      .map(([name, d]) => ({ name, ...d, collRate: d.revenue > 0 ? (d.received / d.revenue) * 100 : 0 }))
      .sort((a, b) => (clientView === 'revenue' ? b.revenue - a.revenue : b.count - a.count))
      .slice(0, clientTop);
  }, [filtered, clientView, clientTop]);

  // ── approval breakdown ──────────────────────────────────────────────────────
  const approval = useMemo(() => ({
    created:   filtered.filter(i => i.approval_status === 'created').length,
    requested: filtered.filter(i => i.approval_status === 'requested').length,
    approved:  filtered.filter(i => i.approval_status === 'final_approved').length,
  }), [filtered]);

  // ── client concentration (HHI-like) ─────────────────────────────────────────
  const hhi = useMemo(() => {
    if (!kpis.totalRevenue) return 0;
    const clientMap = {};
    filtered.forEach(inv => {
      const k = inv.client_name || 'Unknown';
      const { total } = calcTaxes(inv);
      clientMap[k] = (clientMap[k] || 0) + total;
    });
    const shares = Object.values(clientMap).map(v => (v / kpis.totalRevenue) * 100);
    return shares.reduce((s, p) => s + p * p, 0) / 10000;
  }, [filtered, kpis.totalRevenue]);

  // ── monthly invoice counts ───────────────────────────────────────────────────
  const monthlyCount = useMemo(() => bucket('monthly').slice(-6).map(d => d.count), [bucket]);

  // ─── chart data helpers ────────────────────────────────────────────────────
  // eslint-disable-next-line no-unused-vars
  const maxRev = useMemo(() => Math.max(...topClients.map(c => c.revenue), 1), [topClients]);

  // ─── EXPORT ───────────────────────────────────────────────────────────────
  const exportToExcel = async () => {
    if (!filtered.length) { alert('No data to export'); return; }
    setExportLoading(true);
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Jayarama Associates';
      wb.created = new Date();

      // ── Summary Sheet ──
      const ws = wb.addWorksheet('Summary', { pageSetup: { orientation: 'landscape' } });
      const headerStyle = { font: { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B0F1A' } }, alignment: { horizontal: 'center' } };
      const subHeaderStyle = { font: { bold: true, size: 11 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAE7DE' } } };

      ws.mergeCells('A1:H1');
      ws.getCell('A1').value = 'JAYARAMA ASSOCIATES — BUSINESS ANALYTICS REPORT';
      Object.assign(ws.getCell('A1'), { ...headerStyle });

      ws.addRow([`Generated: ${new Date().toLocaleString('en-IN')}`, '', '', '', '', `Invoices: ${kpis.n}`, '', `Collection: ${kpis.collRate.toFixed(2)}%`]);

      ws.addRow([]);
      ws.getCell(`A${ws.rowCount}`).value = 'KEY PERFORMANCE INDICATORS';
      Object.assign(ws.getCell(`A${ws.rowCount}`), subHeaderStyle);

      const kpiRows = [
        ['Metric', 'Value', '', 'Metric', 'Value'],
        ['Total Invoices', kpis.n, '', 'Avg Invoice Value', fmtINR(kpis.avgValue)],
        ['Total Revenue',  fmtINR(kpis.totalRevenue),  '', 'Median Invoice Value', fmtINR(kpis.medValue)],
        ['Total Received', fmtINR(kpis.totalReceived), '', 'Collection Rate', `${kpis.collRate.toFixed(2)}%`],
        ['Total Pending',  fmtINR(kpis.totalPending),  '', 'Paid Invoices', kpis.paidN],
        ['Total Tax (GST)',fmtINR(kpis.totalTax),      '', 'Unpaid Invoices', kpis.unpaidN],
        ['SGST',           fmtINR(kpis.totalSGST),     '', 'Cancelled Invoices', kpis.cancelledN],
        ['CGST',           fmtINR(kpis.totalCGST),     '', 'IGST', fmtINR(kpis.totalIGST)],
      ];
      kpiRows.forEach(r => ws.addRow(r));

      ws.addRow([]);
      ws.getCell(`A${ws.rowCount}`).value = 'PERIOD BREAKDOWN (Monthly)';
      Object.assign(ws.getCell(`A${ws.rowCount}`), subHeaderStyle);
      ws.addRow(['Period', 'Invoice Count', 'Revenue (₹)', 'Received (₹)', 'Pending (₹)', 'SGST (₹)', 'CGST (₹)', 'IGST (₹)', 'Collection %']);
      bucket('monthly').reverse().forEach(row => {
        const rate = row.revenue > 0 ? ((row.received / row.revenue) * 100).toFixed(1) : '0';
        ws.addRow([row.key, row.count, row.revenue, row.received, row.revenue - row.received, row.sgst, row.cgst, row.igst, `${rate}%`]);
      });

      // ── Clients Sheet ──
      const ws2 = wb.addWorksheet('Top Clients');
      ws2.mergeCells('A1:E1');
      ws2.getCell('A1').value = 'TOP CLIENTS BY REVENUE';
      Object.assign(ws2.getCell('A1'), { ...headerStyle });
      ws2.addRow(['Client Name', 'Total Revenue (₹)', 'Received (₹)', 'Invoice Count', 'Collection Rate']);
      topClients.forEach(c => ws2.addRow([c.name, c.revenue, c.received, c.count, `${c.collRate.toFixed(1)}%`]));

      // Column widths
      [ws, ws2].forEach(w => w.columns.forEach(col => { col.width = 20; }));

      const buf = await wb.xlsx.writeBuffer();
      saveAs(new Blob([buf]), `JA_Analytics_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (e) {
      console.error(e);
      alert('Export failed: ' + e.message);
    } finally {
      setExportLoading(false);
    }
  };

  // ─── PRESETS ──────────────────────────────────────────────────────────────
  const applyPreset = (preset) => {
    const now = new Date();
    const fmt  = d => d.toISOString().split('T')[0];
    if (preset === 'thisMonth') {
      setDateRange({ start: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), end: fmt(now) });
    } else if (preset === 'lastMonth') {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      setDateRange({ start: fmt(s), end: fmt(e) });
    } else if (preset === 'thisYear') {
      setDateRange({ start: fmt(new Date(now.getFullYear(), 0, 1)), end: fmt(now) });
    } else if (preset === 'lastYear') {
      setDateRange({ start: fmt(new Date(now.getFullYear() - 1, 0, 1)), end: fmt(new Date(now.getFullYear() - 1, 11, 31)) });
    } else {
      setDateRange({ start: '', end: '' });
    }
  };

  // ─── CHART COLOR ARRAYS ───────────────────────────────────────────────────
  const statusColors = [T.emerald, T.crimson, T.amber];
  const taxColors    = [T.cobalt, T.emerald, T.amber];

  // Show loading screen with pencil animation
  if (loading) return <LoadingScreen message="Loading analytics..." />;

  return (
    <div className="da-root" style={{ display: 'flex', width: '100%', minHeight: '100vh', overflow: 'hidden' }}>
      <Sidebar user={user} onLogout={onLogout} onCreateNew={onCreateNew} userRole={user?.role} />

      <main style={{
        flex: 1, padding: 'clamp(12px,1.5vw,20px)',
        background: T.paper, minHeight: '100vh',
        overflowX: 'hidden', boxSizing: 'border-box',
      }}>

        {/* ════════════════════ HEADER ════════════════════ */}
        <div className="da-animate" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div>
            <button className="da-btn da-btn-ghost" onClick={onBack} style={{ marginBottom: 8, fontSize: 11 }}>
              ← Back
            </button>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: T.ink, letterSpacing: '-.03em', fontFamily: T.fontDisplay, lineHeight: 1 }}>
                Analytics
              </h1>
              <span style={{ fontSize: 11, color: T.slate, fontWeight: 500 }}>Jayarama Associates</span>
            </div>
            <div style={{ fontSize: 11, color: T.slate, marginTop: 3, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="da-dot" style={{ background: T.emerald }} />
              {kpis.n} invoices · {fmtINR(kpis.totalRevenue)} revenue ·{' '}
              <span style={{ color: kpis.collRate >= 80 ? T.emerald : T.amber, fontWeight: 600 }}>
                {kpis.collRate.toFixed(1)}% collected
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className="da-btn da-btn-emerald"
              onClick={exportToExcel}
              disabled={exportLoading}
            >
              {exportLoading ? '⏳' : '↓'} Export XLSX
            </button>
            <button
              className="da-btn da-btn-ghost"
              onClick={() => { setDateRange({ start: '', end: '' }); setSelClient('all'); }}
            >
              ✕ Reset
            </button>
          </div>
        </div>

        {/* ════════════════════ FILTER BAR ════════════════════ */}
        <div className="da-animate da-delay-1" style={{
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
          marginBottom: 16, background: T.white, padding: '10px 16px',
          borderRadius: T.radiusLg, border: `1px solid ${T.paperLine}`,
          boxShadow: T.shadow,
        }}>
          <span className="da-section-label" style={{ marginRight: 4 }}>Filter</span>
          <input
            type="date" value={dateRange.start}
            min="2010-01-01"
            max={dateRange.end || `${new Date().getFullYear() + 1}-12-31`}
            onChange={e => {
              const val = e.target.value;
              setDateRange(p => {
                let nextEnd = p.end;
                if (val && p.end && p.end < val) {
                  nextEnd = val;
                }
                return { ...p, start: val, end: nextEnd };
              });
            }}
            className="da-input"
            title="Start Date (2010 to Next Year)"
          />
          <span style={{ color: T.slate, fontSize: 11 }}>→</span>
          <input
            type="date" value={dateRange.end}
            min={dateRange.start || "2010-01-01"}
            max={`${new Date().getFullYear() + 1}-12-31`}
            onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))}
            className="da-input"
            title="End Date (On or after Start Date)"
          />
          {/* Quick presets */}
          {['thisMonth','lastMonth','thisYear','lastYear'].map(p => (
            <button key={p} className="da-btn da-btn-ghost" style={{ padding: '4px 10px', fontSize: 10 }} onClick={() => applyPreset(p)}>
              { { thisMonth:'This Mo', lastMonth:'Last Mo', thisYear:'This Yr', lastYear:'Last Yr' }[p] }
            </button>
          ))}
          <select value={selectedClient} onChange={e => setSelClient(e.target.value)} className="da-input" style={{ minWidth: 140 }}>
            <option value="all">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {(dateRange.start || selectedClient !== 'all') && (
            <span style={{ fontSize: 10, color: T.cobalt, fontWeight: 600, marginLeft: 4 }}>
              {kpis.n} results
            </span>
          )}
        </div>

        {/* ════════════════════ KPI ROW ════════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 16 }}>
          <KpiCard label="Total Invoices" value={kpis.n} sub={`Avg ₹ · ${fmtINR(kpis.avgValue)} · Med ${fmtINR(kpis.medValue)}`} accent="cobalt" trend={trendIcon(monthlyCount)} className="da-delay-1">
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
              <Badge label={`Paid ${kpis.paidN}`}       color="green" />
              <Badge label={`Unpaid ${kpis.unpaidN}`}   color="red" />
              <Badge label={`Cancelled ${kpis.cancelledN}`} color="amber" />
            </div>
          </KpiCard>

          <KpiCard label="Total Revenue" value={fmtINR(kpis.totalRevenue)} sub="Gross billed including GST" accent="cobalt" trend={trendIcon(monthlyRevTrend)} className="da-delay-1">
            <div style={{ marginTop: 4 }}><Sparkline data={monthlyRevTrend} color={T.cobalt} /></div>
          </KpiCard>

          <KpiCard label="Amount Received" value={fmtINR(kpis.totalReceived)} sub={`Pending: ${fmtINR(kpis.totalPending)}`} accent="emerald" trend={trendIcon(monthlyCollTrend)} progress={kpis.collRate} className="da-delay-2">
            <div style={{ marginTop: 4 }}><Sparkline data={monthlyCollTrend} color={T.emerald} /></div>
          </KpiCard>

          <KpiCard label="Pending / Dues" value={fmtINR(kpis.totalPending)} sub={`${(100 - kpis.collRate).toFixed(1)}% uncollected`} accent="crimson" progress={100 - kpis.collRate} className="da-delay-3" />

          <KpiCard label="Total GST" value={fmtINR(kpis.totalTax)} sub={`SGST ${fmtINR(kpis.totalSGST)} · CGST ${fmtINR(kpis.totalCGST)}`} accent="violet" className="da-delay-4">
            <div style={{ marginTop: 4, fontSize: 10, color: T.slate }}>
              IGST: {fmtINR(kpis.totalIGST)}
            </div>
          </KpiCard>
        </div>

        {/* ════════════════════ ROW 1 — Revenue Trend + Clients ════════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 12, marginBottom: 12 }}>

          {/* Revenue & Collection Trend */}
          <ChartCard
            title="Revenue & Collection Trend"
            icon="📈"
            height={290}
            toggle={
              <Toggle
                opts={[{value:'daily',label:'Day'},{value:'weekly',label:'Week'},{value:'monthly',label:'Mo'},{value:'yearly',label:'Yr'}]}
                value={revView} onChange={setRevView}
              />
            }
          >
            <Line
              data={{
                labels: revData.slice(-12).map(d => d.key.length > 10 ? d.key.slice(0, 8) + '…' : d.key),
                datasets: [
                  {
                    label: 'Revenue',
                    data: revData.slice(-12).map(d => d.revenue),
                    borderColor: T.cobalt, backgroundColor: T.cobaltSoft,
                    borderWidth: 2, tension: .35, fill: true,
                    pointRadius: 3, pointBackgroundColor: T.cobalt,
                    pointBorderColor: T.white, pointBorderWidth: 1.5,
                    pointHoverRadius: 5,
                  },
                  {
                    label: 'Received',
                    data: revData.slice(-12).map(d => d.received),
                    borderColor: T.emerald, backgroundColor: T.emeraldSoft,
                    borderWidth: 2, tension: .35, fill: true,
                    pointRadius: 3, pointBackgroundColor: T.emerald,
                    pointBorderColor: T.white, pointBorderWidth: 1.5,
                    pointHoverRadius: 5,
                    borderDash: [5, 4],
                  },
                ],
              }}
              options={{
                ...makeAxisOpts(),
                plugins: {
                  legend: { display: true, position: 'bottom', labels: { font: { size: 10, family: T.fontBody }, boxWidth: 10, usePointStyle: true, padding: 14 } },
                  tooltip: { ...baseTooltip, callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtINR(ctx.parsed.y)}` } },
                },
                scales: {
                  y: {
                    ticks: { callback: v => fmtINR(v), font: { size: 9, family: T.fontMono }, color: T.slate },
                    grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
                  },
                  x: {
                    ticks: { font: { size: 9 }, color: T.slate, maxRotation: 30 },
                    grid: { display: false },
                  },
                },
              }}
            />
          </ChartCard>

          {/* Top Clients — styled list with bars */}
          <div className="da-card">
            <CardHeader
              title="Top Clients"
              icon="🏢"
              toggle={
                <Toggle
                  opts={[{value:'revenue',label:'Revenue'},{value:'count',label:'Count'}]}
                  value={clientView} onChange={setClientView}
                />
              }
              action={
                <select
                  value={clientTop} onChange={e => setClientTop(+e.target.value)}
                  className="da-input" style={{ padding: '2px 8px', fontSize: 10 }}
                >
                  <option value={5}>Top 5</option>
                  <option value={10}>Top 10</option>
                  <option value={15}>Top 15</option>
                </select>
              }
            />
            <div style={{ overflowY: 'auto', flex: 1, maxHeight: 290 }}>
              {topClients.map((c, i) => {
                const val   = clientView === 'revenue' ? c.revenue : c.count;
                const total = clientView === 'revenue' ? kpis.totalRevenue : kpis.n;
                const pct   = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                const color = T.chartPalette[i % T.chartPalette.length];
                return (
                  <div key={c.name} style={{ padding: '7px 0', borderBottom: `1px solid ${T.paperDark}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: T.slate, minWidth: 14, fontFamily: T.fontMono }}>{i + 1}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>{c.name}</span>
                      </div>
                      <div style={{ display: 'flex', align: 'center', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.ink, fontFamily: T.fontMono }}>
                          {clientView === 'revenue' ? fmtINR(val) : val}
                        </span>
                        <span style={{ fontSize: 9, color: T.slate, alignSelf: 'center' }}>{pct}%</span>
                      </div>
                    </div>
                    <div className="da-bar-bg">
                      <div className="da-bar-fill" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ════════════════════ ROW 2 — 4 small charts ════════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 12 }}>

          {/* Payment Status Donut */}
          <ChartCard title="Payment Status" icon="💳" height={220}
            toggle={<Toggle opts={[{value:'count',label:'Cnt'},{value:'amount',label:'Amt'}]} value={payMode} onChange={setPayMode} />}
          >
            <Doughnut
              data={{
                labels: ['Paid', 'Unpaid', 'Cancelled'],
                datasets: [{
                  data: payMode === 'count'
                    ? [kpis.paidN, kpis.unpaidN, kpis.cancelledN]
                    : [kpis.totalReceived, kpis.totalPending, 0],
                  backgroundColor: statusColors,
                  borderWidth: 2, borderColor: T.white, hoverOffset: 8,
                }],
              }}
              options={{
                ...makePieOpts(ctx => {
                  const total = ctx.dataset.data.reduce((a,b)=>a+b,0);
                  const pct = ((ctx.parsed / total) * 100).toFixed(1);
                  return payMode === 'count'
                    ? ` ${ctx.label}: ${ctx.parsed} (${pct}%)`
                    : ` ${ctx.label}: ${fmtINR(ctx.parsed)} (${pct}%)`;
                }),
                cutout: '62%',
                maintainAspectRatio: false,
                plugins: {
                  ...makePieOpts().plugins,
                  legend: { display: true, position: 'bottom', labels: { font: { size: 9 }, boxWidth: 8, padding: 8 } },
                },
              }}
            />
          </ChartCard>

          {/* Tax Distribution */}
          <ChartCard title="Tax Distribution" icon="🧾" height={220}
            toggle={<Toggle opts={[{value:'pie',label:'Pie'},{value:'bar',label:'Bar'}]} value={taxType} onChange={setTaxType} />}
          >
            {taxType === 'pie' ? (
              <Pie
                data={{
                  labels: ['SGST', 'CGST', 'IGST'],
                  datasets: [{
                    data: [kpis.totalSGST, kpis.totalCGST, kpis.totalIGST],
                    backgroundColor: taxColors,
                    borderWidth: 2, borderColor: T.white, hoverOffset: 8,
                  }],
                }}
                options={{
                  ...makePieOpts(ctx => {
                    const total = ctx.dataset.data.reduce((a,b)=>a+b,0);
                    const pct = ((ctx.parsed / total) * 100).toFixed(1);
                    return ` ${ctx.label}: ${fmtINR(ctx.parsed)} (${pct}%)`;
                  }),
                  maintainAspectRatio: false,
                }}
              />
            ) : (
              <Bar
                data={{
                  labels: ['SGST', 'CGST', 'IGST'],
                  datasets: [{
                    label: 'Tax',
                    data: [kpis.totalSGST, kpis.totalCGST, kpis.totalIGST],
                    backgroundColor: taxColors.map(c => c + '22'),
                    borderColor: taxColors,
                    borderWidth: 1.5, borderRadius: 5,
                  }],
                }}
                options={{
                  ...makeAxisOpts(),
                  plugins: { ...basePlugins, tooltip: { ...baseTooltip, callbacks: { label: ctx => ` ${fmtINR(ctx.parsed.y)}` } } },
                }}
              />
            )}
          </ChartCard>

          {/* Approval Status Polar */}
          <ChartCard title="Approval Status" icon="✅" height={220}>
            <PolarArea
              data={{
                labels: ['Created', 'Requested', 'Approved'],
                datasets: [{
                  data: [approval.created, approval.requested, approval.approved],
                  backgroundColor: [T.amberSoft, T.cobaltSoft, T.emeraldSoft],
                  borderColor: [T.amber, T.cobalt, T.emerald],
                  borderWidth: 1.5,
                }],
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                scales: { r: { ticks: { font: { size: 8 }, backdropColor: 'transparent', color: T.slate }, grid: { color: 'rgba(0,0,0,0.06)' } } },
                plugins: {
                  legend: { display: true, position: 'bottom', labels: { font: { size: 9 }, boxWidth: 9, padding: 10 } },
                  tooltip: { ...baseTooltip, callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed.r}` } },
                },
              }}
            />
          </ChartCard>

          {/* Collection Rate Trend */}
          <ChartCard title="Collection Rate Trend" icon="📉" height={220}
            toggle={<Toggle opts={[{value:'daily',label:'D'},{value:'weekly',label:'W'},{value:'monthly',label:'M'},{value:'yearly',label:'Y'}]} value={collView} onChange={setCollView} />}
          >
            <Line
              data={{
                labels: collData.slice(-8).map(d => d.key.length > 8 ? d.key.slice(0,6)+'…' : d.key),
                datasets: [{
                  label: 'Collection %',
                  data: collData.slice(-8).map(d => d.revenue > 0 ? +((d.received / d.revenue)*100).toFixed(1) : 0),
                  borderColor: T.violet, backgroundColor: T.violetSoft,
                  borderWidth: 2, tension: .3, fill: true,
                  pointRadius: 3, pointBackgroundColor: T.violet,
                  pointBorderColor: T.white, pointBorderWidth: 1.5,
                }],
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { ...basePlugins, tooltip: { ...baseTooltip, callbacks: { label: ctx => ` Rate: ${ctx.parsed.y}%` } } },
                scales: {
                  y: {
                    min: 0, max: 100,
                    ticks: { callback: v => v + '%', font: { size: 9, family: T.fontMono }, color: T.slate },
                    grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
                  },
                  x: { ticks: { font: { size: 8 }, color: T.slate }, grid: { display: false } },
                },
              }}
            />
          </ChartCard>
        </div>

        {/* ════════════════════ ROW 3 — Revenue Bars + Invoice Count Bar ════════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>

          {/* Stacked Revenue Bar */}
          <ChartCard title="Revenue vs Received — Stacked" icon="📊" height={260}>
            <Bar
              data={{
                labels: revData.slice(-10).map(d => d.key.length > 10 ? d.key.slice(0,8)+'…' : d.key),
                datasets: [
                  {
                    label: 'Received',
                    data: revData.slice(-10).map(d => d.received),
                    backgroundColor: T.emeraldSoft,
                    borderColor: T.emerald, borderWidth: 1.5,
                    borderRadius: { topLeft: 4, topRight: 4 },
                    stack: 'a',
                  },
                  {
                    label: 'Pending',
                    data: revData.slice(-10).map(d => d.revenue - d.received),
                    backgroundColor: T.crimsonSoft,
                    borderColor: T.crimson, borderWidth: 1.5,
                    borderRadius: { topLeft: 4, topRight: 4 },
                    stack: 'a',
                  },
                ],
              }}
              options={{
                ...makeAxisOpts(),
                plugins: {
                  legend: { display: true, position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10, padding: 12 } },
                  tooltip: { ...baseTooltip, callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtINR(ctx.parsed.y)}` } },
                },
                scales: {
                  x: { stacked: true, ticks: { font: { size: 9 }, color: T.slate }, grid: { display: false } },
                  y: { stacked: true, ticks: { callback: v => fmtINR(v), font: { size: 9, family: T.fontMono }, color: T.slate }, grid: { color: 'rgba(0,0,0,0.04)' } },
                },
              }}
            />
          </ChartCard>

          {/* Invoice Volume (count per period) */}
          <ChartCard title="Invoice Volume" icon="🔢" height={260}>
            <Bar
              data={{
                labels: revData.slice(-8).map(d => d.key.length > 8 ? d.key.slice(0,6)+'…' : d.key),
                datasets: [{
                  label: 'Invoices',
                  data: revData.slice(-8).map(d => d.count),
                  backgroundColor: T.violetSoft,
                  borderColor: T.violet, borderWidth: 1.5, borderRadius: 5,
                }],
              }}
              options={{
                ...makeAxisOpts(v => v),
                plugins: { ...basePlugins, tooltip: { ...baseTooltip, callbacks: { label: ctx => ` ${ctx.parsed.y} invoice${ctx.parsed.y !== 1 ? 's' : ''}` } } },
              }}
            />
          </ChartCard>
        </div>

        {/* ════════════════════ ROW 4 — Full-width Period Table ════════════════════ */}
        <div style={{ marginBottom: 12 }}>
          <div className="da-card">
            <CardHeader
              title="Period Performance Breakdown"
              icon="📋"
              toggle={
                <Toggle
                  opts={[{value:'daily',label:'Day'},{value:'weekly',label:'Week'},{value:'monthly',label:'Month'},{value:'yearly',label:'Year'}]}
                  value={tableView} onChange={setTableView}
                />
              }
              action={
                <span className="da-section-label">{tableData.length} periods</span>
              }
            />
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table className="da-table">
                <thead>
                  <tr>
                    {['Period','#','Revenue','Received','Pending','SGST','CGST','IGST','Rate'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...tableData].reverse().map((row, i) => {
                    const pct = row.revenue > 0 ? (row.received / row.revenue * 100) : 0;
                    const rateClass = pct >= 80 ? 'da-rate-high' : pct >= 50 ? 'da-rate-mid' : 'da-rate-low';
                    return (
                      <tr key={i}>
                        <td>{row.key}</td>
                        <td style={{ color: T.ink, fontFamily: T.fontMono }}>{row.count}</td>
                        <td style={{ color: T.cobalt, fontWeight: 700, fontFamily: T.fontMono }}>{fmtINR(row.revenue)}</td>
                        <td style={{ color: T.emerald, fontFamily: T.fontMono }}>{fmtINR(row.received)}</td>
                        <td style={{ color: T.crimson, fontFamily: T.fontMono }}>{fmtINR(row.revenue - row.received)}</td>
                        <td style={{ fontFamily: T.fontMono, color: T.slate }}>{fmtINR(row.sgst)}</td>
                        <td style={{ fontFamily: T.fontMono, color: T.slate }}>{fmtINR(row.cgst)}</td>
                        <td style={{ fontFamily: T.fontMono, color: T.slate }}>{fmtINR(row.igst)}</td>
                        <td>
                          <span className={`da-badge ${rateClass}`}>{pct.toFixed(0)}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ════════════════════ FOOTER STATS ════════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 4 }}>
          <KpiCard label="Active Period" value={dateRange.start ? `${dateRange.start.slice(5)} → ${dateRange.end.slice(5)}` : 'All Time'} accent="cobalt" />
          <KpiCard label="Client Filter"  value={selectedClient !== 'all' ? (clients.find(c=>c.id===selectedClient)?.name||'—') : 'All Clients'} accent="violet" />
          <KpiCard label="Unique Clients" value={topClients.length} accent="cobalt" />
          <KpiCard label="Median Invoice" value={fmtINR(kpis.medValue)} accent="amber" />
          <KpiCard label="Concentration"  value={`${(hhi * 100).toFixed(1)}%`} sub="Revenue HHI index" accent={hhi > 0.25 ? 'crimson' : 'emerald'} />
        </div>

      </main>
    </div>
  );
};

export default DataAnalysis;

