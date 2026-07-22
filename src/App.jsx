import React, { useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceArea, ReferenceLine, ReferenceDot, LineChart, Line, ComposedChart, Scatter, ScatterChart,
  Legend, Area
} from 'recharts';
import {
  UploadCloud, Clock, Calendar, TrendingUp, LayoutDashboard, Calculator,
  Compass, Activity, Zap, BarChart3, Layers, GitBranch,
  Info, Server, Cloud, AlertCircle, ChevronUp, ChevronDown, Maximize2
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

// Об'єднання інтервалів на одному дні
const mergeIntervals = (intervals) => {
  if (intervals.length === 0) return 0;
  const sorted = intervals.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [start, end] = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i];
    if (s <= end) {
      end = Math.max(end, e);
    } else {
      total += (end - start) / (3600 * 1000);
      [start, end] = [s, e];
    }
  }
  total += (end - start) / (3600 * 1000);
  return total;
};

// ============ КОМПОНЕНТ GANTT BAR DLA SCATTER ============
const GanttBar = (props) => {
  const { x, y, width, height, payload } = props;
  if (x === undefined || y === undefined || width === undefined || height === undefined) return null;

  const label = payload.label || '';
  const yIndex = payload.id || 0;
  
  // Odcienie zieleni (od jasnego do ciemnego)
  const colors = [
    '#22c55e',
    '#16a34a',
    '#15803d',
    '#166534',
  ];
  const color = colors[yIndex % colors.length];

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={Math.max(2, width)}
        height={height}
        fill={color}
        fillOpacity={0.85}
        stroke="#fff"
        strokeWidth={1}
        rx={4}
      />
      {width > 30 && (
        <text
          x={x + 4}
          y={y + height / 2 + 3}
          fontSize={9}
          fill="#fff"
          fontWeight="bold"
          fontFamily="sans-serif"
        >
          {label.length > 12 ? label.substring(0, 10) + '…' : label}
        </text>
      )}
    </g>
  );
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
  const [overlapStats, setOverlapStats] = useState({ totalOverlap: 0, details: [] });
  const [selectedOverlapDay, setSelectedOverlapDay] = useState(null);
  const [showModelA, setShowModelA] = useState(false);

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
        let startDateObj = null;
        let stopDateObj = null;

        // Пріоритет: якщо є start/stop – використовуємо їх
        if (rawStartDate && rawStopDate) {
          const startDate = parseDateTime(rawStartDate);
          const endDate = parseDateTime(rawStopDate);
          if (startDate && endDate && endDate > startDate) {
            startDateObj = startDate;
            stopDateObj = endDate;
            sessionDateStr = formatDate(startDate);
            sessionHours = (endDate - startDate) / (3600 * 1000);
          }
        }

        // Якщо немає start/stop, але є rawDate і parsedHours – будуємо умовний інтервал
        if (!startDateObj && rawDate) {
          const dateParts = rawDate.split(' ');
          if (dateParts.length === 2) {
            const d = parseDateTime(rawDate);
            if (d) {
              startDateObj = d;
              stopDateObj = new Date(d.getTime() + parsedHours * 3600 * 1000);
              sessionDateStr = formatDate(d);
              sessionHours = parsedHours;
            }
          } else {
            const d = new Date(rawDate.split('.').reverse().join('-'));
            if (!isNaN(d)) {
              startDateObj = new Date(d);
              startDateObj.setHours(0, 0, 0, 0);
              stopDateObj = new Date(startDateObj.getTime() + parsedHours * 3600 * 1000);
              sessionDateStr = formatDate(startDateObj);
              sessionHours = parsedHours;
            }
          }
        }

        if (sessionDateStr && sessionHours > 0 && startDateObj && stopDateObj) {
          const dateParts = sessionDateStr.split('.');
          let dayName = '', monthStr = '', dateObj = null;
          if (dateParts.length === 3) {
            dateObj = new Date(dateParts[2], dateParts[1] - 1, dateParts[0]);
            dayName = DAY_NAMES[dateObj.getDay()];
            monthStr = MONTH_NAMES[parseInt(dateParts[1], 10) - 1];
          }
          const h = parseFloat(sessionHours.toFixed(2));
          rawSessions.push({
            date: sessionDateStr,
            hours: h,
            user,
            reason,
            dayName,
            monthStr,
            dateObj,
            startDate: startDateObj,
            stopDate: stopDateObj,
          });
          allDurations.push(h);
        }
      }

      // ====== ОБЧИСЛЕННЯ АКТИВНИХ ГОДИН НА ДЕНЬ ======
      const dailyMap = {};

      rawSessions.forEach(s => {
        if (!s.startDate || !s.stopDate) return;
        let start = new Date(s.startDate);
        let end = new Date(s.stopDate);
        const dayStartMs = new Date(start);
        dayStartMs.setHours(0, 0, 0, 0);
        const dayEndMs = new Date(dayStartMs);
        dayEndMs.setDate(dayEndMs.getDate() + 1);

        while (start < end) {
          const dayKey = formatDate(start);
          const clipStart = Math.max(start.getTime(), dayStartMs.getTime());
          const clipEnd = Math.min(end.getTime(), dayEndMs.getTime());
          if (clipStart < clipEnd) {
            if (!dailyMap[dayKey]) {
              dailyMap[dayKey] = { unionIntervals: [], otherHours: 0, total: 0, reasons: [], users: new Set() };
            }
            dailyMap[dayKey].unionIntervals.push([clipStart, clipEnd]);
            dailyMap[dayKey].users.add(s.user);
            if (s.reason && !dailyMap[dayKey].reasons.includes(s.reason)) {
              dailyMap[dayKey].reasons.push(s.reason);
            }
          }
          start = new Date(dayEndMs);
          dayStartMs.setDate(dayStartMs.getDate() + 1);
          dayEndMs.setDate(dayEndMs.getDate() + 1);
        }
      });

      rawSessions.forEach(s => {
        if (!s.startDate || !s.stopDate) {
          const dayKey = s.date;
          if (!dailyMap[dayKey]) {
            dailyMap[dayKey] = { unionIntervals: [], otherHours: 0, total: 0, reasons: [], users: new Set() };
          }
          dailyMap[dayKey].otherHours += s.hours;
          dailyMap[dayKey].users.add(s.user);
          if (s.reason && !dailyMap[dayKey].reasons.includes(s.reason)) {
            dailyMap[dayKey].reasons.push(s.reason);
          }
        }
      });

      Object.keys(dailyMap).forEach(date => {
        const day = dailyMap[date];
        day.unionHours = mergeIntervals(day.unionIntervals);
        day.total = day.unionHours + day.otherHours;
      });

      const formattedData = Object.keys(dailyMap).map(date => {
        const day = dailyMap[date];
        const dateParts = date.split('.');
        const dateObj = new Date(dateParts[2], dateParts[1] - 1, dateParts[0]);
        const dayName = DAY_NAMES[dateObj.getDay()];
        const monthStr = MONTH_NAMES[parseInt(dateParts[1], 10) - 1];
        return {
          date,
          hours: day.total,
          unionHours: day.unionHours,
          otherHours: day.otherHours,
          dayName,
          monthStr,
          dateObj,
          reason: day.reasons.join(' | '),
          user: Array.from(day.users).join(', '),
        };
      }).sort((a, b) => a.dateObj - b.dateObj);

      // ====== ПОДАЛЬШІ ОБЧИСЛЕННЯ ======
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

      const daysTotals = { Pn: 0, Wt: 0, Śr: 0, Cz: 0, Pt: 0, Sb: 0, Nd: 0 };
      formattedData.forEach(d => { if (d.dayName && daysTotals[d.dayName] !== undefined) daysTotals[d.dayName] += d.hours; });
      const weeklyArr = DAY_ORDER.map(day => ({ day, hours: parseFloat(daysTotals[day].toFixed(2)) }));

      const heatmapData = {};
      DAY_ORDER.forEach(day => { heatmapData[day] = {}; for (let h = 0; h < 24; h++) heatmapData[day][h] = 0; });

      rawSessions.forEach(s => {
        if (s.startDate && s.stopDate && s.dayName) {
          const startHour = s.startDate.getHours() + s.startDate.getMinutes() / 60;
          const endHour = s.stopDate.getHours() + s.stopDate.getMinutes() / 60;
          if (endHour <= startHour) return;
          const totalDuration = endHour - startHour;
          for (let h = Math.floor(startHour); h < Math.ceil(endHour); h++) {
            const hourStart = Math.max(startHour, h);
            const hourEnd = Math.min(endHour, h + 1);
            const fraction = Math.max(0, hourEnd - hourStart);
            if (fraction > 0 && heatmapData[s.dayName] && heatmapData[s.dayName][h] !== undefined) {
              heatmapData[s.dayName][h] += s.hours * (fraction / totalDuration);
            }
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

      const timeline = formattedData.map(d => ({
        date: d.date,
        hours: d.hours,
        dayName: d.dayName,
        monthStr: d.monthStr
      }));

      // Перекриття сесій
      let totalOverlap = 0;
      const overlapDetails = [];
      for (let i = 0; i < rawSessions.length; i++) {
        const a = rawSessions[i];
        if (!a.startDate || !a.stopDate) continue;
        for (let j = i + 1; j < rawSessions.length; j++) {
          const b = rawSessions[j];
          if (!b.startDate || !b.stopDate) continue;
          const overlapStart = Math.max(a.startDate.getTime(), b.startDate.getTime());
          const overlapEnd = Math.min(a.stopDate.getTime(), b.stopDate.getTime());
          if (overlapStart < overlapEnd) {
            const overlapHours = (overlapEnd - overlapStart) / (3600 * 1000);
            totalOverlap += overlapHours;
            const overlapDate = new Date(overlapStart);
            const dateStr = formatDate(overlapDate);
            overlapDetails.push({
              sessionA: i + 1,
              sessionB: j + 1,
              overlapHours: parseFloat(overlapHours.toFixed(2)),
              day: a.dayName || '—',
              date: dateStr,
              overlapStart: overlapStart
            });
          }
        }
      }

      const overlapByDate = {};
      overlapDetails.forEach(item => {
        const dateKey = item.date;
        if (!overlapByDate[dateKey]) {
          overlapByDate[dateKey] = { date: dateKey, totalOverlapHours: 0, count: 0 };
        }
        overlapByDate[dateKey].totalOverlapHours += item.overlapHours;
        overlapByDate[dateKey].count += 1;
      });

      const overlapDisplay = Object.values(overlapByDate)
        .map((item, idx) => ({
          id: idx + 1,
          date: item.date,
          overlapHours: parseFloat(item.totalOverlapHours.toFixed(2)),
          count: item.count,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Pivot table
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

      // ====== ФІНАЛЬНІ СТАТИСТИКИ ======
      const allHours = formattedData.map(d => d.hours);
      const total = allHours.reduce((s, v) => s + v, 0);
      const sumHours = rawSessions.reduce((s, v) => s + v.hours, 0);
      const avg = allHours.length > 0 ? total / allHours.length : 0;
      const med = median(allHours);
      const std = stddev(allHours);
      const activeDays = formattedData.length;
      const totalSessions = rawSessions.length;

      let totalWorkingDays = 0;
      if (formattedData.length > 0) {
        const firstDate = new Date(formattedData[0].dateObj);
        const lastDate = new Date(formattedData[formattedData.length - 1].dateObj);
        firstDate.setHours(0, 0, 0, 0);
        lastDate.setHours(0, 0, 0, 0);
        let current = new Date(firstDate);
        while (current <= lastDate) {
          const dayOfWeek = current.getDay();
          if (dayOfWeek >= 1 && dayOfWeek <= 5) totalWorkingDays++;
          current.setDate(current.getDate() + 1);
        }
      }

      const potentialHours = totalWorkingDays * 8;
      const utilRate = potentialHours > 0 ? total / potentialHours : 0;
      const downtime = Math.max(0, potentialHours - total);

      const peakHours = Math.max(...allHours, 0);

      setData(formattedData);
      setSessions(rawSessions);
      setSessionDurations(allDurations);
      setTimelineData(timeline);
      setHourlyHeatmap(heatmapArr);
      setOverlapStats({ totalOverlap, details: overlapDisplay });
      if (overlapDisplay.length > 0) {
        const maxOverlapDay = overlapDisplay.reduce((a, b) => a.overlapHours > b.overlapHours ? a : b);
        setSelectedOverlapDay(maxOverlapDay.date);
      } else {
        setSelectedOverlapDay(null);
      }
      setMonthAreas(mAreas);
      setWeeklyStats(weeklyArr);
      setSummary({
        totalSessions,
        totalHours: total,
        sumHours,
        overlapHours: totalOverlap,
        avgHours: avg,
        medianHours: med,
        stdDev: std,
        activeDays,
        totalWorkingDays,
        utilizationRate: utilRate,
        peakHours,
        downtime,
        maxDay: formattedData.reduce((a, b) => a.hours > b.hours ? a : b, { date: '—', hours: 0 })
      });
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // ============ МЕМО ДЛЯ ВІЗУАЛІЗАЦІЙ ============
  const maxWeeklyDay = useMemo(() => {
    if (weeklyStats.length === 0) return null;
    return [...weeklyStats].sort((a, b) => b.hours - a.hours)[0]?.day || null;
  }, [weeklyStats]);

  const monthlyStats = useMemo(() => {
    const totals = {};
    data.forEach(d => {
      if (d.monthStr) {
        totals[d.monthStr] = (totals[d.monthStr] || 0) + d.hours;
      }
    });
    return Object.entries(totals)
      .map(([month, hours]) => ({ month, hours: parseFloat(hours.toFixed(2)) }))
      .sort((a, b) => MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month));
  }, [data]);

  const maxMonth = useMemo(() => {
    if (monthlyStats.length === 0) return null;
    return [...monthlyStats].sort((a, b) => b.hours - a.hours)[0]?.month || null;
  }, [monthlyStats]);

  const getPivotCellClass = (val, isHighlight) => {
    if (isHighlight) return 'bg-orange-500 text-white border-orange-600 shadow-inner font-bold';
    if (val === 0) return 'text-gray-300 bg-white';
    const ratio = val / (pivotState?.maxGridVal || 1);
    if (ratio > 0.8) return 'bg-blue-800 text-white';
    if (ratio > 0.5) return 'bg-blue-600 text-white';
    if (ratio > 0.25) return 'bg-blue-400 text-blue-900';
    return 'bg-blue-100 text-blue-900';
  };

  const durationStats = useMemo(() => {
    if (!sessionDurations.length) return { min: 0, q1: 0, q3: 0, max: 0 };
    const sorted = [...sessionDurations].sort((a, b) => a - b);
    return {
      min: sorted[0],
      q1: sorted[Math.floor(sorted.length * 0.25)] ?? sorted[0],
      q3: sorted[Math.floor(sorted.length * 0.75)] ?? sorted[sorted.length - 1],
      max: sorted[sorted.length - 1],
    };
  }, [sessionDurations]);

  // ============ КОМПОНЕНТ KPI КАРТКИ ============
  const KPICard = ({ icon: Icon, label, value, sub, color = 'blue', badge, tooltip }) => {
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
      <div className={`p-3 rounded-xl border ${colors[color]} transition-all hover:shadow-sm relative`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${colors[color].replace('bg-', 'bg-').replace('border-', 'border-')} bg-opacity-30`}>
              <Icon size={14} className={colors[color].replace('text-', 'text-')} />
            </div>
            <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">{label}</span>
          </div>
          {badge && <span className="text-[9px] bg-white/60 px-1.5 py-0.5 rounded-full">{badge}</span>}
          {tooltip && (
            <div className="absolute top-1 right-1 text-gray-400 hover:text-gray-600 cursor-help" title={tooltip}>
              <Info size={12} />
            </div>
          )}
        </div>
        <p className="text-xl font-bold mt-0.5">{value}</p>
        {sub && <p className="text-[10px] opacity-60 mt-0.5">{sub}</p>}
      </div>
    );
  };

  // ============ РЕНДЕР ============
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

                {/* === ROW 0: KPI CARDS === */}
                <div className="space-y-3">
                  {/* Główne metryki */}
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    <KPICard icon={Activity} 
                      label="Sesje" 
                      value={summary.totalSessions} 
                      sub={`${summary.activeDays} dni aktywnych`} 
                      color="blue" 
                      tooltip="W jednym dniu może występować >1 sesji – np. jeśli sesje nakładają się lub są uruchamiane przez różnych użytkowników."
                    />
                    <KPICard
                      icon={Clock}
                      label="Suma godzin sesji"
                      value={fmtNum(summary.sumHours)}
                      sub={`aktywny czas (bez nakładania): ${fmtNum(summary.totalHours)}h`}
                      color="green"
                      tooltip="Suma godzin wszystkich sesji z logu – zgodna z wierszem „Razem” w raporcie. Aktywny czas = suma po usunięciu podwójnego liczenia nakładających się sesji."
                    />
                    <KPICard
                      icon={Layers}
                      label="Nakładanie się sesji"
                      value={`${fmtNum(summary.overlapHours)}h`}
                      sub={summary.overlapHours > 0.05 ? 'potwierdzona współbieżność' : 'brak wykrytych nakładań'}
                      color={summary.overlapHours > 0.05 ? 'red' : 'gray'}
                      tooltip="Godziny, w których działały jednocześnie ≥2 sesje (porównanie start/stop). Suma godzin sesji minus nakładanie = aktywny czas bez dubli."
                    />

                    {/* TRZY NOWE KARTY: ŚREDNIA, MEDIANA, NAJDŁUŻSZA */}
                    <KPICard
                      icon={BarChart3}
                      label="Średnia sesja"
                      value={`${fmtNum(summary.avgHours)}h`}
                      sub={`z ${summary.totalSessions} sesji`}
                      color="purple"
                      tooltip="Średni czas trwania pojedynczej sesji."
                    />
                    <KPICard
                      icon={TrendingUp}
                      label="Mediana sesji"
                      value={`${fmtNum(summary.medianHours)}h`}
                      sub="wartość środkowa"
                      color="purple"
                      tooltip="Mediana czasu sesji – typowy czas, niezakłócony przez ekstremalnie długie sesje."
                    />

                    <KPICard 
                      icon={Zap} 
                      label="Szczyt" 
                      value={`${fmtNum(summary.peakHours)}h`} 
                      sub={`${summary.maxDay?.date || '—'}`} 
                      color="orange" 
                      tooltip="Najdłuższa sesja - dzień, w którym odnotowano najwięcej godzin aktywności."
                    />
                  </div>

                  {/* Model A – porównanie (cykliczny) – domyślnie zwinięte */}
                  <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-3">
                    <div 
                      className="flex items-center gap-2 cursor-pointer select-none" 
                      onClick={() => setShowModelA(!showModelA)}
                    >
                      <div className="h-4 w-1 bg-teal-500 rounded-full"></div>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        Model A (cykliczny) – porównanie
                      </span>
                      <span className="relative inline-flex ml-1 cursor-help" title="Model A zakłada stałą dostępność środowiska przez 8 godzin każdego dnia roboczego (pn–pt), niezależnie od faktycznego użycia.">
                        <Info size={12} className="text-gray-400 hover:text-gray-600" />
                      </span>
                      <span className="ml-auto">
                        {showModelA ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                      </span>
                    </div>
                    {showModelA && (
                      <>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <KPICard 
                            icon={Calendar} 
                            label="Wykorzystanie" 
                            value={fmtPct(summary.utilizationRate)} 
                            sub={`założenie: 8h/dzień roboczy`} 
                            color="teal" 
                            tooltip="% wykorzystania WZGLĘDEM założonego cyklicznego modelu (8h/dzień roboczy, pn–pt) – im niższy, tym większa potencjalna różnica względem On‑demand." 
                          />
                          <KPICard 
                            icon={Cloud} 
                            label="Przestoje" 
                            value={fmtNum(summary.downtime)} 
                            sub="godz. — hipotetyczny model cykliczny 8h/dzień" 
                            color="gray" 
                            tooltip="Godziny, które byłyby zmarnowane w cyklicznym modelu (8h/dzień roboczy) – hipotetyczne porównanie." 
                          />
                        </div>
                        <p className="text-[9px] text-gray-400 mt-2">
                          ⚠️ „Wykorzystanie” i „Przestoje” odnoszą się do hipotetycznego <strong>Modelu A (cyklicznego)</strong> – nie do faktycznie ponoszonego kosztu w obecnym modelu On‑demand.
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* === ROW 1: Timeline === */}
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
                      <ComposedChart data={timelineData} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis dataKey="date" fontSize={8} stroke="#9ca3af" tick={{ angle: -45, textAnchor: 'end' }} tickFormatter={(v) => v.substring(0, 5)} />
                        <YAxis fontSize={9} stroke="#9ca3af" />
                        <Tooltip contentStyle={{ fontSize: 11, backgroundColor: '#1f2937', color: '#fff', borderRadius: 8, border: 'none' }} />
                        <Area type="monotone" dataKey="hours" fill="#10b981" stroke="#059669" fillOpacity={0.3} />
                        {/* Межі місяців */}
                        {monthAreas.slice(1).map((area, idx) => (
                          <ReferenceLine key={`month-line-${idx}`} x={area.startX} stroke="#9ca3af" strokeDasharray="3 3" strokeWidth={1} />
                        ))}
                        {/* Oznaczenie dnia szczytowego */}
                        {summary?.maxDay?.date && (
                          <>
                            <ReferenceLine x={summary.maxDay.date} stroke="#f97316" strokeDasharray="5 5" strokeWidth={2} />
                            <ReferenceDot
                              x={summary.maxDay.date}
                              y={summary.maxDay.hours}
                              r={6}
                              fill="#f97316"
                              stroke="#fff"
                              strokeWidth={2}
                              label={{
                                value: 'szczyt',
                                position: 'top',
                                fill: '#f97316',
                                fontSize: 9,
                                fontWeight: 700,
                                dy: -10,
                              }}
                            />
                          </>
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[9px] text-gray-400 mt-1">
                    Linie pionowe = granice miesięcy • Pionowa linia i kropka = dzień szczytowy (najwięcej godzin)
                  </p>
                </div>

                {/* === ROW 2: Histogram + Heatmap === */}
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
                          const CAP = 16;
                          const bins = {};
                          sessionDurations.forEach(h => {
                            const key = h >= CAP ? CAP : Math.floor(h / 2) * 2;
                            bins[key] = (bins[key] || 0) + 1;
                          });
                          return Object.keys(bins)
                            .map(Number)
                            .sort((a, b) => a - b)
                            .map(k => ({ range: k >= CAP ? `${CAP}h+` : `${k}-${k + 2}h`, count: bins[k] }));
                        })()} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                          <XAxis dataKey="range" fontSize={9} stroke="#9ca3af" tick={{ angle: -20, textAnchor: 'end' }} />
                          <YAxis fontSize={9} stroke="#9ca3af" />
                          <Tooltip contentStyle={{ fontSize: 11, backgroundColor: '#1f2937', color: '#fff', borderRadius: 8, border: 'none' }} />
                          <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-[9px] text-gray-400 mt-1">Rozkład długości sesji (przedziały 2-godzinne, 16h+ zbiorczo)</p>
                  </div>

                  {/* Heatmap */}
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[12px] font-semibold text-gray-700 flex items-center gap-1.5">
                        <Activity size={14} className="text-orange-500" />
                        Heatmap aktywności (dzień × godzina)
                      </h3>
                      <span className="text-[9px] text-gray-400">realne godziny</span>
                    </div>
                    <div className="w-full">
                      <div className="min-w-[500px]">
                        <div className="flex items-center justify-end gap-2 mb-1.5">
                          <span className="text-[8px] text-gray-400">niska</span>
                          <div className="flex h-2.5 rounded overflow-hidden">
                            <div className="w-4 bg-blue-100" />
                            <div className="w-4 bg-blue-300" />
                            <div className="w-4 bg-blue-500" />
                            <div className="w-4 bg-blue-700" />
                            <div className="w-4 bg-blue-900" />
                          </div>
                          <span className="text-[8px] text-gray-400">wysoka</span>
                        </div>
                        <div className="grid" style={{ gridTemplateColumns: '40px repeat(24, 1fr)', gap: '1px' }}>
                          <div className="text-[8px] text-gray-400 font-medium flex items-center justify-end pr-1">dzień \ godz.</div>
                          {Array.from({ length: 24 }, (_, h) => (
                            <div key={`h-${h}`} className="text-[7px] text-gray-400 text-center font-mono">{h}:00</div>
                          ))}
                          {DAY_ORDER.map(day => {
                            const dayData = hourlyHeatmap.filter(d => d.day === day);
                            const maxVal = Math.max(...dayData.map(d => d.value), 0.1);
                            return (
                              <React.Fragment key={day}>
                                <div className="text-[9px] font-medium text-gray-600 flex items-center justify-end pr-1">{day}</div>
                                {Array.from({ length: 24 }, (_, hour) => {
                                  const entry = dayData.find(d => d.hour === hour);
                                  const val = entry ? entry.value : 0;
                                  const intensity = maxVal > 0 ? Math.min(val / maxVal, 1) : 0;
                                  const color = val === 0
                                    ? 'bg-gray-50'
                                    : intensity > 0.8 ? 'bg-blue-900'
                                    : intensity > 0.6 ? 'bg-blue-700'
                                    : intensity > 0.4 ? 'bg-blue-500'
                                    : intensity > 0.2 ? 'bg-blue-300'
                                    : 'bg-blue-100';
                                  return (
                                    <div
                                      key={`${day}-${hour}`}
                                      className={`${color} h-5 rounded-sm transition-all hover:scale-110 hover:shadow-md cursor-pointer relative group`}
                                      title={`${day} ${hour}:00 – ${val.toFixed(1)}h`}
                                    >
                                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-gray-800 text-white text-[8px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                                        {val > 0 ? `${val.toFixed(1)}h` : 'brak'}
                                      </div>
                                    </div>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <p className="text-[9px] text-gray-400 mt-2">
                      Każda komórka = 1 godzina w danym dniu tygodnia • im ciemniejszy niebieski, tym większa aktywność
                    </p>
                  </div>
                </div>

                {/* === ROW 3: Profile + GANTT === */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    {/* Profil tygodnia */}
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                      <div className="flex items-center gap-1.5 mb-3">
                        <TrendingUp size={14} className="text-gray-500" />
                        <h3 className="text-[12px] font-semibold text-gray-700">Profil tygodnia</h3>
                      </div>
                      <div className="grid grid-cols-7 gap-1.5">
                        {weeklyStats.map((stat) => (
                          <div key={stat.day} className={`text-center p-2 rounded-lg ${stat.day === maxWeeklyDay ? 'bg-orange-50 border border-red-200' : 'bg-gray-50'}`}>
                            <p className={`text-[10px] font-medium ${stat.day === maxWeeklyDay ? 'text-red-700' : 'text-gray-500'}`}>{stat.day}</p>
                            <p className={`text-[11px] font-bold ${stat.day === maxWeeklyDay ? 'text-red-700' : 'text-gray-700'}`}>
                              {stat.hours > 0 ? `${stat.hours.toFixed(1)}h` : '—'}
                            </p>
                            {stat.day === maxWeeklyDay && <span className="text-[8px] text-red-500">🔥 szczyt</span>}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Profil miesiąca */}
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                      <div className="flex items-center gap-1.5 mb-3">
                        <Calendar size={14} className="text-gray-500" />
                        <h3 className="text-[12px] font-semibold text-gray-700">Profil miesiąca</h3>
                      </div>
                      {monthlyStats.length === 0 ? (
                        <p className="text-[10px] text-gray-400">Brak danych miesięcznych</p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-1.5">
                          {monthlyStats.map((stat) => (
                            <div key={stat.month} className={`text-center p-2 rounded-lg ${stat.month === maxMonth ? 'bg-orange-50 border border-orange-300' : 'bg-gray-50'}`}>
                              <p className={`text-[10px] font-medium ${stat.month === maxMonth ? 'text-orange-700' : 'text-gray-500'}`}>
                                {stat.month.substring(0, 3)}
                              </p>
                              <p className={`text-[11px] font-bold ${stat.month === maxMonth ? 'text-orange-700' : 'text-gray-700'}`}>
                                {stat.hours > 0 ? `${stat.hours.toFixed(1)}h` : '—'}
                              </p>
                              {stat.month === maxMonth && <span className="text-[8px] text-orange-500">🔥 szczyt</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* === GANTT: Przecięcia sesji === */}
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[12px] font-semibold text-gray-700 flex items-center gap-1.5">
                        <GitBranch size={14} className="text-red-500" />
                        Przecięcia sesji (realne)
                      </h3>
                      <div className="text-right">
                        <span className="text-[9px] text-gray-400 block">
                          łącznie {overlapStats.totalOverlap.toFixed(1)} godz. przecięć
                        </span>
                        {selectedOverlapDay && (() => {
                          const dayStart = new Date(selectedOverlapDay.split('.').reverse().join('-'));
                          dayStart.setHours(0, 0, 0, 0);
                          const dayEnd = new Date(dayStart);
                          dayEnd.setDate(dayEnd.getDate() + 1);

                          const daySessions = sessions.filter(s => {
                            if (!s.startDate || !s.stopDate) return false;
                            return s.startDate < dayEnd && s.stopDate > dayStart;
                          });

                          const getOverlapIntervals = (sessions, dayStart, dayEnd) => {
                            const intervals = sessions.map(s => {
                              const start = Math.max(s.startDate.getTime(), dayStart.getTime());
                              const end = Math.min(s.stopDate.getTime(), dayEnd.getTime());
                              if (start >= end) return null;
                              return [(start - dayStart.getTime()) / (3600 * 1000), (end - dayStart.getTime()) / (3600 * 1000)];
                            }).filter(Boolean);

                            const overlapIntervals = [];
                            const step = 0.1;
                            let inOverlap = false;
                            let currentStart = 0;
                            for (let t = 0; t < 24; t += step) {
                              const coverCount = intervals.filter(([s, e]) => s <= t && t < e).length;
                              if (coverCount >= 2 && !inOverlap) {
                                inOverlap = true;
                                currentStart = t;
                              } else if ((coverCount < 2 || t >= 24 - step) && inOverlap) {
                                inOverlap = false;
                                overlapIntervals.push([Math.round(currentStart * 10) / 10, Math.round(t * 10) / 10]);
                              }
                            }
                            return overlapIntervals;
                          };

                          const overlapIntervals = getOverlapIntervals(daySessions, dayStart, dayEnd);
                          if (overlapIntervals.length === 0) return null;

                          const overlapHoursText = overlapIntervals.map(([s, e]) => {
                            const startStr = `${Math.floor(s)}:${String(Math.round((s % 1) * 60)).padStart(2, '0')}`;
                            const endStr = `${Math.floor(e)}:${String(Math.round((e % 1) * 60)).padStart(2, '0')}`;
                            return `${startStr} – ${endStr}`;
                          }).join('; ');

                          return (
                            <span className="text-[9px] text-red-500 block mt-0.5 font-medium">
                              {overlapHoursText}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                    {overlapStats.details.length === 0 ? (
                      <div className="flex items-center justify-center h-20 text-gray-400 text-sm">
                        <AlertCircle size={16} className="mr-2" />
                        Brak przecięć między sesjami.
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {overlapStats.details.map((item) => (
                            <button
                              key={item.date}
                              onClick={() => setSelectedOverlapDay(item.date)}
                              className={`text-[10px] px-2 py-1 rounded-lg border transition ${
                                selectedOverlapDay === item.date
                                  ? 'bg-red-100 border-red-400 text-red-700 font-medium'
                                  : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {item.date} ({item.overlapHours.toFixed(1)}h)
                            </button>
                          ))}
                        </div>
                        {selectedOverlapDay && (() => {
                          const dayStart = new Date(selectedOverlapDay.split('.').reverse().join('-'));
                          dayStart.setHours(0, 0, 0, 0);
                          const dayEnd = new Date(dayStart);
                          dayEnd.setDate(dayEnd.getDate() + 1);

                          const daySessions = sessions.filter(s => {
                            if (!s.startDate || !s.stopDate) return false;
                            return s.startDate < dayEnd && s.stopDate > dayStart;
                          });

                          const ganttData = daySessions.map((s, index) => {
                            const start = Math.max(s.startDate.getTime(), dayStart.getTime());
                            const end = Math.min(s.stopDate.getTime(), dayEnd.getTime());
                            const startHour = (start - dayStart.getTime()) / (3600 * 1000);
                            const endHour = (end - dayStart.getTime()) / (3600 * 1000);
                            return {
                              id: index,
                              range: [startHour, endHour],
                              duration: endHour - startHour,
                              label: s.user || 'Sesja',
                            };
                          }).filter(d => d.duration > 0);

                          if (ganttData.length === 0) {
                            return <div className="text-center text-gray-400 py-8">Brak sesji w tym dniu</div>;
                          }

                          const getOverlapIntervals = (sessions, dayStart, dayEnd) => {
                            const intervals = sessions.map(s => {
                              const start = Math.max(s.startDate.getTime(), dayStart.getTime());
                              const end = Math.min(s.stopDate.getTime(), dayEnd.getTime());
                              if (start >= end) return null;
                              return [(start - dayStart.getTime()) / (3600 * 1000), (end - dayStart.getTime()) / (3600 * 1000)];
                            }).filter(Boolean);

                            const overlapIntervals = [];
                            const step = 0.1;
                            let inOverlap = false;
                            let currentStart = 0;
                            for (let t = 0; t < 24; t += step) {
                              const coverCount = intervals.filter(([s, e]) => s <= t && t < e).length;
                              if (coverCount >= 2 && !inOverlap) {
                                inOverlap = true;
                                currentStart = t;
                              } else if ((coverCount < 2 || t >= 24 - step) && inOverlap) {
                                inOverlap = false;
                                overlapIntervals.push([Math.round(currentStart * 10) / 10, Math.round(t * 10) / 10]);
                              }
                            }
                            return overlapIntervals;
                          };

                          const overlapIntervals = getOverlapIntervals(daySessions, dayStart, dayEnd);

                          return (
                            <div className="h-44 w-full relative">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                  layout="vertical"
                                  data={ganttData}
                                  margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                                  barGap={0}
                                >
                                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={true} stroke="#e5e7eb" />
                                  <XAxis
                                    type="number"
                                    domain={[0, 24]}
                                    tickCount={13}
                                    tickFormatter={(v) => `${v}:00`}
                                    fontSize={9}
                                    stroke="#9ca3af"
                                    label={{ value: 'Godzina', position: 'insideBottom', offset: -10, fontSize: 9, fill: '#9ca3af' }}
                                  />
                                  <YAxis
                                    type="category"
                                    dataKey="id"
                                    fontSize={9}
                                    stroke="#9ca3af"
                                    width={60}
                                    tickFormatter={(val) => {
                                      const item = ganttData.find(d => d.id === val);
                                      return item ? (item.label.length > 8 ? item.label.substring(0, 8) + '…' : item.label) : '';
                                    }}
                                  />
                                  <Tooltip
                                    content={({ payload, label }) => {
                                      if (!payload || !payload.length) return null;
                                      const item = payload[0].payload;
                                      if (!item || !item.range) return null;
                                      const [start, end] = item.range;
                                      const duration = end - start;
                                      return (
                                        <div style={{ backgroundColor: '#1f2937', padding: '8px 12px', borderRadius: '8px', color: '#fff', fontSize: '11px', maxWidth: '200px' }}>
                                          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>{item.label}</div>
                                          <div>{duration.toFixed(1)}h ({start.toFixed(1)} – {end.toFixed(1)})</div>
                                        </div>
                                      );
                                    }}
                                    cursor={{ fill: 'transparent' }}
                                  />
                                  {overlapIntervals.map(([start, end]) => (
                                    <ReferenceArea
                                      key={`overlap-${start}-${end}`}
                                      x1={start}
                                      x2={end}
                                      fill="#ef4444"
                                      fillOpacity={0.2}
                                      stroke="#ef4444"
                                      strokeOpacity={0.5}
                                      strokeWidth={1}
                                    />
                                  ))}
                                  <Bar
                                    dataKey="range"
                                    shape={<GanttBar />}
                                    isAnimationActive={false}
                                  />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          );
                        })()}
                      </>
                    )}
                    <p className="text-[9px] text-gray-400 mt-1">Kliknij dzień, aby zobaczyć nakładanie się sesji w tym dniu.</p>
                  </div>
                </div>

                {/* === ROW 4: PIVOT TABLE === */}
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
      </footer>
    </div>
  );
}

export default App;