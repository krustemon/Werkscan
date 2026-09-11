import React, { useState, useEffect } from 'react';
import { 
  Save, 
  Key, 
  Shield, 
  AlertTriangle, 
  Check, 
  RefreshCw, 
  ShoppingBag, 
  ExternalLink, 
  Link2, 
  CheckCircle2, 
  XCircle, 
  ArrowLeft,
  Globe,
  Copy,
  Info,
  Terminal,
  AlertCircle,
  Zap,
  Radio,
  Eye,
  Activity
} from 'lucide-react';
import { AppSettings, ApiProviderConfig, TraderaConfig } from '../types';
import { 
  fetchBlackboxModels, 
  testAiConnection, 
  AiTestResult, 
  getOpenCodeSessionInfo, 
  rotateStealthSession, 
  StealthSessionInfo,
  OPENCODE_FREE_MODELS
} from '../services/geminiService';
import { 
  getTraderaConfig, 
  saveTraderaConfig, 
  getTraderaAuthUrl, 
  verifyTraderaConnection, 
  parseTraderaCallback,
  getHeaders,
  TraderaVerifyResult
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

  // Stealth & AI State
  const [stealthInfo, setStealthInfo] = useState<StealthSessionInfo>(getOpenCodeSessionInfo());
  const [testingAiIndex, setTestingAiIndex] = useState<number | null>(null);
  const [aiTestResults, setAiTestResults] = useState<Record<string, AiTestResult>>({});
  const [stealthMessage, setStealthMessage] = useState<string | null>(null);

  // Tradera State
  const [traderaConfig, setTraderaConfig] = useState<TraderaConfig>(getTraderaConfig());
  const [isTestingTradera, setIsTestingTradera] = useState(false);
  const [traderaTestResult, setTraderaTestResult] = useState<TraderaVerifyResult | null>(null);
  const [manualTokenInput, setManualTokenInput] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [activeTab, setActiveTab] = useState<'ai' | 'tradera'>('ai');

  const currentPwaUrl = typeof window !== 'undefined' ? `${window.location.origin}/` : '';
  const redirectUriMatches = !traderaConfig.redirectUri || traderaConfig.redirectUri.trim() === currentPwaUrl;

  useEffect(() => {
    setTraderaConfig(getTraderaConfig());
  }, []);

  const handleProviderChange = (index: number, field: keyof ApiProviderConfig, value: any) => {
    const newProviders = [...localSettings.providers];
    newProviders[index] = { ...newProviders[index], [field]: value };
    setLocalSettings({ ...localSettings, providers: newProviders });
  };

  const handleRotateStealth = () => {
    const newSid = rotateStealthSession();
    const updatedInfo = getOpenCodeSessionInfo();
    setStealthInfo(updatedInfo);
    setStealthMessage(`Tarnung erfolgreich! Neue getarnte Free-Tier Session: ${newSid.slice(0, 16)}...`);
    setTimeout(() => setStealthMessage(null), 4000);
  };

  const handleTestAi = async (index: number) => {
    const provider = localSettings.providers[index];
    if (!provider) return;
    setTestingAiIndex(index);
    try {
      const result = await testAiConnection(provider);
      setAiTestResults(prev => ({ ...prev, [provider.id]: result }));
    } catch (e: any) {
      setAiTestResults(prev => ({
        ...prev,
        [provider.id]: {
          ok: false,
          message: `Test fehlgeschlagen: ${e?.message || 'Netzwerkfehler'}`
        }
      }));
    } finally {
      setTestingAiIndex(null);
    }
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

          {/* OAuth-Token-Header & Redirect-URI / PWA-Pfad Diagnose */}
          <div className="bg-oil-800 rounded-xl border border-stone-700 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white font-industrial uppercase flex items-center gap-2">
                <Terminal className="w-4 h-4 text-amber-500" /> OAuth-Header &amp; Redirect-URI Diagnose
              </h3>
              <span className={`text-[11px] px-2.5 py-1 rounded font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                redirectUriMatches 
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' 
                  : 'bg-amber-950 text-amber-400 border border-amber-800'
              }`}>
                {redirectUriMatches ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {redirectUriMatches ? 'PWA-Pfad synchronisiert' : 'PWA-Pfad abweichend'}
              </span>
            </div>

            {/* 1. Redirect-URI vs. PWA-Pfad Abgleich */}
            <div className="space-y-3 bg-stone-900/80 p-4 rounded-lg border border-stone-800">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-stone-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-rust-400" /> 1. PWA-URL &amp; Tradera Accept-URL (Redirect-URI)
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-stone-950 rounded border border-stone-800">
                  <span className="text-[11px] text-stone-500 block mb-1 uppercase font-bold">Aktuelle PWA-URL (Browser-Ursprung):</span>
                  <code className="text-emerald-400 font-mono text-[11px] break-all block">{currentPwaUrl || 'Unbekannt'}</code>
                </div>
                <div className="p-3 bg-stone-950 rounded border border-stone-800">
                  <span className="text-[11px] text-stone-500 block mb-1 uppercase font-bold">Tradera Konfiguration (Accept URL):</span>
                  <code className="text-stone-300 font-mono text-[11px] break-all block">{traderaConfig.redirectUri || currentPwaUrl}</code>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    handleTraderaChange('redirectUri', currentPwaUrl);
                    navigator.clipboard.writeText(currentPwaUrl);
                    setCopiedUrl(true);
                    setTimeout(() => setCopiedUrl(false), 2500);
                  }}
                  className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold uppercase rounded border border-stone-700 flex items-center gap-1.5 transition-colors"
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedUrl ? 'In Zwischenablage kopiert!' : 'PWA-URL als Accept-URL kopieren'}
                </button>
              </div>

              <div className="text-[11px] text-stone-400 leading-relaxed bg-amber-950/20 border border-amber-900/30 p-3 rounded flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Wichtig zur Behebung des 401-Fehlers:</strong> Im <a href="https://developer.tradera.com" target="_blank" rel="noopener noreferrer" className="text-rust-400 underline hover:text-rust-300">Tradera Developer Portal</a> unter deiner App (#6760) muss die <strong>Accept URL</strong> exakt mit der obigen PWA-URL übereinstimmen und <em>&quot;Display token on return URL&quot;</em> aktiviert sein. Andernfalls schlägt die Rückleitung fehl und Tradera verweigert Anfragen mit 401.
                </span>
              </div>
            </div>

            {/* 2. OAuth-Token-Header Inspector */}
            <div className="space-y-3 bg-stone-900/80 p-4 rounded-lg border border-stone-800">
              <span className="font-bold text-stone-300 text-xs uppercase tracking-wider block">
                2. Aktive HTTP-Request-Header an die Tradera REST API v4
              </span>
              <div className="font-mono text-xs bg-stone-950 p-3 rounded border border-stone-800 space-y-1.5 overflow-x-auto text-stone-300">
                <div className="flex items-start gap-2">
                  <span className="text-stone-500 w-36 shrink-0">Authorization:</span>
                  <span className={traderaConfig.token ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                    {traderaConfig.token 
                      ? `Bearer ${traderaConfig.token.slice(0, 8)}••••••••${traderaConfig.token.slice(-4)}` 
                      : 'FEHLT (Verursacht HTTP 401 Unauthorized!)'}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-stone-500 w-36 shrink-0">X-User-Token:</span>
                  <span className={traderaConfig.token ? 'text-emerald-400' : 'text-red-400'}>
                    {traderaConfig.token 
                      ? `${traderaConfig.token.slice(0, 8)}••••••••${traderaConfig.token.slice(-4)}` 
                      : 'FEHLT'}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-stone-500 w-36 shrink-0">X-User-Id:</span>
                  <span className={traderaConfig.userId ? 'text-emerald-400' : 'text-red-400'}>
                    {traderaConfig.userId || 'FEHLT'}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-stone-500 w-36 shrink-0">X-App-Id:</span>
                  <span className="text-stone-300">{traderaConfig.appId || '6760'}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-stone-500 w-36 shrink-0">X-App-Key:</span>
                  <span className="text-stone-300">{traderaConfig.appKey ? `${traderaConfig.appKey.slice(0, 8)}••••••••` : 'FEHLT'}</span>
                </div>
              </div>

              {/* Netzwerk-Test Button */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleTestTraderaConnection}
                  disabled={isTestingTradera}
                  className="px-4 py-2 bg-rust-600 hover:bg-rust-500 disabled:opacity-50 text-white text-xs font-bold uppercase font-industrial tracking-wider rounded flex items-center gap-2 shadow"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingTradera ? 'animate-spin' : ''}`} />
                  {isTestingTradera ? 'Sende Netzwerkanfrage...' : 'Netzwerkanfrage an Tradera senden & Diagnose ausführen'}
                </button>
              </div>

              {/* Detailliertes Diagnose-Ergebnis */}
              {traderaTestResult && (
                <div className={`mt-3 p-4 rounded-lg border text-xs space-y-2 ${
                  traderaTestResult.ok 
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200' 
                    : traderaTestResult.status === 401 
                      ? 'bg-red-950/40 border-red-800 text-red-200'
                      : 'bg-amber-950/40 border-amber-800 text-amber-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold flex items-center gap-2">
                      {traderaTestResult.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-red-400" />}
                      HTTP Status: {traderaTestResult.status || (traderaTestResult.ok ? 200 : 'Fehler')}
                    </span>
                    <span className="font-mono text-[10px] uppercase opacity-75">
                      {traderaTestResult.ok ? 'Autorisierung Gültig' : traderaTestResult.status === 401 ? '401 Unauthorized' : '403 Forbidden'}
                    </span>
                  </div>
                  <p className="leading-relaxed">{traderaTestResult.message}</p>
                  
                  {traderaTestResult.status === 401 && (
                    <div className="p-3 bg-red-900/30 rounded border border-red-800/60 text-red-300 text-[11px] space-y-1">
                      <p className="font-bold">Ursachen für den 401-Fehler:</p>
                      <ul className="list-disc list-inside space-y-0.5 pl-1 opacity-90">
                        <li>Der Benutzer-Token ist noch leer oder ungültig.</li>
                        <li>Der Token wurde nach dem Tradera-Login nicht an diese PWA zurückgeleitet (prüfe oben die Accept-URL).</li>
                        <li>Tradera-Tokens laufen nach Ablauf der Gültigkeitsdauer ab und müssen über &quot;Mit Tradera verbinden&quot; erneuert werden.</li>
                      </ul>
                    </div>
                  )}
                </div>
              )}
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
          {/* Stealth Mode & Free Tier Manager */}
          <div className="bg-gradient-to-r from-oil-800 to-oil-900 border border-emerald-800/60 rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-700/80 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-700 text-emerald-400">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white text-base font-industrial uppercase tracking-wide">
                      OpenCode Stealth-Tarnung & Free-Tier
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-900/60 border border-emerald-600/60 text-emerald-300 font-bold">
                      AKTIV & ANONYM
                    </span>
                  </div>
                  <p className="text-xs text-stone-400">
                    Automatische Rotation bei 429-Rate-Limits & Zero-Config Free-Zugang.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRotateStealth}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-xs flex items-center gap-2 font-industrial uppercase tracking-wider shadow transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Neue Identität & Session generieren
              </button>
            </div>

            {stealthMessage && (
              <div className="p-3 bg-emerald-950/70 border border-emerald-700 text-emerald-200 text-xs rounded-lg flex items-center gap-2 animate-fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{stealthMessage}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div className="bg-stone-900/80 p-2.5 rounded border border-stone-800">
                <span className="text-stone-500 block text-[10px] uppercase">Session ID (Getarnt)</span>
                <span className="text-stone-300 truncate block">{stealthInfo.sessionId.slice(0, 22)}...</span>
              </div>
              <div className="bg-stone-900/80 p-2.5 rounded border border-stone-800">
                <span className="text-stone-500 block text-[10px] uppercase">Erfolgte Rotationen</span>
                <span className="text-emerald-400 font-bold block">{stealthInfo.rotationCount} Wechsel</span>
              </div>
              <div className="bg-stone-900/80 p-2.5 rounded border border-stone-800">
                <span className="text-stone-500 block text-[10px] uppercase">Client Fingerprint</span>
                <span className="text-stone-300 truncate block">{stealthInfo.userAgent}</span>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {localSettings.providers.map((provider, index) => {
              const testRes = aiTestResults[provider.id];
              const isTesting = testingAiIndex === index;

              return (
                <div 
                  key={provider.id} 
                  className={`bg-oil-800 rounded-xl border transition-all ${
                    provider.isEnabled ? 'border-stone-600 shadow-md' : 'border-stone-800 opacity-60'
                  }`}
                >
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-lg ${
                          provider.id === 'opencode' 
                            ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/50'
                            : 'bg-stone-900 text-stone-300 border border-stone-700'
                        }`}>
                          <Key className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-white text-lg font-industrial uppercase">{provider.name}</h3>
                            {provider.id === 'opencode' && (
                              <span className="bg-emerald-950 text-emerald-400 border border-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono uppercase">
                                Standard (Free)
                              </span>
                            )}
                            {provider.id === 'blackbox' && (
                              <span className="bg-stone-900 text-stone-400 border border-stone-700 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono uppercase">
                                Veraltet
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-stone-400 mt-0.5">
                            {provider.description || `Priorität: ${index + 1}`}
                          </p>
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
                      {/* API Key Eingabe */}
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-xs text-stone-400 uppercase font-bold">
                            API Key {provider.id === 'opencode' ? '(Optional - Für Free-Tier leer lassen)' : ''}
                          </label>
                          {provider.id === 'opencode' && !provider.apiKey && (
                            <span className="text-[11px] text-emerald-400 font-mono">
                              ✓ Free-Tier aktiv (kein Key benötigt)
                            </span>
                          )}
                        </div>
                        <input 
                          type="password" 
                          value={provider.apiKey}
                          onChange={(e) => handleProviderChange(index, 'apiKey', e.target.value)}
                          placeholder={provider.id === 'opencode' ? 'Leer lassen für automatischen Free-Tier-Zugang' : 'Dein API Key'}
                          className="w-full bg-stone-900 border border-stone-700 rounded p-2.5 text-stone-300 text-sm focus:border-rust-500 outline-none font-mono"
                        />
                      </div>

                      {/* Modell-Auswahl */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-stone-400 uppercase font-bold">Modell</label>
                          {provider.id === 'blackbox' && (
                            <button
                              type="button"
                              onClick={() => handleFetchBlackboxModels(provider.apiKey)}
                              disabled={isFetchingModels || !provider.apiKey}
                              className="text-xs text-rust-500 hover:text-rust-400 flex items-center gap-1 font-mono disabled:opacity-50"
                            >
                              <RefreshCw className={`w-3 h-3 ${isFetchingModels ? 'animate-spin' : ''}`} />
                              {isFetchingModels ? 'Lade...' : 'Modelle abrufen'}
                            </button>
                          )}
                        </div>
                        <input 
                          type="text" 
                          value={provider.model}
                          onChange={(e) => handleProviderChange(index, 'model', e.target.value)}
                          placeholder="Modellname"
                          className="w-full bg-stone-900 border border-stone-700 rounded p-2.5 text-stone-300 text-sm font-mono focus:border-rust-500 outline-none mb-2"
                        />

                        {/* Presets für OpenCode */}
                        {provider.id === 'opencode' && (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {OPENCODE_FREE_MODELS.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => handleProviderChange(index, 'model', m.id)}
                                className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors ${
                                  provider.model === m.id
                                    ? 'bg-emerald-950 border-emerald-500 text-emerald-300 font-bold'
                                    : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                                }`}
                              >
                                {m.name}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Presets für Gemini */}
                        {provider.id === 'gemini' && (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash-lite'].map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => handleProviderChange(index, 'model', m)}
                                className={`px-2 py-1 text-xs font-mono rounded border transition-colors ${
                                  provider.model === m
                                    ? 'bg-rust-950 border-rust-500 text-rust-300 font-bold'
                                    : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                                }`}
                              >
                                {m}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Presets für OpenRouter */}
                        {provider.id === 'openrouter' && (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {[
                              'google/gemini-2.0-flash-lite:free',
                              'meta-llama/llama-3.3-70b-instruct:free',
                              'deepseek/deepseek-r1:free'
                            ].map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => handleProviderChange(index, 'model', m)}
                                className={`px-2 py-1 text-xs font-mono rounded border transition-colors ${
                                  provider.model === m
                                    ? 'bg-rust-950 border-rust-500 text-rust-300 font-bold'
                                    : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                                }`}
                              >
                                {m}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Verbindungstest-Button & Diagnoseergebnis */}
                      <div className="pt-2 flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleTestAi(index)}
                            disabled={isTesting}
                            className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 rounded text-xs font-mono flex items-center gap-2 transition"
                          >
                            <Activity className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-rust-400' : 'text-emerald-400'}`} />
                            {isTesting ? 'Teste Verbindung...' : 'Verbindung testen (Ping)'}
                          </button>
                        </div>

                        {testRes && (
                          <div className={`p-3 rounded-lg border text-xs font-mono flex items-start gap-2 ${
                            testRes.ok 
                              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300' 
                              : 'bg-red-950/40 border-red-800 text-red-300'
                          }`}>
                            {testRes.ok ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1">
                              <p className="font-bold">{testRes.message}</p>
                              {testRes.latencyMs && (
                                <p className="text-[10px] opacity-75 mt-0.5">Latenz: {testRes.latencyMs}ms | HTTP Status: {testRes.status || 200}</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
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
