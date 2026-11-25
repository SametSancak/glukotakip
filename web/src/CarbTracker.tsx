import { useState, useEffect } from 'react';
import { Utensils, Plus, Trash2, Calculator } from 'lucide-react';
import { supabase } from './supabase';

interface CarbLog {
  id: string;
  meal_name: string;
  meal_type: 'Kahvaltı' | 'Öğle' | 'Akşam' | 'Ara Öğün';
  carbs: number;
  suggested_insulin: number | null;
  time: string;
  created_at: string;
}

export default function CarbTracker() {
  const [logs, setLogs] = useState<CarbLog[]>([]);
  const [mealName, setMealName] = useState('');
  const [mealType, setMealType] = useState<'Kahvaltı' | 'Öğle' | 'Akşam' | 'Ara Öğün'>('Öğle');
  const [carbs, setCarbs] = useState('');
  const [carbRatio, setCarbRatio] = useState<number>(() => {
    const saved = localStorage.getItem('glukotakip_icr');
    return saved ? Number(saved) : 10;
  });

  const fetchCarbLogs = async () => {
    const { data } = await supabase
      .from('carb_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);
    if (data) setLogs(data as CarbLog[]);
  };

  useEffect(() => {
    fetchCarbLogs();

    const channel = supabase
      .channel('glukotakip-web-carbs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'carb_logs' },
        () => fetchCarbLogs()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleRatioChange = (val: string) => {
    const num = Math.max(1, Number(val) || 1);
    setCarbRatio(num);
    localStorage.setItem('glukotakip_icr', String(num));
  };

  const calculatedDose =
    carbs && Number(carbs) > 0 && carbRatio > 0
      ? Number((Number(carbs) / carbRatio).toFixed(1))
      : 0;

  const handleAddCarb = async (e: React.FormEvent) => {
    e.preventDefault();
    const carbVal = Number(carbs);
    if (!mealName.trim() || !carbVal || carbVal <= 0) return;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    await supabase.from('carb_logs').insert({
      meal_name: mealName.trim(),
      meal_type: mealType,
      carbs: carbVal,
      suggested_insulin: calculatedDose,
      time: timeStr,
    });

    setMealName('');
    setCarbs('');
    fetchCarbLogs();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('carb_logs').delete().eq('id', id);
    fetchCarbLogs();
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayTotalCarbs = logs
    .filter((l) => l.created_at?.startsWith(todayStr))
    .reduce((acc, item) => acc + Number(item.carbs), 0);

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="bg-amber-100 text-amber-700 p-2 rounded-xl">
            <Utensils className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-slate-800 text-base">Karbonhidrat (KH) Sayımı</h2>
            <p className="text-xs text-slate-500">Bugün Toplam: <strong className="text-slate-800">{todayTotalCarbs} g KH</strong></p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
          <Calculator className="w-3.5 h-3.5 text-teal-600" />
          <span className="text-slate-600">1 Ünite =</span>
          <input
            type="number"
            min={1}
            max={100}
            value={carbRatio}
            onChange={(e) => handleRatioChange(e.target.value)}
            className="w-12 text-center font-bold text-slate-800 bg-white border border-slate-300 rounded px-1 py-0.5"
          />
          <span className="text-slate-600">g KH</span>
        </div>
      </div>

      <form onSubmit={handleAddCarb} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
        <select
          value={mealType}
          onChange={(e) => setMealType(e.target.value as any)}
          className="sm:col-span-3 px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white"
        >
          <option value="Kahvaltı">Kahvaltı</option>
          <option value="Öğle">Öğle</option>
          <option value="Akşam">Akşam</option>
          <option value="Ara Öğün">Ara Öğün</option>
        </select>

        <input
          type="text"
          required
          placeholder="Öğün / Yiyecek (ör. 2 dilim ekmek + çorba)"
          value={mealName}
          onChange={(e) => setMealName(e.target.value)}
          className="sm:col-span-5 px-3 py-2 text-sm border border-slate-200 rounded-xl"
        />

        <div className="sm:col-span-2 relative">
          <input
            type="number"
            required
            min={1}
            step="0.5"
            placeholder="KH (g)"
            value={carbs}
            onChange={(e) => setCarbs(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
          />
        </div>

        <button
          type="submit"
          className="sm:col-span-2 bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Ekle
        </button>
      </form>

      {calculatedDose > 0 && (
        <div className="bg-teal-50 border border-teal-200 text-teal-800 text-xs px-3 py-2 rounded-xl flex items-center justify-between">
          <span>
            Girilen <strong>{carbs}g KH</strong> için önerilen bolus doz (1:{carbRatio}):
          </span>
          <strong className="text-sm">{calculatedDose} Ünite</strong>
        </div>
      )}

      <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
        {logs.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">Henüz karbonhidrat kaydı eklenmedi.</p>
        ) : (
          logs.map((item) => (
            <div key={item.id} className="py-2.5 flex items-center justify-between text-sm">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                    {item.meal_type}
                  </span>
                  <span className="font-medium text-slate-800">{item.meal_name}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">Saat: {item.time}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="font-bold text-slate-800">{item.carbs} g KH</div>
                  {item.suggested_insulin !== null && (
                    <div className="text-[11px] text-teal-600 font-semibold">
                      ~{item.suggested_insulin} Ünite
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="text-slate-300 hover:text-rose-500 p-1 cursor-pointer"
                  title="Sil"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}