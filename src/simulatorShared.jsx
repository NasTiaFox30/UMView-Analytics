import React, { useState } from 'react';
import { X, ToggleRight, ToggleLeft } from 'lucide-react';

export const WEEKS_PER_MONTH = 4.345;
export const DAY_ORDER = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];
export const TIE_TOLERANCE_ZL = 0.5;

export function fmtPLN(n) {
  if (!isFinite(n)) return '—';
  return n.toLocaleString('pl-PL', { maximumFractionDigits: 0 }) + ' zł';
}

export function fmtPct(n) {
  if (!isFinite(n)) return '—';
  return (n > 0 ? '-' : n < 0 ? '+' : '') + Math.abs(n).toFixed(0) + '%';
}

export function NumberField({ label, value, onChange, step = 1, suffix, hint, disabled = false }) {
  return (
    <div className={disabled ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
      <label className="text-[11px] font-medium text-gray-500 flex justify-between leading-none mb-1">
        <span>{label}</span>
        {hint && <span className="text-gray-400 font-normal">{hint}</span>}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
          className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50 disabled:cursor-not-allowed transition-colors"
        />
        {suffix && <span className="text-[11px] text-gray-400 whitespace-nowrap">{suffix}</span>}
      </div>
    </div>
  );
}

export function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      <label className="text-[11px] font-medium text-gray-500 mb-1 block">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function DayPicker({ days, onToggle }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {DAY_ORDER.map(day => (
        <label key={day} className={`flex items-center justify-center px-2 py-1 rounded text-xs font-medium cursor-pointer transition-colors border ${days.includes(day) ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
          <input type="checkbox" className="hidden" checked={days.includes(day)} onChange={() => onToggle(day)} />
          {day}
        </label>
      ))}
    </div>
  );
}

export function InfoButton({ label = 'Jak to działa?', children }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={label}
        className="w-4 h-4 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold leading-none flex items-center justify-center hover:bg-teal-200 transition-colors"
      >
        i
      </button>
      {open && (
        <div className="absolute z-30 left-0 top-6 w-72 p-3 bg-white border border-gray-200 rounded-lg shadow-lg text-[11px] text-gray-600 leading-relaxed">
          <button onClick={() => setOpen(false)} className="absolute top-1.5 right-1.5 text-gray-300 hover:text-gray-500">
            <X size={12} />
          </button>
          {children}
        </div>
      )}
    </span>
  );
}

export function ToggleRow({ label, icon, active, onClick, activeColor = 'text-teal-600', activeToggleColor = 'text-teal-500' }) {
  return (
    <div className="flex items-center justify-between cursor-pointer mb-2" onClick={onClick}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1 ${active ? activeColor : 'text-gray-400'}`}>
        {icon} {label}
      </p>
      {active ? <ToggleRight size={16} className={activeToggleColor} /> : <ToggleLeft size={16} className="text-gray-300" />}
    </div>
  );
}
