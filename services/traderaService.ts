import { AdAnalysis, TraderaConfig, TraderaListingResult, TraderaCategory } from '../types';

export const DEFAULT_TRADERA_CONFIG: TraderaConfig = {
  appId: '6760',
  appKey: '3091c31e-12be-489e-b0db-9ef3dcc20f56',
  publicKey: '546a162e-94b3-4c7e-b166-745fecd0c933',
  authorizationUrl: 'https://api.tradera.com/token-login?',
  redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/` : '',
  token: '',
  userId: '',
  tokenExpires: '',
  isConnected: false,
  defaultItemType: 1, // 1 = Auktion, 3 = Endast Köp Nu (Direktkauf)
  defaultDuration: 7, // 7 Tage
  defaultShippingProviderId: 6, // Annat fraktsätt / Standard
  defaultShippingCost: 59, // 59 SEK (~5 EUR)
  autoCommit: true, // Direkt live schalten
  currencyRateEurToSek: 11.5 // 1 EUR ≈ 11.5 SEK
};

const TRADERA_STORAGE_KEY = 'werkaholic_tradera_config';

/**
 * Holt die Tradera-Konfiguration aus LocalStorage oder den Standard-Werten.
 */
export const getTraderaConfig = (): TraderaConfig => {
  try {
    const raw = localStorage.getItem(TRADERA_STORAGE_KEY);
    const defaultUri = typeof window !== 'undefined' ? `${window.location.origin}/` : '';
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_TRADERA_CONFIG,
        ...parsed,
        // Ensure user keys from prompt are preserved if not overridden
        appId: parsed.appId || DEFAULT_TRADERA_CONFIG.appId,
        appKey: parsed.appKey || DEFAULT_TRADERA_CONFIG.appKey,
        publicKey: parsed.publicKey || DEFAULT_TRADERA_CONFIG.publicKey,
        redirectUri: parsed.redirectUri || defaultUri,
        isConnected: Boolean(parsed.token && parsed.token.length > 10 && parsed.userId)
      };
    }
  } catch (e) {
    console.error("Fehler beim Laden der Tradera-Konfiguration:", e);
  }
  return DEFAULT_TRADERA_CONFIG;
};

/**
 * Speichert die Tradera-Konfiguration persistent.
 */
export const saveTraderaConfig = (config: Partial<TraderaConfig>): TraderaConfig => {
  const current = getTraderaConfig();
  const updated: TraderaConfig = {
    ...current,
    ...config,
    isConnected: Boolean((config.token || current.token) && (config.userId || current.userId))
  };
  try {
    localStorage.setItem(TRADERA_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error("Fehler beim Speichern der Tradera-Konfiguration:", e);
  }
  return updated;
};

/**
 * Generiert die URL für den Tradera Token-Login Flow.
 */
export const getTraderaAuthUrl = (config = getTraderaConfig()): string => {
  const base = config.authorizationUrl.endsWith('?')
    ? config.authorizationUrl
    : `${config.authorizationUrl}?`;
  return `${base}appId=${encodeURIComponent(config.appId)}&pkey=${encodeURIComponent(config.publicKey)}`;
};

/**
 * Extrahiert Token, User-ID und Ablaufdatum aus Parametern oder Hash (z. B. nach Redirect).
 */
export const parseTraderaCallback = (urlStringOrSearch: string): { token?: string; userId?: string; exp?: string } | null => {
  try {
    let search = urlStringOrSearch;
    if (search.includes('?')) {
      search = search.substring(search.indexOf('?') + 1);
    } else if (search.includes('#')) {
      search = search.substring(search.indexOf('#') + 1);
    }
    const params = new URLSearchParams(search);
    const token = params.get('token');
    const userId = params.get('userId') || params.get('userid') || params.get('user_id');
    const exp = params.get('exp') || params.get('expires');

    if (token) {
      return {
        token: decodeURIComponent(token),
        userId: userId ? decodeURIComponent(userId) : undefined,
        exp: exp ? decodeURIComponent(exp) : undefined
      };
    }
  } catch (e) {
    console.error("Fehler beim Parsen des Tradera Callbacks:", e);
  }
  return null;
};

/**
 * Ermittelt den API Base-Pfad:
 * Nutzt im Browser den Vite Proxy `/api/tradera` um CORS zu umgehen.
 */
const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined' && window.location.hostname !== '') {
    return '/api/tradera';
  }
  return 'https://api.tradera.com';
};

/**
 * Erstellt Standard-Header für Tradera REST API v4 inklusive OAuth 2.0 Authorization Header.
 */
export const getHeaders = (config = getTraderaConfig(), requireUser = false): Record<string, string> => {
  const headers: Record<string, string> = {
    'X-App-Id': config.appId ? config.appId.trim() : '',
    'X-App-Key': config.appKey ? config.appKey.trim() : '',
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  const rawToken = config.token ? config.token.trim() : '';
  const cleanToken = rawToken.startsWith('Bearer ') ? rawToken.slice(7).trim() : rawToken;

  if (requireUser || cleanToken) {
    if (cleanToken) {
      // 1. Standard OAuth 2.0 Authorization Header (Bearer Token)
      headers['Authorization'] = `Bearer ${cleanToken}`;
      // 2. Tradera REST API v4 Custom Token Header
      headers['X-User-Token'] = cleanToken;
    }
    if (config.userId && config.userId.trim()) {
      headers['X-User-Id'] = config.userId.trim();
    }
  }

  return headers;
};

export interface TraderaVerifyResult {
  ok: boolean;
  status?: number;
  message: string;
  userId?: string;
  sentHeaders?: Record<string, string>;
  pwaRedirectUri?: string;
  configuredRedirectUri?: string;
  redirectUriMatches?: boolean;
}

/**
 * Überprüft die Gültigkeit der Tradera-Zugangsdaten (Token & App-Key) und liefert Netzwerk-Diagnose.
 */
export const verifyTraderaConnection = async (config = getTraderaConfig()): Promise<TraderaVerifyResult> => {
  const currentPwaUrl = typeof window !== 'undefined' ? `${window.location.origin}/` : '';
  const configuredUri = config.redirectUri || currentPwaUrl;
  const uriMatches = !config.redirectUri || config.redirectUri.trim() === currentPwaUrl;

  if (!config.token || !config.userId) {
    return {
      ok: false,
      status: 401,
      message: 'Kein Benutzer-Token oder User-ID hinterlegt (401 Unauthorized). Bitte zuerst über den Tradera Login-Flow anmelden oder Token einfügen.',
      pwaRedirectUri: currentPwaUrl,
      configuredRedirectUri: configuredUri,
      redirectUriMatches: uriMatches
    };
  }

  const baseUrl = getApiBaseUrl();
  const headers = getHeaders(config, true);

  // Maskierte Header für sichere UI-Diagnose
  const maskedHeaders: Record<string, string> = { ...headers };
  if (maskedHeaders['Authorization']) {
    maskedHeaders['Authorization'] = maskedHeaders['Authorization'].slice(0, 15) + '...[MASKED]';
  }
  if (maskedHeaders['X-User-Token']) {
    maskedHeaders['X-User-Token'] = maskedHeaders['X-User-Token'].slice(0, 8) + '...[MASKED]';
  }
  if (maskedHeaders['X-App-Key']) {
    maskedHeaders['X-App-Key'] = maskedHeaders['X-App-Key'].slice(0, 8) + '...[MASKED]';
  }

  try {
    const res = await fetch(`${baseUrl}/v4/listings/seller-items`, {
      method: 'GET',
      headers: headers
    });

    if (res.ok) {
      return {
        ok: true,
        status: res.status,
        message: `Erfolgreich autorisiert als Tradera Verkäufer #${config.userId}!`,
        userId: config.userId,
        sentHeaders: maskedHeaders,
        pwaRedirectUri: currentPwaUrl,
        configuredRedirectUri: configuredUri,
        redirectUriMatches: uriMatches
      };
    }

    let errorDetail = '';
    try {
      const errJson = await res.json();
      errorDetail = errJson.error?.message || errJson.message || JSON.stringify(errJson);
    } catch {
      errorDetail = await res.text();
    }

    if (res.status === 401) {
      return {
        ok: false,
        status: 401,
        message: `Tradera meldet 401 Unauthorized (${errorDetail || 'User is not authorized'}). Der OAuth-Token-Header wurde gesendet, aber der Token ist abgelaufen oder ungültig. Bitte erneuere die Anmeldung.`,
        sentHeaders: maskedHeaders,
        pwaRedirectUri: currentPwaUrl,
        configuredRedirectUri: configuredUri,
        redirectUriMatches: uriMatches
      };
    }

    if (res.status === 403) {
      return {
        ok: false,
        status: 403,
        message: `Tradera meldet 403 Forbidden (${errorDetail || 'Zugriff verweigert'}). Authentifizierung empfangen, aber der Account besitzt keine Verkäuferberechtigung oder der Token ist ungültig.`,
        sentHeaders: maskedHeaders,
        pwaRedirectUri: currentPwaUrl,
        configuredRedirectUri: configuredUri,
        redirectUriMatches: uriMatches
      };
    }

    return {
      ok: false,
      status: res.status,
      message: `Tradera Antwort (${res.status}): ${errorDetail.slice(0, 150)}`,
      sentHeaders: maskedHeaders,
      pwaRedirectUri: currentPwaUrl,
      configuredRedirectUri: configuredUri,
      redirectUriMatches: uriMatches
    };
  } catch (error: any) {
    return {
      ok: false,
      message: `Verbindungsfehler: ${error?.message || 'Tradera Server nicht erreichbar'}`,
      sentHeaders: maskedHeaders,
      pwaRedirectUri: currentPwaUrl,
      configuredRedirectUri: configuredUri,
      redirectUriMatches: uriMatches
    };
  }
};

