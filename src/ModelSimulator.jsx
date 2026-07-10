import React, { useState, useMemo, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceDot, Legend
} from 'recharts';
import { Calculator, Server, Clock, AlertTriangle, TrendingUp, RefreshCcw, Zap, Cpu, ToggleRight, ToggleLeft } from 'lucide-react';

const WEEKS_PER_MONTH = 4.345;
const DAY_ORDER = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

function fmtPLN(n) {
  if (!isFinite(n)) return '—';
  return n.toLocaleString('pl-PL', { maximumFractionDigits: 0 }) + ' zł';
}

function NumberField({ label, value, onChange, step = 1, suffix, hint, disabled = false }) {
  return (
    <div className={disabled ? 'opacity-50' : ''}>
      <label className="text-xs font-medium text-gray-500 flex justify-between">
        <span>{label}</span>
        {hint && <span className="text-gray-400 font-normal">{hint}</span>}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="number"
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:cursor-not-allowed"
        />
        {suffix && <span className="text-xs text-gray-400 whitespace-nowrap">{suffix}</span>}
      </div>
    </div>
  );
}

export default function ModelSimulator({ rawData = [], pivotState, monthAreas = [] }) {
  const hasData = rawData.length > 0;
  const monthsCount = Math.max(monthAreas.length, 1);

  // ---- auto-derived suggestions from the loaded CSV ----
  const auto = useMemo(() => {
    if (!hasData) {
      return { activationsPerMonth: 4, avgHoursPerActivation: 6, totalHours: 0 };
    }
    const totalHours = rawData.reduce((s, d) => s + d.hours, 0);
    const activationsPerMonth = rawData.length / monthsCount;
    const avgHoursPerActivation = totalHours / rawData.length;
    return { activationsPerMonth, avgHoursPerActivation, totalHours };
  }, [rawData, hasData, monthsCount]);

  // ---- editable assumptions ----
  const [serverCostPerHour, setServerCostPerHour] = useState(3.5);
  const [testerCostPerHour, setTesterCostPerHour] = useState(120);
  const [cyclicDaysPerWeek, setCyclicDaysPerWeek] = useState(1);
  
  const [cyclicDays, setCyclicDays] = useState(['Пн']);
  
  const [cyclicDurationHours, setCyclicDurationHours] = useState(8);
  const [onDemandOverheadMin, setOnDemandOverheadMin] = useState(20);
  const [monthlyActivationsB, setMonthlyActivationsB] = useState(auto.activationsPerMonth || 4);
  const [avgHoursPerActivationB, setAvgHoursPerActivationB] = useState(auto.avgHoursPerActivation || 6);
  
  // Нові параметри для Scale-to-Zero
  const [enableScaleToZero, setEnableScaleToZero] = useState(false);
  const [scaleToZeroTimeoutMin, setScaleToZeroTimeoutMin] = useState(30);

  useEffect(() => {
    const targetCount = Math.max(1, Math.floor(cyclicDaysPerWeek));
    setCyclicDays(prev => {
      const next = [...prev];
      if (next.length < targetCount) {
        while (next.length < targetCount) {
          const nextDay = DAY_ORDER[next.length % DAY_ORDER.length];
          next.push(nextDay);
        }
      } else if (next.length > targetCount) {
        next.length = targetCount;
      }
      return next;
    });
  }, [cyclicDaysPerWeek]);

  const handleDayChange = (index, value) => {
    setCyclicDays(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const resetFromData = () => {
    setMonthlyActivationsB(parseFloat((auto.activationsPerMonth || 4).toFixed(2)));
    setAvgHoursPerActivationB(parseFloat((auto.avgHoursPerActivation || 6).toFixed(2)));
  };

  useEffect(() => {
    if (hasData) resetFromData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData]);

  const totalActualUsageOnCyclicDays = useMemo(() => {
    if (!pivotState) return 0;
    return cyclicDays.reduce((sum, day) => {
      if (pivotState.data[day]) {
        return sum + (pivotState.data[day].total / monthsCount);
      }
      return sum;
    }, 0);
  }, [pivotState, cyclicDays, monthsCount]);

  // ---- core cost model ----
  const calc = useMemo(() => {
    // Модель A
    const activationsA = WEEKS_PER_MONTH * cyclicDaysPerWeek;
    const scheduledHoursA = activationsA * cyclicDurationHours;
    const costInfraA = scheduledHoursA * serverCostPerHour;
    const wastedHoursA = Math.max(0, scheduledHoursA - totalActualUsageOnCyclicDays);
    const wastedCostA = wastedHoursA * serverCostPerHour;
    const totalCostA = costInfraA;

    // Модель B
    const costInfraB = monthlyActivationsB * avgHoursPerActivationB * serverCostPerHour;
    const overheadCostB = monthlyActivationsB * (onDemandOverheadMin / 60) * testerCostPerHour;
    const totalCostB = costInfraB + overheadCostB;
    const marginalCostB = avgHoursPerActivationB * serverCostPerHour + (onDemandOverheadMin / 60) * testerCostPerHour;

    // Модель H (Оригінальна гібридна - A + екстрені переплати B)
    const overflowActivations = Math.max(0, monthlyActivationsB - activationsA);
    const overflowCostInfra = overflowActivations * avgHoursPerActivationB * serverCostPerHour;
    const overheadCostH = overflowActivations * (onDemandOverheadMin / 60) * testerCostPerHour;
    const costInfraH = costInfraA + overflowCostInfra;
    const totalCostH = costInfraH + overheadCostH;

    // Модель S (Scale-to-Zero)
    const scaleToZeroTimeoutHours = scaleToZeroTimeoutMin / 60;
    const actualHoursBase = totalActualUsageOnCyclicDays > 0 ? totalActualUsageOnCyclicDays : (monthlyActivationsB * avgHoursPerActivationB);
    const costInfraS = actualHoursBase * serverCostPerHour;
    const wastedCostS = monthlyActivationsB * scaleToZeroTimeoutHours * serverCostPerHour; 
    const totalCostS = costInfraS + wastedCostS;

    const breakEvenActivations = marginalCostB > 0 ? totalCostA / marginalCostB : null;

    return {
      activationsA, costInfraA, wastedHoursA, wastedCostA, totalCostA,
      costInfraB, overheadCostB, totalCostB, marginalCostB, breakEvenActivations,
      costInfraH, overheadCostH, totalCostH,
      costInfraS, wastedCostS, totalCostS, scaleToZeroTimeoutHours,
      scheduledHoursA
    };
  }, [serverCostPerHour, testerCostPerHour, cyclicDaysPerWeek, cyclicDurationHours, totalActualUsageOnCyclicDays, monthlyActivationsB, avgHoursPerActivationB, onDemandOverheadMin, scaleToZeroTimeoutMin]);

  const breakEvenData = useMemo(() => {
    const maxX = Math.max(20, Math.ceil((calc.breakEvenActivations || 10) * 1.6), Math.ceil(monthlyActivationsB * 1.5));
    return Array.from({ length: maxX + 1 }, (_, x) => {
      
      const overflow = Math.max(0, x - calc.activationsA);
      const costH = calc.totalCostA + overflow * calc.marginalCostB;
      const costS = (x * avgHoursPerActivationB + x * calc.scaleToZeroTimeoutHours) * serverCostPerHour;

      const dataPoint = {
        activations: x,
        'Модель A (циклічна)': Math.round(calc.totalCostA),
        'Модель B (on-demand)': Math.round(x * calc.marginalCostB),
        'Модель H (гібридна)': Math.round(costH),
      };

      if (enableScaleToZero) {
        dataPoint['Модель S (scale-to-zero)'] = Math.round(costS);
      }

      return dataPoint;
    });
  }, [calc, monthlyActivationsB, avgHoursPerActivationB, serverCostPerHour, enableScaleToZero]);

  const barData = [
    { name: 'Модель A (циклічна)', 'Корисна робота сервера': Math.round(calc.costInfraA - calc.wastedCostA), 'Втрати (сервер вхолосту)': Math.round(calc.wastedCostA), 'Втрати (час людей)': 0 },
    { name: 'Модель B (on-demand)', 'Корисна робота сервера': Math.round(calc.costInfraB), 'Втрати (сервер вхолосту)': 0, 'Втрати (час людей)': Math.round(calc.overheadCostB) },
    { name: 'Модель H (гібридна)', 'Корисна робота сервера': Math.round(calc.costInfraH - calc.wastedCostA), 'Втрати (сервер вхолосту)': Math.round(calc.wastedCostA), 'Втрати (час людей)': Math.round(calc.overheadCostH) },
  ];

  if (enableScaleToZero) {
    barData.push({ name: 'Модель S', 'Корисна робота сервера': Math.round(calc.costInfraS), 'Втрати (сервер вхолосту)': Math.round(calc.wastedCostS), 'Втрати (час людей)': 0 });
  }
  
  const maxBarTotal = Math.max(calc.totalCostA, calc.totalCostB, calc.totalCostH, enableScaleToZero ? calc.totalCostS : 0, 1);

  // Виправлена логіка вибору переможця (строго менше)
  let cheaper = 'A';
  let minCost = calc.totalCostA;

  if (calc.totalCostB < minCost) {
    cheaper = 'B';
    minCost = calc.totalCostB;
  }
  if (calc.totalCostH < minCost) {
    cheaper = 'H';
    minCost = calc.totalCostH;
  }
  if (enableScaleToZero && calc.totalCostS < minCost) {
    cheaper = 'S (Scale-to-Zero)';
  }

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
            <NumberField label="Днів на тиждень" value={cyclicDaysPerWeek} step={1} suffix="дні/тиж" onChange={setCyclicDaysPerWeek} />
            
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500">Виберіть дні розкладу:</label>
              <div className="grid grid-cols-1 gap-2">
                {cyclicDays.map((day, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-12">День {idx + 1}:</span>
                    <select 
                      value={day} 
                      onChange={(e) => handleDayChange(idx, e.target.value)} 
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
                    >
                      {DAY_ORDER.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <NumberField label="Тривалість вікна" value={cyclicDurationHours} step={1} suffix="год/раз" onChange={setCyclicDurationHours} />
            <p className="text-[11px] text-gray-400 leading-snug">
              Фактично використано в цей день (сер./міс.): <b>{totalActualUsageOnCyclicDays.toFixed(1)} год</b> з {calc.scheduledHoursA.toFixed(1)} год.
            </p>
          </div>

          <div className="space-y-4 pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1"><Zap size={12} /> Модель B — On-Demand</p>
            <NumberField label="Активацій на місяць" value={monthlyActivationsB} step={0.5} suffix="раз/міс" onChange={setMonthlyActivationsB}
              hint={hasData ? `авто: ${auto.activationsPerMonth.toFixed(1)}` : ''} />
            <NumberField label="Сер. тривалість активації" value={avgHoursPerActivationB} step={0.5} suffix="год" onChange={setAvgHoursPerActivationB}
              hint={hasData ? `авто: ${auto.avgHoursPerActivation.toFixed(1)}` : ''} />
            <NumberField label="Overhead на активацію (люди)" value={onDemandOverheadMin} step={5} suffix="хв очікування" onChange={setOnDemandOverheadMin} />
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between cursor-pointer" onClick={() => setEnableScaleToZero(!enableScaleToZero)}>
              <p className={`text-xs font-semibold uppercase tracking-wide flex items-center gap-1 ${enableScaleToZero ? 'text-teal-600' : 'text-gray-400'}`}>
                <Cpu size={12} /> Модель S — Scale-to-Zero
              </p>
              {enableScaleToZero ? <ToggleRight size={20} className="text-teal-500" /> : <ToggleLeft size={20} className="text-gray-300" />}
            </div>
            
            <div className={`space-y-4 overflow-hidden transition-all duration-300 ${enableScaleToZero ? 'max-h-40 opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
              <NumberField label="Таймаут до авто-вимкнення" value={scaleToZeroTimeoutMin} step={5} suffix="хв" onChange={setScaleToZeroTimeoutMin} disabled={!enableScaleToZero} />
              <p className="text-[11px] text-gray-400 leading-snug">
                Автоматизація прибирає людський фактор (0 zł за DevOps). Єдина втрата — це оплата AWS під час очікування "сну".
              </p>
            </div>
          </div>
        </div>

        {/* --- results --- */}
        <div className="flex-1 space-y-6">
          <div className={`grid grid-cols-1 md:grid-cols-3 ${enableScaleToZero ? 'lg:grid-cols-4' : ''} gap-4 transition-all duration-300`}>
            <div className={`p-4 rounded-xl border ${cheaper === 'A' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100'}`}>
              <p className="text-xs text-gray-500 font-medium">Модель A · Циклічна</p>
              <p className={`text-xl font-bold mt-1 ${cheaper === 'A' ? 'text-emerald-700' : 'text-gray-800'}`}>{fmtPLN(calc.totalCostA)}<span className="text-xs font-medium text-gray-400">/міс</span></p>
              <p className="text-[11px] text-gray-500 mt-2">Холостий хід: <b>{fmtPLN(calc.wastedCostA)}</b></p>
            </div>
            
            <div className={`p-4 rounded-xl border ${cheaper === 'B' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100'}`}>
              <p className="text-xs text-gray-500 font-medium">Модель B · On-demand</p>
              <p className={`text-xl font-bold mt-1 ${cheaper === 'B' ? 'text-emerald-700' : 'text-gray-800'}`}>{fmtPLN(calc.totalCostB)}<span className="text-xs font-medium text-gray-400">/міс</span></p>
              <p className="text-[11px] text-gray-500 mt-2">Час інженерів: <b>{fmtPLN(calc.overheadCostB)}</b></p>
            </div>
            
            <div className={`p-4 rounded-xl border ${cheaper === 'H' ? 'bg-purple-50 border-purple-200' : 'bg-white border-gray-100'}`}>
              <p className="text-xs text-purple-600 font-bold flex items-center gap-1">Модель H · Гібридна</p>
              <p className={`text-xl font-bold mt-1 ${cheaper === 'H' ? 'text-purple-700' : 'text-gray-800'}`}>{fmtPLN(calc.totalCostH)}<span className="text-xs font-medium text-gray-400">/міс</span></p>
              <p className="text-[11px] text-gray-500 mt-2">База A + переплати <b>{fmtPLN(calc.overheadCostH)}</b></p>
            </div>

            {enableScaleToZero && (
              <div className={`p-4 rounded-xl border ${cheaper.includes('S') ? 'bg-teal-50 border-teal-300 shadow-sm' : 'bg-white border-gray-100'}`}>
                <p className="text-xs text-teal-600 font-bold flex items-center gap-1">Модель S · Scale-to-Zero</p>
                <p className={`text-xl font-bold mt-1 ${cheaper.includes('S') ? 'text-teal-700' : 'text-gray-800'}`}>{fmtPLN(calc.totalCostS)}<span className="text-xs font-medium text-gray-400">/міс</span></p>
                <p className="text-[11px] text-teal-600 mt-2">Втрати на таймаут: <b>{fmtPLN(calc.wastedCostS)}</b></p>
              </div>
            )}
          </div>

          <div className={`p-4 border rounded-xl flex items-start gap-3 ${cheaper.includes('S') ? 'bg-teal-50 border-teal-100' : (cheaper === 'H' ? 'bg-purple-50 border-purple-100' : 'bg-blue-50 border-blue-100')}`}>
            <TrendingUp size={18} className={`mt-0.5 flex-shrink-0 ${cheaper.includes('S') ? 'text-teal-600' : (cheaper === 'H' ? 'text-purple-600' : 'text-blue-600')}`} />
            <p className={`text-sm ${cheaper.includes('S') ? 'text-teal-900' : (cheaper === 'H' ? 'text-purple-900' : 'text-blue-900')}`}>
              За поточних припущень дешевшою та найвигіднішою є <b>Модель {cheaper}</b>. 
              {cheaper === 'H' && " Гібридна модель показує реальну вартість Моделі A, коли потреба перевищує можливості розкладу."}
              {cheaper.includes('S') && " Завдяки автоматизації ми платимо лише за фактичний час плюс буфер очікування сну."}
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h4 className="text-sm font-semibold text-gray-700 mb-4">Структура вартості (що з'їдає бюджет)</h4>
            <div className="h-56 w-full" style={{ minHeight: 224 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                  <XAxis type="number" domain={[0, Math.ceil(maxBarTotal * 1.1)]} tickFormatter={(v) => `${v} zł`} fontSize={11} stroke="#9ca3af" />
                  <YAxis type="category" dataKey="name" width={80} fontSize={12} stroke="#6b7280" />
                  <Tooltip formatter={(v) => fmtPLN(v)} contentStyle={{ backgroundColor: '#1f2937', borderRadius: '8px', border: 'none', color: '#fff' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Корисна робота сервера" stackId="a" fill="#10b981" />
                  <Bar dataKey="Втрати (сервер вхолосту)" stackId="a" fill="#f97316" />
                  <Bar dataKey="Втрати (час людей)" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h4 className="text-sm font-semibold text-gray-700 mb-4">Прогнозування витрат від кількості запусків</h4>
            <div className="h-64 w-full" style={{ minHeight: 256 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={breakEvenData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="activations" type="number" domain={[0, breakEvenData[breakEvenData.length - 1]?.activations || 20]} fontSize={11} stroke="#9ca3af" label={{ value: 'активацій / міс', position: 'insideBottom', offset: -3, fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis fontSize={11} stroke="#9ca3af" tickFormatter={(v) => `${v} zł`} />
                  <Tooltip formatter={(v) => fmtPLN(v)} contentStyle={{ backgroundColor: '#1f2937', borderRadius: '8px', border: 'none', color: '#fff' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceDot x={Math.round(monthlyActivationsB)} y={Math.round(calc.totalCostB)} r={5} fill="#f97316" stroke="#fff" strokeWidth={2} />
                  <Line type="monotone" dataKey="Модель A (циклічна)" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Модель B (on-demand)" stroke="#f97316" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Модель H (гібридна)" stroke="#8b5cf6" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                  {enableScaleToZero && (
                    <Line type="monotone" dataKey="Модель S (scale-to-zero)" stroke="#14b8a6" strokeWidth={3} dot={false} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}