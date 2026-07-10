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
          className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50 disabled:cursor-not-allowed"
        />
        {suffix && <span className="text-[11px] text-gray-400 whitespace-nowrap">{suffix}</span>}
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
  
  // Замість кількості та селектів — масив вибраних днів для чекбоксів
  const [cyclicDays, setCyclicDays] = useState(['Пн', 'Вт', 'Ср', 'Чт', 'Пт']);
  
  const [cyclicDurationHours, setCyclicDurationHours] = useState(8);
  const [onDemandOverheadMin, setOnDemandOverheadMin] = useState(20);
  const [monthlyActivationsB, setMonthlyActivationsB] = useState(auto.activationsPerMonth || 4);
  const [avgHoursPerActivationB, setAvgHoursPerActivationB] = useState(auto.avgHoursPerActivation || 6);
  
  // Нові параметри для Scale-to-Zero
  const [enableScaleToZero, setEnableScaleToZero] = useState(false);
  const [scaleToZeroTimeoutMin, setScaleToZeroTimeoutMin] = useState(30);

  const toggleDay = (day) => {
    setCyclicDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
    );
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
    const activationsA = WEEKS_PER_MONTH * cyclicDays.length;
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
  }, [serverCostPerHour, testerCostPerHour, cyclicDays.length, cyclicDurationHours, totalActualUsageOnCyclicDays, monthlyActivationsB, avgHoursPerActivationB, onDemandOverheadMin, scaleToZeroTimeoutMin]);

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
    <div className="space-y-4">
      {!hasData && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2">
          <AlertTriangle size={14} />
          <span>Дані не завантажено — симулятор працює на орієнтовних значеннях. Завантаж CSV на вкладці «Дашборд».</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* --- assumptions panel --- */}
        <div className="w-full lg:w-[22rem] flex-shrink-0 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1.5">
              <Calculator size={16} className="text-gray-500" />
              <h3 className="text-[13px] font-bold text-gray-700 uppercase tracking-wider">Припущення</h3>
            </div>
            <button onClick={resetFromData} disabled={!hasData} className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 disabled:text-gray-300">
              <RefreshCcw size={10} /> з даних
            </button>
          </div>

          <div className="space-y-4">
            {/* Ставки: 2 колонки */}
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1 mb-2"><Server size={10} /> Ставки</p>
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Вартість сервера" value={serverCostPerHour} step={0.5} suffix="zł/год" onChange={setServerCostPerHour} />
                <NumberField label="Вартість часу тестувальника" value={testerCostPerHour} step={5} suffix="zł/год" onChange={setTesterCostPerHour} />
              </div>
            </div>

            {/* Модель A: Чекбокси + тривалість */}
            <div className="pt-3 border-t border-gray-100">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1 mb-2"><Clock size={10} /> Модель A — циклічна</p>
              
              <div className="mb-3">
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">Робочі дні розкладу:</label>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_ORDER.map(day => (
                    <label key={day} className={`flex items-center justify-center px-2 py-1 rounded text-xs font-medium cursor-pointer transition-colors border ${cyclicDays.includes(day) ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
                      <input type="checkbox" className="hidden" checked={cyclicDays.includes(day)} onChange={() => toggleDay(day)} />
                      {day}
                    </label>
                  ))}
                </div>
              </div>

              <NumberField label="Тривалість вікна" value={cyclicDurationHours} step={1} suffix="год/день" onChange={setCyclicDurationHours} />
              <p className="text-[10px] text-gray-400 leading-tight mt-1">
                Фактичне використання: <b>{totalActualUsageOnCyclicDays.toFixed(1)} год</b> з {calc.scheduledHoursA.toFixed(1)} год.
              </p>
            </div>

            {/* Модель B: 2 колонки */}
            <div className="pt-3 border-t border-gray-100">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1 mb-2"><Zap size={10} /> Модель B — On-Demand</p>
              <div className="grid grid-cols-2 gap-3 mb-2">
                <NumberField label="Активацій/міс." value={monthlyActivationsB} step={0.5} suffix="раз/міс" onChange={setMonthlyActivationsB} />
                <NumberField label="Середня тривалість" value={avgHoursPerActivationB} step={0.5} suffix="год/раз" onChange={setAvgHoursPerActivationB} />
              </div>
              <NumberField label="Час на запуск (DevOps)" value={onDemandOverheadMin} step={5} suffix="хв" onChange={setOnDemandOverheadMin} />
            </div>

            {/* Модель S */}
            <div className="pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between cursor-pointer mb-2" onClick={() => setEnableScaleToZero(!enableScaleToZero)}>
                <p className={`text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1 ${enableScaleToZero ? 'text-teal-600' : 'text-gray-400'}`}>
                  <Cpu size={10} /> Модель S — Scale-to-Zero
                </p>
                {enableScaleToZero ? <ToggleRight size={16} className="text-teal-500" /> : <ToggleLeft size={16} className="text-gray-300" />}
              </div>
              
              <div className={`overflow-hidden transition-all duration-300 ${enableScaleToZero ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'}`}>
                <NumberField label="Таймаут до авто-вимкнення" value={scaleToZeroTimeoutMin} step={5} suffix="хв" onChange={setScaleToZeroTimeoutMin} disabled={!enableScaleToZero} />
                <p className="text-[10px] text-gray-400 leading-tight mt-1">
                  0 zł за DevOps. Платимо лише за очікування "сну".
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* --- results --- */}
        <div className="flex-1 space-y-4">
          <div className={`grid grid-cols-1 md:grid-cols-3 ${enableScaleToZero ? 'lg:grid-cols-4' : ''} gap-3 transition-all duration-300`}>
            <div className={`p-3 rounded-xl border ${cheaper === 'A' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100'}`}>
              <p className="text-[11px] text-gray-500 font-medium">Модель A · Циклічна</p>
              <p className={`text-lg font-bold mt-0.5 ${cheaper === 'A' ? 'text-emerald-700' : 'text-gray-800'}`}>{fmtPLN(calc.totalCostA)}</p>
              <p className="text-[10px] text-gray-500 mt-1">Холостий хід: <b>{fmtPLN(calc.wastedCostA)}</b></p>
            </div>
            
            <div className={`p-3 rounded-xl border ${cheaper === 'B' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100'}`}>
              <p className="text-[11px] text-gray-500 font-medium">Модель B · On-demand</p>
              <p className={`text-lg font-bold mt-0.5 ${cheaper === 'B' ? 'text-emerald-700' : 'text-gray-800'}`}>{fmtPLN(calc.totalCostB)}</p>
              <p className="text-[10px] text-gray-500 mt-1">DevOps: <b>{fmtPLN(calc.overheadCostB)}</b></p>
            </div>
            
            <div className={`p-3 rounded-xl border ${cheaper === 'H' ? 'bg-purple-50 border-purple-200' : 'bg-white border-gray-100'}`}>
              <p className="text-[11px] text-purple-600 font-bold flex items-center gap-1">Модель H · Гібридна</p>
              <p className={`text-lg font-bold mt-0.5 ${cheaper === 'H' ? 'text-purple-700' : 'text-gray-800'}`}>{fmtPLN(calc.totalCostH)}</p>
              <p className="text-[10px] text-gray-500 mt-1">База A + переплати <b>{fmtPLN(calc.overheadCostH)}</b></p>
            </div>

            {enableScaleToZero && (
              <div className={`p-3 rounded-xl border ${cheaper.includes('S') ? 'bg-teal-50 border-teal-300 shadow-sm' : 'bg-white border-gray-100'}`}>
                <p className="text-[11px] text-teal-600 font-bold flex items-center gap-1">Модель S · Scale-to-Zero</p>
                <p className={`text-lg font-bold mt-0.5 ${cheaper.includes('S') ? 'text-teal-700' : 'text-gray-800'}`}>{fmtPLN(calc.totalCostS)}</p>
                <p className="text-[10px] text-teal-600 mt-1">Таймаути сну: <b>{fmtPLN(calc.wastedCostS)}</b></p>
              </div>
            )}
          </div>

          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <h4 className="text-[13px] font-semibold text-gray-700 mb-3">Структура вартості (що з'їдає бюджет)</h4>
            <div className="h-40 w-full" style={{ minHeight: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                  <XAxis type="number" domain={[0, Math.ceil(maxBarTotal * 1.1)]} tickFormatter={(v) => `${v} zł`} fontSize={10} stroke="#9ca3af" />
                  <YAxis type="category" dataKey="name" width={110} fontSize={11} stroke="#6b7280" />
                  <Tooltip formatter={(v) => fmtPLN(v)} contentStyle={{ backgroundColor: '#1f2937', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Корисна робота сервера" stackId="a" fill="#10b981" barSize={16} />
                  <Bar dataKey="Втрати (сервер вхолосту)" stackId="a" fill="#f97316" />
                  <Bar dataKey="Втрати (час людей)" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <h4 className="text-[13px] font-semibold text-gray-700 mb-3">Прогнозування витрат від кількості запусків</h4>
            <div className="h-52 w-full" style={{ minHeight: 208 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={breakEvenData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="activations" type="number" domain={[0, breakEvenData[breakEvenData.length - 1]?.activations || 20]} fontSize={10} stroke="#9ca3af" label={{ value: 'активацій / міс', position: 'insideBottom', offset: -3, fontSize: 10, fill: '#9ca3af' }} />
                  <YAxis fontSize={10} stroke="#9ca3af" tickFormatter={(v) => `${v} zł`} />
                  <Tooltip formatter={(v) => fmtPLN(v)} contentStyle={{ backgroundColor: '#1f2937', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceDot x={Math.round(monthlyActivationsB)} y={Math.round(calc.totalCostB)} r={4} fill="#f97316" stroke="#fff" strokeWidth={2} />
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