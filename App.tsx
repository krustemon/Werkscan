import React, { useState, useEffect, useMemo } from 'react';
import { LayoutDashboard, Package, BarChart3, History, Zap, Moon, Sun, Archive, ShoppingBag, Search, ChevronRight, Filter, DollarSign, PieChart as PieIcon, ArrowUpRight, Settings, Trash2, Wrench } from 'lucide-react';
import Scanner from './components/Scanner';
import ResultView from './components/ResultView';
import SettingsView from './components/SettingsView';
import { ViewState, AdAnalysis, HistoryItem, AppSettings } from './types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, CartesianGrid } from 'recharts';
import { getHistory, saveHistoryItem, deleteHistoryItem } from './services/storageService';

// --- THEME CONFIG ---
const LOADING_IMAGE_URL = "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?q=80&w=2670&auto=format&fit=crop"; 

const parsePrice = (priceStr: string): number => {
  try {
    const numbers = priceStr.match(/(\d+[.,]?\d*)/g);
    if (!numbers) return 0;
    const parsedNumbers = numbers.map(n => parseFloat(n.replace(',', '.')));
    if (parsedNumbers.length === 0) return 0;
    if (parsedNumbers.length === 1) return parsedNumbers[0];
    const sum = parsedNumbers.reduce((a, b) => a + b, 0);
    return sum / parsedNumbers.length;
  } catch (e) {
    return 0;
  }
};

const DEFAULT_SETTINGS: AppSettings = {
  providers: [
    { id: 'gemini', name: 'Google Gemini', apiKey: '', isEnabled: true, model: 'gemini-2.5-flash' },
    { id: 'openrouter', name: 'OpenRouter (Fallback)', apiKey: '', isEnabled: true, model: 'google/gemini-2.0-flash-lite-preview-02-05:free' },
    { id: 'blackbox', name: 'Blackbox AI', apiKey: '', isEnabled: true, model: 'blackboxai' }
  ]
};