/**
 * Beliebte und vorkonfigurierte Tradera-Kategorien für Werkzeuge & Elektronik.
 */
export const POPULAR_TRADERA_CATEGORIES: TraderaCategory[] = [
  { id: 302432, name: 'Akkuschrauber & Schlagschrauber', fullName: 'Bygg & Verktyg > Maskiner > Skruv- & mutterdragare' },
  { id: 301790, name: 'Bohrmaschinen & Bohrhämmer', fullName: 'Bygg & Verktyg > Maskiner > Borrmaskiner' },
  { id: 343322, name: 'Winkelschleifer (Flex)', fullName: 'Bygg & Verktyg > Maskiner > Vinkelslipar' },
  { id: 301806, name: 'Schleifmaschinen & Multischleifer', fullName: 'Bygg & Verktyg > Maskiner > Slipmaskiner' },
  { id: 301792, name: 'Sägen (Kreis-, Stich- & Säbelsägen)', fullName: 'Bygg & Verktyg > Maskiner > Maskinsågar' },
  { id: 302433, name: 'Sonstige Maschinen & Elektrowerkzeuge', fullName: 'Bygg & Verktyg > Maskiner > Övriga maskiner' },
  { id: 302408, name: 'Handwerkzeuge (Schlüssel, Zangen, etc.)', fullName: 'Bygg & Verktyg > Verktyg' },
  { id: 302415, name: 'Werkstatt & Aufbewahrung', fullName: 'Bygg & Verktyg > Verkstad' },
  { id: 301811, name: 'Baubedarf & Heimwerker', fullName: 'Bygg & Verktyg > Övriga byggartiklar' },
  { id: 17, name: 'Unterhaltungselektronik & Audio', fullName: 'Hemelektronik' },
  { id: 12, name: 'Computer, IT & Zubehör', fullName: 'Datorer & Tillbehör' },
  { id: 26, name: 'Smartphones, Tablets & Zubehör', fullName: 'Telefoni & Tablets' },
  { id: 25, name: 'Sport, Outdoor & Freizeit', fullName: 'Sport & Fritid' },
  { id: 31, name: 'Haus, Garten & Haushalt', fullName: 'Hem & Hushåll' },
  { id: 2805, name: 'Sonstiges / Allgemein', fullName: 'Övrigt > Övrigt' }
];

