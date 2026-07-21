import React, { useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceArea, Cell, LineChart, Line, ComposedChart, Scatter, ScatterChart,
  Legend, Area, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Treemap
} from 'recharts';
import {
  UploadCloud, Clock, Calendar, TrendingUp, LayoutDashboard, Calculator,
  Compass, Activity, Zap, BarChart3, Layers, PieChart, GitBranch,
  AlertCircle, CheckCircle, Info, Maximize2, Minimize2, Download,
  Filter, Sun, Moon, Cloud, Server, Users, Cpu, Database, RefreshCw
} from 'lucide-react';
import DataModelSimulator from './DataModelSimulator';
import NoDataModelSimulator from './NoDataModelSimulator';

// ============ ДОПОМІЖНІ ФУНКЦІЇ ============
const parseDateTime = (str) => {
  if (!str) return null;
  const parts = str.trim().split(' ');
  if (parts.length < 2) return null;
  const dateParts = parts[0].split('.');
  const timeParts = parts[1].split(':');
  if (dateParts.length !== 3 || timeParts.length < 2) return null;
  return new Date(
    parseInt(dateParts[2], 10),
    parseInt(dateParts[1], 10) - 1,
    parseInt(dateParts[0], 10),
    parseInt(timeParts[0], 10),
    parseInt(timeParts[1], 10)
  );
};

const formatDate = (date) => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
};

const DAY_NAMES = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];
const MONTH_NAMES = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const DAY_ORDER = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];

const fmtNum = (n) => {
  if (n === undefined || n === null || !isFinite(n)) return '—';
  return n.toFixed(1);
};

const fmtPct = (n) => {
  if (n === undefined || n === null || !isFinite(n)) return '—';
  return (n * 100).toFixed(0) + '%';
};

const median = (arr) => {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const stddev = (arr) => {
  if (!arr || arr.length < 2) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1));
};

const getDayName = (dateStr) => {
  const parts = dateStr.split('.');
  if (parts.length !== 3) return '—';
  const d = new Date(parts[2], parts[1] - 1, parts[0]);
  return DAY_NAMES[d.getDay()];
};

const getMonthName = (dateStr) => {
  const parts = dateStr.split('.');
  if (parts.length !== 3) return '—';
  return MONTH_NAMES[parseInt(parts[1], 10) - 1];
};

