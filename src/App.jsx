import React, { useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceArea, ReferenceLine, ReferenceDot, ComposedChart, Area
} from 'recharts';
import {
  UploadCloud, Clock, Calendar, TrendingUp, LayoutDashboard, Calculator,
  Compass, Activity, Zap, BarChart3, Layers, GitBranch,
  Info, Server, Cloud, AlertCircle, ChevronUp, ChevronDown
} from 'lucide-react';
import DataModelSimulator from './DataModelSimulator';
import NoDataModelSimulator from './NoDataModelSimulator';

// ============ FUNKCJE POMOCNICZE ============
const HOUR_MS = 60 * 60 * 1000;

// Założenie analityczne dla porównania z Modelem A.
// Jeżeli harmonogram umowny ma inne godziny, zmień te dwie wartości.
const MODEL_A_START_HOUR = 8;
const MODEL_A_END_HOUR = 16;

const isFiniteNumber = (value) => Number.isFinite(Number(value));

const parseDateTime = (value) => {
  if (!value) return null;
  const match = String(value).trim().match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match) return null;

  const [, day, month, year, hour, minute, second = '0'] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    0
  );

  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return null;
  }
  return date;
};

const parseDateOnly = (value) => {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  date.setHours(0, 0, 0, 0);
  return date;
};

const startOfDay = (date) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

const endExclusiveDayForInterval = (endDate) => {
  // Koniec przedziału jest wyłączny. Dzięki -1 ms sesja kończąca się o 00:00
  // nie tworzy sztucznego kolejnego dnia aktywności.
  return startOfDay(new Date(endDate.getTime() - 1));
};

const formatDate = (date) => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
};