/**
 * Schlägt basierend auf Titel, Zustand und KI-Analyse die beste Tradera-Kategorie vor.
 */
export const suggestTraderaCategory = (analysis: AdAnalysis): TraderaCategory => {
  const text = `${analysis.title} ${analysis.category} ${analysis.description} ${analysis.keywords.join(' ')}`.toLowerCase();

  if (text.includes('akkuschrauber') || text.includes('schrauber') || text.includes('mutterdragare') || text.includes('drill')) {
    return POPULAR_TRADERA_CATEGORIES[0];
  }
  if (text.includes('bohr') || text.includes('bohrhammer') || text.includes('schlagbohr')) {
    return POPULAR_TRADERA_CATEGORIES[1];
  }
  if (text.includes('flex') || text.includes('winkelschleifer') || text.includes('trennjäger')) {
    return POPULAR_TRADERA_CATEGORIES[2];
  }
  if (text.includes('schleif') || text.includes('bandschleifer') || text.includes('exzenterschleifer')) {
    return POPULAR_TRADERA_CATEGORIES[3];
  }
  if (text.includes('säge') || text.includes('stichsäge') || text.includes('kreissäge') || text.includes('kappsäge')) {
    return POPULAR_TRADERA_CATEGORIES[4];
  }
  if (text.includes('makita') || text.includes('bosch') || text.includes('dewalt') || text.includes('milwaukee') || text.includes('festool') || text.includes('hilti')) {
    return POPULAR_TRADERA_CATEGORIES[5];
  }
  if (text.includes('schlüssel') || text.includes('zange') || text.includes('hammer') || text.includes('knarre') || text.includes('ratsche') || text.includes('werkzeug')) {
    return POPULAR_TRADERA_CATEGORIES[6];
  }
  if (text.includes('werkbank') || text.includes('werkstatt') || text.includes('koffer') || text.includes('systainer')) {
    return POPULAR_TRADERA_CATEGORIES[7];
  }
  if (text.includes('handy') || text.includes('iphone') || text.includes('samsung') || text.includes('ipad') || text.includes('tablet')) {
    return POPULAR_TRADERA_CATEGORIES[11];
  }
  if (text.includes('laptop') || text.includes('computer') || text.includes('pc') || text.includes('tastatur') || text.includes('monitor')) {
    return POPULAR_TRADERA_CATEGORIES[10];
  }
  if (text.includes('radio') || text.includes('box') || text.includes('lautsprecher') || text.includes('kamera') || text.includes('fernseher')) {
    return POPULAR_TRADERA_CATEGORIES[9];
  }

  return POPULAR_TRADERA_CATEGORIES[8]; // Bygg & Verktyg general
};

