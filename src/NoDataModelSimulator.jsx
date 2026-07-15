import React, { useState } from 'react';
import { Compass, FileText } from 'lucide-react';
import { SelectField } from './simulatorShared';

// Heurystyka słowna — dla działów bez logów użycia (KS, BO). Nie liczy zł, tylko rekomenduje kierunek.
function qualitativeRecommendation({ freq, predict, latency }) {
  if (freq === 'rare' && predict === 'high') {
    return {
      model: 'On-demand z wyprzedzeniem',
      color: 'blue',
      reason: 'Rzadkie, zaplanowane wydarzenia — najprościej zamawiać środowisko z wyprzedzeniem na czas jego trwania, bez trzymania serwera "na wszelki wypadek" przez resztę roku.',
    };
  }
  if (latency === 'low' || (freq !== 'rare' && predict === 'low')) {
    return {
      model: 'Scale-to-Zero',
      color: 'teal',
      reason: 'Zgłoszenia nieprzewidywalne i/lub wymagają szybkiej reakcji — automatyczne wybudzanie na żądanie nie wymaga zgadywania harmonogramu i unika kosztu stałej dostępności.',
    };
  }
  if (freq === 'frequent' && predict === 'high') {
    return {
      model: 'Cykliczny, węższe okno',
      color: 'purple',
      reason: 'Regularne, przewidywalne zapotrzebowanie — cykliczna dostępność ma sens, ale prawdopodobnie w węższym oknie niż obecne pn–pt 8 godz.',
    };
  }
  return {
    model: 'Hybrydowy',
    color: 'orange',
    reason: 'Mieszany wzorzec — sensowna może być mała baza cykliczna na typowe godziny + doładowanie on-demand na szczyty.',
  };
}

const QUAL_OPTIONS = {
  freq: [
    { value: 'rare', label: 'Kilka razy w roku' },
    { value: 'occasional', label: 'Raz na kwartał / miesiąc' },
    { value: 'frequent', label: 'Co tydzień lub częściej' },
  ],
  predict: [
    { value: 'high', label: 'Wysoka — znamy termin z wyprzedzeniem' },
    { value: 'medium', label: 'Średnia — orientacyjnie wiadomo' },
    { value: 'low', label: 'Niska — zgłoszenia ad hoc' },
  ],
  latency: [
    { value: 'high', label: 'Wysoka — może poczekać kilkanaście minut' },
    { value: 'medium', label: 'Średnia' },
    { value: 'low', label: 'Niska — musi być prawie natychmiast' },
  ],
};

const QUAL_COLOR_CLASSES = {
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
  teal: 'bg-teal-50 border-teal-200 text-teal-700',
  purple: 'bg-purple-50 border-purple-200 text-purple-700',
  orange: 'bg-orange-50 border-orange-200 text-orange-700',
};

function QualitativeCard({ deptName, deptHint, value, onChange }) {
  const rec = qualitativeRecommendation(value);
  return (
    <div className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
      <p className="text-[13px] font-semibold text-gray-700">{deptName}</p>
      <p className="text-[11px] text-gray-400 mb-3">{deptHint}</p>
      <div className="space-y-2.5">
        <SelectField label="Częstotliwość" value={value.freq} onChange={(v) => onChange({ ...value, freq: v })} options={QUAL_OPTIONS.freq} />
        <SelectField label="Przewidywalność terminu" value={value.predict} onChange={(v) => onChange({ ...value, predict: v })} options={QUAL_OPTIONS.predict} />
        <SelectField label="Tolerancja na opóźnienie startu" value={value.latency} onChange={(v) => onChange({ ...value, latency: v })} options={QUAL_OPTIONS.latency} />
      </div>
      <div className={`mt-3 p-2.5 rounded-lg border ${QUAL_COLOR_CLASSES[rec.color]}`}>
        <p className="text-[11px] font-bold uppercase tracking-wide">Sugerowany kierunek: {rec.model}</p>
        <p className="text-[11px] leading-snug mt-1 opacity-90">{rec.reason}</p>
      </div>
    </div>
  );
}

export default function SimulatorKsBo() {
  // Domyślne wartości odzwierciedlają to, co wiadomo słownie:
  // BO — rzadkie, zaplanowane kampanie konsultacyjne ws. nowych programów miejskich.
  // KS — częste, doraźne konsultacje mieszkańców, trudne do przewidzenia z wyprzedzeniem.
  const [assessBO, setAssessBO] = useState({ freq: 'rare', predict: 'high', latency: 'high' });
  const [assessKS, setAssessKS] = useState({ freq: 'frequent', predict: 'low', latency: 'low' });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5">
        <Compass size={16} className="text-gray-500" />
        <h2 className="text-[15px] font-bold text-gray-800">Symulacja: KS i BO</h2>
      </div>
      <p className="text-[11px] text-gray-400 -mt-3">
        Działy bez prowadzonych raportów użycia — ocena kierunkowa na podstawie znanego wzorca pracy, bez liczb.
      </p>

      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
        <p className="text-[11px] text-gray-400 leading-snug mb-4">
          KS i BO nie prowadzą raportów, więc nie da się policzyć ich kosztów tak jak dla PIUW/OW/BIP. Zamiast zmyślonych liczb — kierunek rekomendacji na podstawie tego, co wiadomo słownie. Obecnie oba działy mają stały grafik pn–pt, 8 godz. — poniższe odpowiedzi pomagają ocenić, czy to uzasadnione.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <QualitativeCard
            deptName="BO"
            deptHint="Konsultacje ws. nowych programów miejskich — bardzo rzadkie kampanie."
            value={assessBO}
            onChange={setAssessBO}
          />
          <QualitativeCard
            deptName="KS"
            deptHint="Bieżące konsultacje dla mieszkańców — częstsze niż BO."
            value={assessKS}
            onChange={setAssessKS}
          />
        </div>
        <div className="flex items-start gap-2 mt-3 p-2.5 bg-gray-50 rounded-lg border border-gray-100">
          <FileText size={12} className="text-gray-400 mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-gray-500 leading-snug">
            Kierunek dla BO pokrywa się z rekomendacją nr 1 Wykonawcy (raport Atende, 03.07.2026): dostępność środowisk akceptacyjnych na żądanie, zgłaszana z wyprzedzeniem — zamiast stałej dostępności. To sygnał, że taki kierunek jest też do przyjęcia po stronie Wykonawcy, nie tylko wygodny dla nas.
          </p>
        </div>
      </div>
    </div>
  );
}
