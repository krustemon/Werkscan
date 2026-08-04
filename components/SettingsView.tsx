import React, { useState } from 'react';
import { Save, Key, Shield, AlertTriangle, Check } from 'lucide-react';
import { AppSettings, ApiProviderConfig } from '../types';

interface SettingsViewProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onBack: () => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ settings, onSave, onBack }) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleProviderChange = (index: number, field: keyof ApiProviderConfig, value: any) => {
    const newProviders = [...localSettings.providers];
    newProviders[index] = { ...newProviders[index], [field]: value };
    setLocalSettings({ ...localSettings, providers: newProviders });
  };

  const saveSettings = () => {
    onSave(localSettings);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto animate-fade-in pb-24 md:pb-12 text-stone-200">
       <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2 font-industrial uppercase">
              <Shield className="w-6 h-6 text-rust-500" /> Einstellungen
            </h1>
            <p className="text-stone-500 text-sm mt-1">KI-Verbindungen & Sicherheit</p>
          </div>
       </div>

       <div className="bg-rust-900/20 border border-rust-800 rounded p-4 mb-8 flex items-start gap-3">
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
                         <div className={`p-2 rounded ${
                            provider.id === 'gemini' ? 'bg-blue-900/30 text-blue-400' : 
                            provider.id === 'blackbox' ? 'bg-emerald-900/30 text-emerald-400' : 
                            'bg-purple-900/30 text-purple-400'
                         }`}>
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
                        <div className="w-11 h-6 bg-stone-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rust-600"></div>
                      </label>
                   </div>

                   <div className="space-y-4">
                      <div>
                         <div className="flex justify-between items-center mb-1">
                            <label className="block text-xs font-bold text-stone-400 uppercase">API Schlüssel</label>
                            {provider.id === 'blackbox' && (
                               <a 
                                 href="https://www.blackbox.ai" 
                                 target="_blank" 
                                 rel="noopener noreferrer"
                                 className="text-[10px] text-emerald-400 hover:underline"
                               >
                                 Blackbox AI Key holen ↗
                               </a>
                            )}
                         </div>
                         <input 
                            type="password" 
                            value={provider.apiKey}
                            onChange={(e) => handleProviderChange(index, 'apiKey', e.target.value)}
                            placeholder={`Dein ${provider.name} Key`}
                            className="w-full px-4 py-2 bg-stone-900 border border-stone-700 rounded focus:border-rust-500 outline-none text-white placeholder-stone-700 font-mono"
                            disabled={!provider.isEnabled}
                         />
                      </div>
                      <div>
                         <div className="flex justify-between items-center mb-1">
                            <label className="block text-xs font-bold text-stone-400 uppercase">Modell</label>
                            {provider.id === 'blackbox' && (
                               <span className="text-[10px] text-stone-500 font-mono">10€ Pro & API kompatibel</span>
                            )}
                         </div>
                         <input 
                            type="text" 
                            value={provider.model}
                            onChange={(e) => handleProviderChange(index, 'model', e.target.value)}
                            className="w-full px-4 py-2 bg-stone-900 border border-stone-700 rounded text-sm text-stone-300 font-mono focus:border-rust-500 outline-none"
                            disabled={!provider.isEnabled}
                         />
                         {provider.id === 'blackbox' && provider.isEnabled && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                               <span className="text-[10px] text-stone-500 w-full mb-0.5">Schnellauswahl Pro Modelle:</span>
                               {[
                                 { label: 'Blackbox Agent (Default)', value: 'blackboxai' },
                                 { label: 'GPT-4o', value: 'gpt-4o' },
                                 { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
                                 { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet' },
                                 { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
                               ].map((m) => (
                                 <button
                                   key={m.value}
                                   type="button"
                                   onClick={() => handleProviderChange(index, 'model', m.value)}
                                   className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors ${
                                     provider.model === m.value
                                       ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                                       : 'bg-stone-900 border-stone-700 text-stone-400 hover:border-stone-500 hover:text-stone-200'
                                   }`}
                                 >
                                   {m.label}
                                 </button>
                               ))}
                            </div>
                         )}
                         {provider.id === 'gemini' && provider.isEnabled && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                               {[
                                 { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
                                 { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
                               ].map((m) => (
                                 <button
                                   key={m.value}
                                   type="button"
                                   onClick={() => handleProviderChange(index, 'model', m.value)}
                                   className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors ${
                                     provider.model === m.value
                                       ? 'bg-blue-950 border-blue-500 text-blue-300'
                                       : 'bg-stone-900 border-stone-700 text-stone-400 hover:border-stone-500 hover:text-stone-200'
                                   }`}
                                 >
                                   {m.label}
                                 </button>
                               ))}
                            </div>
                         )}
                      </div>
                   </div>
                </div>
             </div>
          ))}
       </div>

       <div className="mt-8 flex justify-end gap-3">
          <button 
             onClick={saveSettings}
             className="px-6 py-3 bg-rust-600 hover:bg-rust-500 text-white rounded font-bold shadow-lg shadow-rust-900/30 flex items-center gap-2 uppercase tracking-wide"
          >
             {showSuccess ? <Check className="w-5 h-5" /> : <Save className="w-5 h-5" />}
             {showSuccess ? 'GESPEICHERT' : 'SPEICHERN'}
          </button>
       </div>
    </div>
  );
};

export default SettingsView;