import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea, Cell } from 'recharts';
import { UploadCloud, Clock, Calendar, TrendingUp, LayoutDashboard, Calculator } from 'lucide-react';
import ModelSimulator from './ModelSimulator';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState({ totalHours: 0, activeDays: 0, avgHours: 0 });
  const [weeklyStats, setWeeklyStats] = useState([]);
  const [maxHoursVal, setMaxHoursVal] = useState(0);
  const [maxDayDate, setMaxDayDate] = useState(null);
  const [monthAreas, setMonthAreas] = useState([]); 
  const [pivotState, setPivotState] = useState(null);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target.result;

      let text;
      try {
        text = new TextDecoder('windows-1250').decode(buffer);
      } catch (err) {
        text = new TextDecoder('utf-8').decode(buffer);
      }

      const lines = text.split(/\r?\n/);
      
      const formattedData = [];
      let total = 0;
      let maxH = 0;
      let maxDate = null;

      const daysTotals = { 'Pn': 0, 'Wt': 0, 'Śr': 0, 'Cz': 0, 'Pt': 0, 'Sb': 0, 'Nd': 0 };
      const dayNames = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];
      const monthNames = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
      
      let dataIdx = 5;
      let hoursIdx = 6;
      let reasonIdx = 7;

      const headerLine = lines.find(l => l.trim().length > 0);
      if (headerLine) {
        const headers = headerLine.split(';').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
        const hIdx = headers.indexOf('godziny');
        if (hIdx !== -1) {
          hoursIdx = hIdx;
          dataIdx = hIdx - 1; 
          reasonIdx = hIdx + 1; 
        }
      }

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const columns = lines[i].split(';').map(cell => cell.replace(/^"|"$/g, '').trim());
        
        const dateStr = columns[dataIdx];
        const hoursStr = columns[hoursIdx];
        const reason = columns[reasonIdx];

        if (!dateStr || dateStr.toLowerCase() === 'data' || dateStr.toLowerCase() === 'razem' || !hoursStr) continue;

        const hours = parseFloat(hoursStr.replace(',', '.')) || 0;
        
        let monthStr = '';
        let dayNameStr = '';
        let dateObj = null;
        const dateParts = dateStr.split('.');
        
        if (dateParts.length === 3) {
          dateObj = new Date(dateParts[2], dateParts[1] - 1, dateParts[0]);
          dayNameStr = dayNames[dateObj.getDay()];
          daysTotals[dayNameStr] += hours;
          monthStr = monthNames[parseInt(dateParts[1], 10) - 1];
        }

        total += hours;
        if (hours > maxH) {
          maxH = hours;
          maxDate = dateStr;
        }

        formattedData.push({ date: dateStr, hours, reason, monthStr, dayName: dayNameStr, dateObj });
      }

      formattedData.sort((a, b) => (a.dateObj?.getTime() || 0) - (b.dateObj?.getTime() || 0));

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

      const activeMonthsSet = new Set();
      formattedData.forEach(d => { if(d.monthStr) activeMonthsSet.add(d.monthStr); });
      const activeMonths = monthNames.filter(m => activeMonthsSet.has(m)); 

      const pivot = {};
      const rowOrder = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];
      rowOrder.forEach(day => {
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

      let maxGridVal = 0;
      let maxRowTotal = 0;
      let maxColTotal = 0; 

      rowOrder.forEach(day => {
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

      activeMonths.forEach(m => {
        if (colTotals[m] > maxColTotal) maxColTotal = colTotals[m];
      });

      setPivotState({
        months: activeMonths,
        rows: rowOrder,
        data: pivot,
        colTotals,
        maxGridVal,
        maxRowTotal,
        maxColTotal 
      });

      const order = { 'Pn': 1, 'Wt': 2, 'Śr': 3, 'Cz': 4, 'Pt': 5, 'Sb': 6, 'Nd': 7 };
      const weeklyArray = Object.keys(daysTotals)
        .map(day => ({ day, hours: parseFloat(daysTotals[day].toFixed(2)) }))
        .sort((a, b) => order[a.day] - order[b.day]);

      setData(formattedData);
      setMaxHoursVal(maxH);
      setMaxDayDate(maxDate);
      setMonthAreas(mAreas);
      setWeeklyStats(weeklyArray);
      setSummary({
        totalHours: total.toFixed(2),
        activeDays: formattedData.length,
        avgHours: formattedData.length ? (total / formattedData.length).toFixed(2) : 0
      });
    };
    
    reader.readAsArrayBuffer(file);
  };

  const maxWeeklyDay = useMemo(() => {
    if (weeklyStats.length === 0) return null;
    return [...weeklyStats].sort((a, b) => b.hours - a.hours)[0].day;
  }, [weeklyStats]);

  const getPivotCellClass = (val, isHighlight) => {
    if (isHighlight) return 'bg-orange-500 text-white border-orange-600 shadow-inner font-bold';
    if (val === 0) return 'text-gray-300 bg-white';
    
    const ratio = val / pivotState.maxGridVal;
    if (ratio > 0.8) return 'bg-blue-800 text-white';
    if (ratio > 0.5) return 'bg-blue-600 text-white';
    if (ratio > 0.25) return 'bg-blue-400 text-blue-900';
    return 'bg-blue-100 text-blue-900';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 font-sans">
      <div className="max-w-7xl mx-auto space-y-4">
        
        <header className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-lg font-bold text-gray-800 leading-tight">UMView Analytics</h1>
            <p className="text-gray-500 text-[11px] mt-0.5">Dashboard optymalizacji środowisk testowych</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition ${activeTab === 'dashboard' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <LayoutDashboard size={14} /> Dashboard
              </button>
              <button
                onClick={() => setActiveTab('simulator')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition ${activeTab === 'simulator' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Calculator size={14} /> Symulator
              </button>
            </div>
            <label className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-blue-700 transition font-medium text-xs">
              <UploadCloud size={16} />
              <span>Prześlij CSV</span>
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </header>

        {activeTab === 'simulator' ? (
          <ModelSimulator rawData={data} pivotState={pivotState} monthAreas={monthAreas} />
        ) : data.length > 0 ? (
          <div className="flex flex-col lg:flex-row gap-4">
            
            <div className="flex-1 space-y-4">
              
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-[13px] font-semibold text-gray-800 mb-3">Trend obciążenia serwera</h2>
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                      
                      {monthAreas.map((area, idx) => (
                        <ReferenceArea
                          key={idx}
                          x1={area.startX}
                          x2={area.endX}
                          fill={area.isEven ? '#f9fafb' : '#f3f4f6'}
                          fillOpacity={1}
                          label={{ position: 'insideTop', value: area.month, fill: '#6b7280', fontSize: 10, fontWeight: 600, dy: -15 }}
                        />
                      ))}

                      <XAxis 
                        dataKey="date" 
                        stroke="#9ca3af" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        tickFormatter={(val) => val.substring(0, 5)}
                      />
                      <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '11px' }} />
                      
                      <Bar dataKey="hours" name="Godziny pracy" radius={[4, 4, 0, 0]}>
                        {data.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.date === maxDayDate ? '#f97316' : '#3b82f6'} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-2 mt-3 text-[10px] text-gray-500">
                    <div className="flex items-center gap-1">
                      <div className="w-2.5 h-2.5 bg-orange-500 rounded-sm"></div>
                      <span className="font-medium text-gray-700">Największa liczba godzin</span>
                    </div>
                  </div>
              </div>

              {pivotState && (
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                  <h2 className="text-[13px] font-semibold text-gray-800 mb-3">Macierz obciążenia (Dni vs Miesiące)</h2>
                  
                  <table className="w-full text-[11px] text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600">
                        <th className="p-1.5 border border-gray-200 font-semibold text-gray-500">Dzień \ Miesiąc</th>
                        {pivotState.months.map(m => (
                          <th key={m} className="p-1.5 border border-gray-200 font-semibold text-center">{m}</th>
                        ))}
                        <th className="p-1.5 border border-gray-200 font-bold text-center bg-gray-100">Razem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pivotState.rows.map(day => (
                        <tr key={day} className="hover:bg-gray-50 transition-colors">
                          <td className="p-1.5 border border-gray-200 font-medium text-gray-700 bg-gray-50">{day}</td>
                          
                          {pivotState.months.map(m => {
                            const val = pivotState.data[day][m];
                            return (
                              <td 
                                key={m} 
                                className={`p-1.5 border border-gray-200 text-center font-medium transition-colors ${getPivotCellClass(val, false)}`}
                              >
                                {val > 0 ? val.toFixed(2) : '-'}
                              </td>
                            );
                          })}
                          
                          {(() => {
                            const rTotal = pivotState.data[day].total;
                            const isMaxRowTotal = rTotal > 0 && rTotal === pivotState.maxRowTotal;
                            return (
                              <td className={`p-1.5 border border-gray-200 text-center font-bold transition-colors ${getPivotCellClass(rTotal, isMaxRowTotal)}`}>
                                {rTotal > 0 ? rTotal.toFixed(2) : '-'}
                              </td>
                            );
                          })()}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-bold text-gray-700">
                        <td className="p-1.5 border border-gray-200 text-gray-500 bg-gray-100">Razem</td>
                        {pivotState.months.map(m => {
                          const cTotal = pivotState.colTotals[m];
                          const isMaxColTotal = cTotal > 0 && cTotal === pivotState.maxColTotal;
                          return (
                            <td 
                              key={m} 
                              className={`p-1.5 border border-gray-200 text-center transition-colors ${getPivotCellClass(cTotal, isMaxColTotal)}`}
                            >
                              {cTotal > 0 ? cTotal.toFixed(2) : '-'}
                            </td>
                          );
                        })}
                        <td className="p-1.5 border border-gray-200 text-center bg-gray-200 text-blue-900 font-bold">
                          {pivotState.colTotals.total > 0 ? pivotState.colTotals.total.toFixed(2) : '-'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                  
                  <div className="flex items-center gap-2 mt-3 text-[10px] text-gray-500">
                    <div className="flex items-center gap-1">
                      <div className="w-2.5 h-2.5 bg-orange-500 rounded-sm"></div>
                      <span className="font-medium text-gray-700">Obciążenie szczytowe</span>
                    </div>
                    <div className="h-3 w-px bg-gray-300 mx-1"></div>
                    <span>Mniej</span>
                    <div className="w-2.5 h-2.5 bg-white border border-gray-200 rounded-sm"></div>
                    <div className="w-2.5 h-2.5 bg-blue-100 rounded-sm"></div>
                    <div className="w-2.5 h-2.5 bg-blue-400 rounded-sm"></div>
                    <div className="w-2.5 h-2.5 bg-blue-600 rounded-sm"></div>
                    <div className="w-2.5 h-2.5 bg-blue-800 rounded-sm"></div>
                    <span>Więcej</span>
                  </div>
                </div>
              )}
            </div>

            <div className="w-full lg:w-72 flex flex-col gap-4">
              
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Ogólne statystyki</h3>
                <div className="space-y-3">
                  <div className="p-3 bg-blue-50 rounded-lg flex items-center gap-3">
                    <div className="p-1.5 bg-blue-500 text-white rounded-md"><Clock size={16} /></div>
                    <div>
                      <p className="text-[10px] text-gray-500">Całkowity czas</p>
                      <p className="text-lg font-bold text-blue-900 leading-tight">{summary.totalHours} godz.</p>
                    </div>
                  </div>
                  <div className="p-3 bg-purple-50 rounded-lg flex items-center gap-3">
                    <div className="p-1.5 bg-purple-500 text-white rounded-md"><Calendar size={16} /></div>
                    <div>
                      <p className="text-[10px] text-gray-500">Dni z testami</p>
                      <p className="text-lg font-bold text-purple-900 leading-tight">{summary.activeDays} dni</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-1.5 mb-3">
                  <TrendingUp size={14} className="text-gray-500" />
                  <h3 className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">Profil tygodnia</h3>
                </div>
                
                <div className="space-y-1.5">
                  {weeklyStats.map((stat) => (
                    <div 
                      key={stat.day} 
                      className={`flex justify-between items-center px-2 py-1.5 rounded-md ${stat.day === maxWeeklyDay ? 'bg-red-50 border border-red-100' : 'hover:bg-gray-50'}`}
                    >
                      <span className={`text-[11px] font-medium ${stat.day === maxWeeklyDay ? 'text-red-700' : 'text-gray-600'}`}>
                        {stat.day} {stat.day === maxWeeklyDay && '🔥'}
                      </span>
                      <span className={`text-[11px] ${stat.day === maxWeeklyDay ? 'font-bold text-red-700' : 'text-gray-500'}`}>
                        {stat.hours > 0 ? `${stat.hours} godz.` : '-'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        ) : (
          <div className="bg-white p-12 rounded-xl shadow-sm border border-gray-100 text-center text-gray-400 flex flex-col items-center justify-center gap-2">
            <UploadCloud size={32} className="text-gray-300" />
            <p className="font-medium text-gray-600 text-sm">Oczekiwanie na plik testowy...</p>
            <p className="text-[11px] text-gray-400">Prześlij swój plik CSV, aby zbudować dashboard.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;