/**
 * Parst einen Euro- oder SEK-Preisstring in einen numerischen ganzzahligen Betrag für Tradera (SEK).
 */
export const calculateTraderaPrice = (priceEstimate: string, rate = 11.5): { startPrice: number; buyItNowPrice?: number } => {
  try {
    const matches = priceEstimate.match(/(\d+[.,]?\d*)/g);
    if (!matches || matches.length === 0) {
      return { startPrice: 150 }; // Fallback ~150 SEK (~13 EUR)
    }

    const numbers = matches.map(m => parseFloat(m.replace(',', '.')));
    let eurVal = numbers[0];

    if (numbers.length >= 2) {
      // Wenn Bereich "150€ - 200€", nimm untere Grenze als Auktionsstart, obere als Sofortkauf
      const minEur = Math.min(...numbers);
      const maxEur = Math.max(...numbers);
      const startSek = Math.max(1, Math.round(minEur * rate));
      const binSek = Math.max(startSek + 50, Math.round(maxEur * rate));
      return { startPrice: startSek, buyItNowPrice: binSek };
    }

    // Einzelner Preis
    const sek = Math.max(1, Math.round(eurVal * rate));
    return { startPrice: sek, buyItNowPrice: Math.round(sek * 1.25) };
  } catch (e) {
    return { startPrice: 150 };
  }
};