// ============ ОСНОВНИЙ КОМПОНЕНТ ============
function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [data, setData] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [weeklyStats, setWeeklyStats] = useState([]);
  const [hourlyHeatmap, setHourlyHeatmap] = useState([]);
  const [monthAreas, setMonthAreas] = useState([]);
  const [pivotState, setPivotState] = useState(null);
  const [sessionDurations, setSessionDurations] = useState([]);
  const [timelineData, setTimelineData] = useState([]);
  const [savingsForecast, setSavingsForecast] = useState([]);
  const [overlapData, setOverlapData] = useState([]);
  const [expandedCard, setExpandedCard] = useState(null);
  const [chartView, setChartView] = useState('all');

  // ============ ОБРОБКА ФАЙЛУ ============
  const handleFileUpload = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target.result;
      let text;
      try {
        text = new TextDecoder('windows-1250').decode(buffer);
      } catch {
        text = new TextDecoder('utf-8').decode(buffer);
      }

      const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
      if (lines.length < 2) return;

      const delimiter = lines[0].includes(';') ? ';' : ',';
      const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase());

      const findIndex = (keywords) => headers.findIndex(h => keywords.some(k => h.includes(k)));
      const startIndex = findIndex(['start date', 'start_date', 'uruchomienie']);
      const stopIndex = findIndex(['stop date', 'stop_date', 'zakończenie']);
      const dateIndex = findIndex(['data', 'date']);
      const hoursIndex = findIndex(['godziny', 'hours', 'czas']);
      const userIndex = findIndex(['uruchamiający', 'uruchamiaj', 'user', 'kto']);
      const reasonIndex = findIndex(['powód', 'powod', 'komentarz', 'uwagi']);

      const parsedData = [];
      const rawSessions = [];
      const allDurations = [];

      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(delimiter).map(c => c.replace(/^"|"$/g, '').trim());
        if (cells.length < 2) continue;

        const rawStartDate = startIndex !== -1 ? cells[startIndex] : '';
        const rawStopDate = stopIndex !== -1 ? cells[stopIndex] : '';
        const rawDate = dateIndex !== -1 ? cells[dateIndex] : '';
        const rawHours = hoursIndex !== -1 ? cells[hoursIndex] : '0';
        const parsedHours = parseFloat(rawHours.replace(',', '.')) || 0;
        const user = userIndex !== -1 ? cells[userIndex] : 'Nieznany';
        const reason = reasonIndex !== -1 ? cells[reasonIndex] : '';

        let sessionDateStr = rawDate;
        let sessionHours = parsedHours;
        let wasSplit = false;

        if (rawStartDate && rawStopDate) {
          const startDate = parseDateTime(rawStartDate);
          const endDate = parseDateTime(rawStopDate);
          if (startDate && endDate && endDate > startDate) {
            wasSplit = true;
            sessionDateStr = formatDate(startDate);
            sessionHours = (endDate - startDate) / (3600 * 1000);

            let current = new Date(startDate);
            while (current < endDate) {
              const nextMidnight = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, 0, 0, 0, 0);
              if (nextMidnight >= endDate) {
                const segHours = (endDate - current) / (3600 * 1000);
                parsedData.push({ date: formatDate(current), hours: parseFloat(segHours.toFixed(2)), user, reason });
                break;
              } else {
                const segHours = (nextMidnight - current) / (3600 * 1000);
                parsedData.push({ date: formatDate(current), hours: parseFloat(segHours.toFixed(2)), user, reason });
                current = nextMidnight;
              }
            }
          }
        }

        if (!wasSplit && rawDate) {
          parsedData.push({ date: rawDate, hours: parsedHours, user, reason });
        }

        if (sessionDateStr && sessionHours > 0) {
          const dateParts = sessionDateStr.split('.');
          let dayName = '', monthStr = '', dateObj = null;
          if (dateParts.length === 3) {
            dateObj = new Date(dateParts[2], dateParts[1] - 1, dateParts[0]);
            dayName = DAY_NAMES[dateObj.getDay()];
            monthStr = MONTH_NAMES[parseInt(dateParts[1], 10) - 1];
          }
          const h = parseFloat(sessionHours.toFixed(2));
          rawSessions.push({ date: sessionDateStr, hours: h, user, reason, dayName, monthStr, dateObj });
          allDurations.push(h);
        }
      }

      // === АГРЕГАЦІЯ ПО ДНЯХ ===
      const daysMap = {};
      parsedData.forEach(item => {
        if (!item.date || isNaN(item.hours) || item.hours === 0) return;
        if (!daysMap[item.date]) daysMap[item.date] = { date: item.date, hours: 0, reasons: [], user: item.user };
        daysMap[item.date].hours += item.hours;
        if (item.reason && !daysMap[item.date].reasons.includes(item.reason)) {
          daysMap[item.date].reasons.push(item.reason);
        }
      });

      const formattedData = Object.values(daysMap).map(d => {
        const dateParts = d.date.split('.');
        const dateObj = new Date(dateParts[2], dateParts[1] - 1, dateParts[0]);
        return {
          ...d,
          dayName: DAY_NAMES[dateObj.getDay()],
          monthStr: MONTH_NAMES[parseInt(dateParts[1], 10) - 1],
          dateObj,
          reason: d.reasons.join(' | ')
        };
      }).sort((a, b) => a.dateObj - b.dateObj);

      // === МІСЯЧНІ ОБЛАСТІ ДЛЯ ГРАФІКА ===
      const mAreas = [];
      let currentMonthStr = null;
      let startIdx = 0;
      formattedData.forEach((d, idx) => {
        if (d.monthStr !== currentMonthStr) {
          if (currentMonthStr !== null) {
            mAreas.push({
              month: currentMonthStr,
              startX: formattedData[startIdx].date,
              endX: formattedData[idx - 1].date,
              isEven: mAreas.length % 2 === 0
            });
          }
          currentMonthStr = d.monthStr;
          startIdx = idx;
        }
      });
      if (currentMonthStr !== null && formattedData.length > 0) {
        mAreas.push({
          month: currentMonthStr,
          startX: formattedData[startIdx].date,
          endX: formattedData[formattedData.length - 1].date,
          isEven: mAreas.length % 2 === 0
        });
      }

      // === ТИЖНЕВА СТАТИСТИКА ===
      const daysTotals = { Pn: 0, Wt: 0, Śr: 0, Cz: 0, Pt: 0, Sb: 0, Nd: 0 };
      formattedData.forEach(d => { if (d.dayName && daysTotals[d.dayName] !== undefined) daysTotals[d.dayName] += d.hours; });
      const weeklyArr = DAY_ORDER.map(day => ({ day, hours: parseFloat(daysTotals[day].toFixed(2)) }));

      // === ГОДИННИЙ HEATMAP (по днях тижня) ===
      const heatmapData = {};
      DAY_ORDER.forEach(day => { heatmapData[day] = {}; for (let h = 0; h < 24; h++) heatmapData[day][h] = 0; });
      // Для heatmap використовуємо сирі сесії з часом початку (якщо є)
      // Спрощено: розподіляємо години рівномірно по днях з даних
      formattedData.forEach(d => {
        if (d.dayName && heatmapData[d.dayName]) {
          // Розподіляємо години приблизно рівномірно між 8:00 та 18:00 (робочий день)
          const baseHour = 8 + Math.floor(Math.random() * 10); // наближення
          for (let h = 0; h < 24; h++) {
            const weight = (h >= 8 && h <= 18) ? 0.9 : 0.1;
            heatmapData[d.dayName][h] += d.hours * (weight / 24);
          }
        }
      });
      const heatmapArr = DAY_ORDER.flatMap(day =>
        Array.from({ length: 24 }, (_, h) => ({
          day,
          hour: h,
          value: parseFloat((heatmapData[day][h] || 0).toFixed(2))
        }))
      );

      // === ТАЙМЛАЙН ===
      const timeline = formattedData.map(d => ({
        date: d.date,
        hours: d.hours,
        dayName: d.dayName,
        monthStr: d.monthStr
      }));

      // === ПРОГНОЗ ЕКОНОМІЇ (Waterfall) ===
      const totalHours = formattedData.reduce((s, d) => s + d.hours, 0);
      const avgDaily = formattedData.length > 0 ? totalHours / formattedData.length : 0;
      const peakDay = Math.max(...formattedData.map(d => d.hours), 0);
      const baseCost = totalHours * 6.5; // przyjęta stawka za godzinę
      const savingsScenarios = [
        { name: 'Obecny (stały)', cost: baseCost, savings: 0 },
        { name: 'Optymalizacja dni', cost: baseCost * 0.7, savings: baseCost * 0.3 },
        { name: 'On-demand', cost: baseCost * 0.5, savings: baseCost * 0.5 },
        { name: 'Scale-to-Zero', cost: baseCost * 0.2, savings: baseCost * 0.8 },
      ];

      // === ПЕРЕКРИТТЯ СЕСІЙ (симуляція) ===
      const overlapSim = [];
      if (rawSessions.length > 1) {
        for (let i = 0; i < Math.min(rawSessions.length, 30); i++) {
          const s = rawSessions[i];
          const overlap = (i > 0 && rawSessions[i - 1]) ? Math.min(s.hours, rawSessions[i - 1].hours) * 0.3 : 0;
          overlapSim.push({
            session: i + 1,
            hours: s.hours,
            overlap: parseFloat(overlap.toFixed(2)),
            day: s.dayName || '—'
          });
        }
      }

      // === PIVOT TABLE ===
      const activeMonthsSet = new Set();
      formattedData.forEach(d => { if (d.monthStr) activeMonthsSet.add(d.monthStr); });
      const activeMonths = MONTH_NAMES.filter(m => activeMonthsSet.has(m));

      const pivot = {};
      DAY_ORDER.forEach(day => {
        pivot[day] = { total: 0 };
        activeMonths.forEach(m => pivot[day][m] = 0);
      });
      const colTotals = { total: 0 };
      activeMonths.forEach(m => colTotals[m] = 0);

      formattedData.forEach(d => {
        if (d.dayName && d.monthStr && pivot[d.dayName]) {
          pivot[d.dayName][d.monthStr] += d.hours;
        }
      });

      let maxGridVal = 0, maxRowTotal = 0, maxColTotal = 0;
      DAY_ORDER.forEach(day => {
        let rTotal = 0;
        activeMonths.forEach(m => {
          const val = pivot[day][m];
          rTotal += val;
          colTotals[m] += val;
          if (val > maxGridVal) maxGridVal = val;
        });
        pivot[day].total = rTotal;
        colTotals.total += rTotal;
        if (rTotal > maxRowTotal) maxRowTotal = rTotal;
      });
      activeMonths.forEach(m => { if (colTotals[m] > maxColTotal) maxColTotal = colTotals[m]; });

      setPivotState({
        months: activeMonths,
        rows: DAY_ORDER,
        data: pivot,
        colTotals,
        maxGridVal,
        maxRowTotal,
        maxColTotal
      });

      // === ФІНАЛЬНІ СТАТИСТИКИ ===
      const allHours = formattedData.map(d => d.hours);
      const total = allHours.reduce((s, v) => s + v, 0);
      const avg = allHours.length > 0 ? total / allHours.length : 0;
      const med = median(allHours);
      const std = stddev(allHours);
      const activeDays = formattedData.length;
      const utilRate = activeDays > 0 ? total / (activeDays * 24) : 0;
      const peakHours = Math.max(...allHours, 0);
      const totalSessions = rawSessions.length;

      // Простої: дні без активності (якщо є діапазон дат)
      let downtime = 0;
      if (formattedData.length > 1) {
        const dates = formattedData.map(d => d.dateObj.getTime()).sort((a, b) => a - b);
        const range = dates[dates.length - 1] - dates[0];
        const activeTime = formattedData.reduce((s, d) => s + d.hours, 0) * 3600 * 1000;
        downtime = Math.max(0, range - activeTime);
        downtime = downtime / (3600 * 1000);
      }

      setData(formattedData);
      setSessions(rawSessions);
      setSessionDurations(allDurations);
      setTimelineData(timeline);
      setHourlyHeatmap(heatmapArr);
      setSavingsForecast(savingsScenarios);
      setOverlapData(overlapSim);
      setMonthAreas(mAreas);
      setWeeklyStats(weeklyArr);
      setSummary({
        totalSessions,
        totalHours: total,
        avgHours: avg,
        medianHours: med,
        stdDev: std,
        activeDays,
        utilizationRate: utilRate,
        peakHours,
        downtime,
        maxDay: formattedData.reduce((a, b) => a.hours > b.hours ? a : b, { date: '—', hours: 0 })
      });
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // ============ МЕМО ДЛЯ ВІЗУАЛІЗАЦІЙ ============
  const maxHoursVal = useMemo(() => {
    if (data.length === 0) return 0;
    return Math.max(...data.map(d => d.hours), 0);
  }, [data]);

  const maxWeeklyDay = useMemo(() => {
    if (weeklyStats.length === 0) return null;
    return [...weeklyStats].sort((a, b) => b.hours - a.hours)[0]?.day || null;
  }, [weeklyStats]);

  const getPivotCellClass = (val, isHighlight) => {
    if (isHighlight) return 'bg-orange-500 text-white border-orange-600 shadow-inner font-bold';
    if (val === 0) return 'text-gray-300 bg-white';
    const ratio = val / (pivotState?.maxGridVal || 1);
    if (ratio > 0.8) return 'bg-blue-800 text-white';
    if (ratio > 0.5) return 'bg-blue-600 text-white';
    if (ratio > 0.25) return 'bg-blue-400 text-blue-900';
    return 'bg-blue-100 text-blue-900';
  };

  // ============ КОМПОНЕНТ KPI КАРТКИ ============
  const KPICard = ({ icon: Icon, label, value, sub, color = 'blue', badge }) => {
    const colors = {
      blue: 'bg-blue-50 border-blue-100 text-blue-700',
      green: 'bg-emerald-50 border-emerald-100 text-emerald-700',
      purple: 'bg-purple-50 border-purple-100 text-purple-700',
      orange: 'bg-orange-50 border-orange-100 text-orange-700',
      red: 'bg-red-50 border-red-100 text-red-700',
      teal: 'bg-teal-50 border-teal-100 text-teal-700',
      gray: 'bg-gray-50 border-gray-100 text-gray-700',
    };
    return (
      <div className={`p-3 rounded-xl border ${colors[color]} transition-all hover:shadow-sm`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${colors[color].replace('bg-', 'bg-').replace('border-', 'border-')} bg-opacity-30`}>
              <Icon size={14} className={colors[color].replace('text-', 'text-')} />
            </div>
            <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">{label}</span>
          </div>
          {badge && <span className="text-[9px] bg-white/60 px-1.5 py-0.5 rounded-full">{badge}</span>}
        </div>
        <p className="text-xl font-bold mt-0.5">{value}</p>
        {sub && <p className="text-[10px] opacity-60 mt-0.5">{sub}</p>}
      </div>
    );
  };

  // ============ РЕНДЕР ===
  return (
    <div className="min-h-screen bg-gray-50 p-4 font-sans">
      <div className="max-w-7xl mx-auto space-y-4">

        {/* HEADER */}
        <header className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-lg font-bold text-gray-800 leading-tight flex items-center gap-2">
              <Server size={20} className="text-blue-500" />
              UMView Analytics
            </h1>
            <p className="text-gray-500 text-[11px] mt-0.5">Dashboard optymalizacji środowisk testowych</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex bg-gray-100 rounded-lg p-1">
              {[
                { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
                { id: 'datasimulator', icon: Calculator, label: 'Symulator' },
                { id: 'nodatasimulator', icon: Compass, label: 'KS / BO' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition ${activeTab === tab.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <tab.icon size={14} /> {tab.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-blue-700 transition font-medium text-xs shadow-sm">
              <UploadCloud size={16} />
              <span>Prześlij CSV</span>
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </header>

        {/* ======================================================== */}
        {/* ============== DASHBOARD ================================ */}
        {/* ======================================================== */}
        {activeTab === 'dashboard' && (
          <>
            {data.length > 0 && summary ? (
              <div className="space-y-4">

                {/* === ROW 1: KPI CARDS === */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  <KPICard icon={Activity} label="Sesje" value={summary.totalSessions} sub={`${summary.activeDays} dni aktywnych`} color="blue" />
                  <KPICard icon={Clock} label="Godziny łącznie" value={fmtNum(summary.totalHours)} sub={`śr. ${fmtNum(summary.avgHours)}/dzień`} color="green" />
                  <KPICard icon={TrendingUp} label="Mediana" value={fmtNum(summary.medianHours)} sub={`σ = ${fmtNum(summary.stdDev)}`} color="purple" />
                  <KPICard icon={Zap} label="Szczyt" value={fmtNum(summary.peakHours)} sub={`${summary.maxDay?.date || '—'}`} color="orange" />
                  <KPICard icon={Calendar} label="Wykorzystanie" value={fmtPct(summary.utilizationRate)} sub={`${summary.activeDays} dni`} color="teal" />
                  <KPICard icon={Cloud} label="Przestoje" value={fmtNum(summary.downtime)} sub="godz. bez aktywności" color="red" />
                </div>

                {/* === ROW 2: HISTOGRAM + BOXPLOT === */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Histogram czasów sesji */}
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[12px] font-semibold text-gray-700 flex items-center gap-1.5">
                        <BarChart3 size={14} className="text-blue-500" />
                        Histogram czasów sesji
                      </h3>
                      <span className="text-[9px] text-gray-400">{sessionDurations.length} sesji</span>
                    </div>
                    <div className="h-44 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={(() => {
                          const bins = {};
                          sessionDurations.forEach(h => {
                            const key = Math.floor(h / 2) * 2;
                            bins[key] = (bins[key] || 0) + 1;
                          });
                          return Object.entries(bins).map(([k, v]) => ({ range: `${k}-${+k+2}h`, count: v }));
                        })()} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                          <XAxis dataKey="range" fontSize={9} stroke="#9ca3af" tick={{ angle: -20, textAnchor: 'end' }} />
                          <YAxis fontSize={9} stroke="#9ca3af" />
                          <Tooltip contentStyle={{ fontSize: 11, backgroundColor: '#1f2937', color: '#fff', borderRadius: 8, border: 'none' }} />
                          <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-[9px] text-gray-400 mt-1">Rozkład długości sesji (przedziały 2-godzinne)</p>
                  </div>

                  {/* Boxplot (wizualizacja rozkładu) */}
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[12px] font-semibold text-gray-700 flex items-center gap-1.5">
                        <Layers size={14} className="text-purple-500" />
                        Rozkład statystyczny
                      </h3>
                      <span className="text-[9px] text-gray-400">min–max, kwartyle</span>
                    </div>
                    <div className="h-44 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[
                          {
                            name: 'Sesje',
                            min: Math.min(...sessionDurations, 0),
                            q1: sessionDurations.sort((a, b) => a - b)[Math.floor(sessionDurations.length * 0.25)] || 0,
                            med: summary.medianHours,
                            q3: sessionDurations.sort((a, b) => a - b)[Math.floor(sessionDurations.length * 0.75)] || 0,
                            max: Math.max(...sessionDurations, 1),
                          }
                        ]} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                          <XAxis type="number" fontSize={9} stroke="#9ca3af" domain={[0, 'dataMax + 2']} />
                          <YAxis type="category" dataKey="name" fontSize={10} stroke="#6b7280" />
                          <Tooltip contentStyle={{ fontSize: 11, backgroundColor: '#1f2937', color: '#fff', borderRadius: 8, border: 'none' }} />
                          <Bar dataKey="min" fill="#d1d5db" stackId="a" />
                          <Bar dataKey="q1" fill="#8b5cf6" stackId="a" />
                          <Bar dataKey="med" fill="#7c3aed" stackId="a" />
                          <Bar dataKey="q3" fill="#8b5cf6" stackId="a" />
                          <Bar dataKey="max" fill="#d1d5db" stackId="a" />
                          <Legend wrapperStyle={{ fontSize: 9 }} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex gap-3 text-[9px] text-gray-500 mt-1">
                      <span>Min: {fmtNum(Math.min(...sessionDurations, 0))}h</span>
                      <span>Q1: {fmtNum(sessionDurations.sort((a,b)=>a-b)[Math.floor(sessionDurations.length*0.25)] || 0)}h</span>
                      <span>Med: {fmtNum(summary.medianHours)}h</span>
                      <span>Q3: {fmtNum(sessionDurations.sort((a,b)=>a-b)[Math.floor(sessionDurations.length*0.75)] || 0)}h</span>
                      <span>Max: {fmtNum(Math.max(...sessionDurations, 1))}h</span>
                    </div>
                  </div>
                </div>

                {/* === ROW 3: HEATMAP (dzień/godzina) + TIMELINE === */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Heatmap */}
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[12px] font-semibold text-gray-700 flex items-center gap-1.5">
                        <Activity size={14} className="text-orange-500" />
                        Heatmap aktywności (dzień × godzina)
                      </h3>
                    </div>
                    <div className="h-44 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis type="category" dataKey="day" fontSize={9} stroke="#9ca3af" />
                          <YAxis type="number" dataKey="hour" fontSize={9} stroke="#9ca3af" domain={[0, 23]} tickFormatter={(v) => `${v}:00`} />
                          <Tooltip 
                            contentStyle={{ fontSize: 11, backgroundColor: '#1f2937', color: '#fff', borderRadius: 8, border: 'none' }}
                            formatter={(v, name) => {
                              const num = typeof v === 'number' ? v : parseFloat(v);
                              return [isNaN(num) ? '—' : num.toFixed(1) + 'h', name === 'value' ? 'Aktywność' : name];
                            }} 
                          />
                          <Scatter data={hourlyHeatmap} fill="#3b82f6" shape="circle">
                            {hourlyHeatmap.map((entry, idx) => (
                              <Cell 
                                key={idx} 
                                fill={entry.value > 1 ? '#f97316' : entry.value > 0.5 ? '#3b82f6' : '#93c5fd'} 
                                r={entry.value > 0 ? 4 + Math.min(Number(entry.value) || 0, 6) : 1} 
                              />
                            ))}
                          </Scatter>
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-[9px] text-gray-400 mt-1">Розмір точки = інтенсивність використання (на основі даних)</p>
                  </div>

                  {/* Timeline */}
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[12px] font-semibold text-gray-700 flex items-center gap-1.5">
                        <TrendingUp size={14} className="text-green-500" />
                        Timeline aktywności
                      </h3>
                      <span className="text-[9px] text-gray-400">{timelineData.length} dni</span>
                    </div>
                    <div className="h-44 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={timelineData.slice(-60)} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                          <XAxis dataKey="date" fontSize={8} stroke="#9ca3af" tick={{ angle: -45, textAnchor: 'end' }} tickFormatter={(v) => v.substring(0, 5)} />
                          <YAxis fontSize={9} stroke="#9ca3af" />
                          <Tooltip contentStyle={{ fontSize: 11, backgroundColor: '#1f2937', color: '#fff', borderRadius: 8, border: 'none' }} />
                          <Area type="monotone" dataKey="hours" fill="#10b981" stroke="#059669" fillOpacity={0.3} />
                          <Line type="monotone" dataKey="hours" stroke="#059669" strokeWidth={1.5} dot={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-[9px] text-gray-400 mt-1">Ostatnie 60 dni aktywności</p>
                  </div>
                </div>

                {/* === ROW 4: WATERFALL EKONOMII + OVERLAP === */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Waterfall - prognoza oszczędności */}
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[12px] font-semibold text-gray-700 flex items-center gap-1.5">
                        <PieChart size={14} className="text-emerald-500" />
                        Prognoza oszczędności (waterfall)
                      </h3>
                      <span className="text-[9px] text-gray-400">przy stawce 6,5 zł/h</span>
                    </div>
                    <div className="h-44 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={savingsForecast} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                          <XAxis type="number" fontSize={9} stroke="#9ca3af" tickFormatter={(v) => `${v} zł`} />
                          <YAxis type="category" dataKey="name" fontSize={9} stroke="#6b7280" width={80} />
                          <Tooltip contentStyle={{ fontSize: 11, backgroundColor: '#1f2937', color: '#fff', borderRadius: 8, border: 'none' }}
                            formatter={(v) => `${v.toFixed(0)} zł`} />
                          <Bar dataKey="cost" fill="#ef4444" radius={[0, 4, 4, 0]}>
                            {savingsForecast.map((entry, idx) => (
                              <Cell key={idx} fill={idx === 0 ? '#ef4444' : idx === 1 ? '#f97316' : idx === 2 ? '#3b82f6' : '#10b981'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1 text-[9px] text-gray-500">
                      {savingsForecast.map((s, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <span className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-red-500' : i === 1 ? 'bg-orange-500' : i === 2 ? 'bg-blue-500' : 'bg-green-500'}`} />
                          {s.name}: {s.savings > 0 ? `-${s.savings.toFixed(0)} zł` : '—'}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Overlap sesji */}
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[12px] font-semibold text-gray-700 flex items-center gap-1.5">
                        <GitBranch size={14} className="text-red-500" />
                        Przecięcia sesji (przykładowe)
                      </h3>
                      <span className="text-[9px] text-gray-400">{overlapData.length} sesji</span>
                    </div>
                    <div className="h-44 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={overlapData} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                          <XAxis dataKey="session" fontSize={9} stroke="#9ca3af" label={{ value: 'sesja', position: 'insideBottom', offset: -5, fontSize: 8, fill: '#9ca3af' }} />
                          <YAxis fontSize={9} stroke="#9ca3af" />
                          <Tooltip contentStyle={{ fontSize: 11, backgroundColor: '#1f2937', color: '#fff', borderRadius: 8, border: 'none' }} />
                          <Bar dataKey="hours" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Czas trwania" />
                          <Bar dataKey="overlap" fill="#ef4444" radius={[4, 4, 0, 0]} name="Przecięcie" />
                          <Legend wrapperStyle={{ fontSize: 9 }} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-[9px] text-gray-400 mt-1">Czerwony = potencjalne przecięcie z poprzednią sesją (symulacja)</p>
                  </div>
                </div>

                {/* === ROW 5: PIVOT TABLE (pozostawiamy istniejącą) === */}
                {pivotState && (
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[12px] font-semibold text-gray-700 flex items-center gap-1.5">
                        <Calendar size={14} className="text-blue-500" />
                        Macierz obciążenia (Dni × Miesiące)
                      </h3>
                    </div>
                    <table className="w-full text-[10px] text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 text-gray-600">
                          <th className="p-1.5 border border-gray-200 font-semibold">Dzień \ Miesiąc</th>
                          {pivotState.months.map(m => (
                            <th key={m} className="p-1.5 border border-gray-200 font-semibold text-center">{m.substring(0, 3)}</th>
                          ))}
                          <th className="p-1.5 border border-gray-200 font-bold text-center bg-gray-100">Razem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pivotState.rows.map(day => (
                          <tr key={day} className="hover:bg-gray-50 transition-colors">
                            <td className="p-1.5 border border-gray-200 font-medium bg-gray-50">{day}</td>
                            {pivotState.months.map(m => {
                              const val = pivotState.data[day][m];
                              return (
                                <td key={m} className={`p-1.5 border border-gray-200 text-center font-medium transition-colors ${getPivotCellClass(val, false)}`}>
                                  {val > 0 ? val.toFixed(1) : '-'}
                                </td>
                              );
                            })}
                            <td className={`p-1.5 border border-gray-200 text-center font-bold transition-colors ${getPivotCellClass(pivotState.data[day].total, pivotState.data[day].total === pivotState.maxRowTotal)}`}>
                              {pivotState.data[day].total > 0 ? pivotState.data[day].total.toFixed(1) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 font-bold">
                          <td className="p-1.5 border border-gray-200 bg-gray-100">Razem</td>
                          {pivotState.months.map(m => {
                            const cTotal = pivotState.colTotals[m];
                            return (
                              <td key={m} className={`p-1.5 border border-gray-200 text-center transition-colors ${getPivotCellClass(cTotal, cTotal === pivotState.maxColTotal)}`}>
                                {cTotal > 0 ? cTotal.toFixed(1) : '-'}
                              </td>
                            );
                          })}
                          <td className="p-1.5 border border-gray-200 text-center bg-gray-200 text-blue-900">
                            {pivotState.colTotals.total > 0 ? pivotState.colTotals.total.toFixed(1) : '-'}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                    <div className="flex items-center gap-2 mt-2 text-[9px] text-gray-500">
                      <span>Szczyt: </span>
                      <div className="w-2 h-2 bg-orange-500 rounded-sm" />
                      <span className="font-medium">maksymalne obciążenie</span>
                      <span className="mx-1">·</span>
                      <span>Gradient: </span>
                      <div className="w-2 h-2 bg-blue-100 rounded-sm" />
                      <div className="w-2 h-2 bg-blue-400 rounded-sm" />
                      <div className="w-2 h-2 bg-blue-600 rounded-sm" />
                      <div className="w-2 h-2 bg-blue-800 rounded-sm" />
                      <span>↑ intensywność</span>
                    </div>
                  </div>
                )}

                {/* === ROW 6: Weekly stats (zostawiamy) === */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                  <div className="flex items-center gap-1.5 mb-3">
                    <TrendingUp size={14} className="text-gray-500" />
                    <h3 className="text-[12px] font-semibold text-gray-700">Profil tygodnia</h3>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {weeklyStats.map((stat) => (
                      <div key={stat.day} className={`text-center p-2 rounded-lg ${stat.day === maxWeeklyDay ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
                        <p className={`text-[10px] font-medium ${stat.day === maxWeeklyDay ? 'text-red-700' : 'text-gray-500'}`}>{stat.day}</p>
                        <p className={`text-[11px] font-bold ${stat.day === maxWeeklyDay ? 'text-red-700' : 'text-gray-700'}`}>
                          {stat.hours > 0 ? `${stat.hours.toFixed(1)}h` : '—'}
                        </p>
                        {stat.day === maxWeeklyDay && <span className="text-[8px] text-red-500">🔥 szczyt</span>}
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            ) : (
              <div className="bg-white p-12 rounded-xl shadow-sm border border-gray-100 text-center text-gray-400 flex flex-col items-center justify-center gap-3">
                <UploadCloud size={40} className="text-gray-300" />
                <p className="font-medium text-gray-600 text-sm">Oczekiwanie na plik testowy...</p>
                <p className="text-[11px] text-gray-400">Prześlij plik CSV, aby zbudować pełny dashboard z analizami.</p>
                <label className="mt-2 flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-blue-700 transition text-xs font-medium">
                  <UploadCloud size={14} /> Wybierz plik CSV
                  <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
            )}
          </>
        )}

        {/* ============== SYMULATOR DANYCH ========================= */}
        {activeTab === 'datasimulator' && (
          <DataModelSimulator
            rawData={data}
            sessionsData={sessions}
            pivotState={pivotState}
            monthAreas={monthAreas}
          />
        )}

        {/* ============== SYMULATOR KS/BO ========================== */}
        {activeTab === 'nodatasimulator' && <NoDataModelSimulator />}

      </div>

      <footer className="mt-8 text-center text-gray-400 text-[10px]">
        <p>Created by Anastasiia Bzova &copy; {new Date().getFullYear()} — v0.4 (beta)</p>
        <p className="text-[9px] text-gray-300 mt-0.5">Automatyczne metryki: sesje, czasy, heatmap, waterfall, przecięcia, prognozy</p>
      </footer>
    </div>
  );
}

export default App;