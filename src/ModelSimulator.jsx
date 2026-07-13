import React, { useState, useMemo, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceDot, Legend
} from 'recharts';
import { Calculator, Server, Clock, AlertTriangle, TrendingUp, RefreshCcw, Zap, Cpu, ToggleRight, ToggleLeft } from 'lucide-react';

const WEEKS_PER_MONTH = 4.345;
const DAY_ORDER = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];

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

  const auto = useMemo(() => {
    if (!hasData) {
      return { activationsPerMonth: 4, avgHoursPerActivation: 6, totalHours: 0 };
    }
    const totalHours = rawData.reduce((s, d) => s + d.hours, 0);
    const activationsPerMonth = rawData.length / monthsCount;
    const avgHoursPerActivation = totalHours / rawData.length;
    return { activationsPerMonth, avgHoursPerActivation, totalHours };
  }, [rawData, hasData, monthsCount]);

  const [serverCostPerHour, setServerCostPerHour] = useState(3.5);
  const [testerCostPerHour, setTesterCostPerHour] = useState(120);
  
  const [cyclicDays, setCyclicDays] = useState(['Pn', 'Wt', 'Śr', 'Cz', 'Pt']);
  
  const [cyclicDurationHours, setCyclicDurationHours] = useState(8);
  const [onDemandOverheadMin, setOnDemandOverheadMin] = useState(20);
  const [monthlyActivationsB, setMonthlyActivationsB] = useState(auto.activationsPerMonth || 4);
  const [avgHoursPerActivationB, setAvgHoursPerActivationB] = useState(auto.avgHoursPerActivation || 6);
  
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

  // Найдовша ОДНА реальна сесія в обрані дні тижня — місячна сума ховає цей ризик:
  // вікно може "влазити" по сумі годин на місяць, але фізично обривати конкретну сесію.
  const maxSingleSessionOnCyclicDays = useMemo(() => {
    if (!rawData.length || cyclicDays.length === 0) return 0;
    return rawData.reduce((max, d) => (cyclicDays.includes(d.dayName) && d.hours > max ? d.hours : max), 0);
  }, [rawData, cyclicDays]);

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
    // Модель H (гібрид) — базова ємність (в годинах) переводиться в "еквівалент on-demand сесій",
    // а не порівнюється напряму "штука до штуки" (бо тривалість вікна ≠ тривалості реальної сесії).
    const baselineEquivalentActivations = avgHoursPerActivationB > 0 ? scheduledHoursA / avgHoursPerActivationB : 0;
    const overflowActivations = Math.max(0, monthlyActivationsB - baselineEquivalentActivations);
    const overflowCostInfra = overflowActivations * avgHoursPerActivationB * serverCostPerHour;
    const overheadCostH = overflowActivations * (onDemandOverheadMin / 60) * testerCostPerHour;
    const costInfraH = costInfraA + overflowCostInfra;
    const totalCostH = costInfraH + overheadCostH;

    // Модель S (Scale-to-Zero) — авто-присинання on-demand сервера.
    // Концептуально це варіант Моделі B, тому база — реальний обсяг on-demand роботи,
    // а НЕ totalActualUsageOnCyclicDays (те залежить від чекбоксів Моделі A і не має стосунку до S).
    const scaleToZeroTimeoutHours = scaleToZeroTimeoutMin / 60;
    const actualHoursBase = monthlyActivationsB * avgHoursPerActivationB;
    const costInfraS = actualHoursBase * serverCostPerHour;
    const wastedCostS = monthlyActivationsB * scaleToZeroTimeoutHours * serverCostPerHour; 
    const totalCostS = costInfraS + wastedCostS;

    const breakEvenActivations = marginalCostB > 0 ? totalCostA / marginalCostB : null;

    return {
      activationsA, baselineEquivalentActivations, costInfraA, wastedHoursA, wastedCostA, totalCostA,
      costInfraB, overheadCostB, totalCostB, marginalCostB, breakEvenActivations,
      costInfraH, overheadCostH, totalCostH,
      costInfraS, wastedCostS, totalCostS, scaleToZeroTimeoutHours,
      scheduledHoursA
    };
  }, [serverCostPerHour, testerCostPerHour, cyclicDays.length, cyclicDurationHours, totalActualUsageOnCyclicDays, monthlyActivationsB, avgHoursPerActivationB, onDemandOverheadMin, scaleToZeroTimeoutMin]);

  const breakEvenData = useMemo(() => {
    const maxX = Math.max(20, Math.ceil((calc.breakEvenActivations || 10) * 1.6), Math.ceil(monthlyActivationsB * 1.5));
    return Array.from({ length: maxX + 1 }, (_, x) => {
      
      const overflow = Math.max(0, x - calc.baselineEquivalentActivations);
      const costH = calc.totalCostA + overflow * calc.marginalCostB;
      const costS = (x * avgHoursPerActivationB + x * calc.scaleToZeroTimeoutHours) * serverCostPerHour;

      const dataPoint = {
        activations: x,
        'Model A (cykliczny)': Math.round(calc.totalCostA),
        'Model B (on-demand)': Math.round(x * calc.marginalCostB),
        'Model H (hybrydowy)': Math.round(costH),
      };

      if (enableScaleToZero) {
        dataPoint['Model S (scale-to-zero)'] = Math.round(costS);
      }

      return dataPoint;
    });
  }, [calc, monthlyActivationsB, avgHoursPerActivationB, serverCostPerHour, enableScaleToZero]);

  const barData = [
    { name: 'Model A (cykliczny)', 'Efektywna praca serwera': Math.round(calc.costInfraA - calc.wastedCostA), 'Straty (serwer bezczynny)': Math.round(calc.wastedCostA), 'Straty (czas ludzi)': 0 },
    { name: 'Model B (on-demand)', 'Efektywna praca serwera': Math.round(calc.costInfraB), 'Straty (serwer bezczynny)': 0, 'Straty (czas ludzi)': Math.round(calc.overheadCostB) },
    { name: 'Model H (hybrydowy)', 'Efektywna praca serwera': Math.round(calc.costInfraH - calc.wastedCostA), 'Straty (serwer bezczynny)': Math.round(calc.wastedCostA), 'Straty (czas ludzi)': Math.round(calc.overheadCostH) },
  ];

  if (enableScaleToZero) {
    barData.push({ name: 'Model S', 'Efektywna praca serwera': Math.round(calc.costInfraS), 'Straty (serwer bezczynny)': Math.round(calc.wastedCostS), 'Straty (czas ludzi)': 0 });
  }
  
  const maxBarTotal = Math.max(calc.totalCostA, calc.totalCostB, calc.totalCostH, enableScaleToZero ? calc.totalCostS : 0, 1);

  const costs = { A: calc.totalCostA, B: calc.totalCostB, H: calc.totalCostH };
  if (enableScaleToZero) costs.S = calc.totalCostS;
  const sortedCosts = Object.entries(costs).sort((a, b) => a[1] - b[1]);
  const cheaper = sortedCosts[0][0];
  // Модель H часто математично збігається з A (коли база повністю покриває потребу — overflow=0).
  // Порівнювати "економію" з таким двійником безглуздо (завжди 0 zł) — шукаємо наступну ЗНАЧУЩО іншу опцію.
  const TIE_TOLERANCE_ZL = 0.5;
  const nextDistinct = sortedCosts.slice(1).find(([, v]) => Math.abs(v - sortedCosts[0][1]) > TIE_TOLERANCE_ZL);
  const diff = nextDistinct ? nextDistinct[1] - sortedCosts[0][1] : 0;
  const diffPct = nextDistinct && nextDistinct[1] ? (diff / nextDistinct[1]) * 100 : 0;
  const modelLabel = {
    A: 'cykliczny (Model A)',
    B: 'on-demand (Model B)',
    H: 'hybrydowy (Model H)',
    S: 'scale-to-zero (Model S)',
  };

  return (
    <div className="space-y-4">
      {!hasData && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2">
          <AlertTriangle size={14} />
          <span>Dane nie zostały załadowane — symulator działa na wartościach szacunkowych. Prześlij plik CSV w zakładce „Dashboard”.</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* --- assumptions panel --- */}
        <div className="w-full lg:w-[22rem] flex-shrink-0 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1.5">
              <Calculator size={16} className="text-gray-500" />
              <h3 className="text-[13px] font-bold text-gray-700 uppercase tracking-wider">Założenia</h3>
            </div>
            <button onClick={resetFromData} disabled={!hasData} className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 disabled:text-gray-300">
              <RefreshCcw size={10} /> z danych
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1 mb-2"><Server size={10} /> Stawki</p>
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Koszt serwera" value={serverCostPerHour} step={0.5} suffix="zł/godz." onChange={setServerCostPerHour} />
                <NumberField label="Koszt czasu testera" value={testerCostPerHour} step={5} suffix="zł/godz." onChange={setTesterCostPerHour} />
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1 mb-2"><Clock size={10} /> Model A — cykliczny</p>
              
              <div className="mb-3">
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">Dni robocze harmonogramu:</label>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_ORDER.map(day => (
                    <label key={day} className={`flex items-center justify-center px-2 py-1 rounded text-xs font-medium cursor-pointer transition-colors border ${cyclicDays.includes(day) ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
                      <input type="checkbox" className="hidden" checked={cyclicDays.includes(day)} onChange={() => toggleDay(day)} />
                      {day}
                    </label>
                  ))}
                </div>
              </div>

              <NumberField label="Czas trwania okna" value={cyclicDurationHours} step={1} suffix="godz./dzień" onChange={setCyclicDurationHours} />
              <p className="text-[10px] text-gray-400 leading-tight mt-1">
                Rzeczywiste użycie: <b>{totalActualUsageOnCyclicDays.toFixed(1)} godz.</b> z {calc.scheduledHoursA.toFixed(1)} godz. (suma miesięczna)
              </p>
              {maxSingleSessionOnCyclicDays > cyclicDurationHours && (
                <p className="text-[10px] text-red-500 leading-tight mt-1">
                  ⚠ Najdłuższa pojedyncza sesja w te dni trwała <b>{maxSingleSessionOnCyclicDays.toFixed(1)} godz.</b> — okno {cyclicDurationHours} godz. by ją przerwało, mimo że suma miesięczna „się mieści".
                </p>
              )}
              {cyclicDays.length === 0 && (
                <p className="text-[10px] text-red-500 leading-tight mt-1">
                  ⚠ Brak wybranych dni = Model A kosztuje 0 zł, bo serwer nigdy się nie uruchamia. To nie jest realny scenariusz — zaznacz co najmniej 1 dzień.
                </p>
              )}
            </div>

            <div className="pt-3 border-t border-gray-100">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1 mb-2"><Zap size={10} /> Model B — On-Demand</p>
              <div className="grid grid-cols-2 gap-3 mb-2">
                <NumberField label="Aktywacje/mies." value={monthlyActivationsB} step={0.5} suffix="raz/mies." onChange={setMonthlyActivationsB} />
                <NumberField label="Średni czas trwania" value={avgHoursPerActivationB} step={0.5} suffix="godz./raz" onChange={setAvgHoursPerActivationB} />
              </div>
              <NumberField label="Czas na uruchomienie (DevOps)" value={onDemandOverheadMin} step={5} suffix="min" onChange={setOnDemandOverheadMin} />
            </div>

            <div className="pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between cursor-pointer mb-2" onClick={() => setEnableScaleToZero(!enableScaleToZero)}>
                <p className={`text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1 ${enableScaleToZero ? 'text-teal-600' : 'text-gray-400'}`}>
                  <Cpu size={10} /> Model S — Scale-to-Zero
                </p>
                {enableScaleToZero ? <ToggleRight size={16} className="text-teal-500" /> : <ToggleLeft size={16} className="text-gray-300" />}
              </div>
              
              <div className={`overflow-hidden transition-all duration-300 ${enableScaleToZero ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'}`}>
                <NumberField label="Timeout do autowyłączenia" value={scaleToZeroTimeoutMin} step={5} suffix="min" onChange={setScaleToZeroTimeoutMin} disabled={!enableScaleToZero} />
                <p className="text-[10px] text-gray-400 leading-tight mt-1">
                  0 zł za DevOps. Płacimy tylko za oczekiwanie na "uśpienie".
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-4">
          <div className={`grid grid-cols-1 md:grid-cols-3 ${enableScaleToZero ? 'lg:grid-cols-4' : ''} gap-3 transition-all duration-300`}>
            <div className={`p-3 rounded-xl border ${cheaper === 'A' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100'}`}>
              <p className="text-[11px] text-gray-500 font-medium">Model A · Cykliczny</p>
              <p className={`text-lg font-bold mt-0.5 ${cheaper === 'A' ? 'text-emerald-700' : 'text-gray-800'}`}>{fmtPLN(calc.totalCostA)}</p>
              <p className="text-[10px] text-gray-500 mt-1">Czas bezczynności: <b>{fmtPLN(calc.wastedCostA)}</b></p>
            </div>
            
            <div className={`p-3 rounded-xl border ${cheaper === 'B' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100'}`}>
              <p className="text-[11px] text-gray-500 font-medium">Model B · On-demand</p>
              <p className={`text-lg font-bold mt-0.5 ${cheaper === 'B' ? 'text-emerald-700' : 'text-gray-800'}`}>{fmtPLN(calc.totalCostB)}</p>
              <p className="text-[10px] text-gray-500 mt-1">DevOps: <b>{fmtPLN(calc.overheadCostB)}</b></p>
            </div>
            
            <div className={`p-3 rounded-xl border ${cheaper === 'H' ? 'bg-purple-50 border-purple-200' : 'bg-white border-gray-100'}`}>
              <p className="text-[11px] text-purple-600 font-bold flex items-center gap-1">Model H · Hybrydowy</p>
              <p className={`text-lg font-bold mt-0.5 ${cheaper === 'H' ? 'text-purple-700' : 'text-gray-800'}`}>{fmtPLN(calc.totalCostH)}</p>
              <p className="text-[10px] text-gray-500 mt-1">Baza A + nadpłaty <b>{fmtPLN(calc.overheadCostH)}</b></p>
            </div>

            {enableScaleToZero && (
              <div className={`p-3 rounded-xl border ${cheaper.includes('S') ? 'bg-teal-50 border-teal-300 shadow-sm' : 'bg-white border-gray-100'}`}>
                <p className="text-[11px] text-teal-600 font-bold flex items-center gap-1">Model S · Scale-to-Zero</p>
                <p className={`text-lg font-bold mt-0.5 ${cheaper.includes('S') ? 'text-teal-700' : 'text-gray-800'}`}>{fmtPLN(calc.totalCostS)}</p>
                <p className="text-[10px] text-teal-600 mt-1">Timeouty uśpienia: <b>{fmtPLN(calc.wastedCostS)}</b></p>
              </div>
            )}
          </div>

          <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
            <TrendingUp size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-blue-900">
              {nextDistinct ? (
                <> Przy obecnych założeniach najtańszy jest <b>{modelLabel[cheaper]}</b> — oszczędność ≈ <b>{fmtPLN(diff)}/mies.</b> względem następnej realnie innej opcji, <b>{modelLabel[nextDistinct[0]]}</b> ({diffPct.toFixed(0)}%).</>
              ) : (
                <> Przy obecnych założeniach wszystkie modele wychodzą praktycznie tak samo (różnica &lt; {TIE_TOLERANCE_ZL} zł) — wybór zależy od innych czynników niż czysty koszt (np. elastyczność, obciążenie DevOps).</>
              )}
              {calc.breakEvenActivations != null && (
                <> Próg A↔B: jeśli realna potrzeba testowania przekroczy <b>~{calc.breakEvenActivations.toFixed(1)} aktywacji/mies.</b> przy obecnym oknie cyklicznym — model cykliczny staje się tańszy od czystego on-demand, poniżej tego progu — odwrotnie.</>
              )}
              {' '}Model hybrydowy ma sens, gdy część obciążenia jest regularna (pokrywa ją baza), a część to nieprzewidywalne skoki; scale-to-zero — gdy sesje są nieregularne, ale krótki timeout nie generuje dużych strat.
            </p>
          </div>

          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <h4 className="text-[13px] font-semibold text-gray-700 mb-3">Struktura kosztów (co pochłania budżet)</h4>
            <div className="h-40 w-full" style={{ minHeight: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                  <XAxis type="number" domain={[0, Math.ceil(maxBarTotal * 1.1)]} tickFormatter={(v) => `${v} zł`} fontSize={10} stroke="#9ca3af" />
                  <YAxis type="category" dataKey="name" width={110} fontSize={11} stroke="#6b7280" />
                  <Tooltip formatter={(v) => fmtPLN(v)} contentStyle={{ backgroundColor: '#1f2937', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Efektywna praca serwera" stackId="a" fill="#10b981" barSize={16} />
                  <Bar dataKey="Straty (serwer bezczynny)" stackId="a" fill="#f97316" />
                  <Bar dataKey="Straty (czas ludzi)" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <h4 className="text-[13px] font-semibold text-gray-700 mb-3">Prognozowanie kosztów w zależności od liczby uruchomień</h4>
            <div className="h-52 w-full" style={{ minHeight: 208 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={breakEvenData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="activations" type="number" domain={[0, breakEvenData[breakEvenData.length - 1]?.activations || 20]} fontSize={10} stroke="#9ca3af" label={{ value: 'aktywacji / mies.', position: 'insideBottom', offset: -3, fontSize: 10, fill: '#9ca3af' }} />
                  <YAxis fontSize={10} stroke="#9ca3af" tickFormatter={(v) => `${v} zł`} />
                  <Tooltip formatter={(v) => fmtPLN(v)} contentStyle={{ backgroundColor: '#1f2937', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {calc.breakEvenActivations != null && (
                    <ReferenceLine x={Math.round(calc.breakEvenActivations)} stroke="#9ca3af" strokeDasharray="4 4"
                      label={{ value: 'próg A↔B', position: 'top', fontSize: 10, fill: '#6b7280' }} />
                  )}
                  <ReferenceDot x={Math.round(monthlyActivationsB)} y={Math.round(calc.totalCostB)} r={4} fill="#f97316" stroke="#fff" strokeWidth={2} />
                  <Line type="monotone" dataKey="Model A (cykliczny)" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Model B (on-demand)" stroke="#f97316" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Model H (hybrydowy)" stroke="#8b5cf6" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                  {enableScaleToZero && (
                    <Line type="monotone" dataKey="Model S (scale-to-zero)" stroke="#14b8a6" strokeWidth={3} dot={false} />
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