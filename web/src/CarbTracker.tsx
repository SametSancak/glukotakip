import { useState, useEffect } from 'react';
import { Utensils, Search, Plus, Minus, X } from 'lucide-react';
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

interface FoodItem {
  id: string;
  name: string;
  category: string;
  carbs: number;
}

interface CartItem extends FoodItem {
  qty: number;
}

const TURKISH_FOODS: FoodItem[] = [
  { id: 'ekmek-tam', name: '1 dilim tam buğday ekmeği', category: 'Tahıl', carbs: 15 },
  { id: 'pirinc-pilav', name: '3 YK pirinç pilavı', category: 'Ana Yemek', carbs: 15 },
  { id: 'mercimek', name: '1 kase mercimek çorbası', category: 'Çorba', carbs: 15 },
  { id: 'elma', name: '1 orta boy elma', category: 'Meyve', carbs: 15 },
  { id: 'yogurt', name: '1 kase yoğurt', category: 'Süt Ürünü', carbs: 9 },
  { id: 'simit', name: '1/2 susamlı simit', category: 'Hamur İşi', carbs: 25 },
  { id: 'makarna', name: '4 YK makarna', category: 'Ana Yemek', carbs: 20 },
  { id: 'muz', name: '1 adet muz', category: 'Meyve', carbs: 23 },
  { id: 'bulgur', name: '3 YK bulgur pilavı', category: 'Ana Yemek', carbs: 15 },
  { id: 'beyaz-ekmek', name: '1 dilim beyaz ekmek', category: 'Tahıl', carbs: 15 },
  { id: 'kuru-fasulye', name: '1 porsiyon kuru fasulye', category: 'Bakliyat', carbs: 25 },
  { id: 'patates', name: '1 orta boy haşlanmış patates', category: 'Sebze', carbs: 20 },
  { id: 'ayran', name: '1 su bardağı ayran', category: 'Süt Ürünü', carbs: 5 },
  { id: 'cacik', name: '1 kase cacık', category: 'Süt Ürünü', carbs: 7 },
];

const MEAL_LABELS: Record<CarbLog['meal_type'], string> = {
  Kahvaltı: 'Kahvaltı',
  Öğle: 'Öğle Yemeği',
  Akşam: 'Akşam Yemeği',
  'Ara Öğün': 'Ara Öğün',
};

