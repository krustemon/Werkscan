import React, { useState, useEffect, useRef } from 'react';
import { AdAnalysis, TraderaConfig, TraderaListingResult } from '../types';
import { Copy, Check, TrendingUp, Tag, Share2, ArrowLeft, ExternalLink, ShoppingBag, FileDown, Archive, Pencil, Save, X, Cloud, Loader2, Plus, Image as ImageIcon, Trash2, RotateCw, Wand2, SlidersHorizontal, ArrowRight, Eraser, AlertCircle, Globe, Truck, Scale, CheckCircle2, Settings as SettingsIcon } from 'lucide-react';
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { removeBackground, checkMarketPrices, MarketCheckResult, updatePriceAnalysis } from '../services/geminiService';
import { 
  getTraderaConfig, 
  saveTraderaConfig, 
  createTraderaListing, 
  calculateTraderaPrice, 
  suggestTraderaCategory, 
  getTraderaAuthUrl, 
  parseTraderaCallback 
} from '../services/traderaService';

interface ResultViewProps {
  result: AdAnalysis;
  images: string[];
  onBack: () => void;
  onSave?: (updatedResult: AdAnalysis, updatedImages?: string[]) => void;
}

const ResultView: React.FC<ResultViewProps> = ({ result, images, onBack, onSave }) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<AdAnalysis>(result);
  const [localImages, setLocalImages] = useState<string[]>(images);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasAutoDownloaded, setHasAutoDownloaded] = useState(false);
  
  // Re-Calculate Price
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Market Check
  const [marketCheckLoading, setMarketCheckLoading] = useState(false);
  const [marketCheckResult, setMarketCheckResult] = useState<MarketCheckResult | null>(null);
  const [marketCheckError, setMarketCheckError] = useState<string | null>(null);

  // Editor
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorImage, setEditorImage] = useState<string | null>(null);
  const [editorRotation, setEditorRotation] = useState(0);
  const [editorBrightness, setEditorBrightness] = useState(100);
  const [editorContrast, setEditorContrast] = useState(100);
  const [isProcessingBg, setIsProcessingBg] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Auto-save
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const lastSavedData = useRef<string>(JSON.stringify(result) + JSON.stringify(images));

  // Tradera State
  const [isTraderaListing, setIsTraderaListing] = useState(false);
  const [traderaProgress, setTraderaProgress] = useState<{ step: number; total: number; message: string } | null>(null);
  const [traderaResult, setTraderaResult] = useState<TraderaListingResult | null>(null);
  const [traderaError, setTraderaError] = useState<string | null>(null);
  const [showTraderaAuthModal, setShowTraderaAuthModal] = useState(false);
  const [showTraderaOptionsModal, setShowTraderaOptionsModal] = useState(false);
  const [authPasteInput, setAuthPasteInput] = useState('');
  const [customTraderaDuration, setCustomTraderaDuration] = useState<number>(7);
  const [customTraderaType, setCustomTraderaType] = useState<number>(1);
  const [customTraderaStartPrice, setCustomTraderaStartPrice] = useState<number>(0);
  const [customTraderaBuyNow, setCustomTraderaBuyNow] = useState<number>(0);
  const [customTraderaAutoCommit, setCustomTraderaAutoCommit] = useState<boolean>(true);

  // Auto-Download Logic for NEW items
  useEffect(() => {
    // We assume if 'images' has 1+ items and we haven't downloaded yet, and the result is fresh (passed via props)
    // Actually, simpler: If this component mounts and it's a "fresh" scan, we could trigger.
    // However, props don't tell us if it's new.
    // Let's rely on a session flag or just check if we are in "Result" view immediately after scan.
    // For now, we only trigger via button or if explicitly requested. 
    // To support "Auto Download", we would need a prop 'autoDownload' from App.tsx.
    // Assuming the user wants it triggered:
    // We will do it once per mount if valid.
  }, []);

  useEffect(() => {
    if (!isEditing) {
      setEditData(result);
      setLocalImages(images);
      lastSavedData.current = JSON.stringify(result) + JSON.stringify(images);
    }
  }, [result, images, isEditing]);

  useEffect(() => {
    if (!isEditing || !onSave) return;
    const currentDataString = JSON.stringify(editData) + JSON.stringify(localImages);
    if (currentDataString === lastSavedData.current) return;
    setSaveStatus('saving');
    const timer = setTimeout(() => {
      onSave(editData, localImages);
      lastSavedData.current = currentDataString;
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 2000);
    return () => clearTimeout(timer);
  }, [editData, localImages, isEditing, onSave]);

  const toggleEdit = () => {
    if (isEditing) {
      setEditData(result);
      setLocalImages(images);
      setSaveStatus('idle');
    }
    setIsEditing(!isEditing);
  };

  const handleManualSave = () => {
    if (onSave) {
      onSave(editData, localImages);
      lastSavedData.current = JSON.stringify(editData) + JSON.stringify(localImages);
    }
    setIsEditing(false);
    setSaveStatus('idle');
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleAddImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if(reader.result) {
            setLocalImages(prev => {
                const updated = [...prev, reader.result as string];
                return updated;
            });
          }
        };
        reader.readAsDataURL(file as Blob);
      });
    }
  };

  const handleDeleteImage = (index: number) => {
    if(window.confirm("Bild wirklich löschen?")) {
      const updated = localImages.filter((_, i) => i !== index);
      setLocalImages(updated);
      
      // Fix: Adjust index safely immediately
      let newIndex = selectedImageIndex;
      if (index === selectedImageIndex) {
         newIndex = Math.max(0, index - 1); 
      } else if (index < selectedImageIndex) {
         newIndex = selectedImageIndex - 1;
      }
      
      // Ensure index is within bounds of NEW array
      if (updated.length > 0) {
         if (newIndex >= updated.length) newIndex = updated.length - 1;
      } else {
         newIndex = 0;
      }
      
      setSelectedImageIndex(newIndex);

      // Force Save immediately to sync DB
      if (onSave) onSave(editData, updated);
      lastSavedData.current = JSON.stringify(editData) + JSON.stringify(updated);
    }
  };

  const openEditor = () => {
    if (localImages[selectedImageIndex]) {
        setEditorImage(localImages[selectedImageIndex]);
        setEditorRotation(0);
        setEditorBrightness(100);
        setEditorContrast(100);
        setBgError(null);
        setIsEditorOpen(true);
    }
  };

  const saveEditedImage = () => {
    if (canvasRef.current) {
        const newDataUrl = canvasRef.current.toDataURL('image/jpeg', 0.9);
        const updated = [...localImages];
        updated[selectedImageIndex] = newDataUrl;
        setLocalImages(updated);
        
        if (onSave) onSave(editData, updated);
        lastSavedData.current = JSON.stringify(editData) + JSON.stringify(updated);

        setIsEditorOpen(false);
        setEditorImage(null);
    }
  };

  const getApiKey = () => {
      let apiKey = "";
      try {
          const saved = localStorage.getItem('werkaholic_settings');
          if (saved) {
              const parsed = JSON.parse(saved);
              const blackbox = parsed.providers?.find((p: any) => p.id === 'blackbox');
              if (blackbox && blackbox.apiKey && blackbox.isEnabled) apiKey = blackbox.apiKey;
          }
      } catch(e) {}
      if (!apiKey || apiKey.trim().length < 5) {
          apiKey = 'sk-v8P_-3kN7H9tC2bgGdGdTQ';
      }
      return apiKey;
  };

  const getSavedProviders = () => {
      try {
          const saved = localStorage.getItem('werkaholic_settings');
          if (saved) {
              const parsed = JSON.parse(saved);
              return parsed.providers || [];
          }
      } catch(e) {}
      return [];
  };

  const handleMagicRemoveBackground = async () => {
    if (!editorImage) return;
    setIsProcessingBg(true);
    setBgError(null);
    try {
        const apiKey = getApiKey();
        const newBg = await removeBackground(apiKey, editorImage);
        
        // Update state with new image
        setEditorImage(newBg);
        setEditorRotation(0); 
    } catch (e: any) {
        setBgError((e.message || "Netzwerkproblem"));
    } finally {
        setIsProcessingBg(false);
    }
  };

  // --- RECALCULATE PRICE ---
  const handleRecalculatePrice = async () => {
     setIsRecalculating(true);
     try {
        const apiKey = getApiKey();
        const providers = getSavedProviders();
        const newData = await updatePriceAnalysis(apiKey, editData, providers);
        setEditData({
            ...editData,
            price_estimate: newData.price_estimate,
            shipping_cost: newData.shipping_cost,
            reasoning: newData.reasoning,
            keywords: newData.keywords && newData.keywords.length > 0 ? newData.keywords : editData.keywords
        });
        alert("Preis neu berechnet!");
     } catch (e: any) {
        alert("Fehler bei Neuberechnung: " + e.message);
     } finally {
        setIsRecalculating(false);
     }
  };

  // --- MARKET CHECK ---
  const handleMarketCheck = async () => {
     if (marketCheckLoading) return;
     setMarketCheckLoading(true);
     setMarketCheckError(null);
     
     try {
         const apiKey = getApiKey();
         const result = await checkMarketPrices(apiKey, editData.title, editData.condition);
         setMarketCheckResult(result);

     } catch (e: any) {
         setMarketCheckError(e.message || "Markt-Check fehlgeschlagen");
     } finally {
         setMarketCheckLoading(false);
     }
  };

  useEffect(() => {
    if (isEditorOpen && editorImage && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.src = editorImage;
        img.crossOrigin = "anonymous";
        img.onload = () => {
            // Adjust canvas size for rotation
            if (editorRotation % 180 !== 0) {
                canvas.width = img.height;
                canvas.height = img.width;
            } else {
                canvas.width = img.width;
                canvas.height = img.height;
            }
            
            if (ctx) {
                // Clear previous
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                // Save context
                ctx.save();
                
                // Filters
                ctx.filter = `brightness(${editorBrightness}%) contrast(${editorContrast}%)`;
                
                // Move to center
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate((editorRotation * Math.PI) / 180);
                
                // Draw image centered
                ctx.drawImage(img, -img.width / 2, -img.height / 2);
                
                // Restore
                ctx.restore();
            }
        };
    }
  }, [isEditorOpen, editorImage, editorRotation, editorBrightness, editorContrast]);

  const handleKleinanzeigenExport = () => {
    const sourceData = isEditing ? editData : result;
    const fullDescription = `${sourceData.description}\n\nZustand: ${sourceData.condition}\nVersand: ${sourceData.shipping_cost || 'Siehe Oben'}\n\n${sourceData.keywords.map(k => `#${k}`).join(' ')}`;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(fullDescription);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
    window.open('https://www.kleinanzeigen.de/p-anzeige-aufgeben.html', '_blank');
  };

  const handlePdfExport = () => {
    const sourceData = isEditing ? editData : result;
    setIsGenerating(true);
    try {
      const doc = new jsPDF();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text(sourceData.title, 10, 20);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(16);
      doc.text(`Preis: ${sourceData.price_estimate}`, 10, 30);
      doc.text(`Zustand: ${sourceData.condition}`, 10, 40);
      doc.setFontSize(12);
      doc.text(sourceData.description, 10, 50, { maxWidth: 180 });
      doc.save("expose.pdf");
    } catch (error) {
      alert("Fehler bei PDF");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleZipExport = async () => {
    const sourceData = isEditing ? editData : result;
    setIsGenerating(true);
    try {
      const zip = new JSZip();
      
      // Sanitize title for filename: Remove invalid chars, allow German umlauts, spaces, dashes
      const safeTitle = sourceData.title
        .replace(/[^a-zA-Z0-9äöüÄÖÜß \-_]/g, "")
        .trim()
        .replace(/\s+/g, "_") || "Inserat";

      const folder = zip.folder(safeTitle);
      
      if (folder) {
        folder.file("text.txt", sourceData.description);
        localImages.forEach((img, idx) => folder.file(`img_${idx}.jpg`, img.split(',')[1], {base64: true}));
        const content = await zip.generateAsync({type:"blob"});
        const url = window.URL.createObjectURL(content as any);
        const a = document.createElement('a'); a.href = url;
        
        // Use sanitized title as filename
        a.download = `${safeTitle}.zip`; 
        
        a.click();
        setHasAutoDownloaded(true);
      }
    } catch (e) { alert("Zip Fehler"); } finally { setIsGenerating(false); }
  };

  // --- TRADERA LISTING AUTOMATION ---
  const handleTraderaCreateClick = () => {
    const config = getTraderaConfig();
    if (!config.token || !config.userId) {
      setShowTraderaAuthModal(true);
      return;
    }
    executeTraderaListing();
  };

  const handleOpenTraderaOptions = () => {
    const config = getTraderaConfig();
    const sourceData = isEditing ? editData : result;
    const priceCalc = calculateTraderaPrice(sourceData.price_estimate, config.currencyRateEurToSek);
    setCustomTraderaType(config.defaultItemType || 1);
    setCustomTraderaDuration(config.defaultDuration || 7);
    setCustomTraderaStartPrice(priceCalc.startPrice);
    setCustomTraderaBuyNow(priceCalc.buyItNowPrice);
    setCustomTraderaAutoCommit(config.autoCommit ?? true);
    setShowTraderaOptionsModal(true);
  };

  const executeTraderaListing = async (overrideOptions?: {
    itemType?: number;
    duration?: number;
    startPrice?: number;
    buyItNowPrice?: number;
    autoCommit?: boolean;
  }) => {
    const config = getTraderaConfig();
    if (!config.token || !config.userId) {
      setShowTraderaAuthModal(true);
      return;
    }

    const sourceData = isEditing ? editData : result;
    setIsTraderaListing(true);
    setTraderaError(null);
    setTraderaResult(null);

    try {
      const listingRes = await createTraderaListing(
        sourceData,
        localImages,
        config,
        {
          itemType: overrideOptions?.itemType ?? config.defaultItemType,
          duration: overrideOptions?.duration ?? config.defaultDuration,
          startPrice: overrideOptions?.startPrice,
          buyItNowPrice: overrideOptions?.buyItNowPrice,
          autoCommit: overrideOptions?.autoCommit ?? config.autoCommit,
          onProgress: (message, step, total) => {
            setTraderaProgress({ step, total, message });
          }
        }
      );
      setTraderaResult(listingRes);
      setShowTraderaOptionsModal(false);
    } catch (err: any) {
      setTraderaError(err.message || 'Fehler beim Erstellen des Tradera Inserats');
    } finally {
      setIsTraderaListing(false);
      setTraderaProgress(null);
    }
  };

  const handleApplyAuthAndList = () => {
    if (!authPasteInput.trim()) return;
    const cb = parseTraderaCallback(authPasteInput.trim());
    let token = authPasteInput.trim();
    let userId = '6760';

    if (cb && cb.token) {
      token = cb.token;
      if (cb.userId) userId = cb.userId;
    }

    saveTraderaConfig({
      token,
      userId,
      isConnected: true
    });

    setShowTraderaAuthModal(false);
    setAuthPasteInput('');
    // Sofort mit Inserats-Erstellung starten
    setTimeout(() => {
      executeTraderaListing();
    }, 100);
  };

  // Auto trigger download if enabled and fresh
  useEffect(() => {
     // This could be controlled by a prop or logic. For now, manual.
  }, []);

  return (
    <div className="flex flex-col h-full bg-oil-950 animate-fade-in pb-20 md:pb-0 relative text-stone-200">
      {showToast && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[60] bg-rust-600 text-white px-6 py-3 rounded shadow-xl flex items-center gap-3 animate-fade-in font-bold">
          <Check className="w-5 h-5" /> Text kopiert!
        </div>
      )}

      <div className="bg-oil-900 px-4 py-4 border-b border-stone-800 sticky top-0 z-10 flex items-center justify-between shadow-sm">
        <button onClick={onBack} className="flex items-center text-stone-400 hover:text-white font-medium">
          <ArrowLeft className="w-5 h-5 mr-1" /> ZURÜCK
        </button>
        <div className="flex items-center gap-3">
           {isEditing && (
             <div className="flex items-center gap-2 mr-2 text-xs font-medium font-mono text-rust-500">
               {saveStatus === 'saving' && <span>SPEICHERT...</span>}
               {saveStatus === 'saved' && <span className="text-green-500">GESPEICHERT</span>}
             </div>
           )}

           {!isEditing ? (
             <button onClick={toggleEdit} className="flex items-center gap-2 px-3 py-1.5 bg-stone-800 text-stone-300 rounded hover:bg-stone-700 font-medium text-sm transition-colors border border-stone-700">
               <Pencil className="w-4 h-4" />
               <span className="hidden sm:inline">BEARBEITEN</span>
             </button>
           ) : (
             <div className="flex items-center gap-2">
                <button onClick={toggleEdit} className="p-2 text-stone-400 hover:text-white"><X className="w-5 h-5" /></button>
                <button onClick={handleManualSave} className="flex items-center gap-2 px-3 py-1.5 bg-rust-600 text-white rounded hover:bg-rust-700 font-medium text-sm"><Save className="w-4 h-4" /> FERTIG</button>
             </div>
           )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        <div className="space-y-6">
            <div className="bg-oil-800 rounded-lg shadow-sm p-3 border border-stone-700">
                <div className="relative group rounded overflow-hidden bg-black aspect-square lg:aspect-[4/3] border border-stone-800">
                    {localImages.length > 0 && localImages[selectedImageIndex] ? (
                        <img src={localImages[selectedImageIndex]} alt="Main" className="w-full h-full object-contain" />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-stone-600">
                            <ImageIcon className="w-12 h-12 mb-2"/>
                            <span className="text-sm">Kein Bild vorhanden</span>
                        </div>
                    )}
                    {localImages.length > 0 && (
                        <button onClick={openEditor} className="absolute top-3 right-3 bg-rust-600 hover:bg-rust-500 text-white p-2 rounded opacity-0 group-hover:opacity-100 transition-all shadow-lg flex items-center gap-2 font-bold text-xs uppercase">
                            <Wand2 className="w-4 h-4" /> Bearbeiten
                        </button>
                    )}
                </div>
                <div className="mt-3 grid grid-cols-5 gap-2">
                    {localImages.map((img, idx) => (
                        <div key={idx} onClick={() => setSelectedImageIndex(idx)} className={`relative aspect-square rounded overflow-hidden cursor-pointer border-2 ${selectedImageIndex === idx ? 'border-rust-500' : 'border-stone-800 opacity-60 hover:opacity-100'}`}>
                            <img src={img} className="w-full h-full object-cover" />
                            {isEditing && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleDeleteImage(idx); }} 
                                    className="absolute top-0 right-0 bg-red-600 hover:bg-red-500 p-1 transition-colors z-10"
                                >
                                    <X className="w-3 h-3 text-white" />
                                </button>
                            )}
                        </div>
                    ))}
                    {isEditing && (
                        <>
                            <div onClick={() => fileInputRef.current?.click()} className="aspect-square rounded border-2 border-dashed border-stone-700 hover:border-rust-500 flex flex-col items-center justify-center text-stone-500 hover:text-rust-500 cursor-pointer bg-stone-900/50 transition-colors">
                            <Plus className="w-6 h-6" />
                            </div>
                            <input type="file" multiple accept="image/*" ref={fileInputRef} className="hidden" onChange={handleAddImage} />
                        </>
                    )}
                </div>
            </div>

            <div className="bg-oil-800 rounded-lg shadow-sm p-4 md:p-6 border border-stone-700">
                <div className="flex justify-between items-start mb-4">
                    <h3 className="text-sm font-bold text-rust-500 uppercase tracking-widest flex items-center gap-2 font-industrial">
                        <TrendingUp className="w-4 h-4" /> Profi Schätzung
                    </h3>
                    {isEditing && (
                       <button onClick={handleRecalculatePrice} disabled={isRecalculating} className="text-xs bg-stone-700 text-stone-300 px-2 py-1 rounded hover:bg-white hover:text-black transition-colors flex items-center gap-1">
                          {isRecalculating ? <Loader2 className="w-3 h-3 animate-spin"/> : <RotateCw className="w-3 h-3"/>} Recalc
                       </button>
                    )}
                </div>
                
                <div className="w-full mb-6">
                    <p className="text-stone-400 text-xs uppercase mb-1">Marktwert (Gebraucht)</p>
                    {isEditing ? (
                        <input type="text" value={editData.price_estimate} onChange={(e) => setEditData({...editData, price_estimate: e.target.value})} className="w-full text-2xl font-black bg-stone-900 border border-stone-700 rounded p-2 text-white font-mono focus:border-rust-500 outline-none" />
                    ) : (
                        <p className="text-4xl font-black text-white font-mono">{result.price_estimate}</p>
                    )}
                </div>

                {/* Shipping & Weight info */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-stone-900/50 p-3 rounded border border-stone-800">
                        <div className="flex items-center gap-2 mb-1 text-stone-500 text-xs uppercase font-bold">
                            <Truck className="w-3 h-3" /> Versand
                        </div>
                        {isEditing ? (
                            <input type="text" value={editData.shipping_cost || ''} onChange={(e) => setEditData({...editData, shipping_cost: e.target.value})} className="w-full bg-stone-800 border border-stone-700 rounded p-1 text-white text-sm" placeholder="6,99€" />
                        ) : (
                            <p className="text-stone-300 font-mono font-bold">{result.shipping_cost || 'N/A'}</p>
                        )}
                    </div>
                    <div className="bg-stone-900/50 p-3 rounded border border-stone-800">
                        <div className="flex items-center gap-2 mb-1 text-stone-500 text-xs uppercase font-bold">
                            <Scale className="w-3 h-3" /> Gewicht (ca.)
                        </div>
                        {isEditing ? (
                            <input type="text" value={editData.weight_estimate || ''} onChange={(e) => setEditData({...editData, weight_estimate: e.target.value})} className="w-full bg-stone-800 border border-stone-700 rounded p-1 text-white text-sm" placeholder="2 kg" />
                        ) : (
                            <p className="text-stone-300 font-mono font-bold">{result.weight_estimate || 'N/A'}</p>
                        )}
                    </div>
                </div>

                {/* Market Check Button */}
                {!marketCheckResult && (
                    <button 
                       onClick={handleMarketCheck} 
                       disabled={marketCheckLoading}
                       className="w-full py-2 bg-stone-700/50 hover:bg-stone-700 border border-stone-600 rounded text-stone-300 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all mb-4"
                    >
                        {marketCheckLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                        {marketCheckLoading ? 'Suche Preise...' : 'Live Markt-Check'}
                    </button>
                )}

                {/* Market Check Results */}
                {marketCheckError && <div className="text-red-500 text-xs p-2 bg-red-900/20 rounded mb-4">{marketCheckError}</div>}
                
                {marketCheckResult && (
                    <div className="bg-stone-900/80 rounded p-4 mb-4 border border-stone-800 animate-fade-in">
                        <div className="flex justify-between items-center mb-2">
                             <h4 className="font-bold text-white text-sm flex items-center gap-2">
                                <Globe className="w-3 h-3 text-rust-500" />
                                Online Fundstücke
                             </h4>
                             <button onClick={() => setMarketCheckResult(null)} className="text-stone-500 hover:text-white"><X className="w-3 h-3"/></button>
                        </div>
                        <div className="text-xs text-stone-400 mb-3 leading-relaxed whitespace-pre-line">
                            {marketCheckResult.text}
                        </div>
                        {marketCheckResult.sources.length > 0 && (
                            <div className="space-y-1">
                                {marketCheckResult.sources.map((src, i) => (
                                    <a key={i} href={src.uri} target="_blank" rel="noopener noreferrer" className="block text-xs text-rust-500 hover:underline truncate flex items-center gap-1">
                                        <ExternalLink className="w-3 h-3 inline" /> {src.title || src.uri}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {result.reasoning && (
                    <div className="p-3 bg-stone-900/50 rounded border border-stone-800">
                        <p className="text-xs text-stone-400 font-mono leading-relaxed"><span className="text-rust-500 font-bold">ANALYSE:</span> {result.reasoning}</p>
                    </div>
                )}
            </div>
        </div>

        <div className="space-y-6">
            <div className="bg-oil-800 rounded-lg shadow-sm border border-stone-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-stone-700 bg-stone-900/50 flex justify-between items-center">
                    <span className="font-bold text-stone-300 font-industrial uppercase">Details</span>
                    {!isEditing && <button onClick={() => copyToClipboard(result.title, 'title')} className="text-rust-500 hover:text-white text-xs font-bold uppercase flex items-center gap-1"><Copy className="w-4 h-4" /> COPY</button>}
                </div>
                <div className="p-4 md:p-6">
                    {isEditing ? (
                      <div className="space-y-3">
                         <input type="text" value={editData.title} onChange={(e) => setEditData({...editData, title: e.target.value})} className="w-full text-lg font-bold bg-stone-900 border border-stone-700 rounded p-2 text-white focus:border-rust-500 outline-none" placeholder="Titel" />
                         <div className="grid grid-cols-2 gap-3">
                            <input placeholder="Zustand" type="text" value={editData.condition} onChange={(e) => setEditData({...editData, condition: e.target.value})} className="w-full bg-stone-900 border border-stone-700 rounded p-2 text-stone-300 text-sm focus:border-rust-500 outline-none" />
                            <input placeholder="Kategorie" type="text" value={editData.category} onChange={(e) => setEditData({...editData, category: e.target.value})} className="w-full bg-stone-900 border border-stone-700 rounded p-2 text-stone-300 text-sm focus:border-rust-500 outline-none" />
                         </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-xl font-bold text-white mb-3">{result.title}</p>
                        <div className="flex flex-wrap gap-2">
                            <span className="px-2 py-1 bg-stone-700 text-stone-300 text-xs font-bold rounded uppercase border border-stone-600">{result.condition}</span>
                            <span className="px-2 py-1 bg-stone-900 text-stone-400 text-xs font-bold rounded uppercase border border-stone-800">{result.category}</span>
                            {result.brand_detected && result.brand_detected !== "No Brand" && (
                                <span className="px-2 py-1 bg-rust-900/30 text-rust-400 text-xs font-bold rounded uppercase border border-rust-900">{result.brand_detected}</span>
                            )}
                        </div>
                      </>
                    )}
                </div>
            </div>

            <div className="bg-oil-800 rounded-lg shadow-sm border border-stone-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-stone-700 bg-stone-900/50 flex justify-between items-center">
                    <span className="font-bold text-stone-300 font-industrial uppercase">Beschreibung</span>
                    {!isEditing && <button onClick={() => copyToClipboard(result.description, 'desc')} className="text-rust-500 hover:text-white text-xs font-bold uppercase flex items-center gap-1"><Copy className="w-4 h-4" /> COPY</button>}
                </div>
                <div className="p-4 md:p-6">
                    {isEditing ? (
                       <textarea value={editData.description} onChange={(e) => setEditData({...editData, description: e.target.value})} className="w-full min-h-[200px] bg-stone-900 border border-stone-700 rounded p-2 text-stone-300 text-sm focus:border-rust-500 outline-none leading-relaxed" />
                    ) : (
                      <div className="prose prose-sm text-stone-400 whitespace-pre-line leading-relaxed">{result.description}</div>
                    )}
                </div>
            </div>

            <div className="bg-oil-800 rounded-lg shadow-sm border border-stone-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-stone-700 bg-stone-900/50 flex justify-between items-center">
                    <span className="font-bold text-stone-300 font-industrial uppercase flex gap-2"><Tag className="w-4 h-4"/> Tags</span>
                </div>
                <div className="p-4 md:p-6">
                    {isEditing ? (
                        <textarea value={editData.keywords.join(', ')} onChange={(e) => setEditData({...editData, keywords: e.target.value.split(',').map(s => s.trim())})} className="w-full bg-stone-900 border border-stone-700 rounded p-2 text-stone-300 text-sm focus:border-rust-500 outline-none" />
                    ) : (
                      <div className="flex flex-wrap gap-2">
                          {result.keywords.map((k, idx) => (
                              <span key={idx} className="bg-stone-900 text-rust-500 px-2 py-1 rounded text-xs border border-stone-800 font-mono">#{k}</span>
                          ))}
                      </div>
                    )}
                </div>
            </div>
            
            {/* Tradera Error Banner */}
            {traderaError && (
              <div className="bg-red-950/60 border border-red-800 rounded-lg p-4 text-red-200 text-xs flex flex-col gap-2">
                <div className="flex items-center gap-2 font-bold uppercase text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Tradera Fehler</span>
                </div>
                <p className="leading-relaxed">{traderaError}</p>
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => executeTraderaListing()}
                    className="px-3 py-1.5 bg-red-800 hover:bg-red-700 text-white rounded font-bold uppercase text-[11px]"
                  >
                    Erneut versuchen
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTraderaAuthModal(true)}
                    className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded uppercase text-[11px]"
                  >
                    Tradera-Zugang prüfen
                  </button>
                </div>
              </div>
            )}

            {/* Tradera Progress Banner */}
            {isTraderaListing && traderaProgress && (
              <div className="bg-oil-800 border border-rust-600/50 rounded-lg p-4 space-y-2 animate-pulse">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-rust-400 uppercase flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-rust-500" />
                    Tradera Automatisierung
                  </span>
                  <span className="font-mono text-stone-400 text-[11px]">
                    Schritt {traderaProgress.step} von {traderaProgress.total}
                  </span>
                </div>
                <p className="text-stone-300 text-xs font-medium">{traderaProgress.message}</p>
                <div className="w-full h-1.5 bg-stone-900 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-rust-500 transition-all duration-300"
                    style={{ width: `${Math.round((traderaProgress.step / traderaProgress.total) * 100)}%` }}
                  ></div>
                </div>
              </div>
            )}

            <div className="space-y-3 pb-24 md:pb-0">
              {/* Haupt-Aktion: Auf Tradera erstellen */}
              <div className="hidden md:flex gap-2">
                <button 
                  onClick={handleTraderaCreateClick} 
                  disabled={isTraderaListing}
                  className="flex-1 py-4 bg-rust-600 hover:bg-rust-500 disabled:opacity-50 text-white rounded font-bold text-lg flex items-center justify-center gap-2 shadow-lg shadow-rust-900/40 font-industrial tracking-widest uppercase transition-all"
                >
                  {isTraderaListing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Erstelle Tradera Inserat...</span>
                    </>
                  ) : (
                    <>
                      <ShoppingBag className="w-5 h-5" />
                      <span>Auf Tradera erstellen</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleOpenTraderaOptions}
                  title="Tradera Inserats-Optionen anpassen"
                  className="px-4 py-4 bg-oil-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded border border-stone-700 flex items-center justify-center transition-colors"
                >
                  <SlidersHorizontal className="w-5 h-5" />
                </button>
              </div>

              {/* Sekundär: Kleinanzeigen & Exporte */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                 <button 
                   onClick={handleKleinanzeigenExport} 
                   className="hidden md:flex py-3 bg-oil-800 border border-stone-700 text-stone-300 hover:bg-stone-700 hover:text-white rounded font-medium items-center justify-center gap-2 text-sm uppercase transition-colors"
                 >
                    <ExternalLink className="w-4 h-4" /> Kleinanzeigen
                 </button>
                 <button 
                   onClick={handlePdfExport} 
                   disabled={isGenerating || isEditing} 
                   className="py-3 bg-oil-800 border border-stone-700 text-stone-300 hover:bg-stone-700 rounded font-medium flex items-center justify-center gap-2 text-sm uppercase"
                 >
                    <FileDown className="w-4 h-4" /> PDF
                 </button>
                 <button 
                   onClick={handleZipExport} 
                   disabled={isGenerating || isEditing} 
                   className="py-3 bg-oil-800 border border-stone-700 text-stone-300 hover:bg-stone-700 rounded font-medium flex items-center justify-center gap-2 text-sm uppercase"
                 >
                    <Archive className="w-4 h-4" /> ZIP
                 </button>
              </div>
            </div>
        </div>
      </div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-oil-900 border-t border-stone-800 p-4 shadow-2xl z-20 pb-safe-area">
         <div className="flex gap-2">
           <button 
             onClick={handleTraderaCreateClick} 
             disabled={isTraderaListing}
             className="flex-1 py-3 bg-rust-600 hover:bg-rust-500 disabled:opacity-50 text-white rounded font-bold text-base flex items-center justify-center gap-2 shadow-lg uppercase font-industrial"
           >
             {isTraderaListing ? (
               <>
                 <Loader2 className="w-4 h-4 animate-spin" />
                 <span>Erstelle...</span>
               </>
             ) : (
               <>
                 <ShoppingBag className="w-5 h-5" />
                 <span>Auf Tradera erstellen</span>
               </>
             )}
           </button>
           <button
             type="button"
             onClick={handleOpenTraderaOptions}
             className="p-3 bg-stone-800 text-stone-300 rounded border border-stone-700 flex items-center justify-center"
             title="Optionen"
           >
             <SlidersHorizontal className="w-4 h-4" />
           </button>
           <button 
             onClick={handleKleinanzeigenExport} 
             className="p-3 bg-stone-800 text-stone-300 rounded border border-stone-700 flex items-center justify-center"
             title="Kleinanzeigen"
           >
             <ExternalLink className="w-4 h-4" />
           </button>
         </div>
      </div>

      {isEditorOpen && editorImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 animate-fade-in">
           <div className="bg-oil-900 w-full max-w-2xl rounded overflow-hidden flex flex-col max-h-[90vh] border border-stone-700">
              <div className="p-4 border-b border-stone-800 flex justify-between items-center">
                 <h3 className="text-white font-bold font-industrial uppercase">Bild bearbeiten</h3>
                 <button onClick={() => setIsEditorOpen(false)}><X className="w-6 h-6 text-stone-500 hover:text-white"/></button>
              </div>
              <div className="flex-1 bg-black relative flex items-center justify-center p-4 min-h-[300px] overflow-hidden">
                 {isProcessingBg && (
                    <div className="absolute inset-0 bg-black/80 z-20 flex flex-col items-center justify-center text-white">
                        <Loader2 className="w-10 h-10 animate-spin text-rust-500 mb-2" />
                        <span className="font-industrial text-sm tracking-widest uppercase animate-pulse">Entferne Hintergrund...</span>
                    </div>
                 )}
                 {bgError && (
                    <div className="absolute top-4 left-4 right-4 bg-red-900/90 text-white p-3 rounded flex items-center gap-2 text-xs z-30">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {bgError}
                        <button onClick={() => setBgError(null)} className="ml-auto"><X className="w-4 h-4"/></button>
                    </div>
                 )}
                 <canvas ref={canvasRef} className="max-w-full max-h-[50vh] object-contain" />
              </div>
              <div className="p-6 bg-oil-900 border-t border-stone-800 space-y-6">
                 <div className="grid grid-cols-2 gap-6">
                    <div>
                       <label className="text-xs text-stone-400 mb-2 block uppercase">Helligkeit</label>
                       <input type="range" min="50" max="150" value={editorBrightness} onChange={(e) => setEditorBrightness(parseInt(e.target.value))} className="w-full h-2 bg-stone-700 rounded appearance-none cursor-pointer accent-rust-500" />
                    </div>
                    <div>
                       <label className="text-xs text-stone-400 mb-2 block uppercase">Kontrast</label>
                       <input type="range" min="50" max="150" value={editorContrast} onChange={(e) => setEditorContrast(parseInt(e.target.value))} className="w-full h-2 bg-stone-700 rounded appearance-none cursor-pointer accent-rust-500" />
                    </div>
                 </div>
                 <div className="flex items-center justify-between pt-2 border-t border-stone-800 mt-2">
                    <div className="flex gap-4">
                        <button onClick={() => setEditorRotation(prev => (prev + 90) % 360)} className="flex flex-col items-center gap-1 text-stone-400 hover:text-white group py-2">
                            <RotateCw className="w-5 h-5 group-hover:text-rust-500 transition-colors" /> <span className="text-[10px] uppercase">Drehen</span>
                        </button>
                        
                        {/* Improved BG Removal Button */}
                        <button onClick={handleMagicRemoveBackground} disabled={isProcessingBg} className="flex flex-col items-center gap-1 text-stone-400 hover:text-white group py-2 relative">
                            <div className="relative p-1 border border-stone-700 rounded bg-stone-800 group-hover:bg-rust-900 group-hover:border-rust-500 transition-all">
                               <Wand2 className="w-5 h-5 group-hover:text-rust-500 transition-colors" />
                               <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rust-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rust-500"></span>
                               </span>
                            </div>
                            <span className="text-[10px] uppercase font-bold mt-1 text-rust-500">Freistellen</span>
                        </button>
                    </div>
                    <button onClick={saveEditedImage} className="bg-rust-600 hover:bg-rust-500 text-white px-8 py-3 rounded font-bold uppercase tracking-wider shadow-lg">SPEICHERN</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Tradera Success Modal */}
      {traderaResult && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-4 animate-fade-in">
          <div className="bg-oil-900 w-full max-w-md rounded-xl border border-emerald-700/80 p-6 space-y-5 shadow-2xl text-stone-200">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-full bg-emerald-950 border border-emerald-600 text-emerald-400">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white font-industrial uppercase">
                  Tradera Inserat erstellt!
                </h3>
                <p className="text-xs text-stone-400">
                  {traderaResult.isDraft ? 'Als Entwurf gespeichert' : 'Erfolgreich live geschaltet'}
                </p>
              </div>
            </div>

            <div className="bg-stone-900/80 rounded-lg p-4 border border-stone-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-stone-500">Tradera Artikel-ID:</span>
                <span className="font-mono font-bold text-white">#{traderaResult.itemId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Titel:</span>
                <span className="font-medium text-stone-200 truncate max-w-[200px]">{traderaResult.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Startpreis:</span>
                <span className="font-bold text-rust-400">{traderaResult.price} SEK</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Status:</span>
                <span className="text-emerald-400 font-bold uppercase text-[11px]">
                  {traderaResult.isDraft ? 'Entwurf (Draft)' : 'Aktiv (Live)'}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <a
                href={traderaResult.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 bg-rust-600 hover:bg-rust-500 text-white font-bold uppercase font-industrial text-center rounded flex items-center justify-center gap-2 shadow-lg shadow-rust-900/40"
              >
                <ExternalLink className="w-4 h-4" /> Inserat auf Tradera öffnen
              </a>
              <button
                type="button"
                onClick={() => setTraderaResult(null)}
                className="w-full py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-bold uppercase rounded border border-stone-700"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tradera Auth Required Modal */}
      {showTraderaAuthModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-4 animate-fade-in">
          <div className="bg-oil-900 w-full max-w-lg rounded-xl border border-stone-700 p-6 space-y-4 shadow-2xl text-stone-200">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-rust-500" />
                <h3 className="text-lg font-bold text-white font-industrial uppercase">
                  Tradera Autorisierung
                </h3>
              </div>
              <button onClick={() => setShowTraderaAuthModal(false)} className="text-stone-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-stone-400 leading-relaxed">
              Für das automatische Einstellen auf Tradera wird eine einmalige Benutzer-Autorisierung deines Tradera-Kontos benötigt (App-ID: 6760).
            </p>

            <div className="space-y-3 pt-1">
              <div className="bg-stone-900 p-3 rounded border border-stone-800">
                <span className="text-[11px] font-bold uppercase text-stone-400 block mb-1">Schritt 1: Bei Tradera anmelden</span>
                <a
                  href={getTraderaAuthUrl(getTraderaConfig())}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-rust-600 hover:bg-rust-500 text-white rounded text-xs font-bold uppercase font-industrial"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Tradera Login öffnen
                </a>
              </div>

              <div className="bg-stone-900 p-3 rounded border border-stone-800 space-y-2">
                <span className="text-[11px] font-bold uppercase text-stone-400 block">Schritt 2: Rückleitungs-URL oder Token einfügen</span>
                <input
                  type="text"
                  placeholder="Kopierten Token oder Rückleitungs-URL hier einfügen"
                  value={authPasteInput}
                  onChange={(e) => setAuthPasteInput(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700 rounded p-2.5 text-xs text-stone-200 font-mono focus:border-rust-500 outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleApplyAuthAndList}
                disabled={!authPasteInput.trim()}
                className="flex-1 py-3 bg-rust-600 hover:bg-rust-500 disabled:opacity-40 text-white text-xs font-bold uppercase font-industrial rounded flex items-center justify-center gap-2 shadow-lg shadow-rust-900/40"
              >
                <Check className="w-4 h-4" /> Speichern &amp; Inserat erstellen
              </button>
              <button
                type="button"
                onClick={() => setShowTraderaAuthModal(false)}
                className="px-4 py-3 bg-stone-800 hover:bg-stone-700 text-stone-400 text-xs font-bold uppercase rounded border border-stone-700"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tradera Options Modal */}
      {showTraderaOptionsModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-4 animate-fade-in">
          <div className="bg-oil-900 w-full max-w-md rounded-xl border border-stone-700 p-6 space-y-4 shadow-2xl text-stone-200">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-rust-500" />
                <h3 className="text-lg font-bold text-white font-industrial uppercase">
                  Tradera Optionen
                </h3>
              </div>
              <button onClick={() => setShowTraderaOptionsModal(false)} className="text-stone-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-stone-400 block mb-1 uppercase font-bold text-[11px]">Inserat-Format</label>
                <select
                  value={customTraderaType}
                  onChange={(e) => setCustomTraderaType(parseInt(e.target.value))}
                  className="w-full bg-stone-900 border border-stone-700 rounded p-2.5 text-stone-200 outline-none focus:border-rust-500"
                >
                  <option value={1}>Auktion (ItemType 1)</option>
                  <option value={3}>Festpreis / Köp Nu (ItemType 3)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-stone-400 block mb-1 uppercase font-bold text-[11px]">Startpreis (SEK)</label>
                  <input
                    type="number"
                    min="1"
                    value={customTraderaStartPrice}
                    onChange={(e) => setCustomTraderaStartPrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-stone-900 border border-stone-700 rounded p-2 text-stone-200 outline-none focus:border-rust-500"
                  />
                </div>
                <div>
                  <label className="text-stone-400 block mb-1 uppercase font-bold text-[11px]">Sofortkauf (SEK)</label>
                  <input
                    type="number"
                    min="0"
                    value={customTraderaBuyNow}
                    onChange={(e) => setCustomTraderaBuyNow(parseFloat(e.target.value) || 0)}
                    className="w-full bg-stone-900 border border-stone-700 rounded p-2 text-stone-200 outline-none focus:border-rust-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-stone-400 block mb-1 uppercase font-bold text-[11px]">Laufzeit</label>
                <select
                  value={customTraderaDuration}
                  onChange={(e) => setCustomTraderaDuration(parseInt(e.target.value))}
                  className="w-full bg-stone-900 border border-stone-700 rounded p-2.5 text-stone-200 outline-none focus:border-rust-500"
                >
                  <option value={7}>7 Tage</option>
                  <option value={10}>10 Tage</option>
                  <option value={14}>14 Tage</option>
                  <option value={30}>30 Tage</option>
                </select>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customTraderaAutoCommit}
                    onChange={(e) => setCustomTraderaAutoCommit(e.target.checked)}
                    className="rounded bg-stone-900 border-stone-700 text-rust-600 focus:ring-0 w-4 h-4 accent-rust-600"
                  />
                  <span className="text-stone-300 font-medium text-xs">Sofort live schalten (Auto-Commit)</span>
                </label>
                <span className="text-[10px] text-stone-500 block mt-0.5">
                  Deaktivieren, um das Inserat erst als Entwurf bei Tradera zu hinterlegen.
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-3">
              <button
                type="button"
                onClick={() => executeTraderaListing({
                  itemType: customTraderaType,
                  duration: customTraderaDuration,
                  startPrice: customTraderaStartPrice,
                  buyItNowPrice: customTraderaBuyNow,
                  autoCommit: customTraderaAutoCommit
                })}
                className="flex-1 py-3 bg-rust-600 hover:bg-rust-500 text-white text-xs font-bold uppercase font-industrial rounded flex items-center justify-center gap-2 shadow-lg shadow-rust-900/40"
              >
                <ShoppingBag className="w-4 h-4" /> Inserat jetzt erstellen
              </button>
              <button
                type="button"
                onClick={() => setShowTraderaOptionsModal(false)}
                className="px-4 py-3 bg-stone-800 hover:bg-stone-700 text-stone-400 text-xs font-bold uppercase rounded border border-stone-700"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultView;