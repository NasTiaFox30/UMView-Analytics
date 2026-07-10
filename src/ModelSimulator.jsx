import React, { useState, useMemo, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceDot, Legend
} from 'recharts';
import { Calculator, Server, Users, Clock, AlertTriangle, TrendingDown, RefreshCcw, Zap } from 'lucide-react';

const WEEKS_PER_MONTH = 4.345;
const DAY_ORDER = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

function fmtPLN(n) {
  if (!isFinite(n)) return '—';
  return n.toLocaleString('pl-PL', { maximumFractionDigits: 0 }) + ' zł';
}

function NumberField({ label, value, onChange, step = 1, suffix, hint }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 flex justify-between">
        <span>{label}</span>
        {hint && <span className="text-gray-400 font-normal">{hint}</span>}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        {suffix && <span className="text-xs text-gray-400 whitespace-nowrap">{suffix}</span>}
      </div>
    </div>
  );
}

/**
 * rawData: array of { date, hours, monthStr, dayName }  (same shape produced by App.jsx parser)
 * pivotState: { rows, months, data: { day: { month: hours, total } } } | null
 * monthAreas: array used to infer how many distinct months are covered
 */
export default function ModelSimulator({ rawData = [], pivotState, monthAreas = [] }) {
  const hasData = rawData.length > 0;
  const monthsCount = Math.max(monthAreas.length, 1);

  // ---- auto-derived suggestions from the loaded CSV ----
  const auto = useMemo(() => {
    if (!hasData) {
      return { activationsPerMonth: 4, avgHoursPerActivation: 6, cyclicDayUsage: 0 };
    }
    const totalHours = rawData.reduce((s, d) => s + d.hours, 0);
    const activationsPerMonth = rawData.length / monthsCount;
    const avgHoursPerActivation = totalHours / rawData.length;
    return { activationsPerMonth, avgHoursPerActivation, totalHours };
  }, [rawData, hasData, monthsCount]);

  // ---- editable assumptions ----
  const [serverCostPerHour, setServerCostPerHour] = useState(3.5);
  const [testerCostPerHour, setTesterCostPerHour] = useState(120);
  const [cyclicDay, setCyclicDay] = useState('Пн');
  const [cyclicDurationHours, setCyclicDurationHours] = useState(8);
  const [onDemandOverheadMin, setOnDemandOverheadMin] = useState(20);
  const [monthlyActivationsB, setMonthlyActivationsB] = useState(auto.activationsPerMonth || 4);
  const [avgHoursPerActivationB, setAvgHoursPerActivationB] = useState(auto.avgHoursPerActivation || 6);

  const resetFromData = () => {
    setMonthlyActivationsB(parseFloat((auto.activationsPerMonth || 4).toFixed(2)));
    setAvgHoursPerActivationB(parseFloat((auto.avgHoursPerActivation || 6).toFixed(2)));
  };

  useEffect(() => {
    if (hasData) resetFromData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData]);

  // actual usage on the chosen "cyclic" weekday, averaged per month (used to size the idle-waste)
  const actualUsageOnCyclicDay = useMemo(() => {
    if (!pivotState || !pivotState.data[cyclicDay]) return 0;
    return pivotState.data[cyclicDay].total / monthsCount;
  }, [pivotState, cyclicDay, monthsCount]);

  // ---- core cost model ----
  const calc = useMemo(() => {
    // Model A — cyclic: environment is up on a fixed schedule regardless of whether it's used
    const activationsA = WEEKS_PER_MONTH; // once a week by default
    const scheduledHoursA = activationsA * cyclicDurationHours;
    const costInfraA = scheduledHoursA * serverCostPerHour;
    const wastedHoursA = Math.max(0, scheduledHoursA - actualUsageOnCyclicDay);
    const wastedCostA = wastedHoursA * serverCostPerHour;
    const totalCostA = costInfraA;

    // Model B — on-demand: infra only when actually triggered, but each trigger costs coordination/wait time
    const costInfraB = monthlyActivationsB * avgHoursPerActivationB * serverCostPerHour;
    const overheadCostB = monthlyActivationsB * (onDemandOverheadMin / 60) * testerCostPerHour;
    const totalCostB = costInfraB + overheadCostB;

    // cost of ONE extra on-demand activation (marginal cost) — used for the break-even line
    const marginalCostB = avgHoursPerActivationB * serverCostPerHour + (onDemandOverheadMin / 60) * testerCostPerHour;
    const breakEvenActivations = marginalCostB > 0 ? totalCostA / marginalCostB : null;

    return {
      costInfraA, wastedHoursA, wastedCostA, totalCostA,
      costInfraB, overheadCostB, totalCostB, marginalCostB, breakEvenActivations,
      scheduledHoursA
    };
  }, [serverCostPerHour, testerCostPerHour, cyclicDurationHours, actualUsageOnCyclicDay, monthlyActivationsB, avgHoursPerActivationB, onDemandOverheadMin]);

  const breakEvenData = useMemo(() => {
    const maxX = Math.max(20, Math.ceil((calc.breakEvenActivations || 10) * 1.6));
    return Array.from({ length: maxX + 1 }, (_, x) => ({
      activations: x,
      'Модель A (циклічна)': Math.round(calc.totalCostA),
      'Модель B (on-demand)': Math.round(x * calc.marginalCostB),
    }));
  }, [calc]);

  const barData = [
    { name: 'Модель A (циклічна)', 'Інфраструктура': Math.round(calc.costInfraA), 'Overhead / простій': Math.round(calc.wastedCostA) },
    { name: 'Модель B (on-demand)', 'Інфраструктура': Math.round(calc.costInfraB), 'Overhead / простій': Math.round(calc.overheadCostB) },
  ];
  const maxBarTotal = Math.max(
    calc.costInfraA + calc.wastedCostA,
    calc.costInfraB + calc.overheadCostB,
    1
  );
  const maxLineTotal = Math.max(calc.totalCostA, calc.marginalCostB * (breakEvenData[breakEvenData.length - 1]?.activations || 1), 1);

  const cheaper = calc.totalCostA < calc.totalCostB ? 'A' : 'B';
  const diff = Math.abs(calc.totalCostA - calc.totalCostB);
  const diffPct = calc.totalCostA && calc.totalCostB
    ? (diff / Math.max(calc.totalCostA, calc.totalCostB)) * 100
    : 0;

  return (
    <div className="space-y-6">
      {!hasData && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2">
          <AlertTriangle size={14} />
          <span>Дані не завантажено — симулятор працює на орієнтовних значеннях. Завантаж CSV на вкладці «Дашборд», щоб підтягнути реальну частоту й тривалість активацій.</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* --- assumptions panel --- */}
        <div className="w-full lg:w-96 flex-shrink-0 bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calculator size={18} className="text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Припущення</h3>
            </div>
            <button
              onClick={resetFromData}
              disabled={!hasData}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-300 disabled:cursor-not-allowed"
              title="Підтягнути частоту й тривалість з завантаженого CSV"
            >
              <RefreshCcw size={12} /> з даних
            </button>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1"><Server size={12} /> Ставки</p>
            <NumberField label="Вартість сервера" value={serverCostPerHour} step={0.5} suffix="zł/год" onChange={setServerCostPerHour} />
            <NumberField label="Вартість часу тестувальника/девопса" value={testerCostPerHour} step={5} suffix="zł/год" onChange={setTesterCostPerHour} />
          </div>

          <div className="space-y-4 pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1"><Clock size={12} /> Модель A — циклічна</p>
            <div>
              <label className="text-xs font-medium text-gray-500">День підняття</label>
              <select value={cyclicDay} onChange={(e) => setCyclicDay(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                {DAY_ORDER.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <NumberField label="Тривалість вікна" value={cyclicDurationHours} step={1} suffix="год/раз" onChange={setCyclicDurationHours} />
            <p className="text-[11px] text-gray-400 leading-snug">
              Фактично використано в цей день (сер./міс.): <b>{actualUsageOnCyclicDay.toFixed(1)} год</b> з {calc.scheduledHoursA.toFixed(1)} год піднятих.
            </p>
          </div>

          <div className="space-y-4 pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1"><Zap size={12} /> Модель B — on-demand</p>
            <NumberField label="Активацій на місяць" value={monthlyActivationsB} step={0.5} suffix="раз/міс" onChange={setMonthlyActivationsB}
              hint={hasData ? `авто: ${auto.activationsPerMonth.toFixed(1)}` : ''} />
            <NumberField label="Сер. тривалість активації" value={avgHoursPerActivationB} step={0.5} suffix="год" onChange={setAvgHoursPerActivationB}
              hint={hasData ? `авто: ${auto.avgHoursPerActivation.toFixed(1)}` : ''} />
            <NumberField label="Overhead на активацію" value={onDemandOverheadMin} step={5} suffix="хв очікування" onChange={setOnDemandOverheadMin} />
          </div>
        </div>

        {/* --- results --- */}
        <div className="flex-1 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className={`p-5 rounded-xl border ${cheaper === 'A' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100'}`}>
              <p className="text-xs text-gray-500 font-medium">Модель A · циклічна</p>
              <p className={`text-2xl font-bold mt-1 ${cheaper === 'A' ? 'text-emerald-700' : 'text-gray-800'}`}>{fmtPLN(calc.totalCostA)}<span className="text-sm font-medium text-gray-400">/міс</span></p>
              <p className="text-[11px] text-gray-500 mt-2">з них простій (сервер піднятий даремно): <b>{fmtPLN(calc.wastedCostA)}</b></p>
            </div>
            <div className={`p-5 rounded-xl border ${cheaper === 'B' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100'}`}>
              <p className="text-xs text-gray-500 font-medium">Модель B · on-demand</p>
              <p className={`text-2xl font-bold mt-1 ${cheaper === 'B' ? 'text-emerald-700' : 'text-gray-800'}`}>{fmtPLN(calc.totalCostB)}<span className="text-sm font-medium text-gray-400">/міс</span></p>
              <p className="text-[11px] text-gray-500 mt-2">з них overhead очікування: <b>{fmtPLN(calc.overheadCostB)}</b></p>
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
            <TrendingDown size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-blue-900">
              За поточних припущень дешевша <b>Модель {cheaper}</b> — економія ≈ <b>{fmtPLN(diff)}/міс</b> ({diffPct.toFixed(0)}%).
              {calc.breakEvenActivations != null && (
                <> Точка беззбитковості: якщо потреба у тестуванні перевищить <b>~{calc.breakEvenActivations.toFixed(1)} активацій/міс</b>, циклічна модель стає вигіднішою за on-demand — і навпаки.</>
              )}
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h4 className="text-sm font-semibold text-gray-700 mb-4">Структура вартості</h4>
            <div className="h-56 w-full" style={{ minHeight: 224 }}>
              <ResponsiveContainer width="100%" height="100%" minHeight={224}>
                <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                  <XAxis type="number" domain={[0, Math.ceil(maxBarTotal * 1.1)]} tickFormatter={(v) => `${v} zł`} fontSize={11} stroke="#9ca3af" />
                  <YAxis type="category" dataKey="name" width={110} fontSize={12} stroke="#6b7280" />
                  <Tooltip formatter={(v) => fmtPLN(v)} contentStyle={{ backgroundColor: '#1f2937', borderRadius: '8px', border: 'none', color: '#fff' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Інфраструктура" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Overhead / простій" stackId="a" fill="#f97316" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-semibold text-gray-700">Точка беззбитковості (вартість / кількість активацій на місяць)</h4>
            </div>
            <div className="h-64 w-full" style={{ minHeight: 256 }}>
              <ResponsiveContainer width="100%" height="100%" minHeight={256}>
                <LineChart data={breakEvenData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="activations" type="number" domain={[0, breakEvenData[breakEvenData.length - 1]?.activations || 20]} fontSize={11} stroke="#9ca3af" label={{ value: 'активацій / міс', position: 'insideBottom', offset: -3, fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis fontSize={11} stroke="#9ca3af" domain={[0, Math.ceil(maxLineTotal * 1.1)]} tickFormatter={(v) => `${v} zł`} />
                  <Tooltip formatter={(v) => fmtPLN(v)} contentStyle={{ backgroundColor: '#1f2937', borderRadius: '8px', border: 'none', color: '#fff' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {calc.breakEvenActivations != null && (
                    <ReferenceLine x={Math.round(calc.breakEvenActivations)} stroke="#9ca3af" strokeDasharray="4 4"
                      label={{ value: 'поріг', position: 'top', fontSize: 11, fill: '#6b7280' }} />
                  )}
                  <ReferenceDot x={Math.round(monthlyActivationsB)} y={Math.round(monthlyActivationsB * calc.marginalCostB)}
                    r={5} fill="#10b981" stroke="#fff" strokeWidth={2} />
                  <Line type="monotone" dataKey="Модель A (циклічна)" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Модель B (on-demand)" stroke="#f97316" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              Зелена точка — де зараз проєкт (за поточною частотою активацій). Лінія A — фіксована (не залежить від реального навантаження), лінія B — росте лінійно з кожною активацією.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}