export interface CreateListingOptions {
  categoryId?: number;
  itemType?: 1 | 3; // 1 = Auction, 3 = Buy Now
  startPrice?: number;
  buyItNowPrice?: number;
  duration?: number;
  shippingCost?: number;
  autoCommit?: boolean;
  onProgress?: (statusText: string, step: number, totalSteps: number) => void;
}

/**
 * Erstellt automatisch ein Inserat auf Tradera:
 * 1. Inserat anlegen (POST /v4/listings/items)
 * 2. Alle Produktbilder hochladen (POST /v4/listings/items/{requestId}/images)
 * 3. Inserat final veröffentlichen (POST /v4/listings/items/{requestId}/commit)
 */
export const createTraderaListing = async (
  analysis: AdAnalysis,
  images: string[],
  options?: CreateListingOptions
): Promise<TraderaListingResult> => {
  const config = getTraderaConfig();
  if (!config.token || !config.userId) {
    throw new Error('Tradera ist nicht autorisiert. Bitte verknüpfe zuerst deinen Tradera-Account in den Einstellungen oder im Dialog.');
  }

  const baseUrl = getApiBaseUrl();
  const onProgress = options?.onProgress || (() => {});

  // 1. Parameter vorbereiten
  const category = options?.categoryId || suggestTraderaCategory(analysis).id;
  const itemType = options?.itemType ?? config.defaultItemType;
  const duration = options?.duration ?? (itemType === 3 ? 30 : config.defaultDuration);

  const priceCalc = calculateTraderaPrice(analysis.price_estimate, config.currencyRateEurToSek);
  const startPrice = options?.startPrice ?? priceCalc.startPrice;
  const buyItNowPrice = options?.buyItNowPrice ?? (itemType === 3 ? startPrice : priceCalc.buyItNowPrice);

  const shippingCost = options?.shippingCost ?? config.defaultShippingCost;
  const autoCommit = options?.autoCommit ?? config.autoCommit;

  // Tradera Titel limit: 80 Zeichen
  const cleanTitle = analysis.title.trim().slice(0, 80);

  // Saubere Beschreibung mit Zustand und Tags
  const fullDescription = [
    analysis.title,
    '',
    analysis.description,
    '',
    `Zustand / Skick: ${analysis.condition}`,
    analysis.brand_detected ? `Hersteller: ${analysis.brand_detected}` : '',
    analysis.shipping_cost ? `Versandinfo: ${analysis.shipping_cost}` : '',
    analysis.keywords && analysis.keywords.length > 0 ? `Suchbegriffe: ${analysis.keywords.join(', ')}` : '',
    '',
    '---',
    'Erstellt mit Werkaholic AI - Produktscanner'
  ].filter(Boolean).join('\n');

  // Item condition attribute: 1 = Ny (Neu), 2 = Begagnad (Gebraucht)
  const isNew = analysis.condition.toLowerCase().includes('neu') || analysis.condition.toLowerCase().includes('new');
  const itemAttributes = [isNew ? 1 : 2];

  // Request Body für ItemRequest
  const itemPayload: Record<string, any> = {
    title: cleanTitle,
    description: fullDescription,
    categoryId: category,
    duration: duration,
    itemType: itemType,
    startPrice: startPrice,
    autoCommit: false, // Erst nach Bildern commiten!
    itemAttributes: itemAttributes,
    acceptedBidderId: 4, // 4 = Inom EU (Within EU)
    paymentOptionIds: [16384, 4], // Swish/Kort/PayPal + Banküberweisung
    shippingOptions: [
      {
        shippingOptionId: config.defaultShippingProviderId || 6,
        cost: shippingCost
      }
    ]
  };

  if (itemType === 1 && buyItNowPrice && buyItNowPrice > startPrice) {
    itemPayload.buyItNowPrice = buyItNowPrice;
  } else if (itemType === 3) {
    itemPayload.buyItNowPrice = buyItNowPrice || startPrice;
  }

  const totalSteps = 2 + Math.min(images.length, 5);
  onProgress('Erstelle Inserat-Entwurf auf Tradera...', 1, totalSteps);

  // --- STEP 1: Inserat initial erstellen ---
  const createRes = await fetch(`${baseUrl}/v4/listings/items`, {
    method: 'POST',
    headers: getHeaders(config, true),
    body: JSON.stringify(itemPayload)
  });

  if (!createRes.ok) {
    let errorDetail = '';
    try {
      const errJson = await createRes.json();
      errorDetail = errJson.message || errJson.error?.message || JSON.stringify(errJson);
    } catch {
      errorDetail = await createRes.text();
    }
    if (createRes.status === 401) {
      throw new Error(`Tradera 401 Unauthorized: Die Authentifizierung ist ungültig oder abgelaufen (${errorDetail}). Bitte überprüfe den Token und die Redirect-URI in den Einstellungen.`);
    }
    if (createRes.status === 403) {
      throw new Error(`Tradera 403 Forbidden: Zugriff verweigert (${errorDetail}). Dein Tradera-Benutzerkonto benötigt Verkäuferberechtigung.`);
    }
    throw new Error(`Tradera Fehler beim Erstellen (${createRes.status}): ${errorDetail}`);
  }

  const createData = await createRes.json();
  const requestId = createData.requestId;
  const itemId = createData.itemId;

  if (!requestId) {
    throw new Error('Ungültige Serverantwort von Tradera: Keine requestId erhalten.');
  }

  // --- STEP 2: Produktbilder hochladen ---
  const imagesToUpload = images.slice(0, 5); // Bis zu 5 Bilder hochladen
  let uploadedCount = 0;

  for (let i = 0; i < imagesToUpload.length; i++) {
    const rawImg = imagesToUpload[i];
    onProgress(`Lade Produktbild ${i + 1} von ${imagesToUpload.length} hoch...`, 2 + i, totalSteps);

    try {
      // Data-URL Präfix entfernen: "data:image/jpeg;base64," -> pure Base64
      let base64Data = rawImg;
      let format = 1; // 1 = Jpeg, 2 = Png
      if (rawImg.includes(',')) {
        const parts = rawImg.split(',');
        base64Data = parts[1];
        if (parts[0].includes('png')) format = 2;
      }

      const imgRes = await fetch(`${baseUrl}/v4/listings/items/${requestId}/images`, {
        method: 'POST',
        headers: getHeaders(config, true),
        body: JSON.stringify({
          imageData: base64Data,
          imageFormat: format,
          hasMega: false
        })
      });

      if (imgRes.ok) {
        uploadedCount++;
      } else {
        console.warn(`Bild ${i + 1} Upload-Warnung:`, imgRes.status);
      }
    } catch (imgErr) {
      console.warn(`Bild ${i + 1} konnte nicht hochgeladen werden:`, imgErr);
    }
  }

  // --- STEP 3: Commit (Veröffentlichung) ---
  if (autoCommit) {
    onProgress('Veröffentliche Inserat live auf Tradera...', totalSteps, totalSteps);
    const commitRes = await fetch(`${baseUrl}/v4/listings/items/${requestId}/commit`, {
      method: 'POST',
      headers: getHeaders(config, true)
    });

    if (!commitRes.ok) {
      console.warn('Commit fehlgeschlagen, bleibt als Entwurf erhalten:', commitRes.status);
    }
  }

  const finalUrl = `https://www.tradera.com/item/${itemId}`;

  return {
    requestId: requestId,
    itemId: itemId,
    url: finalUrl,
    title: cleanTitle,
    price: startPrice,
    isDraft: !autoCommit
  };
};
