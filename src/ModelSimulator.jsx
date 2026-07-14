import React, { useState, useMemo, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceDot, Legend
} from 'recharts';
import {
  Calculator, Server, Clock, AlertTriangle, TrendingUp, RefreshCcw, Zap, Cpu,
  ToggleRight, ToggleLeft, EyeOff, ChevronDown, ChevronRight, X, GitMerge
} from 'lucide-react';

const WEEKS_PER_MONTH = 4.345;
const DAY_ORDER = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];
const TIE_TOLERANCE_ZL = 0.5;

function fmtPLN(n) {
  if (!isFinite(n)) return '—';
  return n.toLocaleString('pl-PL', { maximumFractionDigits: 0 }) + ' zł';
}

function fmtPct(n) {
  if (!isFinite(n)) return '—';
  return (n > 0 ? '-' : n < 0 ? '+' : '') + Math.abs(n).toFixed(0) + '%';
}

function NumberField({ label, value, onChange, step = 1, suffix, hint, disabled = false }) {
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

function DayPicker({ days, onToggle }) {
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

function InfoButton({ label = 'Jak to działa?', children }) {
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

function ToggleRow({ label, icon, active, onClick, activeColor = 'text-teal-600', activeToggleColor = 'text-teal-500' }) {
  return (
    <div className="flex items-center justify-between cursor-pointer mb-2" onClick={onClick}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1 ${active ? activeColor : 'text-gray-400'}`}>
        {icon} {label}
      </p>
      {active ? <ToggleRight size={16} className={activeToggleColor} /> : <ToggleLeft size={16} className="text-gray-300" />}
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

  // Stawka serwera — schowana domyślnie, najmniej istotna dla analizy porównawczej.
  // Uwaga: po naszej stronie uruchomienie serwera nie kosztuje nic (robi to Wykonawca) —
  // dlatego żaden z modeli nie ma już osobnego kosztu "czasu DevOps/uruchomienia".
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [serverCostPerHour, setServerCostPerHour] = useState(3.5);

  // Model A — cykliczny
  const [cyclicDays, setCyclicDays] = useState(['Pn', 'Wt', 'Śr', 'Cz', 'Pt']);
  const [cyclicDurationHours, setCyclicDurationHours] = useState(8);
  const [ignoreModelA, setIgnoreModelA] = useState(false);
  const [actualUsageA, setActualUsageA] = useState(0); // auto z danych, edytowalne

  // Model B — on-demand (rzeczywisty standard we wszystkich zespołach)
  // Wykonawca fakturuje zamówione godziny — realne użycie testerów bywa niższe (świadomy zapas).
  const [monthlyActivationsB, setMonthlyActivationsB] = useState(auto.activationsPerMonth || 4);
  const [avgHoursPerActivationB, setAvgHoursPerActivationB] = useState(auto.avgHoursPerActivation || 6); // godz. zamówione (faktura)
  const [avgActualHoursPerActivationB, setAvgActualHoursPerActivationB] = useState(auto.avgHoursPerActivation || 6); // godz. realnego użycia

  // Model H — hybrydowy, opcjonalny, w PEŁNI niezależny od A i B (własna baza + własna nadwyżka on-demand)
  const [enableModelH, setEnableModelH] = useState(false);
  const [cyclicDaysH, setCyclicDaysH] = useState(['Pn', 'Wt', 'Śr', 'Cz', 'Pt']);
  const [cyclicDurationHoursH, setCyclicDurationHoursH] = useState(4);
  const [actualUsageH, setActualUsageH] = useState(0); // auto z danych, edytowalne
  const [overflowActivationsH, setOverflowActivationsH] = useState(auto.activationsPerMonth || 4);
  const [avgOrderedHoursOverflowH, setAvgOrderedHoursOverflowH] = useState(auto.avgHoursPerActivation || 6);
  const [avgActualHoursOverflowH, setAvgActualHoursOverflowH] = useState(auto.avgHoursPerActivation || 6);

  // Model S — scale-to-zero, opcjonalny
  const [enableScaleToZero, setEnableScaleToZero] = useState(false);
  const [scaleToZeroTimeoutMin, setScaleToZeroTimeoutMin] = useState(30);

  const toggleDayIn = (setter) => (day) => {
    setter(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
    );
  };

  const resetFromData = () => {
    setMonthlyActivationsB(parseFloat((auto.activationsPerMonth || 4).toFixed(2)));
    setAvgHoursPerActivationB(parseFloat((auto.avgHoursPerActivation || 6).toFixed(2)));
    setAvgActualHoursPerActivationB(parseFloat((auto.avgHoursPerActivation || 6).toFixed(2)));
    setOverflowActivationsH(parseFloat((auto.activationsPerMonth || 4).toFixed(2)));
    setAvgOrderedHoursOverflowH(parseFloat((auto.avgHoursPerActivation || 6).toFixed(2)));
    setAvgActualHoursOverflowH(parseFloat((auto.avgHoursPerActivation || 6).toFixed(2)));
  };

  useEffect(() => {
    if (hasData) resetFromData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData]);

  const usageForDays = (days) => {
    if (!pivotState) return { totalActual: 0, maxSession: 0 };
    const totalActual = days.reduce((sum, day) => {
      if (pivotState.data[day]) return sum + (pivotState.data[day].total / monthsCount);
      return sum;
    }, 0);
    const maxSession = rawData.length
      ? rawData.reduce((max, d) => (days.includes(d.dayName) && d.hours > max ? d.hours : max), 0)
      : 0;
    return { totalActual, maxSession };
  };

  const usageA = useMemo(() => usageForDays(cyclicDays), [pivotState, cyclicDays, rawData, monthsCount]);
  const usageH = useMemo(() => usageForDays(cyclicDaysH), [pivotState, cyclicDaysH, rawData, monthsCount]);

  // "Rzeczywiste użycie" — auto-podstawiane z danych przy zmianie dni/danych, ale zawsze edytowalne ręcznie
  useEffect(() => {
    setActualUsageA(parseFloat(usageA.totalActual.toFixed(1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usageA.totalActual]);

  useEffect(() => {
    setActualUsageH(parseFloat(usageH.totalActual.toFixed(1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usageH.totalActual]);

  // ---- core cost model ----
  const calc = useMemo(() => {
    // Model A — rzeczywiste użycie nie może logicznie przekroczyć zamówionych (zaplanowanych) godzin
    const activationsA = WEEKS_PER_MONTH * cyclicDays.length;
    const scheduledHoursA = activationsA * cyclicDurationHours;
    const costInfraA = scheduledHoursA * serverCostPerHour;
    const safeActualUsageA = Math.min(actualUsageA, scheduledHoursA);
    const wastedHoursA = Math.max(0, scheduledHoursA - safeActualUsageA);
    const wastedCostA = wastedHoursA * serverCostPerHour;
    const totalCostA = costInfraA;

    // Model B — płacimy wg zamówionych (fakturowanych) godzin; jeśli zamawiamy świadomie więcej
    // niż realnie wykorzystujemy, to nie "oszustwo", tylko zaplanowany zapas — jak w Modelu A.
    // Rzeczywiste użycie nie może logicznie przekroczyć zamówionych godzin.
    const safeActualHoursB = Math.min(avgActualHoursPerActivationB, avgHoursPerActivationB);
    const paddingHoursB = Math.max(0, avgHoursPerActivationB - safeActualHoursB);
    const paddingCostB = monthlyActivationsB * paddingHoursB * serverCostPerHour;
    const costInfraB = monthlyActivationsB * avgHoursPerActivationB * serverCostPerHour;
    const totalCostB = costInfraB;
    const marginalCostB = avgHoursPerActivationB * serverCostPerHour;

    // Model H — całkowicie niezależny od A i B: własna baza cykliczna + własna nadwyżka on-demand
    const activationsH = WEEKS_PER_MONTH * cyclicDaysH.length;
    const scheduledHoursH = activationsH * cyclicDurationHoursH;
    const costBaseH = scheduledHoursH * serverCostPerHour;
    const safeActualUsageH = Math.min(actualUsageH, scheduledHoursH);
    const wastedHoursH = Math.max(0, scheduledHoursH - safeActualUsageH);
    const wastedCostH = wastedHoursH * serverCostPerHour;
    const safeActualHoursOverflowH = Math.min(avgActualHoursOverflowH, avgOrderedHoursOverflowH);
    const paddingHoursOverflowH = Math.max(0, avgOrderedHoursOverflowH - safeActualHoursOverflowH);
    const paddingCostOverflowH = overflowActivationsH * paddingHoursOverflowH * serverCostPerHour;
    const costOverflowH = overflowActivationsH * avgOrderedHoursOverflowH * serverCostPerHour;
    const costInfraH = costBaseH + costOverflowH;
    const totalCostH = costInfraH;

    // Model S — Scale-to-Zero: płacimy wyłącznie za REALNY czas testów + krótki bufor uśpienia
    const scaleToZeroTimeoutHours = scaleToZeroTimeoutMin / 60;
    const actualHoursBase = monthlyActivationsB * safeActualHoursB;
    const costInfraS = actualHoursBase * serverCostPerHour;
    const wastedCostS = monthlyActivationsB * scaleToZeroTimeoutHours * serverCostPerHour;
    const totalCostS = costInfraS + wastedCostS;

    const breakEvenActivations = marginalCostB > 0 ? totalCostA / marginalCostB : null;

    return {
      activationsA, scheduledHoursA, costInfraA, wastedHoursA, wastedCostA, totalCostA,
      paddingHoursB, paddingCostB, costInfraB, totalCostB, marginalCostB, breakEvenActivations,
      scheduledHoursH, costBaseH, wastedCostH, paddingHoursOverflowH, paddingCostOverflowH,
      costOverflowH, costInfraH, totalCostH,
      costInfraS, wastedCostS, totalCostS, scaleToZeroTimeoutHours,
    };
  }, [
    serverCostPerHour,
    cyclicDays.length, cyclicDurationHours, actualUsageA,
    monthlyActivationsB, avgHoursPerActivationB, avgActualHoursPerActivationB,
    cyclicDaysH.length, cyclicDurationHoursH, actualUsageH,
    overflowActivationsH, avgOrderedHoursOverflowH, avgActualHoursOverflowH,
    scaleToZeroTimeoutMin,
  ]);

  const breakEvenData = useMemo(() => {
    const maxX = Math.max(20, Math.ceil((calc.breakEvenActivations || 10) * 1.6), Math.ceil(monthlyActivationsB * 1.5));
    return Array.from({ length: maxX + 1 }, (_, x) => {
      const dataPoint = {
        activations: x,
        'Model B (on-demand)': Math.round(x * calc.marginalCostB),
      };
      if (!ignoreModelA) dataPoint['Model A (cykliczny)'] = Math.round(calc.totalCostA);
      if (enableModelH) dataPoint['Model H (hybrydowy)'] = Math.round(calc.totalCostH);
      if (enableScaleToZero) {
        const costS = x * avgActualHoursPerActivationB * serverCostPerHour + x * calc.scaleToZeroTimeoutHours * serverCostPerHour;
        dataPoint['Model S (scale-to-zero)'] = Math.round(costS);
      }
      return dataPoint;
    });
  }, [calc, monthlyActivationsB, avgActualHoursPerActivationB, serverCostPerHour, enableScaleToZero, enableModelH, ignoreModelA]);

  // --- aktywne modele: tylko te faktycznie brane pod uwagę w porównaniu ---
  const modelMeta = {
    A: { label: 'Model A · Cykliczny' },
    B: { label: 'Model B · On-demand' },
    H: { label: 'Model H · Hybrydowy' },
    S: { label: 'Model S · Scale-to-Zero' },
  };

  const activeModels = useMemo(() => {
    const list = [{ id: 'B', val: calc.totalCostB }];
    if (!ignoreModelA) list.push({ id: 'A', val: calc.totalCostA });
    if (enableModelH) list.push({ id: 'H', val: calc.totalCostH });
    if (enableScaleToZero) list.push({ id: 'S', val: calc.totalCostS });
    return list;
  }, [calc, ignoreModelA, enableModelH, enableScaleToZero]);

  // najdroższy z aktywnych modeli = punkt odniesienia 100% (bo skład aktywnych modeli może się zmieniać)
  const baselineCost = Math.max(...activeModels.map(m => m.val), 1);

  const cheaper = useMemo(() => {
    const sorted = [...activeModels].sort((a, b) => a.val - b.val);
    return sorted[0]?.id;
  }, [activeModels]);

  const { nextDistinct, diff, diffPct } = useMemo(() => {
    const sorted = [...activeModels].sort((a, b) => a.val - b.val);
    const min = sorted[0];
    const next = sorted.slice(1).find(m => Math.abs(m.val - min.val) > TIE_TOLERANCE_ZL);
    const d = next ? next.val - min.val : 0;
    const pct = next && next.val ? (d / next.val) * 100 : 0;
    return { nextDistinct: next, diff: d, diffPct: pct };
  }, [activeModels]);

  const barData = [
    { name: 'Model B (on-demand)', 'Efektywna praca serwera': Math.round(calc.costInfraB - calc.paddingCostB), 'Straty (zapas ponad użycie)': Math.round(calc.paddingCostB) },
  ];
  if (!ignoreModelA) {
    barData.unshift({ name: 'Model A (cykliczny)', 'Efektywna praca serwera': Math.round(calc.costInfraA - calc.wastedCostA), 'Straty (zapas ponad użycie)': Math.round(calc.wastedCostA) });
  }
  if (enableModelH) {
    barData.push({ name: 'Model H (hybrydowy)', 'Efektywna praca serwera': Math.round(calc.costInfraH - calc.wastedCostH - calc.paddingCostOverflowH), 'Straty (zapas ponad użycie)': Math.round(calc.wastedCostH + calc.paddingCostOverflowH) });
  }
  if (enableScaleToZero) {
    barData.push({ name: 'Model S (scale-to-zero)', 'Efektywna praca serwera': Math.round(calc.costInfraS), 'Straty (zapas ponad użycie)': Math.round(calc.wastedCostS) });
  }
  const maxBarTotal = Math.max(...activeModels.map(m => m.val), 1);

  const modelLabel = {
    A: 'cykliczny (Model A)',
    B: 'on-demand (Model B)',
    H: 'hybrydowy (Model H)',
    S: 'scale-to-zero (Model S)',
  };

  const gridColsClass = {
    1: 'md:grid-cols-1',
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  }[activeModels.length] || 'md:grid-cols-2';

  return (
    <div className="space-y-4">
      {!hasData && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2 shadow-sm">
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
            <button onClick={resetFromData} disabled={!hasData} className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 disabled:text-gray-300 transition-colors">
              <RefreshCcw size={10} /> z danych
            </button>
          </div>

          <div className="space-y-4">

            {/* Model A */}
            <div className="pt-0">
              <div className="flex items-center justify-between mb-2">
                <p className={`text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1 ${ignoreModelA ? 'text-gray-300' : 'text-gray-400'}`}>
                  <Clock size={10} /> Model A — Cykliczny
                </p>
                <div
                  className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setIgnoreModelA(!ignoreModelA)}
                  title="Wyklucz Model A z porównywania jako nieefektywny"
                >
                  <span className={`text-[10px] ${ignoreModelA ? 'text-blue-500 font-medium' : 'text-gray-400'}`}>Ignoruj w rankingu</span>
                  {ignoreModelA ? <ToggleRight size={16} className="text-blue-500" /> : <ToggleLeft size={16} className="text-gray-300" />}
                </div>
              </div>

              <div className={`transition-opacity duration-300 ${ignoreModelA ? 'opacity-60' : 'opacity-100'}`}>
                <div className="mb-3">
                  <label className="text-[11px] font-medium text-gray-500 mb-1 block">Dni robocze harmonogramu:</label>
                  <DayPicker days={cyclicDays} onToggle={toggleDayIn(setCyclicDays)} />
                </div>

                <NumberField label="Czas trwania okna" value={cyclicDurationHours} step={1} suffix="godz./dzień" onChange={setCyclicDurationHours} />
                <div className="mt-3">
                  <NumberField label="Rzeczywiste użycie" value={actualUsageA} step={0.5} suffix="godz./mies." onChange={setActualUsageA} />
                  <p className="text-[10px] text-gray-400 leading-tight mt-1">z {calc.scheduledHoursA.toFixed(1)} godz. zamówionych w harmonogramie (suma miesięczna)</p>
                  {actualUsageA > calc.scheduledHoursA && (
                    <p className="text-[10px] text-gray-500 leading-tight mt-1">
                      ⚠ Rzeczywiste użycie nie może przekraczać zamówionych godzin
                    </p>
                  )}
                </div>
                {usageA.maxSession > cyclicDurationHours && (
                  <p className="text-[10px] text-gray-500 leading-tight mt-1.5">
                    ⚠ Najdłuższa pojedyncza sesja w te dni trwała <b>{usageA.maxSession.toFixed(1)} godz.</b>
                  </p>
                )}
                {cyclicDays.length === 0 && (
                  <p className="text-[10px] text-red-500 leading-tight mt-1">
                    ⚠ Brak wybranych dni = Model A kosztuje 0 zł. To nie jest realny scenariusz — zaznacz co najmniej 1 dzień.
                  </p>
                )}
              </div>
            </div>

            {/* Model B */}
            <div className="pt-3 border-t border-gray-100">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 mb-3">
                <Zap size={10} /> Model B — On-Demand (standard)
                <InfoButton label="Skąd te liczby?">
                  <p className="mb-1.5"><b>1 „aktywacja” = 1 zamówienie do Wykonawcy</b> (może obejmować kilka dni, jeśli tak zamawiacie — np. 3 dni × 8 godz. to jedna aktywacja z 24 godz. zamówionymi).</p>
                  <p className="mb-1.5">Suma miesięczna = aktywacje × średnia. To poprawnie liczy <b>łączny koszt</b>, nawet jeśli poszczególne aktywacje mocno się różnią.</p>
                  <p>Czego średnia NIE pokazuje: skrajnych przypadków (np. 2 z 24 zamówionych godzin wykorzystane). Jeśli takie skoki są częste, warto rozdzielić typowe i nietypowe aktywacje na osobne wpisy zamiast liczyć wspólną średnią.</p>
                </InfoButton>
              </p>
              <NumberField label="Aktywacje/mies." value={monthlyActivationsB} step={0.5} suffix="raz/mies." onChange={setMonthlyActivationsB} />
              <div className="grid grid-cols-2 gap-3 mt-3 mb-1">
                <NumberField label="Godz. zamówione" value={avgHoursPerActivationB} step={0.5} suffix="godz./raz" onChange={setAvgHoursPerActivationB} />
                <NumberField label="Godz. realnego użycia" value={avgActualHoursPerActivationB} step={0.5} suffix="godz./raz" onChange={setAvgActualHoursPerActivationB} />
              </div>
              {avgActualHoursPerActivationB > avgHoursPerActivationB && (
                <p className="text-[10px] text-gray-500 leading-tight mt-1.5">
                  ⚠ Realne użycie nie może przekraczać zamówionych godzin — w obliczeniach ograniczone do {avgHoursPerActivationB.toFixed(1)} godz./raz.
                </p>
              )}

              {calc.paddingHoursB > 0 && (
                <p className="text-[10px] text-gray-500 leading-tight mt-1.5">
                  Zamówiony zapas: ~<b>{calc.paddingHoursB.toFixed(1)} godz./aktywację</b> ponad realne użycie (świadomy zapas)
                </p>
              )}
            </div>

            {/* Model H — opcjonalny, w pełni samodzielny */}
            <div className="pt-3 border-t border-gray-100">
              <ToggleRow
                label="Model H — Hybrydowy"
                icon={<GitMerge size={10} />}
                active={enableModelH}
                onClick={() => setEnableModelH(!enableModelH)}
                activeColor="text-purple-600"
                activeToggleColor="text-purple-500"
              />
              <div className={`overflow-hidden transition-all duration-300 ${enableModelH ? 'max-h-[42rem] opacity-100' : 'max-h-0 opacity-0'}`}>
                <p className="text-[10px] text-gray-400 leading-tight mb-3">
                  Niezależny model: własna baza cykliczna (jak A) + własna nadwyżka on-demand (jak B). Nic z sekcji A/B nie jest tu ponownie użyte.
                </p>

                <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-wide mb-2">Baza cykliczna</p>
                <div className="mb-3">
                  <label className="text-[11px] font-medium text-gray-500 mb-1 block">Dni bazowego okna:</label>
                  <DayPicker days={cyclicDaysH} onToggle={toggleDayIn(setCyclicDaysH)} />
                </div>
                <NumberField label="Czas trwania okna bazowego" value={cyclicDurationHoursH} step={1} suffix="godz./dzień" onChange={setCyclicDurationHoursH} disabled={!enableModelH} />
                <div className="mt-3">
                  <NumberField label="Rzeczywiste użycie bazy" value={actualUsageH} step={0.5} suffix="godz./mies." hint="auto, edytowalne" onChange={setActualUsageH} disabled={!enableModelH} />
                  <p className="text-[10px] text-gray-400 leading-tight mt-1">z {calc.scheduledHoursH.toFixed(1)} godz. zamówionych w bazie (suma miesięczna)</p>
                  {actualUsageH > calc.scheduledHoursH && (
                    <p className="text-[10px] text-gray-500 leading-tight mt-1">
                      ⚠ Rzeczywiste użycie nie może przekraczać zamówionych godzin — ograniczone do {calc.scheduledHoursH.toFixed(1)} godz.
                    </p>
                  )}
                </div>

                <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-wide mb-2 mt-4">Nadwyżka on-demand</p>
                <NumberField label="Aktywacje nadwyżkowe/mies." value={overflowActivationsH} step={0.5} suffix="raz/mies." onChange={setOverflowActivationsH} disabled={!enableModelH} />
                <div className="grid grid-cols-2 gap-3 mt-3 mb-1">
                  <NumberField label="Godz. zamówione" value={avgOrderedHoursOverflowH} step={0.5} suffix="godz./raz" onChange={setAvgOrderedHoursOverflowH} disabled={!enableModelH} />
                  <NumberField label="Godz. realnego użycia" value={avgActualHoursOverflowH} step={0.5} suffix="godz./raz" hint="log testów" onChange={setAvgActualHoursOverflowH} disabled={!enableModelH} />
                </div>
                {avgActualHoursOverflowH > avgOrderedHoursOverflowH && (
                  <p className="text-[10px] text-gray-500 leading-tight mt-1.5">
                    ⚠ Realne użycie nie może przekraczać zamówionych godzin — ograniczone do {avgOrderedHoursOverflowH.toFixed(1)} godz./raz.
                  </p>
                )}
                {calc.paddingHoursOverflowH > 0 && (
                  <p className="text-[10px] text-gray-500 leading-tight mt-1.5">
                    Zamówiony zapas nadwyżki: ~<b>{calc.paddingHoursOverflowH.toFixed(1)} godz./aktywację</b> — <b>{fmtPLN(calc.paddingCostOverflowH)}/mies.</b>
                  </p>
                )}
              </div>
            </div>

            {/* Model S — opcjonalny */}
            <div className="pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between cursor-pointer mb-2">
                <p className={`text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1.5 ${enableScaleToZero ? 'text-teal-600' : 'text-gray-400'}`}>
                  <span className="flex items-center gap-1 cursor-pointer" onClick={() => setEnableScaleToZero(!enableScaleToZero)}>
                    <Cpu size={10} /> Model S — Scale-to-Zero
                  </span>
                  <InfoButton label="Jak działa Scale-to-Zero?">
                    <p className="mb-1.5"><b>Model S nie ma harmonogramu.</b> Serwer budzi się automatycznie w momencie realnego zapytania testera i usypia się sam po ustalonym czasie bezczynności — bez udziału DevOps.</p>
                    <p className="mb-1.5">Płacimy wyłącznie za: godziny faktycznych testów + krótki bufor oczekiwania na „uśpienie”.</p>
                    <p>Brak kosztu rezerwacji „na zapas” (jak w A) i brak kosztu czasu człowieka na ręczne uruchamianie (jak w B). To dlatego ten model wygrywa niemal zawsze.</p>
                  </InfoButton>
                </p>
                <div onClick={() => setEnableScaleToZero(!enableScaleToZero)} className="cursor-pointer">
                  {enableScaleToZero ? <ToggleRight size={16} className="text-teal-500" /> : <ToggleLeft size={16} className="text-gray-300" />}
                </div>
              </div>

              <div className={`overflow-hidden transition-all duration-300 ${enableScaleToZero ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'}`}>
                <NumberField label="Timeout do autowyłączenia" value={scaleToZeroTimeoutMin} step={5} suffix="min" onChange={setScaleToZeroTimeoutMin} disabled={!enableScaleToZero} />
              </div>
            </div>

            {/* Stawki — zaawansowane, domyślnie schowane */}
            <div className="pt-3 border-t border-gray-100">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600 transition-colors"
              >
                <span className="flex items-center gap-1"><Server size={10} /> Zaawansowane: stawki</span>
                {showAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              <div className={`overflow-hidden transition-all duration-300 ${showAdvanced ? 'max-h-32 opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
                <NumberField label="Koszt serwera" value={serverCostPerHour} step={0.5} suffix="zł/godz." onChange={setServerCostPerHour} />
                <p className="text-[10px] text-gray-400 leading-tight mt-1.5">
                  Stawka referencyjna, wyliczona łącznie z 4 działów — nie jest to nasz koszt (płaci go zamawiający projekt), a punkt odniesienia do porównania modeli.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* --- RESULTS PANEL --- */}
        <div className="flex-1 space-y-4">
          <div className={`grid grid-cols-1 ${gridColsClass} gap-3 transition-all duration-300`}>
            {activeModels.map(({ id, val }) => {
              const isWinner = id === cheaper;
              const isBaseline = Math.abs(val - baselineCost) <= TIE_TOLERANCE_ZL && activeModels.length > 1;
              const savingsPct = baselineCost > 0 ? ((baselineCost - val) / baselineCost) * 100 : 0;
              const subtext = id === 'A' ? <>Bezczynność (zapas): <b>{fmtPLN(calc.wastedCostA)}</b></>
                : id === 'B' ? <>Zapas ponad realne użycie: <b>{fmtPLN(calc.paddingCostB)}</b></>
                : id === 'H' ? <>Baza (bezczynność) + zapas nadwyżki: <b>{fmtPLN(calc.wastedCostH + calc.paddingCostOverflowH)}</b></>
                : <>Bufor uśpienia: <b>{fmtPLN(calc.wastedCostS)}</b></>;

              return (
                <div
                  key={id}
                  className={`p-3 rounded-xl border transition-all duration-300 relative ${
                    isWinner ? 'bg-emerald-50 border-emerald-200 shadow-sm' : 'bg-white border-gray-100'
                  }`}
                >
                  <p className={`text-[11px] font-medium ${isWinner ? 'text-emerald-700' : 'text-gray-500'}`}>{modelMeta[id].label}</p>
                  <p className={`text-2xl font-bold mt-0.5 ${isWinner ? 'text-emerald-700' : 'text-gray-800'}`}>
                    {isBaseline ? 'najdroższy' : fmtPct(savingsPct)}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{fmtPLN(val)}/mies.</p>
                  <p className="text-[10px] text-gray-500 mt-1">{subtext}</p>
                </div>
              );
            })}
          </div>

          {/* <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3 shadow-sm">
            <TrendingUp size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-blue-900 leading-relaxed">
              {nextDistinct ? (
                <>
                  Przy obecnych założeniach najtańszy jest <b>{modelLabel[cheaper]}</b> — oszczędność ≈ <b>{fmtPLN(diff)}/mies.</b> ({diffPct.toFixed(0)}%) względem następnej realnie innej opcji, <b>{modelLabel[nextDistinct.id]}</b>.
                </>
              ) : (
                <>Aktywne modele wychodzą praktycznie tak samo (różnica &lt; {TIE_TOLERANCE_ZL} zł) — wybór zależy od elastyczności operacyjnej.</>
              )}
              {calc.breakEvenActivations != null && !ignoreModelA && (
                <> Próg A↔B: powyżej <b>~{calc.breakEvenActivations.toFixed(1)} aktywacji/mies.</b> harmonogram cykliczny staje się tańszy od czystego on-demand.</>
              )}
            </p>
          </div> */}

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
                  <Bar dataKey="Straty (zapas ponad użycie)" stackId="a" fill="#f97316" radius={[0, 4, 4, 0]} />
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
                  {calc.breakEvenActivations != null && !ignoreModelA && (
                    <ReferenceLine x={Math.round(calc.breakEvenActivations)} stroke="#9ca3af" strokeDasharray="4 4"
                      label={{ value: 'próg A↔B', position: 'top', fontSize: 10, fill: '#6b7280' }} />
                  )}
                  <ReferenceDot x={Math.round(monthlyActivationsB)} y={Math.round(calc.totalCostB)} r={4} fill="#f97316" stroke="#fff" strokeWidth={2} />
                  {!ignoreModelA && (
                    <Line type="monotone" dataKey="Model A (cykliczny)" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  )}
                  <Line type="monotone" dataKey="Model B (on-demand)" stroke="#f97316" strokeWidth={2} dot={false} />
                  {enableModelH && (
                    <Line type="monotone" dataKey="Model H (hybrydowy)" stroke="#8b5cf6" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                  )}
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