const formatDateTime = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${formatDate(date)} ${hh}:${mm}`;
};

const DAY_NAMES = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];
const MONTH_NAMES = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const DAY_ORDER = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];

const fmtNum = (value, digits = 1) => {
  if (!isFiniteNumber(value)) return '—';
  return Number(value).toLocaleString('pl-PL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const fmtPct = (value, digits = 1) => {
  if (!isFiniteNumber(value)) return '—';
  return (Number(value) * 100).toLocaleString('pl-PL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }) + '%';
};

const median = (values) => {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const stddev = (values) => {
  if (!Array.isArray(values) || values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
};

const normalizeHeader = (header) => String(header || '')
  .replace(/^\uFEFF/, '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ');

const parseCsvRow = (line, delimiter) => {
  const cells = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
};

const detectDelimiter = (headerLine) => {
  const candidates = [';', ',', '\t'];
  return candidates
    .map(delimiter => ({ delimiter, count: parseCsvRow(headerLine, delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
};

const decodeCsvBuffer = (buffer) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1250').decode(buffer);
  }
};

const findHeaderIndex = (headers, exact = [], includes = []) => {
  const exactIndex = headers.findIndex(header => exact.includes(header));
  if (exactIndex !== -1) return exactIndex;
  return headers.findIndex(header => includes.some(fragment => header.includes(fragment)));
};

const mergeIntervalRanges = (intervals) => {
  if (!Array.isArray(intervals) || intervals.length === 0) return [];
  const sorted = intervals
    .filter(interval => interval && interval.length === 2 && interval[1] > interval[0])
    .map(([start, end]) => [Number(start), Number(end)])
    .sort((a, b) => a[0] - b[0]);

  if (sorted.length === 0) return [];
  const merged = [sorted[0]];
  for (let index = 1; index < sorted.length; index += 1) {
    const [start, end] = sorted[index];
    const last = merged[merged.length - 1];
    if (start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
};

const sumIntervalHours = (intervals) => intervals.reduce(
  (sum, [start, end]) => sum + (end - start) / HOUR_MS,
  0
);

const splitIntervalByDay = (startDate, endDate, callback) => {
  let cursor = new Date(startDate);
  const end = new Date(endDate);
  while (cursor < end) {
    const dayStart = startOfDay(cursor);
    const nextDay = new Date(dayStart);
    nextDay.setDate(nextDay.getDate() + 1);
    const partStart = Math.max(cursor.getTime(), dayStart.getTime());
    const partEnd = Math.min(end.getTime(), nextDay.getTime());
    if (partStart < partEnd) callback(new Date(partStart), new Date(partEnd), dayStart);
    cursor = new Date(partEnd);
  }
};

const buildMonthAreas = (rows) => {
  if (!rows.length) return [];
  const areas = [];
  let currentMonth = rows[0].monthStr;
  let startIndex = 0;

  rows.forEach((row, index) => {
    if (row.monthStr !== currentMonth) {
      areas.push({
        month: currentMonth,
        startX: rows[startIndex].date,
        endX: rows[index - 1].date,
        isEven: areas.length % 2 === 0,
      });
      currentMonth = row.monthStr;
      startIndex = index;
    }
  });

  areas.push({
    month: currentMonth,
    startX: rows[startIndex].date,
    endX: rows[rows.length - 1].date,
    isEven: areas.length % 2 === 0,
  });
  return areas;
};

const calculateConcurrentSegments = (intervals, minimumConcurrency = 2) => {
  const events = [];
  intervals.forEach(({ start, end }) => {
    if (start instanceof Date && end instanceof Date && end > start) {
      events.push({ time: start.getTime(), delta: 1 });
      events.push({ time: end.getTime(), delta: -1 });
    }
  });
  events.sort((a, b) => a.time - b.time);

  const segments = [];
  let active = 0;
  let previousTime = null;
  let index = 0;

  while (index < events.length) {
    const time = events[index].time;
    if (previousTime !== null && time > previousTime && active >= minimumConcurrency) {
      segments.push({ start: previousTime, end: time, concurrency: active });
    }

    let delta = 0;
    while (index < events.length && events[index].time === time) {
      delta += events[index].delta;
      index += 1;
    }
    active += delta;
    previousTime = time;
  }
  return segments;
};

const calculateOverlapSummary = (sessions) => {
  const segments = calculateConcurrentSegments(sessions.map(session => ({
    start: session.startDate,
    end: session.stopDate,
  })));

  const byDate = {};
  segments.forEach(segment => {
    splitIntervalByDay(new Date(segment.start), new Date(segment.end), (partStart, partEnd, dayStart) => {
      const key = formatDate(dayStart);
      if (!byDate[key]) {
        byDate[key] = { date: key, intervals: [], maxConcurrency: 2 };
      }
      byDate[key].intervals.push([partStart.getTime(), partEnd.getTime()]);
      byDate[key].maxConcurrency = Math.max(byDate[key].maxConcurrency, segment.concurrency);
    });
  });

  const details = Object.values(byDate)
    .map((item, index) => {
      const merged = mergeIntervalRanges(item.intervals);
      return {
        id: index + 1,
        date: item.date,
        overlapHours: sumIntervalHours(merged),
        count: merged.length,
        maxConcurrency: item.maxConcurrency,
      };
    })
    .sort((a, b) => parseDateOnly(a.date) - parseDateOnly(b.date));

  return {
    totalOverlap: segments.reduce((sum, segment) => sum + (segment.end - segment.start) / HOUR_MS, 0),
    details,
  };
};

const intersectHours = (intervals, windowStart, windowEnd) => intervals.reduce((sum, [start, end]) => {
  const overlapStart = Math.max(start, windowStart);
  const overlapEnd = Math.min(end, windowEnd);
  return sum + (overlapEnd > overlapStart ? (overlapEnd - overlapStart) / HOUR_MS : 0);
}, 0);

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
  const [timelineMonthAreas, setTimelineMonthAreas] = useState([]);
  const [pivotState, setPivotState] = useState(null);
  const [sessionDurations, setSessionDurations] = useState([]);
  const [timelineData, setTimelineData] = useState([]);
  const [overlapStats, setOverlapStats] = useState({ totalOverlap: 0, details: [] });
  const [selectedOverlapDay, setSelectedOverlapDay] = useState(null);
  const [showModelA, setShowModelA] = useState(false);
  const [fileError, setFileError] = useState('');
  const [loadedFileName, setLoadedFileName] = useState('');

  // ============ WCZYTYWANIE I ANALIZA CSV ============
  const handleFileUpload = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileError('');
    setLoadedFileName(file.name);

    const reader = new FileReader();
    reader.onerror = () => setFileError('Nie udało się odczytać pliku.');
    reader.onload = (loadEvent) => {
      try {
        const text = decodeCsvBuffer(loadEvent.target.result);
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) throw new Error('Plik nie zawiera rekordów danych.');

        const delimiter = detectDelimiter(lines[0]);
        const headers = parseCsvRow(lines[0], delimiter).map(normalizeHeader);

        const startIndex = findHeaderIndex(headers, ['start date', 'start_date'], ['uruchomienie', 'start']);
        const stopIndex = findHeaderIndex(headers, ['stop date', 'stop_date'], ['zakonczenie', 'stop']);
        const hoursIndex = findHeaderIndex(headers, ['godziny', 'hours', 'czas'], ['godzin', 'hours']);
        const userIndex = findHeaderIndex(headers, ['uruchamiajacy', 'user', 'kto'], ['uruchamiaj']);
        const reasonIndex = findHeaderIndex(headers, ['powod', 'komentarz', 'comment', 'uwagi'], ['powod', 'komentarz', 'comment']);

        if (startIndex === -1 || stopIndex === -1) {
          throw new Error('Nie znaleziono kolumn „Start date” i „Stop date”.');
        }

        const rawSessions = [];
        for (let rowIndex = 1; rowIndex < lines.length; rowIndex += 1) {
          const cells = parseCsvRow(lines[rowIndex], delimiter);
          const rawStart = cells[startIndex] || '';
          const rawStop = cells[stopIndex] || '';
          const startDate = parseDateTime(rawStart);
          const stopDate = parseDateTime(rawStop);

          // Pomijamy wiersze podsumowania („Razem”) i rekordy bez poprawnego start/stop.
          if (!startDate || !stopDate || stopDate <= startDate) continue;

          const rawHours = hoursIndex !== -1 ? cells[hoursIndex] || '' : '';
          const sourceHours = Number.parseFloat(String(rawHours).replace(',', '.'));
          const calculatedHours = (stopDate - startDate) / HOUR_MS;
          const startDay = startOfDay(startDate);

          rawSessions.push({
            id: rawSessions.length + 1,
            date: formatDate(startDate),
            hours: calculatedHours,
            sourceHours: Number.isFinite(sourceHours) ? sourceHours : null,
            user: userIndex !== -1 && cells[userIndex] ? cells[userIndex] : 'Nieznany',
            reason: reasonIndex !== -1 && cells[reasonIndex] ? cells[reasonIndex] : '',
            dayName: DAY_NAMES[startDay.getDay()],
            monthStr: MONTH_NAMES[startDay.getMonth()],
            dateObj: startDay,
            startDate,
            stopDate,
          });
        }

        if (rawSessions.length === 0) {
          throw new Error('Nie znaleziono poprawnych sesji start–stop.');
        }
        rawSessions.sort((a, b) => a.startDate - b.startDate);

        // ----- Aktywny czas bez podwójnego liczenia -----
        const dailyMap = {};
        rawSessions.forEach(session => {
          splitIntervalByDay(session.startDate, session.stopDate, (partStart, partEnd, dayStart) => {
            const key = formatDate(dayStart);
            if (!dailyMap[key]) {
              dailyMap[key] = { intervals: [], reasons: [], users: new Set(), dateObj: dayStart };
            }
            dailyMap[key].intervals.push([partStart.getTime(), partEnd.getTime()]);
            dailyMap[key].users.add(session.user);
            if (session.reason && !dailyMap[key].reasons.includes(session.reason)) {
              dailyMap[key].reasons.push(session.reason);
            }
          });
        });

        const formattedData = Object.entries(dailyMap)
          .map(([date, day]) => {
            const mergedIntervals = mergeIntervalRanges(day.intervals);
            return {
              date,
              hours: sumIntervalHours(mergedIntervals),
              unionHours: sumIntervalHours(mergedIntervals),
              otherHours: 0,
              intervals: mergedIntervals,
              dayName: DAY_NAMES[day.dateObj.getDay()],
              monthStr: MONTH_NAMES[day.dateObj.getMonth()],
              dateObj: day.dateObj,
              reason: day.reasons.join(' | '),
              user: Array.from(day.users).join(', '),
            };
          })
          .sort((a, b) => a.dateObj - b.dateObj);

        const firstDay = startOfDay(rawSessions[0].startDate);
        const latestStop = rawSessions.reduce(
          (latest, session) => session.stopDate > latest ? session.stopDate : latest,
          rawSessions[0].stopDate
        );
        const lastDay = endExclusiveDayForInterval(latestStop);

        // Pełna oś czasu – również dni bez aktywności.
        const timeline = [];
        for (let cursor = new Date(firstDay); cursor <= lastDay; cursor.setDate(cursor.getDate() + 1)) {
          const date = formatDate(cursor);
          const activeDay = dailyMap[date];
          const mergedIntervals = activeDay ? mergeIntervalRanges(activeDay.intervals) : [];
          timeline.push({
            date,
            hours: sumIntervalHours(mergedIntervals),
            dayName: DAY_NAMES[cursor.getDay()],
            monthStr: MONTH_NAMES[cursor.getMonth()],
            dateObj: new Date(cursor),
          });
        }

        // ----- Profil tygodnia -----
        const daysTotals = Object.fromEntries(DAY_ORDER.map(day => [day, 0]));
        formattedData.forEach(day => { daysTotals[day.dayName] += day.hours; });
        const weeklyArr = DAY_ORDER.map(day => ({ day, hours: daysTotals[day] }));

        // ----- Heatmap: dzielenie wielodniowych sesji + brak dubli -----
        const heatmapData = Object.fromEntries(
          DAY_ORDER.map(day => [day, Object.fromEntries(Array.from({ length: 24 }, (_, hour) => [hour, 0]))])
        );
        formattedData.forEach(day => {
          day.intervals.forEach(([intervalStart, intervalEnd]) => {
            const dayStartMs = day.dateObj.getTime();
            const startHour = (intervalStart - dayStartMs) / HOUR_MS;
            const endHour = (intervalEnd - dayStartMs) / HOUR_MS;
            for (let hour = Math.floor(startHour); hour < Math.ceil(endHour); hour += 1) {
              if (hour < 0 || hour > 23) continue;
              const partStart = Math.max(startHour, hour);
              const partEnd = Math.min(endHour, hour + 1);
              if (partEnd > partStart) heatmapData[day.dayName][hour] += partEnd - partStart;
            }
          });
        });
        const heatmapArr = DAY_ORDER.flatMap(day =>
          Array.from({ length: 24 }, (_, hour) => ({
            day,
            hour,
            value: heatmapData[day][hour],
          }))
        );

        // ----- Współbieżność liczona jako unikalny czas z >=2 sesjami -----
        const overlap = calculateOverlapSummary(rawSessions);

        // ----- Pivot: aktywny czas bez podwójnego liczenia -----
        const activeMonths = MONTH_NAMES.filter(month => formattedData.some(day => day.monthStr === month));
        const pivot = Object.fromEntries(DAY_ORDER.map(day => [
          day,
          { total: 0, ...Object.fromEntries(activeMonths.map(month => [month, 0])) },
        ]));
        const colTotals = { total: 0, ...Object.fromEntries(activeMonths.map(month => [month, 0])) };

        formattedData.forEach(day => {
          pivot[day.dayName][day.monthStr] += day.hours;
        });

        let maxGridVal = 0;
        let maxRowTotal = 0;
        DAY_ORDER.forEach(day => {
          activeMonths.forEach(month => {
            const value = pivot[day][month];
            pivot[day].total += value;
            colTotals[month] += value;
            maxGridVal = Math.max(maxGridVal, value);
          });
          colTotals.total += pivot[day].total;
          maxRowTotal = Math.max(maxRowTotal, pivot[day].total);
        });
        const maxColTotal = Math.max(...activeMonths.map(month => colTotals[month]), 0);

        // ----- Statystyki sesji (nie dni!) -----
        const sessionHours = rawSessions.map(session => session.hours);
        const sumSessionHours = sessionHours.reduce((sum, hours) => sum + hours, 0);
        const avgSessionHours = sumSessionHours / rawSessions.length;
        const medianSessionHours = median(sessionHours);
        const sessionStdDev = stddev(sessionHours);
        const maxSession = rawSessions.reduce(
          (max, session) => session.hours > max.hours ? session : max,
          rawSessions[0]
        );

        const totalActiveHours = formattedData.reduce((sum, day) => sum + day.hours, 0);
        const activeCalendarDays = formattedData.length;
        const activeWorkingDays = formattedData.filter(day => {
          const weekday = day.dateObj.getDay();
          return weekday >= 1 && weekday <= 5;
        }).length;
        const totalWorkingDays = timeline.filter(day => {
          const weekday = day.dateObj.getDay();
          return weekday >= 1 && weekday <= 5;
        }).length;

        // ----- Model A: rzeczywiste przecięcie aktywności z oknem 08:00–16:00 -----
        let usedInModelWindow = 0;
        timeline.forEach(day => {
          const weekday = day.dateObj.getDay();
          if (weekday < 1 || weekday > 5) return;
          const windowStart = new Date(day.dateObj);
          windowStart.setHours(MODEL_A_START_HOUR, 0, 0, 0);
          const windowEnd = new Date(day.dateObj);
          windowEnd.setHours(MODEL_A_END_HOUR, 0, 0, 0);
          const intervals = dailyMap[day.date] ? mergeIntervalRanges(dailyMap[day.date].intervals) : [];
          usedInModelWindow += intersectHours(intervals, windowStart.getTime(), windowEnd.getTime());
        });

        const modelWindowHours = totalWorkingDays * (MODEL_A_END_HOUR - MODEL_A_START_HOUR);
        const modelWindowUtilizationRate = modelWindowHours > 0 ? usedInModelWindow / modelWindowHours : 0;
        const activeWorkingDayRate = totalWorkingDays > 0 ? activeWorkingDays / totalWorkingDays : 0;
        const modelDowntime = Math.max(0, modelWindowHours - usedInModelWindow);
        const outsideModelWindowHours = Math.max(0, totalActiveHours - usedInModelWindow);
        const maxActiveDay = formattedData.reduce(
          (max, day) => day.hours > max.hours ? day : max,
          formattedData[0]
        );

        setData(formattedData);
        setSessions(rawSessions);
        setSessionDurations(sessionHours);
        setTimelineData(timeline);
        setHourlyHeatmap(heatmapArr);
        setOverlapStats(overlap);
        setSelectedOverlapDay(overlap.details.length
          ? overlap.details.reduce((max, day) => day.overlapHours > max.overlapHours ? day : max).date
          : null);
        setMonthAreas(buildMonthAreas(formattedData));
        setTimelineMonthAreas(buildMonthAreas(timeline));
        setWeeklyStats(weeklyArr);
        setPivotState({
          months: activeMonths,
          rows: DAY_ORDER,
          data: pivot,
          colTotals,
          maxGridVal,
          maxRowTotal,
          maxColTotal
        });
        setSummary({
          totalSessions: rawSessions.length,
          sumHours: sumSessionHours,
          totalHours: totalActiveHours,
          overlapHours: overlap.totalOverlap,
          duplicateInstanceHours: Math.max(0, sumSessionHours - totalActiveHours),
          avgSessionHours,
          medianSessionHours,
          sessionStdDev,
          maxSession,
          minSessionHours: Math.min(...sessionHours),
          activeCalendarDays,
          activeWorkingDays,
          totalWorkingDays,
          activeWorkingDayRate,
          modelWindowHours,
          usedInModelWindow,
          modelWindowUtilizationRate,
          modelDowntime,
          outsideModelWindowHours,
          maxActiveDay,
          periodStart: firstDay,
          periodEnd: lastDay,
        });
      } catch (error) {
        setData([]);
        setSessions([]);
        setSummary(null);
        setTimelineData([]);
        setHourlyHeatmap([]);
        setWeeklyStats([]);
        setMonthAreas([]);
        setTimelineMonthAreas([]);
        setSessionDurations([]);
        setOverlapStats({ totalOverlap: 0, details: [] });
        setSelectedOverlapDay(null);
        setPivotState(null);
        setFileError(error instanceof Error ? error.message : 'Nie udało się przeanalizować pliku.');
      }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
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

  const heatmapMax = useMemo(() => (
    Math.max(...hourlyHeatmap.map(item => item.value), 0.1)
  ), [hourlyHeatmap]);

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
            {(loadedFileName || fileError) && (
              <div className={`rounded-lg border px-3 py-2 text-[11px] ${fileError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-blue-50 border-blue-100 text-blue-700'}`}>
                {fileError ? `Błąd pliku: ${fileError}` : `Wczytano: ${loadedFileName}`}
              </div>
            )}
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
                  <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
                    <KPICard
                      icon={Activity}
                      label="Sesje"
                      value={summary.totalSessions}
                      sub={`${summary.activeCalendarDays} dni kalendarzowych aktywnych`}
                      color="blue"
                      tooltip="Jedna sesja = jeden ciągły przedział start–stop. W jednym dniu może wystąpić więcej niż jedna sesja."
                    />
                    <KPICard
                      icon={Calendar}
                      label="Dni robocze"
                      value={`${summary.activeWorkingDays} / ${summary.totalWorkingDays}`}
                      sub={`${fmtPct(summary.activeWorkingDayRate)} aktywnych`}
                      color="teal"
                      tooltip="Aktywne dni robocze / wszystkie dni robocze w analizowanym okresie. Dni weekendowe nie zwiększają licznika aktywnych dni roboczych."
                    />
                    <KPICard
                      icon={Clock}
                      label="Suma godzin sesji"
                      value={`${fmtNum(summary.sumHours)}h`}
                      sub={`czas aktywny bez dubli: ${fmtNum(summary.totalHours)}h`}
                      color="green"
                      tooltip="Suma długości wszystkich sesji. Czas aktywny bez dubli jest liczony jako suma unii przedziałów czasowych."
                    />
                    <KPICard
                      icon={Layers}
                      label="Współbieżność"
                      value={`${fmtNum(summary.overlapHours)}h`}
                      sub={summary.overlapHours > 0.05 ? 'unikalny czas z ≥2 sesjami' : 'brak wykrytych przecięć'}
                      color={summary.overlapHours > 0.05 ? 'red' : 'gray'}
                      tooltip="Unikalny czas, w którym jednocześnie działały co najmniej dwie sesje. Nie jest to suma wszystkich par przecięć, więc nie zawyża wyniku przy 3+ sesjach."
                    />
                    <KPICard
                      icon={BarChart3}
                      label="Średnia sesja"
                      value={`${fmtNum(summary.avgSessionHours)}h`}
                      sub={`σ = ${fmtNum(summary.sessionStdDev)}h`}
                      color="purple"
                      tooltip="Średnia liczona z długości pojedynczych sesji start–stop, a nie ze średniej aktywności dziennej."
                    />
                    <KPICard
                      icon={TrendingUp}
                      label="Mediana sesji"
                      value={`${fmtNum(summary.medianSessionHours)}h`}
                      sub="wartość środkowa"
                      color="purple"
                      tooltip="Mediana długości pojedynczej sesji; jest odporna na skrajnie długie sesje."
                    />
                    <KPICard
                      icon={Zap}
                      label="Najdłuższa sesja"
                      value={`${fmtNum(summary.maxSession.hours)}h`}
                      sub={formatDate(summary.maxSession.startDate)}
                      color="orange"
                      tooltip={`${formatDateTime(summary.maxSession.startDate)} → ${formatDateTime(summary.maxSession.stopDate)}${summary.maxSession.reason ? ` • ${summary.maxSession.reason}` : ''}`}
                    />
                    <KPICard
                      icon={Cloud}
                      label="Maks. aktywność dobowa"
                      value={`${fmtNum(summary.maxActiveDay.hours)}h`}
                      sub={summary.maxActiveDay.date}
                      color="orange"
                      tooltip="Maksymalny unikalny czas aktywności przypisany do jednego dnia kalendarzowego. To nie jest długość najdłuższej sesji."
                    />
                  </div>

                  {/* Model A – porównanie (cykliczny) */}
                  <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-3">
                    <div
                      className="flex items-center gap-2 cursor-pointer select-none"
                      onClick={() => setShowModelA(!showModelA)}
                    >
                      <div className="h-4 w-1 bg-teal-500 rounded-full" />
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        Model A – porównanie z oknem {String(MODEL_A_START_HOUR).padStart(2, '0')}:00–{String(MODEL_A_END_HOUR).padStart(2, '0')}:00
                      </span>
                      <span
                        className="relative inline-flex ml-1 cursor-help"
                        title="To założenie analityczne. Jeżeli harmonogram umowny ma inne godziny, zmień stałe MODEL_A_START_HOUR i MODEL_A_END_HOUR."
                      >
                        <Info size={12} className="text-gray-400 hover:text-gray-600" />
                      </span>
                      <span className="ml-auto">
                        {showModelA ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                      </span>
                    </div>
                    {showModelA && (
                      <>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-2">
                          <KPICard
                            icon={Calendar}
                            label="Aktywne dni robocze"
                            value={fmtPct(summary.activeWorkingDayRate)}
                            sub={`${summary.activeWorkingDays} z ${summary.totalWorkingDays} dni`}
                            color="teal"
                            tooltip="Udział dni roboczych, w których wystąpiła jakakolwiek aktywność. To wskaźnik dniowy, a nie godzinowy."
                          />
                          <KPICard
                            icon={Clock}
                            label="Wykorzystanie okna"
                            value={fmtPct(summary.modelWindowUtilizationRate)}
                            sub={`${fmtNum(summary.usedInModelWindow)} z ${fmtNum(summary.modelWindowHours)}h`}
                            color="teal"
                            tooltip="Aktywny czas będący przecięciem sesji z hipotetycznym oknem Modelu A / całkowity czas tego okna."
                          />
                          <KPICard
                            icon={Cloud}
                            label="Przestój w oknie"
                            value={`${fmtNum(summary.modelDowntime)}h`}
                            sub="czas okna bez realnej aktywności"
                            color="gray"
                            tooltip="Czas hipotetycznego okna Modelu A, który nie pokrywa się z żadną sesją. Godziny poza oknem nie pomniejszają tego wyniku."
                          />
                          <KPICard
                            icon={AlertCircle}
                            label="Aktywność poza oknem"
                            value={`${fmtNum(summary.outsideModelWindowHours)}h`}
                            sub="noce, weekendy lub godziny poza 08–16"
                            color="red"
                            tooltip="Unikalny czas aktywności, którego hipotetyczne okno Modelu A 08:00–16:00 nie obejmuje."
                          />
                        </div>
                        <p className="text-[9px] text-gray-400 mt-2">
                          ⚠️ To porównanie operacyjne, nie bieżące rozliczenie kosztowe. Wynik zależy od przyjętego okna godzinowego.
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
                    <span className="text-[9px] text-gray-400">{timelineData.length} dni kalendarzowych • {summary.activeCalendarDays} aktywnych</span>
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
                        {timelineMonthAreas.slice(1).map((area, idx) => (
                          <ReferenceLine key={`month-line-${idx}`} x={area.startX} stroke="#9ca3af" strokeDasharray="3 3" strokeWidth={1} />
                        ))}
                        {/* Oznaczenie dnia szczytowego */}
                        {summary?.maxActiveDay?.date && (
                          <>
                            <ReferenceLine x={summary.maxActiveDay.date} stroke="#f97316" strokeDasharray="5 5" strokeWidth={2} />
                            <ReferenceDot
                              x={summary.maxActiveDay.date}
                              y={summary.maxActiveDay.hours}
                              r={6}
                              fill="#f97316"
                              stroke="#fff"
                              strokeWidth={2}
                              label={{
                                value: 'maks. dzień',
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
                    Oś zawiera również dni z 0h • Linie pionowe = granice miesięcy • znacznik = dzień z największą unikalną aktywnością
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
                            return (
                              <React.Fragment key={day}>
                                <div className="text-[9px] font-medium text-gray-600 flex items-center justify-end pr-1">{day}</div>
                                {Array.from({ length: 24 }, (_, hour) => {
                                  const entry = dayData.find(d => d.hour === hour);
                                  const val = entry ? entry.value : 0;
                                  const intensity = heatmapMax > 0 ? Math.min(val / heatmapMax, 1) : 0;
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
                      Aktywność wielodniowa jest dzielona na właściwe dni i godziny • jedna wspólna skala kolorów dla całej heatmapy • przecięcia nie są liczone podwójnie
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
                        Przecięcia sesji
                      </h3>
                      <div className="text-right">
                        <span className="text-[9px] text-gray-400 block">
                          łącznie {fmtNum(overlapStats.totalOverlap)}h unikalnej współbieżności
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

                          const overlapIntervals = calculateConcurrentSegments(
                            daySessions.map(session => ({
                              start: new Date(Math.max(session.startDate.getTime(), dayStart.getTime())),
                              end: new Date(Math.min(session.stopDate.getTime(), dayEnd.getTime())),
                            }))
                          ).map(segment => [
                            (segment.start - dayStart.getTime()) / HOUR_MS,
                            (segment.end - dayStart.getTime()) / HOUR_MS,
                          ]);
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
                              key={`${item.date}-${item.id}`}
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

                          const overlapIntervals = calculateConcurrentSegments(
                            daySessions.map(session => ({
                              start: new Date(Math.max(session.startDate.getTime(), dayStart.getTime())),
                              end: new Date(Math.min(session.stopDate.getTime(), dayEnd.getTime())),
                            }))
                          ).map(segment => [
                            (segment.start - dayStart.getTime()) / HOUR_MS,
                            (segment.end - dayStart.getTime()) / HOUR_MS,
                          ]);

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
        <p>Created by Anastasiia Bzova &copy; {new Date().getFullYear()} — v0.6</p>
      </footer>
    </div>
  );
}

export default App;