const App: React.FC = () => {
  // Loading Screen State
  const [isLoadingApp, setIsLoadingApp] = useState(true);

  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  const [previousView, setPreviousView] = useState<ViewState>(ViewState.DASHBOARD);
  const [currentResult, setCurrentResult] = useState<AdAnalysis | null>(null);
  const [currentImages, setCurrentImages] = useState<string[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Settings bleiben im LocalStorage (da klein)
  const [appSettings, setAppSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('werkaholic_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          providers: DEFAULT_SETTINGS.providers.map(def => {
             const existing = parsed.providers?.find((p: any) => p.id === def.id);
             return existing ? { ...def, ...existing } : def;
          })
        };
      }
      return DEFAULT_SETTINGS;
    } catch (e) {
      return DEFAULT_SETTINGS;
    }
  });

  // History State - initial leer, wird async geladen
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Initial Data Load (IndexedDB + Migration)
  useEffect(() => {
    const initData = async () => {
      try {
        // 1. Migration: Prüfen ob alte Daten im LocalStorage sind
        // Safe check to avoid crashing if LS is corrupt
        let legacyHistory = null;
        try {
            legacyHistory = localStorage.getItem('werkaholic_history');
        } catch(e) { console.error("LS access failed", e); }

        if (legacyHistory) {
          try {
            const parsed = JSON.parse(legacyHistory);
            if (Array.isArray(parsed) && parsed.length > 0) {
              console.log(`Migriere ${parsed.length} Items nach IndexedDB...`);
              for (const item of parsed) {
                await saveHistoryItem(item);
              }
            }
          } catch (e) {
            console.error("Fehler bei Migration:", e);
          } finally {
            // Immer löschen, wenn etwas da war, um Quota zu fixen
             try {
                localStorage.removeItem('werkaholic_history');
             } catch(e) {}
          }
        }

        // 2. Laden aus IndexedDB
        const items = await getHistory();
        // Sortierung nach ID (Timestamp) absteigend -> Neueste zuerst
        items.sort((a, b) => Number(b.id) - Number(a.id));
        setHistory(items);
      } catch (e) {
        console.error("DB Init Failed:", e);
      }
    };

    // Parallel: Daten laden UND Mindestladezeit für Animation abwarten
    const minLoadTime = new Promise(resolve => setTimeout(resolve, 2500));
    
    Promise.all([initData(), minLoadTime]).then(() => {
      setIsLoadingApp(false);
    });

    document.documentElement.classList.add('dark');
  }, []);

  const handleSaveSettings = (newSettings: AppSettings) => {
    setAppSettings(newSettings);
    try {
      localStorage.setItem('werkaholic_settings', JSON.stringify(newSettings));
    } catch (e: any) {
      if (e.name === 'QuotaExceededError') {
         // Notfall: Versuche Platz zu schaffen
         try { localStorage.removeItem('werkaholic_history'); } catch(e){}
         try { localStorage.setItem('werkaholic_settings', JSON.stringify(newSettings)); } catch(e) { alert("Einstellungen konnten nicht gespeichert werden (Speicher voll)."); }
      }
    }
  };

  const analyticsData = useMemo(() => {
    const totalItems = history.length;
    const totalValue = history.reduce((acc, item) => acc + parsePrice(item.analysis.price_estimate), 0);
    const averageValue = totalItems > 0 ? totalValue / totalItems : 0;
    const categoryCount: Record<string, number> = {};
    history.forEach(item => {
      const cat = item.analysis.category || "Sonstige";
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });
    const categoryData = Object.keys(categoryCount).map(key => ({
      name: key,
      value: categoryCount[key]
    })).sort((a, b) => b.value - a.value);
    const priceDistribution = history.map((item, index) => ({
      name: `Item ${index + 1}`,
      value: parsePrice(item.analysis.price_estimate)
    })).slice(0, 20);
    return { totalItems, totalValue, averageValue, categoryData, priceDistribution };
  }, [history]);

  const handleAnalysisComplete = (result: AdAnalysis, image: string, additionalImages: string[] = []) => {
    const newId = Date.now().toString();
    const newItem: HistoryItem = {
      id: newId,
      image,
      additionalImages: additionalImages,
      date: new Date().toLocaleDateString('de-DE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }),
      analysis: result
    };
    
    // Optimistic UI Update
    setHistory(prev => [newItem, ...prev]);
    setCurrentResult(result);
    setCurrentImages([image, ...additionalImages]);
    setCurrentId(newId);

    // Async Save to DB
    saveHistoryItem(newItem).catch(err => console.error("Fehler beim Speichern:", err));
  };

  const handleUpdateResult = (updatedAnalysis: AdAnalysis, updatedImages?: string[]) => {
    if (!currentId) return;
    
    setCurrentResult(updatedAnalysis);
    if (updatedImages) setCurrentImages(updatedImages);

    // Optimistic Update
    setHistory(prev => prev.map(item => {
      if (item.id === currentId) {
        // Fallback if all images deleted
        const safeImages = updatedImages && updatedImages.length > 0 ? updatedImages : (item.image ? [item.image] : []);
        
        const updatedItem = {
          ...item,
          analysis: updatedAnalysis,
          image: safeImages[0], 
          additionalImages: safeImages.slice(1)
        };
        // Async Save Update
        saveHistoryItem(updatedItem).catch(err => console.error("Fehler beim Update:", err));
        return updatedItem;
      }
      return item;
    }));
  };

  const handleDeleteItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    
    // Optimistic Delete
    setHistory(prev => prev.filter(item => item.id !== id));
    
    // Async Delete from DB
    deleteHistoryItem(id).catch(err => console.error("Fehler beim Löschen:", err));

    if (currentId === id) {
      if (view === ViewState.RESULTS) {
        setView(previousView);
      }
      setCurrentResult(null);
      setCurrentId(null);
    }
  };

  const handleOpenItem = (item: HistoryItem) => {
    setCurrentResult(item.analysis);
    const allImages = [item.image, ...(item.additionalImages || [])];
    setCurrentImages(allImages);
    setCurrentId(item.id);
    setPreviousView(view);
    setView(ViewState.RESULTS);
  };

  // --- RENDER LOADING SCREEN ---
  if (isLoadingApp) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-oil-950 overflow-hidden">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0">
          <img 
            src={LOADING_IMAGE_URL} 
            className="w-full h-full object-cover opacity-60 filter contrast-125 sepia-[0.2]" 
            alt="Werkaholic Workshop" 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-oil-950 via-oil-950/80 to-transparent"></div>
        </div>

        <div className="relative z-10 flex flex-col items-center">
          <div className="mb-6 animate-fade-in">
            <div className="bg-rust-600 p-3 rounded-xl shadow-2xl shadow-rust-600/30 rotate-3">
              <Wrench className="w-12 h-12 text-white" />
            </div>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-black text-white uppercase tracking-widest font-industrial mb-2 drop-shadow-xl">
            Werkaholic <span className="text-rust-500">AI</span>
          </h1>
          <p className="text-stone-400 text-sm tracking-[0.3em] uppercase mb-12">
            Professional Valuation Tools
          </p>

          <div className="w-64 h-1.5 bg-stone-800 rounded-full overflow-hidden border border-stone-700">
             <div className="h-full bg-rust-500 animate-[width_2s_ease-out] w-full origin-left"></div>
          </div>
          <style>{`
            @keyframes width { from { width: 0%; } to { width: 100%; } }
          `}</style>
          
          <p className="mt-4 text-xs text-stone-500 animate-pulse">Initialisiere Datenbank...</p>
        </div>
      </div>
    );
  }

  // --- MAIN APP RENDER ---

  const renderSidebar = () => (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-oil-950 border-r border-stone-800 h-screen sticky top-0 z-40">
        <div className="p-6">
          <div className="flex items-center gap-2 cursor-pointer mb-10">
            <div className="bg-rust-600 rounded-lg p-1.5 shadow-lg shadow-rust-600/20">
               <Zap className="w-5 h-5 text-white" fill="currentColor" />
            </div>
            <span className="font-bold text-xl tracking-wide text-white font-industrial uppercase">
              Werkaholic <span className="text-rust-500">AI</span>
            </span>
          </div>
          
          <nav className="space-y-2">
            {[
              { id: ViewState.DASHBOARD, icon: LayoutDashboard, label: 'Dashboard' },
              { id: ViewState.INVENTORY, icon: Package, label: 'Warenbestand' },
              { id: ViewState.ANALYTICS, icon: BarChart3, label: 'Auswertung' },
              { id: ViewState.SETTINGS, icon: Settings, label: 'Einstellungen' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all font-medium border border-transparent ${
                  view === item.id 
                    ? 'bg-rust-600/10 text-rust-500 border-rust-600/30' 
                    : 'text-stone-400 hover:bg-stone-800 hover:text-white'
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-6 border-t border-stone-800">
           <div className="flex items-center justify-between bg-stone-900 p-3 rounded-lg border border-stone-800">
              <div className="flex items-center gap-3">
                 <div className="w-8 h-8 bg-stone-800 rounded-full flex items-center justify-center text-rust-500 text-xs font-bold border border-stone-700">
                    MA
                 </div>
                 <div className="text-sm">
                    <p className="font-bold text-white font-industrial">Pro Account</p>
                    <p className="text-xs text-stone-500 truncate w-24">Max Mustermann</p>
                 </div>
              </div>
           </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-oil-900 border-t border-stone-800 flex justify-around p-3 z-50 pb-safe-area">
        {[
          { id: ViewState.DASHBOARD, icon: LayoutDashboard, label: 'Scan' },
          { id: ViewState.INVENTORY, icon: Package, label: 'Bestand' },
          { id: ViewState.ANALYTICS, icon: BarChart3, label: 'Daten' },
          { id: ViewState.SETTINGS, icon: Settings, label: 'Settings' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className={`flex flex-col items-center gap-1 text-xs font-medium transition-colors ${
              view === item.id ? 'text-rust-500' : 'text-stone-500'
            }`}
          >
            <item.icon className={`w-6 h-6 ${view === item.id ? 'stroke-current' : 'stroke-current'}`} />
            {item.label}
          </button>
        ))}
      </div>
    </>
  );

  const renderDashboard = () => (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 animate-fade-in pb-24 md:pb-12 max-w-7xl mx-auto flex flex-col h-full">
      <div className="flex justify-between items-center mb-2 md:hidden">
         <div className="flex items-center gap-2">
            <div className="bg-rust-600 rounded-lg p-1">
               <Zap className="w-4 h-4 text-white" fill="currentColor" />
            </div>
            <span className="font-bold text-lg text-white font-industrial">WERKAHOLIC AI</span>
         </div>
      </div>

      <div className="flex flex-col md:grid md:grid-cols-2 lg:grid-cols-3 gap-6 h-auto md:h-[calc(100vh-140px)] lg:h-[600px]">
         {/* Scanner Area */}
         <div className="md:col-span-1 lg:col-span-2 h-[50vh] md:h-full rounded-2xl shadow-xl overflow-hidden bg-black border border-stone-800 relative ring-1 ring-white/5">
            <Scanner 
                onAnalysisComplete={handleAnalysisComplete} 
                onCancel={() => {}} 
                isEmbedded={true}
                settings={appSettings}
            />
         </div>

         {/* Quick Access */}
         <div className="md:col-span-1 lg:col-span-1 h-auto md:h-full max-h-[500px] md:max-h-full bg-oil-800 rounded-2xl shadow-sm border border-stone-700/50 flex flex-col overflow-hidden">
            <div className="p-4 md:p-5 border-b border-stone-700 flex justify-between items-center bg-stone-900/50">
               <h3 className="font-bold text-stone-200 flex items-center gap-2 font-industrial uppercase">
                 <History className="w-5 h-5 text-rust-500" />
                 Schnellzugriff
               </h3>
               <button onClick={() => setView(ViewState.INVENTORY)} className="text-xs font-medium text-rust-500 hover:text-rust-400">
                 ALLE
               </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar bg-oil-800">
               {history.slice(0, 10).map(item => (
                   <div key={item.id} onClick={() => handleOpenItem(item)} className="flex items-center gap-3 p-2 hover:bg-stone-700/50 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-stone-600 group">
                      <img src={item.image} className="w-12 h-12 rounded bg-stone-900 object-cover opacity-80 group-hover:opacity-100" />
                      <div className="flex-1 min-w-0">
                         <p className="text-sm font-semibold text-stone-200 truncate">{item.analysis.title}</p>
                         <p className="text-xs text-rust-400 font-bold">{item.analysis.price_estimate}</p>
                      </div>
                      <div className="flex items-center gap-1">
                          <button 
                            onClick={(e) => handleDeleteItem(e, item.id)}
                            className="p-2 text-stone-500 hover:text-red-500 hover:bg-red-900/20 rounded-md transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                      </div>
                   </div>
               ))}
               {history.length === 0 && (
                 <div className="text-center p-8 text-stone-600 text-sm">Keine Scans vorhanden.</div>
               )}
            </div>
         </div>
      </div>
    </div>
  );

  const renderInventory = () => {
    const filteredHistory = history.filter(item => 
      item.analysis.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.analysis.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="p-4 md:p-8 space-y-6 animate-fade-in pb-24 md:pb-12 max-w-7xl mx-auto h-full flex flex-col">
         <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2 font-industrial uppercase">
                <Package className="w-6 h-6 text-rust-500" />
                Warenbestand
              </h1>
              <p className="text-stone-400 text-sm mt-1">
                Verwalte deine {history.length} erfassten Produkte
              </p>
            </div>
            
            <div className="flex gap-2 w-full md:w-auto">
               <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-stone-500" />
                  <input 
                    type="text" 
                    placeholder="Suchen..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-oil-800 border border-stone-700 rounded-lg text-sm focus:ring-1 focus:ring-rust-500 outline-none text-white placeholder-stone-600"
                  />
               </div>
               <button className="p-2 bg-oil-800 border border-stone-700 rounded-lg text-stone-400 hover:text-rust-500">
                  <Filter className="w-5 h-5" />
               </button>
            </div>
         </div>

         <div className="flex-1 overflow-y-auto bg-oil-800 rounded-2xl shadow-sm border border-stone-700/50">
            {filteredHistory.length > 0 ? (
              <div className="divide-y divide-stone-700">
                 {filteredHistory.map((item) => (
                   <div key={item.id} onClick={() => handleOpenItem(item)} className="p-3 md:p-4 hover:bg-stone-700/30 transition-colors flex items-start md:items-center gap-3 md:gap-4 group cursor-pointer">
                      <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-stone-900 relative border border-stone-700">
                         <img src={item.image} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                         {item.additionalImages && item.additionalImages.length > 0 && (
                            <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 rounded flex items-center">
                               +{item.additionalImages.length}
                            </div>
                         )}
                      </div>
                      
                      <div className="flex-1 min-w-0 flex flex-col md:grid md:grid-cols-3 gap-1 md:gap-4 md:items-center">
                         <div className="md:col-span-2">
                            <h3 className="font-bold text-stone-200 truncate text-base line-clamp-2 md:line-clamp-1">{item.analysis.title}</h3>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                               <span className="text-xs bg-stone-900 text-stone-400 px-2 py-0.5 rounded border border-stone-700">
                                 {item.analysis.category}
                               </span>
                               <span className="text-xs text-stone-500">{item.date}</span>
                            </div>
                         </div>
                         <div className="flex items-center justify-between md:justify-end gap-4 mt-1 md:mt-0">
                            <div className="text-left md:text-right">
                               <p className="font-bold text-rust-500 font-mono">{item.analysis.price_estimate}</p>
                               <p className="text-xs text-stone-500">{item.analysis.condition}</p>
                            </div>
                         </div>
                      </div>

                      <div className="flex flex-col md:flex-row items-center gap-2 ml-2">
                         <button onClick={() => handleOpenItem(item)} className="p-2 text-rust-500 hover:bg-rust-900/20 rounded hidden md:block" title="Details">
                            <ArrowUpRight className="w-5 h-5" />
                         </button>
                         <button onClick={(e) => handleDeleteItem(e, item.id)} className="p-2 text-stone-500 hover:text-red-500 hover:bg-red-900/20 rounded transition-colors" title="Löschen">
                            <Trash2 className="w-5 h-5" />
                         </button>
                      </div>
                   </div>
                 ))}
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-stone-600">
                 <Package className="w-12 h-12 mb-4 opacity-20" />
                 <p>Keine Produkte gefunden.</p>
              </div>
            )}
         </div>
      </div>
    );
  };

  const renderAnalytics = () => (
    <div className="p-4 md:p-8 space-y-6 animate-fade-in pb-24 md:pb-12 max-w-7xl mx-auto">
       <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2 font-industrial uppercase">
              <BarChart3 className="w-6 h-6 text-rust-500" />
              Auswertung
            </h1>
          </div>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          <div className="bg-gradient-to-br from-rust-600 to-rust-800 text-white p-6 rounded-2xl shadow-lg shadow-rust-900/50 relative overflow-hidden border border-rust-500/30">
             <div className="relative z-10">
               <p className="text-rust-100 text-sm font-medium mb-1 uppercase tracking-wider">Gesamtwert</p>
               <h2 className="text-3xl md:text-4xl font-black font-mono">{analyticsData.totalValue.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})}</h2>
             </div>
             <DollarSign className="absolute right-[-20px] bottom-[-20px] w-32 h-32 text-black/20 rotate-12" />
          </div>

          <div className="bg-oil-800 p-6 rounded-2xl shadow-sm border border-stone-700/50 flex flex-col justify-center">
             <div className="flex justify-between items-start">
                <div>
                   <p className="text-stone-400 text-sm font-bold uppercase tracking-wider mb-2">Produkte</p>
                   <h2 className="text-3xl md:text-4xl font-black text-white">{analyticsData.totalItems}</h2>
                </div>
                <div className="p-3 bg-stone-900 rounded-lg text-stone-400 border border-stone-700">
                   <Package className="w-6 h-6" />
                </div>
             </div>
          </div>

          <div className="bg-oil-800 p-6 rounded-2xl shadow-sm border border-stone-700/50 flex flex-col justify-center">
             <div className="flex justify-between items-start">
                <div>
                   <p className="text-stone-400 text-sm font-bold uppercase tracking-wider mb-2">Ø Wert</p>
                   <h2 className="text-3xl md:text-4xl font-black text-white font-mono">{analyticsData.averageValue.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})}</h2>
                </div>
             </div>
          </div>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-oil-800 p-6 rounded-2xl shadow-sm border border-stone-700/50">
             <h3 className="text-lg font-bold text-white mb-6 font-industrial">Kategorien</h3>
             <div className="h-64">
               <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                    <Pie
                      data={analyticsData.categoryData}
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {analyticsData.categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={['#ea580c', '#57534e', '#d97706', '#78716c', '#b45309'][index % 5]} />
                      ))}
                    </Pie>
                    <Tooltip 
                       contentStyle={{backgroundColor: '#1c1917', borderRadius: '8px', border: '1px solid #44403c', color: '#fff'}}
                       itemStyle={{color: '#fff'}}
                    />
                 </PieChart>
               </ResponsiveContainer>
             </div>
          </div>

          <div className="bg-oil-800 p-6 rounded-2xl shadow-sm border border-stone-700/50">
             <h3 className="text-lg font-bold text-white mb-6 font-industrial">Werteverteilung</h3>
             <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                   <AreaChart data={analyticsData.priceDistribution}>
                      <defs>
                         <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ea580c" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#ea580c" stopOpacity={0}/>
                         </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#292524" />
                      <XAxis hide dataKey="name" />
                      <YAxis 
                         axisLine={false} 
                         tickLine={false} 
                         tick={{fill: '#78716c', fontSize: 12}} 
                         tickFormatter={(val) => `${val}€`}
                      />
                      <Tooltip 
                         contentStyle={{backgroundColor: '#1c1917', borderRadius: '8px', border: '1px solid #44403c', color: '#fff'}}
                         itemStyle={{color: '#ea580c'}}
                         labelStyle={{display: 'none'}}
                      />
                      <Area type="monotone" dataKey="value" stroke="#ea580c" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                   </AreaChart>
                </ResponsiveContainer>
             </div>
          </div>
       </div>
    </div>
  );

  return (
    <div className={`min-h-screen bg-oil-950 flex font-sans transition-colors duration-200 text-stone-200 selection:bg-rust-500 selection:text-white`}>
      {renderSidebar()}
      <main className="flex-1 overflow-auto w-full relative">
        {view === ViewState.DASHBOARD && renderDashboard()}
        {view === ViewState.INVENTORY && renderInventory()}
        {view === ViewState.ANALYTICS && renderAnalytics()}
        {view === ViewState.SETTINGS && (
          <SettingsView 
            settings={appSettings} 
            onSave={handleSaveSettings}
            onBack={() => setView(ViewState.DASHBOARD)}
          />
        )}
        {view === ViewState.RESULTS && currentResult && (currentImages.length > 0 || currentResult) && (
          <div className="absolute inset-0 bg-oil-950 z-50 overflow-y-auto">
            <ResultView 
              result={currentResult} 
              images={currentImages} 
              onBack={() => setView(previousView)} 
              onSave={handleUpdateResult}
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;