export default function CarbTracker() {
  const [logs, setLogs] = useState<CarbLog[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [mealType, setMealType] = useState<CarbLog['meal_type']>('Öğle');
  const [customName, setCustomName] = useState('');
  const [customCarbs, setCustomCarbs] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchCarbLogs = async () => {
    const { data } = await supabase
      .from('carb_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
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

  const filteredFoods = TURKISH_FOODS.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.category.toLowerCase().includes(search.toLowerCase())
  );

  const addToCart = (food: FoodItem) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === food.id);
      if (existing) {
        return prev.map((i) => (i.id === food.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { ...food, qty: 1 }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
    );
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const carbVal = Number(customCarbs);
    if (!customName.trim() || !carbVal || carbVal <= 0) return;

    addToCart({
      id: `custom-${Date.now()}`,
      name: customName.trim(),
      category: 'Özel',
      carbs: carbVal,
    });
    setCustomName('');
    setCustomCarbs('');
  };

  const totalCarbs = cart.reduce((acc, item) => acc + item.carbs * item.qty, 0);
  const totalExchanges = (totalCarbs / 15).toFixed(1);

  const handleSaveMeal = async () => {
    if (cart.length === 0 || saving) return;
    setSaving(true);

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const summaryText = cart.map((i) => `${i.qty}x ${i.name}`).join(', ');

    await supabase.from('carb_logs').insert({
      meal_name: summaryText,
      meal_type: mealType,
      carbs: totalCarbs,
      suggested_insulin: Number((totalCarbs / 15).toFixed(1)),
      time: timeStr,
    });

    setCart([]);
    setSaving(false);
    fetchCarbLogs();
  };

  const handleDeleteLog = async (id: string) => {
    await supabase.from('carb_logs').delete().eq('id', id);
    fetchCarbLogs();
  };

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden print:shadow-none print:border-slate-300">
      {/* Üst Başlık ve Arama */}
      <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Utensils className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-bold text-slate-900">Karbonhidrat (CHO) Sayacı</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Türk mutfağı besinleri ve 15g karbonhidrat değişim hesaplayıcı
          </p>
        </div>

        <div className="relative w-full sm:w-64 print:hidden">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Besin ara (ekmek, simit, pilav...)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition"
          />
        </div>
      </div>

      {/* Orta Alan: Sol Besin Listesi + Sağ Mevcut Öğün */}
      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Sol Sütun */}
        <div className="lg:col-span-7 p-5 border-b lg:border-b-0 lg:border-r border-slate-100 flex flex-col justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[290px] overflow-y-auto pr-1">
            {filteredFoods.map((food) => (
              <button
                key={food.id}
                type="button"
                onClick={() => addToCart(food)}
                className="flex items-center justify-between gap-2 p-3.5 rounded-xl border border-slate-200/90 hover:border-teal-400 hover:bg-teal-50/30 transition text-left cursor-pointer group"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-teal-800">
                    {food.name}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {food.category} • {(food.carbs / 15).toFixed(1)} değişim
                  </p>
                </div>
                <span className="shrink-0 bg-teal-50 text-teal-700 font-bold text-xs px-2.5 py-1 rounded-lg border border-teal-100">
                  +{food.carbs}g
                </span>
              </button>
            ))}
            {filteredFoods.length === 0 && (
              <p className="col-span-2 text-center text-xs text-slate-400 py-8">
                Aramanızla eşleşen besin bulunamadı. Aşağıdan özel besin ekleyebilirsiniz.
              </p>
            )}
          </div>

          {/* Özel Besin Ekleme */}
          <form
            onSubmit={handleAddCustom}
            className="pt-4 border-t border-slate-100 flex flex-wrap sm:flex-nowrap gap-2 print:hidden"
          >
            <input
              type="text"
              placeholder="Özel besin (ör. 1 kase cacık)"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="flex-1 min-w-[160px] px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <input
              type="number"
              min={1}
              step="0.5"
              placeholder="CHO (g)"
              value={customCarbs}
              onChange={(e) => setCustomCarbs(e.target.value)}
              className="w-24 px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              type="submit"
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2 rounded-xl transition cursor-pointer shrink-0"
            >
              + Ekle
            </button>
          </form>
        </div>

        {/* Sağ Sütun: Mevcut Öğün */}
        <div className="lg:col-span-5 p-5 bg-slate-50/60 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Mevcut Öğün
              </span>
              <select
                value={mealType}
                onChange={(e) => setMealType(e.target.value as CarbLog['meal_type'])}
                className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="Kahvaltı">Kahvaltı</option>
                <option value="Öğle">Öğle Yemeği</option>
                <option value="Akşam">Akşam Yemeği</option>
                <option value="Ara Öğün">Ara Öğün</option>
              </select>
            </div>

            <div className="min-h-[140px] max-h-[180px] overflow-y-auto space-y-2 pr-1">
              {cart.length === 0 ? (
                <div className="h-[140px] flex items-center justify-center text-xs text-slate-400 text-center">
                  Sepet boş. Soldaki listeden besin seçin.
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200/80 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{item.name}</p>
                      <p className="text-[11px] text-teal-600 font-medium">
                        {item.carbs * item.qty}g CHO
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateQty(item.id, -1)}
                        className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-5 text-center font-bold text-slate-700">{item.qty}</span>
                      <button
                        type="button"
                        onClick={() => updateQty(item.id, 1)}
                        className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Toplam Kartları ve Aksiyon Butonları */}
          <div className="pt-3 border-t border-slate-200/70 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Toplam CHO
                </span>
                <span className="text-xl font-bold text-teal-600 mt-0.5 block">
                  {totalCarbs} g
                </span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  15G Değişim
                </span>
                <span className="text-xl font-bold text-teal-600 mt-0.5 block">
                  {totalExchanges}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={handleSaveMeal}
                disabled={cart.length === 0 || saving}
                className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-xl transition cursor-pointer"
              >
                {saving ? 'Kaydediliyor...' : 'Öğünü Kaydet'}
              </button>
              <button
                type="button"
                onClick={() => setCart([])}
                className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold px-4 py-2.5 rounded-xl transition cursor-pointer"
              >
                Temizle
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Alt Şerit: Son Kaydedilen Öğünler */}
      <div className="px-5 py-4 bg-slate-50/70 border-t border-slate-100">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2.5">
          Son Kaydedilen Öğünler
        </h3>
        {logs.length === 0 ? (
          <p className="text-xs text-slate-400">Henüz kaydedilmiş öğün bulunmuyor.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200/80 text-xs max-w-full"
              >
                <span className="font-bold text-teal-700 shrink-0">
                  {log.carbs}g ({(Number(log.carbs) / 15).toFixed(1)} değ.)
                </span>
                <span className="font-semibold text-slate-800 shrink-0">
                  {MEAL_LABELS[log.meal_type] ?? log.meal_type}
                </span>
                <span className="text-slate-400 truncate max-w-[180px]" title={log.meal_name}>
                  {log.meal_name}
                </span>
                <button
                  type="button"
                  onClick={() => handleDeleteLog(log.id)}
                  title="Sil"
                  className="text-slate-300 hover:text-rose-500 transition cursor-pointer ml-1 print:hidden"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}