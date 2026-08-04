import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Upload, X, Loader2, Sparkles, AlertCircle, RefreshCw, SwitchCamera, Image as ImageIcon, ScanLine, Radio, Check, CopyCheck, Power, Play, Pause, Thermometer, Layers } from 'lucide-react';
import { analyzeImage } from '../services/geminiService';
import { AdAnalysis, AppSettings } from '../types';

interface ScannerProps {
  onAnalysisComplete: (result: AdAnalysis, image: string, additionalImages?: string[]) => void;
  onCancel: () => void;
  isEmbedded?: boolean;
  settings?: AppSettings; 
}

const Scanner: React.FC<ScannerProps> = ({ onAnalysisComplete, onCancel, isEmbedded = false, settings }) => {
  const [mode, setMode] = useState<'upload' | 'camera'>('camera');
  const [image, setImage] = useState<string | null>(null);
  const [additionalImages, setAdditionalImages] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScannedResult, setLastScannedResult] = useState<AdAnalysis | null>(null);
  const [isDuplicateScan, setIsDuplicateScan] = useState(false);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const scanIntervalRef = useRef<number | null>(null);
  const recentScansRef = useRef<{title: string, time: number}[]>([]);

  useEffect(() => {
    return () => {
      stopCameraStream();
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (mode === 'camera' && !image && !isPaused && !isQuotaExceeded) {
      startCamera();
    } else {
      stopCameraStream();
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    }
  }, [mode, image, isPaused, isQuotaExceeded]);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
        startAutoScan();
      }
    } catch (err: any) {
      console.error("Camera Error:", err);
      setError("Kamera Fehler: Zugriff verweigert oder nicht verfügbar.");
      setMode('upload');
    }
  };

  const stopCameraStream = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setCameraActive(false);
    }
  };

  const togglePause = () => {
    if (isQuotaExceeded) {
        setIsQuotaExceeded(false);
        setIsPaused(false);
        setError(null);
        setTimeout(() => startAutoScan(), 1000);
    } else {
        setIsPaused(!isPaused);
    }
  };

  const startAutoScan = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    if (isQuotaExceeded || isPaused) return; 

    setIsDuplicateScan(false);

    // RATE LIMIT FIX: Increased interval to 6000ms (6 seconds) to be safer with limits
    scanIntervalRef.current = window.setInterval(() => {
      if (!isAnalyzing && mode === 'camera' && !image && !isPaused && !isQuotaExceeded) {
        attemptAutoCapture();
      }
    }, 6000); 
  };

  const handleScanSuccess = (result: AdAnalysis, dataUrl: string, isManual: boolean = false, extraImages: string[] = []) => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    
    if (!isManual) {
         const now = Date.now();
         recentScansRef.current = recentScansRef.current.filter(scan => now - scan.time < 120000);

         const clean = (str: string) => str.toLowerCase().replace(/[^a-z0-9äöüß ]/g, '').trim();
         const newTitle = clean(result.title);
         const newWords = new Set(newTitle.split(' ').filter(w => w.length > 2));

         const isDuplicate = recentScansRef.current.some(scan => {
             const lastTitle = clean(scan.title);
             if (lastTitle === newTitle) return true;
             const wordsLast = new Set(lastTitle.split(' ').filter(w => w.length > 2));
             if (wordsLast.size > 0 && newWords.size > 0) {
                 let matchCount = 0;
                 wordsLast.forEach(w => { if (newWords.has(w)) matchCount++; });
                 const overlap = matchCount / Math.max(wordsLast.size, newWords.size); 
                 return overlap > 0.7; 
             }
             return false;
         });

         if (isDuplicate) {
             setIsDuplicateScan(true);
             setTimeout(() => {
                setIsDuplicateScan(false);
                startAutoScan(); 
             }, 2000);
             return;
         }
    }

    recentScansRef.current.push({ title: result.title, time: Date.now() });
    
    setLastScannedResult(result);
    setImage(dataUrl); 
    setAdditionalImages(extraImages);
    
    const speakText = `Gefunden: ${result.title}. Geschätzter Wert: ${result.price_estimate}.`;
    speakResult(speakText);
    
    onAnalysisComplete(result, dataUrl, extraImages);

    setTimeout(() => {
        setImage(null);
        setAdditionalImages([]);
        setLastScannedResult(null);
        startAutoScan(); 
    }, 4000);
  };

  const attemptAutoCapture = useCallback(async () => {
    if (videoRef.current && canvasRef.current && !isAnalyzing && !isQuotaExceeded && !isPaused) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video.readyState !== 4) return; 

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6); // Lower quality slightly for speed
        
        setIsAnalyzing(true);
        try {
          const providers = settings?.providers || [];
          const result = await analyzeImage(dataUrl, providers);
          
          if (result.item_detected) {
            handleScanSuccess(result, dataUrl, false);
          } else {
            console.log("No valid item detected");
          }
        } catch (e: any) {
          const errStr = JSON.stringify(e) + (e.message || "");
          if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("quota")) {
             if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
             setIsQuotaExceeded(true);
             setIsPaused(true); 
             setError("⚠️ Rate Limit. Abkühlung...");
             setIsAnalyzing(false);
             return;
          }
        } finally {
          setIsAnalyzing(false);
        }
      }
    }
  }, [isAnalyzing, mode, onAnalysisComplete, isQuotaExceeded, isPaused, settings]);

  const handleManualCapture = async () => {
    if (isQuotaExceeded) {
       setError("Noch im Cooldown...");
       return;
    }

    if (videoRef.current && canvasRef.current && !isAnalyzing) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setIsAnalyzing(true);
        setError(null);
        setIsDuplicateScan(false);
        try {
          const providers = settings?.providers || [];
          const result = await analyzeImage(dataUrl, providers);
          if (result.item_detected) {
            handleScanSuccess(result, dataUrl, true);
          } else {
            setError("Kein Objekt.");
            setTimeout(() => setError(null), 3000);
          }
        } catch (err: any) {
             const errStr = err.message || JSON.stringify(err);
             if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED")) {
               setIsQuotaExceeded(true);
               setError("Limit erreicht. Warte kurz.");
             } else {
               setError("Fehler.");
             }
             setTimeout(() => setError(null), 3000);
        } finally {
          setIsAnalyzing(false);
        }
      }
    }
  };

  const speakResult = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'de-DE';
      utterance.rate = 1.1;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      setError(null);
      setIsAnalyzing(true);
      
      const loadedImages: string[] = [];
      
      const readImage = (file: File): Promise<string> => {
          return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(file);
          });
      };

      try {
          // Read all images
          for (const file of files) {
              const base64 = await readImage(file as File);
              loadedImages.push(base64);
          }

          // Main image is the first one
          const mainImage = loadedImages[0];
          const extras = loadedImages.slice(1);

          setImage(mainImage);
          setAdditionalImages(extras);

          // Analyze main image
          const providers = settings?.providers || [];
          const result = await analyzeImage(mainImage, providers);
          
          handleScanSuccess(result, mainImage, true, extras);

      } catch (err) {
          setError("Fehler beim Upload/Analyse.");
      } finally {
          setIsAnalyzing(false);
      }
    }
  };

  const handleAnalyze = async () => {
    // Only used if image set but not analyzed (rare case in new flow)
    if (!image) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const providers = settings?.providers || [];
      const result = await analyzeImage(image, providers);
      handleScanSuccess(result, image, true, additionalImages);
    } catch (err: any) {
        setError("Fehler bei Analyse.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const triggerFileSelect = () => fileInputRef.current?.click();
  const resetScanner = () => {
    setImage(null);
    setAdditionalImages([]);
    setError(null);
    setIsAnalyzing(false);
    setLastScannedResult(null);
    if (mode === 'camera') startCamera();
  };

  return (
    <div className={`flex flex-col h-full bg-oil-900 rounded-2xl shadow-sm overflow-hidden animate-fade-in relative transition-colors ${isEmbedded ? 'rounded-3xl' : ''}`}>
      {!isEmbedded && (
        <div className="p-4 border-b border-stone-800 flex justify-between items-center bg-oil-950 text-white z-10">
          <h2 className="text-lg font-semibold flex items-center gap-2 font-industrial">
            {mode === 'camera' ? <Camera className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
            {mode === 'camera' ? 'LIVE SCAN' : 'UPLOAD'}
          </h2>
          <button onClick={onCancel} className="text-stone-400 hover:text-white"><X className="w-6 h-6" /></button>
        </div>
      )}

      {isEmbedded && (
         <div className="absolute top-4 right-4 z-[60] flex gap-2">
             <div className={`backdrop-blur-md px-3 py-1 rounded-sm text-xs font-bold font-mono tracking-wide flex items-center gap-2 border border-white/10 transition-colors uppercase ${
                 isQuotaExceeded ? 'bg-red-900/80 text-white animate-pulse' : 
                 isPaused ? 'bg-amber-600/80 text-white' : 
                 'bg-black/60 text-rust-500'
             }`}>
                {isQuotaExceeded ? (
                   <> <Thermometer className="w-3 h-3" /> COOLING DOWN </>
                ) : isPaused ? (
                   <> <Pause className="w-3 h-3" /> PAUSE </>
                ) : isAnalyzing ? (
                   <> <Loader2 className="w-3 h-3 animate-spin text-rust-400" /> KI... </>
                ) : mode === 'camera' ? (
                   <> <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> AUTO </>
                ) : 'UPLOAD'}
             </div>
             
             {mode === 'camera' && (
                 <button 
                    onClick={togglePause}
                    className={`backdrop-blur-md p-2 rounded-sm border border-white/10 hover:border-white/30 transition-all ${
                        isPaused || isQuotaExceeded ? 'bg-stone-200 text-black' : 'bg-black/60 text-white hover:bg-black/80'
                    }`}
                 >
                    {isPaused || isQuotaExceeded ? <Play className="w-4 h-4 fill-current" /> : <Power className="w-4 h-4" />}
                 </button>
             )}

             <button 
                onClick={() => setMode(mode === 'camera' ? 'upload' : 'camera')}
                className="bg-black/60 backdrop-blur-md p-2 rounded-sm text-white hover:bg-black/80 transition-colors border border-white/10"
             >
                {mode === 'camera' ? <ImageIcon className="w-4 h-4" /> : <SwitchCamera className="w-4 h-4" />}
             </button>
         </div>
      )}

      <div className="flex-1 bg-black relative flex flex-col items-center justify-center overflow-hidden">
        
        {(isPaused || isQuotaExceeded) && mode === 'camera' && !image && (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-oil-950 z-10 text-white p-6 text-center animate-fade-in">
                 <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${isQuotaExceeded ? 'bg-red-900/20 text-red-500 animate-pulse-slow' : 'bg-stone-800 text-stone-500'}`}>
                     {isQuotaExceeded ? <Thermometer className="w-10 h-10" /> : <Power className="w-10 h-10" />}
                 </div>
                 <h3 className="text-xl font-bold mb-2 font-industrial uppercase">
                    {isQuotaExceeded ? 'System Überhitzt' : 'Scanner Offline'}
                 </h3>
                 <p className="text-stone-500 text-xs max-w-xs mb-4">
                    {isQuotaExceeded ? 'Rate Limit erreicht. Warte einen Moment, das System kühlt ab.' : 'Scanner ist pausiert.'}
                 </p>
                 <button 
                    onClick={togglePause}
                    className="px-6 py-3 bg-rust-600 hover:bg-rust-500 text-white rounded font-bold flex items-center gap-2 mt-4 transition-transform active:scale-95"
                 >
                    <RefreshCw className="w-4 h-4" />
                    {isQuotaExceeded ? 'COOLDOWN RESET' : 'NEUSTART'}
                 </button>
             </div>
        )}

        {mode === 'camera' && !image && !isPaused && !isQuotaExceeded && (
          <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-black">
             <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover opacity-90" onLoadedMetadata={() => videoRef.current?.play()} />
             <canvas ref={canvasRef} className="hidden" />
             
             {!isAnalyzing && (
               <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  <div className="absolute inset-0 border-2 border-rust-500/30 rounded-lg m-4"></div>
                  <div className="absolute w-full h-1 bg-gradient-to-r from-transparent via-rust-500 to-transparent opacity-50 top-0 animate-[scan_6s_ease-in-out_infinite]"></div>
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 border border-white/10 rounded-full flex items-center justify-center">
                      <ScanLine className="w-8 h-8 text-rust-500/50 animate-pulse" />
                  </div>
                  {isDuplicateScan && (
                      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 mt-32 bg-amber-600 text-white px-4 py-2 rounded text-sm font-bold shadow-lg uppercase font-mono tracking-tight">
                          <CopyCheck className="w-4 h-4 inline mr-2" /> DUP
                      </div>
                  )}
               </div>
             )}

             <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-50 flex flex-col items-center gap-2">
                <button 
                  onClick={handleManualCapture}
                  disabled={isAnalyzing}
                  className="w-20 h-20 bg-white/10 backdrop-blur-sm rounded-full border-4 border-stone-400 flex items-center justify-center hover:bg-white/20 active:scale-95 shadow-2xl disabled:opacity-50 cursor-pointer"
                >
                   <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center relative pointer-events-none">
                      {isAnalyzing ? <Loader2 className="w-8 h-8 text-rust-600 animate-spin" /> : <div className="w-14 h-14 bg-stone-200 border-2 border-stone-400 rounded-full"></div>}
                   </div>
                </button>
             </div>
          </div>
        )}

        {mode === 'upload' && !image && (
          <div className="bg-oil-900 w-full h-full flex flex-col items-center justify-center p-6">
            <div onClick={triggerFileSelect} className="border-2 border-dashed border-stone-700 rounded-xl p-12 hover:border-rust-500 hover:bg-stone-800 transition-all cursor-pointer group text-center max-w-md w-full relative">
              <div className="absolute top-2 right-2">
                <Layers className="w-5 h-5 text-stone-600" />
              </div>
              <Upload className="w-12 h-12 text-stone-500 group-hover:text-rust-500 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-white mb-2 font-industrial">DATEIEN WÄHLEN</h3>
              <p className="text-stone-500 text-xs">Mehrfachauswahl möglich (JPG, PNG)</p>
            </div>
            <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
          </div>
        )}

        {image && (
          <div className="absolute inset-0 bg-oil-950 z-30 flex flex-col">
             <div className="flex-1 relative overflow-hidden">
                <img src={image} alt="Capture" className="w-full h-full object-cover bg-black opacity-60" />
                {additionalImages.length > 0 && (
                   <div className="absolute bottom-4 right-4 bg-black/80 text-white px-3 py-1 rounded text-xs flex items-center gap-1">
                      <Layers className="w-3 h-3" /> +{additionalImages.length} weitere
                   </div>
                )}
                
                {isAnalyzing && (
                  <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white z-40">
                    <Loader2 className="w-16 h-16 animate-spin text-rust-500" />
                    <p className="mt-6 text-xl font-industrial tracking-widest text-rust-500 animate-pulse">ANALYZING</p>
                  </div>
                )}
                {!isAnalyzing && mode === 'camera' && lastScannedResult && (
                   <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm p-6 text-center animate-fade-in">
                       <Check className="w-16 h-16 text-green-500 mb-4" />
                       <h3 className="text-2xl font-bold text-white mb-2 font-industrial">{lastScannedResult.title}</h3>
                       <p className="text-4xl font-black text-rust-500 font-mono mb-8">{lastScannedResult.price_estimate}</p>
                       <div className="w-48 h-1 bg-stone-800 rounded overflow-hidden">
                           <div className="h-full bg-rust-500 animate-[width_4s_linear] w-full origin-left" style={{animationDuration: '4s', animationName: 'shrink'}}></div>
                       </div>
                   </div>
                )}
             </div>
             
             {!isAnalyzing && mode === 'upload' && (
                <div className="p-6 bg-oil-900 flex flex-col gap-4 relative z-50 border-t border-stone-800">
                   {additionalImages.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {additionalImages.map((img, i) => (
                           <img key={i} src={img} className="w-10 h-10 object-cover rounded border border-stone-700" />
                        ))}
                      </div>
                   )}
                   <button onClick={() => handleAnalyze()} className="w-full py-4 bg-rust-600 hover:bg-rust-700 text-white rounded font-bold text-lg flex items-center justify-center gap-2 font-industrial tracking-wider shadow-lg shadow-rust-900/50">
                     <Sparkles className="w-5 h-5" /> ANALYSE STARTEN
                   </button>
                   <button onClick={resetScanner} className="w-full py-3 text-stone-400 hover:text-white font-medium flex items-center justify-center gap-2">
                     <RefreshCw className="w-4 h-4" /> Reset
                   </button>
                </div>
             )}
          </div>
        )}
      </div>
      <style>{`
        @keyframes scan { 0% { top: 0%; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
        @keyframes shrink { from { width: 100%; } to { width: 0%; } }
      `}</style>
    </div>
  );
};

export default Scanner;