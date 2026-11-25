
import { useState, useEffect, useRef } from 'react';
import {
  Bell,
  BellRing,
  Droplet,
  Plus,
  CheckCircle2,
  Clock,
  Trash2,
  Syringe,
  RotateCcw,
  Volume2,
  X,
  Download,
  Printer,
  MapPin,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';
import { supabase } from './supabase';
import CarbTracker from './CarbTracker';

interface InsulinReminder {
  id: string;
  name: string;
  dose: number;
  time: string;
  taken: boolean;
}

interface GlucoseLog {
  id: string;
  value: number;
  context: 'Açlık' | 'Tokluk' | 'Gece';
  time: string;
}

interface InjectionSite {
  id: string;
  label: string;
  group: 'Göbek' | 'Kol' | 'Bacak';
  x: number;
  y: number;
}

interface InjectionLog {
  id: string;
  site_id: string;
  label: string;
  time: string;
  date: string;
}

const INJECTION_SITES: InjectionSite[] = [
  { id: 'abdomen-tr', label: 'Göbek Sağ Üst', group: 'Göbek', x: 84, y: 122 },
  { id: 'abdomen-tl', label: 'Göbek Sol Üst', group: 'Göbek', x: 116, y: 122 },
  { id: 'abdomen-br', label: 'Göbek Sağ Alt', group: 'Göbek', x: 84, y: 148 },
  { id: 'abdomen-bl', label: 'Göbek Sol Alt', group: 'Göbek', x: 116, y: 148 },
  { id: 'arm-r', label: 'Sağ Kol', group: 'Kol', x: 46, y: 108 },
  { id: 'arm-l', label: 'Sol Kol', group: 'Kol', x: 154, y: 108 },
  { id: 'leg-r', label: 'Sağ Bacak', group: 'Bacak', x: 78, y: 215 },
  { id: 'leg-l', label: 'Sol Bacak', group: 'Bacak', x: 122, y: 215 },
];

function playAlarmSound() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.22);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.22);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + idx * 0.22 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.22 + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.22);
      osc.stop(ctx.currentTime + idx * 0.22 + 0.4);
    });
  } catch {
    // Tarayıcı otomatik ses oynatmayı engellerse sessiz geç
  }
}

export default function App() {
  const [reminders, setReminders] = useState<InsulinReminder[]>([]);
  const [logs, setLogs] = useState<GlucoseLog[]>([]);
  const [injectionLogs, setInjectionLogs] = useState<InjectionLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [insulinName, setInsulinName] = useState('');
  const [insulinDose, setInsulinDose] = useState('');
  const [insulinTime, setInsulinTime] = useState('08:00');

  const [newGlucose, setNewGlucose] = useState('');
  const [glucoseContext, setGlucoseContext] = useState<'Açlık' | 'Tokluk' | 'Gece'>('Açlık');
  const [hoveredLog, setHoveredLog] = useState<GlucoseLog | null>(null);

  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [activeAlarm, setActiveAlarm] = useState<InsulinReminder | null>(null);
  const triggeredRef = useRef<Set<string>>(new Set());

  const fetchAllData = async () => {
    setLoading(true);
    const [remRes, logRes, injRes] = await Promise.all([
      supabase.from('insulin_reminders').select('*').order('time', { ascending: true }),
      supabase.from('glucose_logs').select('*').order('created_at', { ascending: false }),
      supabase.from('injection_logs').select('*').order('created_at', { ascending: false }).limit(20),
    ]);

    if (remRes.data) setReminders(remRes.data);
    if (logRes.data) setLogs(logRes.data);
    if (injRes.data) setInjectionLogs(injRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchAllData();

    const channel = supabase
      .channel('glukotakip-web-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'insulin_reminders' },
        () => fetchAllData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'glucose_logs' },
        () => fetchAllData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'injection_logs' },
        () => fetchAllData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const lastSiteId = injectionLogs[0]?.site_id ?? null;
  const lastIndex = lastSiteId ? INJECTION_SITES.findIndex((s) => s.id === lastSiteId) : -1;
  const recommendedSite = INJECTION_SITES[(lastIndex + 1) % INJECTION_SITES.length];

  const logInjectionSite = async (site: InjectionSite) => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const dateStr = now.toLocaleDateString('tr-TR');

    const { data, error } = await supabase
      .from('injection_logs')
      .insert([{ site_id: site.id, label: site.label, time: timeStr, date: dateStr }])
      .select()
      .single();

    if (!error && data) {
      setInjectionLogs([data, ...injectionLogs].slice(0, 20));
    }
  };

  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setNotifPermission(result);
  };

  const triggerAlarm = (item: InsulinReminder) => {
    playAlarmSound();
    setActiveAlarm(item);

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('GlukoTakip - İnsülin Zamanı', {
        body: `${item.name} (${item.dose} Ünite) saati geldi (${item.time}). Önerilen bölge: ${recommendedSite.label}`,
      });
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const dateKey = `${now.toDateString()}-${hhmm}`;

      reminders.forEach((item) => {
        const key = `${item.id}-${dateKey}`;
        if (!item.taken && item.time === hhmm && !triggeredRef.current.has(key)) {
          triggeredRef.current.add(key);
          triggerAlarm(item);
        }
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [reminders, recommendedSite]);

  const addReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    const doseVal = Number(insulinDose);
    if (!insulinName.trim() || !doseVal || doseVal <= 0 || !insulinTime) return;

    const { data, error } = await supabase
      .from('insulin_reminders')
      .insert([{ name: insulinName.trim(), dose: doseVal, time: insulinTime, taken: false }])
      .select()
      .single();

    if (!error && data) {
      const updated = [...reminders, data].sort((a, b) => a.time.localeCompare(b.time));
      setReminders(updated);
      setInsulinName('');
      setInsulinDose('');
    }
  };

  const toggleTaken = async (id: string) => {
    const target = reminders.find((r) => r.id === id);
    if (!target) return;
    const nextVal = !target.taken;

    setReminders(reminders.map((r) => (r.id === id ? { ...r, taken: nextVal } : r)));
    await supabase.from('insulin_reminders').update({ taken: nextVal }).eq('id', id);
  };

  const deleteReminder = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setReminders(reminders.filter((r) => r.id !== id));
    await supabase.from('insulin_reminders').delete().eq('id', id);
  };

  const resetDay = async () => {
    setReminders(reminders.map((r) => ({ ...r, taken: false })));
    triggeredRef.current.clear();
    await supabase.from('insulin_reminders').update({ taken: false }).eq('taken', true);
  };

  const markAlarmTaken = async () => {
    if (!activeAlarm) return;
    if (activeAlarm.id !== 'test') {
      setReminders(reminders.map((r) => (r.id === activeAlarm.id ? { ...r, taken: true } : r)));
      await supabase.from('insulin_reminders').update({ taken: true }).eq('id', activeAlarm.id);
    }
    setActiveAlarm(null);
  };

  const snoozeAlarm = async () => {
    if (!activeAlarm) return;
    const [h, m] = activeAlarm.time.split(':').map(Number);
    const totalMin = (h * 60 + m + 15) % (24 * 60);
    const newTime = `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;

    setReminders(
      reminders
        .map((r) => (r.id === activeAlarm.id ? { ...r, time: newTime } : r))
        .sort((a, b) => a.time.localeCompare(b.time))
    );
    await supabase.from('insulin_reminders').update({ time: newTime }).eq('id', activeAlarm.id);
    setActiveAlarm(null);
  };

  const testAlarm = () => {
    const target = reminders.find((r) => !r.taken) || {
      id: 'test',
      name: 'Örnek İnsülin Dozu',
      dose: 8,
      time: 'Şimdi',
      taken: false,
    };
    triggerAlarm(target);
  };

  const addGlucose = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(newGlucose);
    if (!val || val < 20 || val > 600) return;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('glucose_logs')
      .insert([{ value: val, context: glucoseContext, time: timeStr }])
      .select()
      .single();

    if (!error && data) {
      setLogs([data, ...logs]);
      setNewGlucose('');
    }
  };

  const deleteLog = async (id: string) => {
    setLogs(logs.filter((l) => l.id !== id));
    if (hoveredLog?.id === id) setHoveredLog(null);
    await supabase.from('glucose_logs').delete().eq('id', id);
  };

  const avgGlucose = logs.length
    ? Math.round(logs.reduce((acc, item) => acc + item.value, 0) / logs.length)
    : 0;

  const inRangeCount = logs.filter((l) => l.value >= 70 && l.value <= 180).length;
  const tirPercent = logs.length ? Math.round((inRangeCount / logs.length) * 100) : 0;
  const minLogVal = logs.length ? Math.min(...logs.map((l) => l.value)) : 0;
  const maxLogVal = logs.length ? Math.max(...logs.map((l) => l.value)) : 0;

  const chartLogs = [...logs].slice(0, 14).reverse();
  const svgWidth = 640;
  const svgHeight = 220;
  const padLeft = 44;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 32;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const yMin = chartLogs.length ? Math.max(20, Math.min(55, ...chartLogs.map((l) => l.value)) - 10) : 40;
  const yMax = chartLogs.length ? Math.max(210, ...chartLogs.map((l) => l.value)) + 15 : 220;

  const getX = (idx: number) =>
    chartLogs.length <= 1 ? padLeft + plotW / 2 : padLeft + (idx / (chartLogs.length - 1)) * plotW;

  const getY = (val: number) => padTop + plotH - ((val - yMin) / (yMax - yMin)) * plotH;

  const y180 = getY(180);
  const y70 = getY(70);
  const polylinePoints = chartLogs.map((l, i) => `${getX(i)},${getY(l.value)}`).join(' ');
  const areaPath =
    chartLogs.length > 1
      ? `M ${getX(0)},${padTop + plotH} L ${chartLogs
          .map((l, i) => `${getX(i)},${getY(l.value)}`)
          .join(' L ')} L ${getX(chartLogs.length - 1)},${padTop + plotH} Z`
      : '';

  const exportToCSV = () => {
    const today = new Date().toLocaleDateString('tr-TR');
    const lines: string[] = [
      `GlukoTakip Doktor Raporu;Tarih: ${today};Ortalama Şeker: ${avgGlucose} mg/dL;Hedef Aralık (TIR): %${tirPercent}`,
      '',
      'KAN ŞEKERİ ÖLÇÜMLERİ',
      'Saat;Değer (mg/dL);Durum',
      ...logs.map((l) => `${l.time};${l.value};${l.context}`),
      '',
      'GÜNLÜK İNSÜLİN DOZLARI',
      'Saat;İnsülin Adı;Doz (Ünite);Durum',
      ...reminders.map((r) => `${r.time};${r.name};${r.dose};${r.taken ? 'Yapıldı' : 'Bekliyor'}`),
      '',
      'ENJEKSİYON BÖLGESİ GEÇMİŞİ',
      'Tarih;Saat;Bölge',
      ...injectionLogs.map((i) => `${i.date};${i.time};${i.label}`),
    ];

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `glukotakip-rapor-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 md:p-8 print:bg-white print:p-0">
      
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-100 print:shadow-none print:border-slate-300">
          <div className="flex items-center gap-3">
            <div className="bg-teal-600 text-white p-2.5 rounded-xl print:hidden">
              <Syringe className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">GlukoTakip</h1>
              <p className="text-xs text-slate-500">
                Bulut Senkronize Takip ({new Date().toLocaleDateString('tr-TR')})
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 print:hidden">
              <button
                onClick={fetchAllData}
                title="Buluttan verileri yenile"
                className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl flex items-center gap-1.5 font-medium transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Yenile
              </button>

              {notifPermission !== 'granted' ? (
                <button
                  onClick={requestNotificationPermission}
                  className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-3 py-2 rounded-xl flex items-center gap-1.5 font-medium transition cursor-pointer"
                >
                  <Bell className="w-3.5 h-3.5" /> İzin Ver
                </button>
              ) : (
                <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-2 rounded-xl flex items-center gap-1.5 font-medium">
                  <BellRing className="w-3.5 h-3.5" /> Açık
                </span>
              )}

              <button
                onClick={testAlarm}
                className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl flex items-center gap-1.5 font-medium transition cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" /> Test
              </button>

              <button
                onClick={exportToCSV}
                className="text-xs bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 px-3 py-2 rounded-xl flex items-center gap-1.5 font-medium transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Excel / CSV
              </button>

              <button
                onClick={() => window.print()}
                className="text-xs bg-slate-800 hover:bg-slate-900 text-white px-3 py-2 rounded-xl flex items-center gap-1.5 font-medium transition cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" /> Yazdır / PDF
              </button>
            </div>

            <div className="text-right pl-2 border-l border-slate-100">
              <span className="text-xs text-slate-500 block">Ortalama Şeker</span>
              <span className="text-lg font-bold text-teal-600">{avgGlucose} mg/dL</span>
            </div>
          </div>
        </header>

        {/* Trend Grafiği */}
        <section className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4 print:shadow-none print:border-slate-300">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-teal-600 print:hidden" />
              <h2 className="font-semibold text-slate-800">Kan Şekeri Trend Grafiği</h2>
            </div>

            {hoveredLog ? (
              <div className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg flex items-center gap-2">
                <span className="font-bold">{hoveredLog.value} mg/dL</span>
                <span className="text-slate-300">• {hoveredLog.context}</span>
                <span className="text-slate-400">({hoveredLog.time})</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-lg font-medium">
                  Hedef Aralıkta: %{tirPercent}
                </span>
                <span className="text-slate-500">
                  Min: <strong className="text-slate-700">{minLogVal}</strong>
                </span>
                <span className="text-slate-500">
                  Max: <strong className="text-slate-700">{maxLogVal}</strong>
                </span>
              </div>
            )}
          </div>

          {chartLogs.length === 0 ? (
            <p className="text-center text-xs text-slate-400 py-10">
              Grafiği görmek için en az bir kan şekeri ölçümü ekle.
            </p>
          ) : (
            <div className="w-full overflow-x-auto">
              <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-52 min-w-105">
                <defs>
                  <linearGradient id="glucoseFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0d9488" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#0d9488" stopOpacity="0.01" />
                  </linearGradient>
                </defs>

                <rect
                  x={padLeft}
                  y={y180}
                  width={plotW}
                  height={Math.max(0, y70 - y180)}
                  fill="#10b981"
                  fillOpacity="0.08"
                  rx="4"
                />

                <line x1={padLeft} y1={y180} x2={svgWidth - padRight} y2={y180} stroke="#f43f5e" strokeOpacity="0.45" strokeDasharray="4 4" />
                <text x={padLeft - 6} y={y180 + 4} textAnchor="end" className="fill-rose-500 text-[10px] font-medium">180</text>

                <line x1={padLeft} y1={y70} x2={svgWidth - padRight} y2={y70} stroke="#f59e0b" strokeOpacity="0.55" strokeDasharray="4 4" />
                <text x={padLeft - 6} y={y70 + 4} textAnchor="end" className="fill-amber-600 text-[10px] font-medium">70</text>

                {areaPath && <path d={areaPath} fill="url(#glucoseFill)" />}

                {chartLogs.length > 1 && (
                  <polyline fill="none" stroke="#0d9488" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={polylinePoints} />
                )}

                {chartLogs.map((log, i) => {
                  const cx = getX(i);
                  const cy = getY(log.value);
                  const dotColor = log.value > 180 ? '#e11d48' : log.value < 70 ? '#d97706' : '#059669';
                  const isHovered = hoveredLog?.id === log.id;

                  return (
                    <g key={log.id} onMouseEnter={() => setHoveredLog(log)} onMouseLeave={() => setHoveredLog(null)} className="cursor-pointer">
                      <circle cx={cx} cy={cy} r={isHovered ? 7 : 5} fill={dotColor} stroke="#ffffff" strokeWidth="2" className="transition-all" />
                      <text x={cx} y={cy - 10} textAnchor="middle" className="fill-slate-600 text-[10px] font-semibold">{log.value}</text>
                      <text x={cx} y={svgHeight - 10} textAnchor="middle" className="fill-slate-400 text-[10px]">{log.time}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </section>
          <CarbTracker />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* İnsülin Hatırlatıcıları */}
          <section className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4 print:shadow-none print:border-slate-300">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-teal-600 print:hidden" />
                <h2 className="font-semibold text-slate-800">Günlük İnsülin Dozları</h2>
              </div>
              <button onClick={resetDay} className="text-xs text-slate-500 hover:text-teal-600 flex items-center gap-1 transition cursor-pointer print:hidden">
                <RotateCcw className="w-3.5 h-3.5" /> Günü Sıfırla
              </button>
            </div>

            <form onSubmit={addReminder} className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-100 print:hidden">
              <input
                type="text"
                placeholder="İnsülin adı (Örn: Akşam Hızlı Etkili)"
                value={insulinName}
                onChange={(e) => setInsulinName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <div className="flex flex-wrap gap-2">
                <input
                  type="time"
                  value={insulinTime}
                  onChange={(e) => setInsulinTime(e.target.value)}
                  className="px-2.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <input
                  type="number"
                  placeholder="Ünite"
                  min="1"
                  max="100"
                  value={insulinDose}
                  onChange={(e) => setInsulinDose(e.target.value)}
                  className="w-24 px-2.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <button type="submit" className="flex-1 bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-lg flex items-center justify-center gap-1 text-sm font-medium transition cursor-pointer">
                  <Plus className="w-4 h-4" /> Ekle
                </button>
              </div>
            </form>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 print:max-h-none print:overflow-visible">
              {reminders.length === 0 && <p className="text-center text-xs text-slate-400 py-4">Henüz insülin hatırlatıcısı eklenmedi.</p>}
              {reminders.map((item) => (
                <div
                  key={item.id}
                  onClick={() => toggleTaken(item.id)}
                  className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition ${
                    item.taken ? 'bg-teal-50 border-teal-200 text-teal-900' : 'bg-slate-50 border-slate-200 hover:border-teal-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className={`w-5 h-5 shrink-0 ${item.taken ? 'text-teal-600' : 'text-slate-300'}`} />
                    <div>
                      <p className={`font-medium text-sm ${item.taken ? 'line-through opacity-75' : ''}`}>{item.name}</p>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {item.time}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm bg-white px-2.5 py-1 rounded-lg border border-slate-200">{item.dose} Ü</span>
                    <button onClick={(e) => deleteReminder(e, item.id)} className="text-slate-400 hover:text-rose-500 p-1 transition cursor-pointer print:hidden">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Kan Şekeri Kaydı */}
          <section className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4 print:shadow-none print:border-slate-300">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Droplet className="w-5 h-5 text-rose-500 print:hidden" />
              <h2 className="font-semibold text-slate-800">Kan Şekeri Ölçümleri</h2>
            </div>

            <form onSubmit={addGlucose} className="flex flex-wrap gap-2 print:hidden">
              <input
                type="number"
                placeholder="mg/dL (Örn: 115)"
                value={newGlucose}
                onChange={(e) => setNewGlucose(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <select
                value={glucoseContext}
                onChange={(e) => setGlucoseContext(e.target.value as 'Açlık' | 'Tokluk' | 'Gece')}
                className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="Açlık">Açlık</option>
                <option value="Tokluk">Tokluk</option>
                <option value="Gece">Gece</option>
              </select>
              <button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white px-3.5 py-2 rounded-xl flex items-center gap-1 text-sm font-medium transition cursor-pointer">
                <Plus className="w-4 h-4" /> Ekle
              </button>
            </form>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1 print:max-h-none print:overflow-visible">
              {logs.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <span className={`font-bold text-base ${log.value > 180 ? 'text-rose-600' : log.value < 70 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {log.value} mg/dL
                    </span>
                    <span className="ml-2 text-xs bg-white px-2 py-0.5 rounded-md border border-slate-200 text-slate-600">{log.context}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{log.time}</span>
                    <button onClick={() => deleteLog(log.id)} className="text-slate-400 hover:text-rose-500 transition cursor-pointer print:hidden">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Enjeksiyon Bölgesi Rotasyon Haritası */}
        <section className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4 print:shadow-none print:border-slate-300">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-teal-600 print:hidden" />
              <h2 className="font-semibold text-slate-800">Enjeksiyon Bölgesi Rotasyon Haritası</h2>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500 print:hidden">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Son Kullanılan</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Önerilen</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="flex flex-col items-center justify-center bg-slate-50 rounded-2xl p-4 border border-slate-100 print:hidden">
              <svg viewBox="0 0 200 280" className="w-48 h-64 select-none">
                <circle cx="100" cy="34" r="20" fill="#e2e8f0" />
                <path d="M72 64 C72 58 128 58 128 64 L144 74 L164 134 C166 140 154 144 150 138 L136 96 L132 166 L138 258 C138 265 122 265 120 258 L104 184 L96 184 L80 258 C78 265 62 265 62 258 L68 166 L64 96 L50 138 C46 144 34 140 36 134 L56 74 Z" fill="#e2e8f0" />
                <circle cx="100" cy="135" r="2.5" fill="#94a3b8" />

                {INJECTION_SITES.map((site) => {
                  const isLast = site.id === lastSiteId;
                  const isRecommended = site.id === recommendedSite.id;
                  return (
                    <g key={site.id} onClick={() => logInjectionSite(site)} className="cursor-pointer group">
                      {isRecommended && <circle cx={site.x} cy={site.y} r="13" className="fill-emerald-400/40 animate-ping" />}
                      <circle cx={site.x} cy={site.y} r="9" className={`transition-all stroke-2 stroke-white ${isLast ? 'fill-rose-500' : isRecommended ? 'fill-emerald-500' : 'fill-slate-400 group-hover:fill-teal-500'}`} />
                      <title>{site.label} - Kaydetmek için tıkla</title>
                    </g>
                  );
                })}
              </svg>
              <p className="text-xs text-slate-400 mt-1">Enjeksiyon yaptığın noktaya tıklayarak kaydet</p>
            </div>

            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-emerald-700 block">Bir Sonraki Önerilen Bölge</span>
                  <span className="text-lg font-bold text-emerald-900">{recommendedSite.label}</span>
                </div>
                <button onClick={() => logInjectionSite(recommendedSite)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3.5 py-2 rounded-xl transition cursor-pointer print:hidden">
                  Buraya Yaptım
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 print:hidden">
                {INJECTION_SITES.map((site) => {
                  const isLast = site.id === lastSiteId;
                  const isRecommended = site.id === recommendedSite.id;
                  return (
                    <button
                      key={site.id}
                      onClick={() => logInjectionSite(site)}
                      className={`text-left px-3 py-2 rounded-xl text-xs font-medium border transition cursor-pointer ${
                        isLast ? 'bg-rose-50 border-rose-200 text-rose-700' : isRecommended ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-teal-300'
                      }`}
                    >
                      {site.label}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Son Enjeksiyon Geçmişi</h3>
                {injectionLogs.length === 0 ? (
                  <p className="text-xs text-slate-400">Henüz bölge kaydı yapılmadı.</p>
                ) : (
                  <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                    {injectionLogs.slice(0, 5).map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-xs bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                        <span className="font-medium text-slate-700">{item.label}</span>
                        <span className="text-slate-400">{item.date} • {item.time}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <p className="text-center text-xs text-slate-400">Bu uygulama tıbbi tavsiye vermez, yalnızca kişisel takip amaçlıdır.</p>
      </div>

      {activeAlarm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-5 border border-slate-100">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-teal-100 text-teal-600 p-3 rounded-xl animate-bounce">
                  <BellRing className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">İnsülin Zamanı!</h3>
                  <p className="text-xs text-slate-500">Saat: {activeAlarm.time}</p>
                </div>
              </div>
              <button onClick={() => setActiveAlarm(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center space-y-1">
              <p className="font-semibold text-slate-800">{activeAlarm.name}</p>
              <p className="text-2xl font-bold text-teal-600">{activeAlarm.dose} Ünite</p>
              <p className="text-xs text-emerald-700 font-medium pt-1">Önerilen Bölge: {recommendedSite.label}</p>
            </div>

            <div className="flex gap-2">
              <button onClick={markAlarmTaken} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white py-2.5 rounded-xl font-medium text-sm transition cursor-pointer">
                Dozu Yaptım
              </button>
              {activeAlarm.id !== 'test' && (
                <button onClick={snoozeAlarm} className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl font-medium text-sm transition cursor-pointer">
                  15 dk Ertele
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}