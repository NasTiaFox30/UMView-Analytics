import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea, Cell } from 'recharts';
import { UploadCloud, Clock, Calendar, AlertCircle, TrendingUp } from 'lucide-react';

function App() {
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
      const text = event.target.result;
      const lines = text.split(/\r?\n/);
      
      const formattedData = [];
      let total = 0;
      let maxH = 0;
      let maxDate = null;

      const daysTotals = { 'Пн': 0, 'Вт': 0, 'Ср': 0, 'Чт': 0, 'Пт': 0, 'Сб': 0, 'Нд': 0 };
      const dayNames = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      const monthNames = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
      
      // За замовчуванням старі індекси (для першого файлу)
      let dataIdx = 5;
      let hoursIdx = 6;
      let reasonIdx = 7;

      // Читаємо перший непустий рядок (заголовки) і шукаємо реальні позиції
      const headerLine = lines.find(l => l.trim().length > 0);
      if (headerLine) {
        const headers = headerLine.split(';').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
        const hIdx = headers.indexOf('godziny');
        if (hIdx !== -1) {
          hoursIdx = hIdx;
          dataIdx = hIdx - 1; // Data завжди перед Godziny
          reasonIdx = hIdx + 1; // Komentarz/Powód завжди після Godziny
        }
      }

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const columns = lines[i].split(';').map(cell => cell.replace(/^"|"$/g, '').trim());
        
        // Використовуємо динамічні індекси замість жорстких 5, 6, 7
        const dateStr = columns[dataIdx];
        const hoursStr = columns[hoursIdx];
        const reason = columns[reasonIdx];

        if (!dateStr || dateStr.toLowerCase() === 'data' || dateStr.toLowerCase() === 'razem' || !hoursStr) continue;

        const hours = parseFloat(hoursStr.replace(',', '.')) || 0;
        
        let monthStr = '';
        let dayNameStr = '';
        const dateParts = dateStr.split('.');
        
        if (dateParts.length === 3) {
          const dateObj = new Date(dateParts[2], dateParts[1] - 1, dateParts[0]);
          dayNameStr = dayNames[dateObj.getDay()];
          daysTotals[dayNameStr] += hours;
          monthStr = monthNames[parseInt(dateParts[1], 10) - 1];
        }

        total += hours;
        if (hours > maxH) {
          maxH = hours;
          maxDate = dateStr;
        }

        formattedData.push({ date: dateStr, hours, reason, monthStr, dayName: dayNameStr });
      }

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
      const rowOrder = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
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

      const order = { 'Пн': 1, 'Вт': 2, 'Ср': 3, 'Чт': 4, 'Пт': 5, 'Сб': 6, 'Нд': 7 };
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
    
    reader.readAsText(file, 'UTF-8');
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
    <div className="min-h-screen bg-gray-50 p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <header className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Cloud OptiDash 🚀</h1>
            <p className="text-gray-500 text-sm mt-1">Дашборд оптимізації тестових середовищ</p>
          </div>
          <label className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg cursor-pointer hover:bg-blue-700 transition font-medium">
            <UploadCloud size={20} />
            <span>Завантажити CSV</span>
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>
        </header>

        {data.length > 0 ? (
          <div className="flex flex-col lg:flex-row gap-6">
            
            <div className="flex-1 space-y-6">
              
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800 mb-6">Тенденція навантаження на сервер</h2>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 30, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                      
                      {monthAreas.map((area, idx) => (
                        <ReferenceArea
                          key={idx}
                          x1={area.startX}
                          x2={area.endX}
                          fill={area.isEven ? '#f9fafb' : '#f3f4f6'}
                          fillOpacity={1}
                          label={{ position: 'insideTop', value: area.month, fill: '#6b7280', fontSize: 12, fontWeight: 600, dy: -20 }}
                        />
                      ))}

                      <XAxis 
                        dataKey="date" 
                        stroke="#9ca3af" 
                        fontSize={11} 
                        tickLine={false} 
                        axisLine={false}
                        tickFormatter={(val) => val.substring(0, 5)}
                      />
                      <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderRadius: '8px', border: 'none', color: '#fff' }} />
                      
                      <Bar dataKey="hours" name="Робочі години" radius={[4, 4, 0, 0]}>
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
              </div>

              {pivotState && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                  <h2 className="text-lg font-semibold text-gray-800 mb-4">Матриця навантаження (Дні vs Місяці)</h2>
                  
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600">
                        <th className="p-3 border border-gray-200 font-semibold text-gray-500">День \ Місяць</th>
                        {pivotState.months.map(m => (
                          <th key={m} className="p-3 border border-gray-200 font-semibold text-center">{m}</th>
                        ))}
                        <th className="p-3 border border-gray-200 font-bold text-center bg-gray-100">Razem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pivotState.rows.map(day => (
                        <tr key={day} className="hover:bg-gray-50 transition-colors">
                          <td className="p-3 border border-gray-200 font-medium text-gray-700 bg-gray-50">{day}</td>
                          
                          {pivotState.months.map(m => {
                            const val = pivotState.data[day][m];
                            return (
                              <td 
                                key={m} 
                                className={`p-3 border border-gray-200 text-center font-medium transition-colors ${getPivotCellClass(val, false)}`}
                              >
                                {val > 0 ? val.toFixed(2) : '-'}
                              </td>
                            );
                          })}
                          
                          {(() => {
                            const rTotal = pivotState.data[day].total;
                            const isMaxRowTotal = rTotal > 0 && rTotal === pivotState.maxRowTotal;
                            return (
                              <td className={`p-3 border border-gray-200 text-center font-bold transition-colors ${getPivotCellClass(rTotal, isMaxRowTotal)}`}>
                                {rTotal > 0 ? rTotal.toFixed(2) : '-'}
                              </td>
                            );
                          })()}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-bold text-gray-700">
                        <td className="p-3 border border-gray-200 text-gray-500 bg-gray-100">Razem</td>
                        {pivotState.months.map(m => {
                          const cTotal = pivotState.colTotals[m];
                          const isMaxColTotal = cTotal > 0 && cTotal === pivotState.maxColTotal;
                          return (
                            <td 
                              key={m} 
                              className={`p-3 border border-gray-200 text-center transition-colors ${getPivotCellClass(cTotal, isMaxColTotal)}`}
                            >
                              {cTotal > 0 ? cTotal.toFixed(2) : '-'}
                            </td>
                          );
                        })}
                        <td className="p-3 border border-gray-200 text-center bg-gray-200 text-blue-900 font-bold">
                          {pivotState.colTotals.total > 0 ? pivotState.colTotals.total.toFixed(2) : '-'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                  
                  <div className="flex items-center gap-3 mt-6 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-orange-500 rounded-sm"></div>
                      <span className="font-medium text-gray-700">Пікове навантаження (періоду)</span>
                    </div>
                    <div className="h-4 w-px bg-gray-300 mx-2"></div>
                    <span>Менше</span>
                    <div className="w-3 h-3 bg-white border border-gray-200 rounded-sm"></div>
                    <div className="w-3 h-3 bg-blue-100 rounded-sm"></div>
                    <div className="w-3 h-3 bg-blue-400 rounded-sm"></div>
                    <div className="w-3 h-3 bg-blue-600 rounded-sm"></div>
                    <div className="w-3 h-3 bg-blue-800 rounded-sm"></div>
                    <span>Більше</span>
                  </div>
                </div>
              )}
            </div>

            <div className="w-full lg:w-80 flex flex-col gap-6">
              
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Загальна стастика</h3>
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 rounded-lg flex items-center gap-4">
                    <div className="p-2 bg-blue-500 text-white rounded-md"><Clock size={20} /></div>
                    <div>
                      <p className="text-xs text-gray-500">Всього витрачено</p>
                      <p className="text-xl font-bold text-blue-900">{summary.totalHours} год</p>
                    </div>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-lg flex items-center gap-4">
                    <div className="p-2 bg-purple-500 text-white rounded-md"><Calendar size={20} /></div>
                    <div>
                      <p className="text-xs text-gray-500">Днів з тестами</p>
                      <p className="text-xl font-bold text-purple-900">{summary.activeDays} днів</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={18} className="text-gray-500" />
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Профіль тижня</h3>
                </div>
                
                <div className="space-y-2">
                  {weeklyStats.map((stat) => (
                    <div 
                      key={stat.day} 
                      className={`flex justify-between items-center p-2 rounded-lg ${stat.day === maxWeeklyDay ? 'bg-red-50 border border-red-100' : 'hover:bg-gray-50'}`}
                    >
                      <span className={`font-medium ${stat.day === maxWeeklyDay ? 'text-red-700' : 'text-gray-600'}`}>
                        {stat.day} {stat.day === maxWeeklyDay && '🔥'}
                      </span>
                      <span className={`text-sm ${stat.day === maxWeeklyDay ? 'font-bold text-red-700' : 'text-gray-500'}`}>
                        {stat.hours > 0 ? `${stat.hours} год` : '-'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        ) : (
          <div className="bg-white p-16 rounded-xl shadow-sm border border-gray-100 text-center text-gray-400 flex flex-col items-center justify-center gap-3">
            <UploadCloud size={40} className="text-gray-300" />
            <p className="font-medium text-gray-600">Очікування тестового файлу...</p>
            <p className="text-sm text-gray-400">Завантажте ваш CSV-файл для побудови дашборду.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;