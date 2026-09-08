import React, { useState, useEffect } from 'react';
import { Save, Key, Shield, AlertTriangle, Check, RefreshCw, ShoppingBag, ExternalLink, Link2, CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';
import { AppSettings, ApiProviderConfig, TraderaConfig } from '../types';
import { fetchBlackboxModels } from '../services/geminiService';
import { 
  getTraderaConfig, 
  saveTraderaConfig, 
  getTraderaAuthUrl, 
  verifyTraderaConnection, 
  parseTraderaCallback 
} from '../services/traderaService';

interface SettingsViewProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onBack: () => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ settings, onSave, onBack }) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [showSuccess, setShowSuccess] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  // Tradera State
  const [traderaConfig, setTraderaConfig] = useState<TraderaConfig>(getTraderaConfig());
  const [isTestingTradera, setIsTestingTradera] = useState(false);
  const [traderaTestResult, setTraderaTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [manualTokenInput, setManualTokenInput] = useState('');
  const [activeTab, setActiveTab] = useState<'tradera' | 'ai'>('tradera');

  useEffect(() => {
    setTraderaConfig(getTraderaConfig());
  }, []);

  const handleProviderChange = (index: number, field: keyof ApiProviderConfig, value: any) => {
    const newProviders = [...localSettings.providers];
    newProviders[index] = { ...newProviders[index], [field]: value };
    setLocalSettings({ ...localSettings, providers: newProviders });
  };

  const handleFetchBlackboxModels = async (apiKey: string) => {
    if (!apiKey || apiKey.trim().length < 5) return;
    setIsFetchingModels(true);
    try {
      const models = await fetchBlackboxModels(apiKey);
      setFetchedModels(models);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleTraderaChange = (field: keyof TraderaConfig, value: any) => {
    const updated = { ...traderaConfig, [field]: value };
    setTraderaConfig(updated);
  };

  const handleSaveTradera = () => {
    const saved = saveTraderaConfig(traderaConfig);
    setTraderaConfig(saved);
  };

  const handleTestTraderaConnection = async () => {
    setIsTestingTradera(true);
    setTraderaTestResult(null);
    try {
      const result = await verifyTraderaConnection(traderaConfig);
      setTraderaTestResult(result);
      if (result.ok) {
        const updated = saveTraderaConfig({ ...traderaConfig, isConnected: true });
        setTraderaConfig(updated);
      }
    } catch (e: any) {
      setTraderaTestResult({
        ok: false,
        message: e?.message || 'Verbindungsfehler zur Tradera API'
      });
    } finally {
      setIsTestingTradera(false);
    }
  };

  const handleApplyPastedToken = () => {
    if (!manualTokenInput.trim()) return;
    const callbackData = parseTraderaCallback(manualTokenInput.trim());
    let newToken = manualTokenInput.trim();
    let newUserId = traderaConfig.userId;

    if (callbackData && callbackData.token) {
      newToken = callbackData.token;
      if (callbackData.userId) newUserId = callbackData.userId;
    }

    const updated = {
      ...traderaConfig,
      token: newToken,
      userId: newUserId,
      isConnected: Boolean(newToken && newUserId)
    };
    const saved = saveTraderaConfig(updated);
    setTraderaConfig(saved);
    setManualTokenInput('');
    setTraderaTestResult(null);
  };

  const saveSettings = () => {
    handleSaveTradera();
    onSave({ ...localSettings, tradera: traderaConfig });
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto animate-fade-in pb-24 md:pb-12 text-stone-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={onBack}
            className="p-2 rounded bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-white border border-stone-800 transition-colors"
            title="Zurück zum Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2 font-industrial uppercase">
              <Shield className="w-6 h-6 text-rust-500" /> Einstellungen
            </h1>
            <p className="text-stone-500 text-sm">Tradera Marktplatz &amp; KI-Dienste verwalten</p>
          </div>
        </div>

        <div className="flex gap-2 bg-oil-900 p-1 rounded-lg border border-stone-800">
          <button
            type="button"
            onClick={() => setActiveTab('tradera')}
            className={`px-4 py-2 rounded text-xs font-bold font-industrial uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'tradera' 
                ? 'bg-rust-600 text-white shadow-md' 
                : 'text-stone-400 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-4 h-4" /> Tradera
            {traderaConfig.isConnected ? (
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className={`px-4 py-2 rounded text-xs font-bold font-industrial uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'ai' 
                ? 'bg-rust-600 text-white shadow-md' 
                : 'text-stone-400 hover:text-white'
            }`}
          >
            <Key className="w-4 h-4" /> KI-Modell
          </button>
        </div>
      </div>

      {activeTab === 'tradera' && (
        <div className="space-y-6">
          {/* Status Card */}
          <div className={`rounded-xl border p-6 ${
            traderaConfig.isConnected 
              ? 'bg-emerald-950/20 border-emerald-800/60' 
              : 'bg-oil-800 border-stone-700'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg ${
                  traderaConfig.isConnected ? 'bg-emerald-600 text-white' : 'bg-stone-800 text-stone-400 border border-stone-700'
                }`}>
                  <ShoppingBag className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-white font-industrial uppercase">Tradera Marktplatz</h2>
                    {traderaConfig.isConnected ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-400 border border-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Verbunden
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-900/50 text-amber-400 border border-amber-700">
                        Nicht autorisiert
                      </span>
                    )}
                  </div>
                  <p className="text-stone-400 text-sm mt-1">
                    {traderaConfig.isConnected 
                      ? `Verknüpft mit Verkäufer-Konto #${traderaConfig.userId || '6760'}. Inserate werden automatisch per Knopfdruck erstellt.`
                      : 'Autorisiere deinen Tradera-Account, um Inserate direkt per Knopfdruck automatisch zu publizieren.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={getTraderaAuthUrl(traderaConfig)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 bg-rust-600 hover:bg-rust-500 text-white text-xs font-bold uppercase font-industrial tracking-wider rounded flex items-center gap-2 shadow-lg shadow-rust-900/40"
                >
                  <ExternalLink className="w-4 h-4" />
                  {traderaConfig.isConnected ? 'Erneut verbinden' : 'Mit Tradera verbinden'}
                </a>
                {traderaConfig.isConnected && (
                  <button
                    type="button"
                    onClick={handleTestTraderaConnection}
                    disabled={isTestingTradera}
                    className="px-4 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-bold uppercase font-industrial tracking-wider rounded border border-stone-700 flex items-center gap-2"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTestingTradera ? 'animate-spin' : ''}`} />
                    {isTestingTradera ? 'Prüfe...' : 'Verbindung testen'}
                  </button>
                )}
              </div>
            </div>

            {/* Test Result Message */}
            {traderaTestResult && (
              <div className={`mt-4 p-3 rounded text-xs flex items-center gap-2 ${
                traderaTestResult.ok 
                  ? 'bg-emerald-900/40 border border-emerald-700 text-emerald-200' 
                  : 'bg-red-900/40 border border-red-700 text-red-200'
              }`}>
                {traderaTestResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /> : <XCircle className="w-4 h-4 shrink-0 text-red-400" />}
                <span>{traderaTestResult.message}</span>
              </div>
            )}
          </div>

          {/* Token & Login Helper */}
          <div className="bg-oil-800 rounded-xl border border-stone-700 p-6 space-y-4">
            <h3 className="text-base font-bold text-white font-industrial uppercase flex items-center gap-2">
              <Link2 className="w-4 h-4 text-rust-500" /> Token &amp; Autorisierung
            </h3>
            <p className="text-xs text-stone-400">
              Klicke oben auf &quot;Mit Tradera verbinden&quot; oder füge deinen erhaltenen Token oder die Rückleitungs-URL direkt hier ein:
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Token oder URL hier einfügen (z. B. ?token=...&userId=...)"
                value={manualTokenInput}
                onChange={(e) => setManualTokenInput(e.target.value)}
                className="flex-1 bg-stone-900 border border-stone-700 rounded p-3 text-stone-200 text-xs font-mono focus:border-rust-500 outline-none"
              />
              <button
                type="button"
                onClick={handleApplyPastedToken}
                disabled={!manualTokenInput.trim()}
                className="px-5 py-3 bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-200 text-xs font-bold uppercase rounded border border-stone-700 whitespace-nowrap"
              >
                Übernehmen
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="text-[11px] text-stone-400 block mb-1 uppercase font-bold">User-Token</label>
                <input
                  type="password"
                  value={traderaConfig.token}
                  onChange={(e) => handleTraderaChange('token', e.target.value)}
                  placeholder="Aktiver Benutzer-Token"
                  className="w-full bg-stone-900 border border-stone-700 rounded p-2.5 text-stone-300 text-xs font-mono focus:border-rust-500 outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-stone-400 block mb-1 uppercase font-bold">User-ID (Tradera Benutzer-ID)</label>
                <input
                  type="text"
                  value={traderaConfig.userId}
                  onChange={(e) => handleTraderaChange('userId', e.target.value)}
                  placeholder="z. B. 6760 oder deine Tradera-Benutzer-ID"
                  className="w-full bg-stone-900 border border-stone-700 rounded p-2.5 text-stone-300 text-xs font-mono focus:border-rust-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Standard Inserat Einstellungen */}
          <div className="bg-oil-800 rounded-xl border border-stone-700 p-6 space-y-4">
            <h3 className="text-base font-bold text-white font-industrial uppercase">
              Standard-Inseratsoptionen (Tradera)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-stone-400 block mb-1 uppercase font-bold">Inserat-Typ</label>
                <select
                  value={traderaConfig.defaultItemType}
                  onChange={(e) => handleTraderaChange('defaultItemType', parseInt(e.target.value))}
                  className="w-full bg-stone-900 border border-stone-700 rounded p-2.5 text-stone-200 text-xs focus:border-rust-500 outline-none"
                >
                  <option value={1}>Auktion (ItemType 1)</option>
                  <option value={3}>Endast Köp Nu / Festpreis (ItemType 3)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-stone-400 block mb-1 uppercase font-bold">Laufzeit</label>
                <select
                  value={traderaConfig.defaultDuration}
                  onChange={(e) => handleTraderaChange('defaultDuration', parseInt(e.target.value))}
                  className="w-full bg-stone-900 border border-stone-700 rounded p-2.5 text-stone-200 text-xs focus:border-rust-500 outline-none"
                >
                  <option value={7}>7 Tage</option>
                  <option value={10}>10 Tage</option>
                  <option value={14}>14 Tage</option>
                  <option value={30}>30 Tage (Festpreis)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-stone-400 block mb-1 uppercase font-bold">Versandart</label>
                <select
                  value={traderaConfig.defaultShippingProviderId}
                  onChange={(e) => handleTraderaChange('defaultShippingProviderId', parseInt(e.target.value))}
                  className="w-full bg-stone-900 border border-stone-700 rounded p-2.5 text-stone-200 text-xs focus:border-rust-500 outline-none"
                >
                  <option value={6}>Annat fraktsätt (Standardversand)</option>
                  <option value={2}>DHL Paket</option>
                  <option value={7}>Schenker</option>
                  <option value={8}>Avhämtning (Nur Abholung)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="text-xs text-stone-400 block mb-1 uppercase font-bold">Standard Versandkosten (SEK)</label>
                <input
                  type="number"
                  min="0"
                  value={traderaConfig.defaultShippingCost}
                  onChange={(e) => handleTraderaChange('defaultShippingCost', parseFloat(e.target.value) || 0)}
                  className="w-full bg-stone-900 border border-stone-700 rounded p-2.5 text-stone-200 text-xs focus:border-rust-500 outline-none"
                />
                <span className="text-[10px] text-stone-500 mt-1 block">59 SEK entsprechen ca. 5,10 €</span>
              </div>

              <div>
                <label className="text-xs text-stone-400 block mb-1 uppercase font-bold">EUR / SEK Wechselkurs</label>
                <input
                  type="number"
                  step="0.1"
                  min="5"
                  max="20"
                  value={traderaConfig.currencyRateEurToSek}
                  onChange={(e) => handleTraderaChange('currencyRateEurToSek', parseFloat(e.target.value) || 11.5)}
                  className="w-full bg-stone-900 border border-stone-700 rounded p-2.5 text-stone-200 text-xs focus:border-rust-500 outline-none"
                />
                <span className="text-[10px] text-stone-500 mt-1 block">Wird für Preisumrechnungen verwendet</span>
              </div>

              <div className="flex flex-col justify-center">
                <label className="text-xs text-stone-400 block mb-2 uppercase font-bold">Veröffentlichung</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={traderaConfig.autoCommit}
                    onChange={(e) => handleTraderaChange('autoCommit', e.target.checked)}
                    className="rounded bg-stone-900 border-stone-700 text-rust-600 focus:ring-0 w-4 h-4 accent-rust-600"
                  />
                  <span className="text-xs text-stone-300 font-medium">Direkt live schalten (Auto-Commit)</span>
                </label>
                <span className="text-[10px] text-stone-500 mt-1 block">Wenn deaktiviert, wird das Inserat als Entwurf gespeichert</span>
              </div>
            </div>
          </div>

          {/* API Keys (Vorkonfiguriert) */}
          <div className="bg-oil-800 rounded-xl border border-stone-700 p-6 space-y-4">
            <h3 className="text-base font-bold text-white font-industrial uppercase">
              Tradera API Entwickler-Schlüssel (Vorkonfiguriert)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[11px] text-stone-400 block mb-1 uppercase font-mono">Application ID</label>
                <input
                  type="text"
                  value={traderaConfig.appId}
                  onChange={(e) => handleTraderaChange('appId', e.target.value)}
                  className="w-full bg-stone-900 border border-stone-700 rounded p-2 text-stone-300 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-stone-400 block mb-1 uppercase font-mono">App Key</label>
                <input
                  type="text"
                  value={traderaConfig.appKey}
                  onChange={(e) => handleTraderaChange('appKey', e.target.value)}
                  className="w-full bg-stone-900 border border-stone-700 rounded p-2 text-stone-300 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-stone-400 block mb-1 uppercase font-mono">Public Key</label>
                <input
                  type="text"
                  value={traderaConfig.publicKey}
                  onChange={(e) => handleTraderaChange('publicKey', e.target.value)}
                  className="w-full bg-stone-900 border border-stone-700 rounded p-2 text-stone-300 text-xs font-mono"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ai' && (
        <div className="space-y-6">
          <div className="bg-rust-900/20 border border-rust-800 rounded p-4 mb-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rust-500 shrink-0 mt-0.5" />
            <div className="text-sm text-rust-200">
              <p className="font-bold mb-1 uppercase text-rust-400">System Hinweis</p>
              <p>API Keys werden verschlüsselt lokal gespeichert. Das System nutzt Fallback-Logik bei Ausfällen.</p>
            </div>
          </div>

          <div className="space-y-6">
            {localSettings.providers.map((provider, index) => (
              <div key={provider.id} className={`bg-oil-800 rounded border transition-all ${provider.isEnabled ? 'border-stone-600 shadow-sm' : 'border-stone-800 opacity-60'}`}>
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded bg-emerald-900/30 text-emerald-400">
                        <Key className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-white text-lg font-industrial uppercase">{provider.name}</h3>
                        <p className="text-xs text-stone-500 font-mono">PRIO: {index + 1}</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={provider.isEnabled} 
                        onChange={(e) => handleProviderChange(index, 'isEnabled', e.target.checked)}
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-stone-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rust-600"></div>
                    </label>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-xs text-stone-400 mb-1 block uppercase">API Key</label>
                      <input 
                        type="password" 
                        value={provider.apiKey}
                        onChange={(e) => handleProviderChange(index, 'apiKey', e.target.value)}
                        placeholder="Dein API Key"
                        className="w-full bg-stone-900 border border-stone-700 rounded p-2.5 text-stone-300 text-sm focus:border-rust-500 outline-none"
                      />
                    </div>

                    {provider.id === 'blackbox' && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-stone-400 uppercase">Modell</label>
                          <button
                            type="button"
                            onClick={() => handleFetchBlackboxModels(provider.apiKey)}
                            disabled={isFetchingModels || !provider.apiKey}
                            className="text-xs text-rust-500 hover:text-rust-400 flex items-center gap-1 font-mono disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3 h-3 ${isFetchingModels ? 'animate-spin' : ''}`} />
                            {isFetchingModels ? 'Lade...' : 'Modelle abrufen'}
                          </button>
                        </div>
                        <input 
                          type="text" 
                          value={provider.model}
                          onChange={(e) => handleProviderChange(index, 'model', e.target.value)}
                          placeholder="Modellname"
                          className="w-full bg-stone-900 border border-stone-700 rounded p-2.5 text-stone-300 text-sm font-mono focus:border-rust-500 outline-none mb-2"
                        />
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {[
                            { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat (Standard)' },
                            { id: 'deepseek/deepseek-v3', label: 'DeepSeek V3' },
                            { id: 'deepseek-v3', label: 'DeepSeek V3 (Alias)' },
                            { id: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
                            { id: 'gpt-4o', label: 'GPT-4o' },
                            { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
                          ].map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => handleProviderChange(index, 'model', m.id)}
                              className={`px-2 py-1 text-xs font-mono rounded border transition-colors ${
                                provider.model === m.id
                                  ? 'bg-rust-950 border-rust-500 text-rust-300 font-bold'
                                  : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                              }`}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 flex justify-end gap-3">
        <button 
          type="button"
          onClick={saveSettings}
          className="px-6 py-3 bg-rust-600 hover:bg-rust-500 text-white rounded font-bold shadow-lg shadow-rust-900/30 flex items-center gap-2 uppercase tracking-wide font-industrial"
        >
          {showSuccess ? <Check className="w-5 h-5" /> : <Save className="w-5 h-5" />}
          {showSuccess ? 'GESPEICHERT' : 'EINSTELLUNGEN SPEICHERN'}
        </button>
      </div>
    </div>
  );
};

export default SettingsView;
