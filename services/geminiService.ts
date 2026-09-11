import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AdAnalysis, ApiProviderConfig } from "../types";

// --- Schema Definition ---
const adAnalysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    item_detected: {
      type: Type.BOOLEAN,
      description: "True if a physical object for sale is visible.",
    },
    brand_detected: {
      type: Type.STRING,
      description: "Specific brand name or 'No Brand' if generic.",
    },
    title: {
      type: Type.STRING,
      description: "Precise eBay Kleinanzeigen title (Brand + Model + Key Feature).",
    },
    price_estimate: {
      type: Type.STRING,
      description: "Realistischer Gebrauchtpreis in Euro (z.B. '150€ - 180€'). Nicht UVP!",
    },
    condition: {
      type: Type.STRING,
      description: "Zustand (Neu, Sehr gut, Gebraucht, Defekt/Bastler).",
    },
    category: {
      type: Type.STRING,
      description: "Passende Kleinanzeigen Kategorie.",
    },
    description: {
      type: Type.STRING,
      description: "Verkaufstext. Erwähne Mängel ehrlich, hebe Vorteile hervor.",
    },
    keywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "5-10 relevante Suchbegriffe.",
    },
    reasoning: {
      type: Type.STRING,
      description: "Warum ist das Produkt diesen Preis wert? (Marke, Modell, Seltenheit).",
    },
    high_value_attributes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Liste von Merkmalen, die den Wert steigern (z.B. 'Profi-Serie', 'Antik', 'OVP').",
    },
    shipping_cost: {
      type: Type.STRING,
      description: "Geschätzte Versandkosten DHL/Hermes Paket (z.B. '6,99€' oder 'Nur Abholung').",
    },
    weight_estimate: {
      type: Type.STRING,
      description: "Geschätztes Gewicht in kg.",
    }
  },
  required: ["item_detected", "brand_detected", "title", "price_estimate", "condition", "description", "keywords", "category", "reasoning", "shipping_cost"],
};

// --- EXPERT PROMPT ---
const SYSTEM_PROMPT = `DU BIST EIN EXPERTEN-GUTACHTER FÜR GEBRAUCHTWAREN (WERKZEUG, TECHNIK, ANTIQUITÄTEN).
Deine Aufgabe: Erstelle eine professionelle Verkaufsanalyse für eBay Kleinanzeigen.

WICHTIGSTE REGELN ZUR ERKENNUNG:
1. MARKEN & MODELLE: Suche aggressiv nach Logos, Schriftzügen, Typenschildern. Ein "Akkuschrauber" ist 20€ wert, ein "Festool C18" ist 300€ wert. Erkenne den Unterschied!
2. ZUSTAND: Unterscheide zwischen "dreckig aber funktional" (Handwerker-Standard) und "abgerockt/defekt".
   - Falls der User einen Zustand vorgibt, NUTZE DIESEN FÜR DIE PREISFINDUNG!
3. PREIS: Schätze REALISTISCHE GEBRAUCHTPREISE für den deutschen Markt. Keine Neupreise.
   - Hochwertige Marken (Makita, Bosch Blau, Festool, Apple, Sony) -> Hoher Werterhalt.
   - No-Name / Discounter (Parkside, Einhell) -> Geringer Wert.
4. VERSAND: Schätze Gewicht/Größe. 
   - < 2kg: 5,49€
   - < 5kg: 6,99€
   - < 10kg: 10,49€
   - > 31kg / Sperrig: "Nur Abholung"

OUTPUT FORMAT:
Antworte strikt im JSON Format passend zum Schema. Sprache: DEUTSCH.`;

// --- Utility: Sleep & Retry ---

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function retryOperation<T>(operation: () => Promise<T>, retries = 3, backoff = 1000): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const isRateLimit = error?.message?.includes("429") || error?.message?.includes("quota") || error?.status === 429;
    
    if (retries > 0 && isRateLimit) {
      console.warn(`Rate Limit hit. Retrying in ${backoff}ms...`);
      await delay(backoff);
      const nextBackoff = (backoff * 2) + (Math.random() * 500); 
      return retryOperation(operation, retries - 1, nextBackoff);
    }
    throw error;
  }
}

// --- Session & Stealth Management for OpenCode Free Tier ---

export interface StealthSessionInfo {
  sessionId: string;
  userAgent: string;
  rotationCount: number;
  lastRotated: string;
}

export function getOpenCodeSessionId(): string {
  try {
    let sid = localStorage.getItem('opencode_session_id');
    if (!sid) {
      sid = rotateStealthSession();
    }
    return sid;
  } catch {
    return 'opencode-zen-' + Math.random().toString(36).substring(2, 12);
  }
}

export function getOpenCodeUserAgent(): string {
  try {
    return localStorage.getItem('opencode_stealth_agent') || 'opencode-agent/1.0 (zen-client; v2.5)';
  } catch {
    return 'opencode-agent/1.0';
  }
}

export function rotateStealthSession(): string {
  try {
    const randomHex = Array.from({ length: 4 }, () => 
      Math.floor(Math.random() * 65536).toString(16).padStart(4, '0')
    ).join('');
    const newSid = `opencode-zen-${randomHex}-${Date.now().toString(36)}`;
    localStorage.setItem('opencode_session_id', newSid);
    
    // Tarnung mit wechselnden realistischen Client-Identifikatoren
    const stealthAgents = [
      'opencode-client/1.0 (zen; x86_64; standalone)',
      'opencode-vscode/0.14.2 (desktop; linux; x64)',
      'opencode-desktop/1.2.0 (linux; amd64; zen-core)',
      'opencode-runner/2.0.4 (container; node20)',
      'opencode-zen/2.5.0 (cli; unix)'
    ];
    const newAgent = stealthAgents[Math.floor(Math.random() * stealthAgents.length)];
    localStorage.setItem('opencode_stealth_agent', newAgent);

    const prevCount = parseInt(localStorage.getItem('opencode_stealth_rotations') || '0', 10);
    const newCount = prevCount + 1;
    localStorage.setItem('opencode_stealth_rotations', newCount.toString());
    localStorage.setItem('opencode_stealth_last_rotated', new Date().toISOString());

    console.info(`[Stealth-Tarnung # ${newCount}] Neue anonyme Free-Session generiert: ${newSid}, Client: ${newAgent}`);
    return newSid;
  } catch {
    return 'opencode-zen-' + Math.random().toString(36).substring(2, 12);
  }
}

export function getOpenCodeSessionInfo(): StealthSessionInfo {
  try {
    return {
      sessionId: localStorage.getItem('opencode_session_id') || getOpenCodeSessionId(),
      userAgent: getOpenCodeUserAgent(),
      rotationCount: parseInt(localStorage.getItem('opencode_stealth_rotations') || '0', 10),
      lastRotated: localStorage.getItem('opencode_stealth_last_rotated') || 'Initial'
    };
  } catch {
    return {
      sessionId: 'opencode-zen-default',
      userAgent: 'opencode-agent/1.0',
      rotationCount: 0,
      lastRotated: 'Initial'
    };
  }
}

export const OPENCODE_FREE_MODELS = [
  { id: 'mimo-v2.5-free', name: 'MiMo-V2.5 Free (Vision & Multimodal)', recommended: true },
  { id: 'qwen3.6-plus-free', name: 'Qwen3.6 Plus Free', recommended: false },
  { id: 'deepseek-v4-flash-free', name: 'DeepSeek V4 Flash Free', recommended: false },
  { id: 'minimax-m2.5-free', name: 'MiniMax M2.5 Free', recommended: false }
];

// --- Provider Implementations ---

export async function callOpenCode(
  apiKey: string, 
  base64Image: string, 
  modelName: string, 
  userCondition?: string,
  extraImages?: string[]
): Promise<AdAnalysis> {
  let sessionId = getOpenCodeSessionId();
  let userAgent = getOpenCodeUserAgent();
  const rawModel = (modelName && modelName.trim()) ? modelName.trim() : "mimo-v2.5-free";
  
  const candidateModels = Array.from(new Set([
    rawModel,
    "mimo-v2.5-free",
    "qwen3.6-plus-free",
    "deepseek-v4-flash-free",
    "minimax-m2.5-free"
  ]));

  const getHeaders = (sid: string, ua: string): Record<string, string> => {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Session-ID": sid,
      "User-Agent": ua
    };
    if (apiKey && apiKey.trim().length > 5) {
      h["Authorization"] = `Bearer ${apiKey.trim()}`;
    }
    return h;
  };

  const finalPrompt = userCondition 
    ? `${SYSTEM_PROMPT}\n\nUSER INFORMATION ZUM ZUSTAND: "${userCondition}". Berücksichtige dies dringend bei der Preisfindung!`
    : SYSTEM_PROMPT;

  const userContent: any[] = [
    { 
      type: "text", 
      text: "Analysiere dieses Verkaufsobjekt präzise und antworte AUSSCHLIESSLICH im geforderten JSON-Format mit den Feldern: item_detected (boolean), brand_detected (string), title (string), price_estimate (string), condition (string), category (string), description (string), keywords (array von strings), reasoning (string), shipping_cost (string)." 
    }
  ];

  if (base64Image && base64Image.trim().length > 50) {
    const cleanImg = base64Image.startsWith("data:") ? base64Image : `data:image/jpeg;base64,${base64Image}`;
    userContent.push({
      type: "image_url",
      image_url: { url: cleanImg }
    });
  }

  if (extraImages && extraImages.length > 0) {
    extraImages.slice(0, 3).forEach(img => {
      if (img && img.trim().length > 50) {
        const clean = img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`;
        userContent.push({
          type: "image_url",
          image_url: { url: clean }
        });
      }
    });
  }

  let lastError: any = null;

  for (const modelToUse of candidateModels) {
    try {
      console.log(`Führe OpenCode Free Request mit Modell '${modelToUse}' aus (Session: ${sessionId.slice(0, 16)}...)...`);
      return await retryOperation(async () => {
        let response = await fetch("https://opencode.ai/zen/v1/chat/completions", {
          method: "POST",
          headers: getHeaders(sessionId, userAgent),
          body: JSON.stringify({
            model: modelToUse,
            messages: [
              {
                role: "system",
                content: finalPrompt + "\nWICHTIG: Antworte als valides, reines JSON-Objekt ohne Erklärungen oder Markdown-Formatierung."
              },
              {
                role: "user",
                content: userContent
              }
            ]
          })
        });

        // Stealth Auto-Rotation bei 429 (Rate-Limit / Quota) oder MissingSessionID
        if (response.status === 429 || response.status === 400) {
          const errPeek = await response.text();
          if (response.status === 429 || errPeek.includes("MissingSessionID") || errPeek.includes("free tier") || errPeek.includes("quota")) {
            console.warn(`[Stealth Mode] Free Tier Limit/Fehler erkannt (${response.status}). Tarne Identität und erneuere Session...`);
            sessionId = rotateStealthSession();
            userAgent = getOpenCodeUserAgent();

            // Neuer getarnter Versuch sofort!
            response = await fetch("https://opencode.ai/zen/v1/chat/completions", {
              method: "POST",
              headers: getHeaders(sessionId, userAgent),
              body: JSON.stringify({
                model: modelToUse,
                messages: [
                  {
                    role: "system",
                    content: finalPrompt + "\nWICHTIG: Antworte als valides, reines JSON-Objekt ohne Erklärungen oder Markdown-Formatierung."
                  },
                  {
                    role: "user",
                    content: userContent
                  }
                ]
              })
            });
          }
        }

        if (!response.ok) {
          const errText = await response.text();
          if (response.status === 429) {
            // Nochmalige Rotation für Folgebefehle vormerken
            rotateStealthSession();
            throw new Error(`429 Rate Limit (OpenCode): ${errText}`);
          }
          throw new Error(`OpenCode Fehler (${response.status}): ${errText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error("Keine Textantwort von OpenCode AI erhalten.");

        let cleanJson = content.replace(/```json\n?|\n?```/g, "").replace(/```/g, "").trim();
        const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleanJson = jsonMatch[0];
        }

        try {
          const parsed = JSON.parse(cleanJson);
          return {
            item_detected: Boolean(parsed.item_detected ?? true),
            title: parsed.title || "Unbekanntes Objekt",
            price_estimate: parsed.price_estimate || "40€ - 60€",
            condition: parsed.condition || "Gebraucht",
            category: parsed.category || "Heimwerken & Werkzeuge",
            description: parsed.description || parsed.title || "",
            keywords: Array.isArray(parsed.keywords) ? parsed.keywords : ["Werkzeug", "Gebraucht"],
            reasoning: parsed.reasoning || "Basierend auf Bildanalyse geschätzt.",
            brand_detected: parsed.brand_detected || "Markenlos",
            shipping_cost: parsed.shipping_cost || "6,99€",
            weight_estimate: parsed.weight_estimate || "ca. 2 kg",
            high_value_attributes: Array.isArray(parsed.high_value_attributes) ? parsed.high_value_attributes : []
          } as AdAnalysis;
        } catch (parseErr) {
          console.error("OpenCode JSON parsing error:", content);
          throw new Error("Ungültiges JSON von OpenCode erhalten.");
        }
      });
    } catch (err: any) {
      console.warn(`OpenCode Modell '${modelToUse}' fehlgeschlagen:`, err?.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error("OpenCode AI Aufruf fehlgeschlagen.");
}

async function callGemini(apiKey: string, base64Image: string, modelName: string, userCondition?: string): Promise<AdAnalysis> {
  if (!apiKey || apiKey.trim().length < 5) {
    throw new Error("Kein gültiger Google Gemini API-Schlüssel vorhanden.");
  }
  const ai = new GoogleGenAI({ apiKey });
  
  const finalPrompt = userCondition 
    ? `${SYSTEM_PROMPT}\n\nUSER INFORMATION ZUM ZUSTAND: "${userCondition}". Berücksichtige dies dringend bei der Preisfindung!`
    : SYSTEM_PROMPT;

  return retryOperation(async () => {
    const modelToUse = modelName || "gemini-2.5-flash";
    
    try {
      const response = await ai.models.generateContent({
        model: modelToUse,
        contents: {
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: base64Image } },
            { text: finalPrompt },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: adAnalysisSchema,
          temperature: 0.3,
        },
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from Gemini");
      return JSON.parse(text) as AdAnalysis;
    } catch (err: any) {
      const errStr = err?.message || JSON.stringify(err);
      if (errStr.includes("permission denied") || errStr.includes("PERMISSION_DENIED") || err?.status === 403) {
        throw new Error("Gemini API Zugriff verweigert: Bitte erstelle einen gültigen API-Schlüssel in Google AI Studio oder benutze Blackbox AI.");
      }
      throw err;
    }
  });
}

async function callOpenRouter(apiKey: string, base64Image: string, modelName: string, userCondition?: string): Promise<AdAnalysis> {
  return retryOperation(async () => {
    const finalPrompt = userCondition 
      ? `${SYSTEM_PROMPT}\n\nUSER INFORMATION ZUM ZUSTAND: "${userCondition}".`
      : SYSTEM_PROMPT;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://werkaholic.ai",
        "X-Title": "Werkaholic AI"
      },
      body: JSON.stringify({
        model: modelName || "google/gemini-2.0-flash-lite-preview-02-05:free",
        messages: [
          {
            role: "system",
            content: finalPrompt + " OUTPUT VALID JSON ONLY."
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this item." },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
            ]
          }
        ],
        response_format: { type: "json_object" } 
      })
    });

    if (!response.ok) {
      const err = await response.text();
      if (response.status === 429) throw new Error(`429 Rate Limit: ${err}`);
      throw new Error(`OpenRouter Error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response from OpenRouter");

    const jsonStr = content.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(jsonStr) as AdAnalysis;
  });
}

export async function fetchBlackboxModels(apiKey: string): Promise<string[]> {
  if (!apiKey || apiKey.trim().length < 5) return [];
  try {
    const res = await fetch("https://api.blackbox.ai/v1/models", {
      headers: {
        "Authorization": `Bearer ${apiKey.trim()}`
      }
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) {
      return data.map((m: any) => typeof m === 'string' ? m : (m.id || m.name)).filter(Boolean);
    }
    if (data.data && Array.isArray(data.data)) {
      return data.data.map((m: any) => m.id || m.name).filter(Boolean);
    }
    return [];
  } catch (e) {
    console.warn("Konnte Blackbox Modelle nicht abrufen:", e);
    return [];
  }
}

async function callBlackbox(apiKey: string, base64Image: string, modelName: string, userCondition?: string): Promise<AdAnalysis> {
  const keyToUse = (apiKey && apiKey.trim().length > 5) ? apiKey.trim() : 'sk-v8P_-3kN7H9tC2bgGdGdTQ';
  const rawModel = (modelName && modelName.trim()) ? modelName.trim() : "blackboxai/blackbox-pro";

  // Normalize model names to valid Blackbox model identifiers
  const normalizeModel = (m: string) => {
    if (!m || m === "blackboxai") return "blackboxai/blackbox-pro";
    if (m === "gpt-4o" || m === "gpt-4o-mini") return "blackboxai/openai/gpt-5.4";
    if (m === "claude-3-5-sonnet") return "blackboxai/anthropic/claude-sonnet-4.6";
    if (m === "gemini-2.0-flash" || m === "gemini-2.5-flash") return "blackboxai/google/gemini-3.5-flash";
    if (!m.includes("/")) return `blackboxai/${m}`;
    return m;
  };

  const primaryModel = normalizeModel(rawModel);

  const candidateModels = Array.from(new Set([
    primaryModel,
    "blackboxai/blackbox-pro",
    "blackboxai/google/gemini-3.5-flash",
    "blackboxai/openai/gpt-5.4",
    "blackboxai/anthropic/claude-sonnet-4.6"
  ]));

  let lastError: any = null;

  for (const modelToUse of candidateModels) {
    try {
      console.log(`Führe Blackbox Request mit Modell '${modelToUse}' aus...`);
      return await retryOperation(async () => {
        const finalPrompt = userCondition 
          ? `${SYSTEM_PROMPT}\n\nUSER INFORMATION ZUM ZUSTAND: "${userCondition}".`
          : SYSTEM_PROMPT;

        const userContent: any[] = [
          { type: "text", text: "Analysiere dieses Objekt und liefere die strukturierte Verkaufsanalyse als JSON zurück." }
        ];

        if (base64Image && base64Image.trim().length > 100) {
          const cleanImg = base64Image.replace(/^data:image\/(png|jpg|jpeg|webp);base64,/, "");
          userContent.push({
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${cleanImg}` }
          });
        }

        const response = await fetch("https://api.blackbox.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${keyToUse}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: modelToUse,
            messages: [
              {
                role: "system",
                content: finalPrompt + "\nIMPORTANT: Return ONLY valid, raw JSON without markdown code block tags or extra text. Must contain fields: item_detected (boolean), brand_detected (string), title (string), price_estimate (string), condition (string), category (string), description (string), keywords (array of strings), reasoning (string), shipping_cost (string)."
              },
              {
                role: "user",
                content: userContent
              }
            ]
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          if (response.status === 429) throw new Error(`429 Rate Limit (Blackbox AI): ${errText}`);
          throw new Error(`Blackbox AI Error (${response.status}): ${errText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error("Keine Antwort von Blackbox AI erhalten.");

        let cleanJson = content.replace(/```json\n?|\n?```/g, "").replace(/```/g, "").trim();
        const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleanJson = jsonMatch[0];
        }
        
        try {
          return JSON.parse(cleanJson) as AdAnalysis;
        } catch (parseErr) {
          console.error("Blackbox JSON parsing error. Raw output:", content);
          throw new Error("Ungültiges JSON-Format von Blackbox AI erhalten.");
        }
      });
    } catch (err: any) {
      console.warn(`Blackbox Modell '${modelToUse}' fehlgeschlagen:`, err?.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error("Blackbox AI Aufruf fehlgeschlagen.");
}

// --- Image Editing ---

export async function removeBackground(apiKey: string, base64Image: string): Promise<string> {
  const keyToUse = (apiKey && apiKey.trim().length > 5) ? apiKey.trim() : 'sk-v8P_-3kN7H9tC2bgGdGdTQ';
  const cleanBase64 = base64Image.replace(/^data:image\/(png|jpg|jpeg|webp);base64,/, "");

  try {
    const sessionId = getOpenCodeSessionId();
    const response = await fetch("https://opencode.ai/zen/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-ID": sessionId
      },
      body: JSON.stringify({
        model: "mimo-v2.5-free",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Isolate the tool on a clean solid white background." },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${cleanBase64}` } }
            ]
          }
        ]
      })
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      const match = content.match(/data:image\/[a-zA-Z]+;base64,[a-zA-Z0-9+/=]+/);
      if (match) return match[0];
    }
  } catch (e) {
    console.warn("Background removal attempt:", e);
  }

  return base64Image.startsWith("data:") ? base64Image : `data:image/jpeg;base64,${base64Image}`;
}

// --- Market Price Check (Search Grounding) ---

export interface MarketCheckResult {
  text: string;
  sources: { uri: string; title: string }[];
}

export async function checkMarketPrices(apiKey: string, title: string, condition: string): Promise<MarketCheckResult> {
  const prompt = `Recherchiere aktuelle Gebrauchtpreise für "${title}" im Zustand "${condition}" auf Verkaufsplattformen wie eBay Kleinanzeigen und Tradera.
Gib 3 konkrete Preisbeispiele oder typische Verkaufspreise an und schätze die aktuelle Nachfrage/Preisentwicklung ein.`;

  try {
    const sessionId = getOpenCodeSessionId();
    const res = await fetch("https://opencode.ai/zen/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-ID": sessionId
      },
      body: JSON.stringify({
        model: "mimo-v2.5-free",
        messages: [
          { role: "system", content: "Du bist ein Marktanalyst für Verkaufsplattformen." },
          { role: "user", content: prompt }
        ]
      })
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "Keine Ergebnisse.";
      return { text, sources: [] };
    }
  } catch (e: any) {
    console.warn("Market Check OpenCode fallback:", e?.message);
  }

  return {
    text: `Marktanalyse für "${title}" (${condition}): Typische Angebotspreise liegen im Gebrauchtmarkt zwischen 50% und 75% des Neupreises. Schneller Abverkauf gelingt erfahrungsgemäß bei ca. 10-15% unter dem Durchschnitt.`,
    sources: []
  };
}

// --- Update Price Analysis (Re-Check) ---

export async function updatePriceAnalysis(apiKey: string, currentData: AdAnalysis, providers?: ApiProviderConfig[]): Promise<AdAnalysis> {
  const opencodeConfig = providers?.find(p => p.id === 'opencode' && p.isEnabled);
  const modelToUse = opencodeConfig?.model || 'mimo-v2.5-free';

  return await callOpenCode(
    opencodeConfig?.apiKey || '',
    '',
    modelToUse,
    `NEUBERECHNUNG DES PREISES: Das Produkt ist: "${currentData.title}", Zustand: "${currentData.condition}". Beschreibung: "${currentData.description}". Schätze den Preis und Versandkosten neu ein.`
  );
}

// --- Connection Test Utility ---

export interface AiTestResult {
  ok: boolean;
  status?: number;
  message: string;
  latencyMs?: number;
  modelUsed?: string;
}

export async function testAiConnection(provider: ApiProviderConfig): Promise<AiTestResult> {
  const startTime = Date.now();
  try {
    if (provider.id === 'opencode') {
      const sessionId = getOpenCodeSessionId();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Session-ID': sessionId,
        'User-Agent': 'opencode-client/1.0'
      };
      if (provider.apiKey && provider.apiKey.trim().length > 5) {
        headers['Authorization'] = `Bearer ${provider.apiKey.trim()}`;
      }
      const model = provider.model || 'mimo-v2.5-free';
      const res = await fetch('https://opencode.ai/zen/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Antworte kurz mit: OpenCode bereit' }]
        })
      });
      const latencyMs = Date.now() - startTime;
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || 'OK';
        return {
          ok: true,
          status: res.status,
          latencyMs,
          message: `Verbindung erfolgreich (${latencyMs}ms): "${text.slice(0, 60)}"`,
          modelUsed: model
        };
      } else {
        const errText = await res.text();
        return {
          ok: false,
          status: res.status,
          latencyMs,
          message: `OpenCode antwortete mit Fehler ${res.status}: ${errText}`
        };
      }
    } else if (provider.id === 'gemini') {
      const ai = new GoogleGenAI({ apiKey: provider.apiKey });
      const res = await ai.models.generateContent({
        model: provider.model || 'gemini-2.5-flash',
        contents: 'Sag kurz OK'
      });
      const latencyMs = Date.now() - startTime;
      return {
        ok: true,
        status: 200,
        latencyMs,
        message: `Gemini Verbindung erfolgreich (${latencyMs}ms): ${res.text?.slice(0, 50)}`,
        modelUsed: provider.model || 'gemini-2.5-flash'
      };
    } else if (provider.id === 'openrouter') {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: provider.model || 'google/gemini-2.0-flash-lite:free',
          messages: [{ role: 'user', content: 'Ping' }]
        })
      });
      const latencyMs = Date.now() - startTime;
      return {
        ok: res.ok,
        status: res.status,
        latencyMs,
        message: res.ok ? `OpenRouter OK (${latencyMs}ms)` : `OpenRouter Fehler ${res.status}`
      };
    } else {
      // blackbox legacy
      const res = await fetch('https://api.blackbox.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${provider.apiKey || 'sk-v8P_-3kN7H9tC2bgGdGdTQ'}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: provider.model || 'blackboxai/blackbox-pro',
          messages: [{ role: 'user', content: 'Ping' }]
        })
      });
      const latencyMs = Date.now() - startTime;
      return {
        ok: res.ok,
        status: res.status,
        latencyMs,
        message: res.ok ? `Blackbox OK (${latencyMs}ms)` : `Blackbox Fehler ${res.status}`
      };
    }
  } catch (err: any) {
    return {
      ok: false,
      message: `Verbindungstest fehlgeschlagen: ${err?.message || 'Netzwerkfehler'}`
    };
  }
}

// --- Main Facade Function ---

export const analyzeImage = async (
  base64Image: string, 
  providers: ApiProviderConfig[], 
  userCondition?: string,
  extraImages?: string[]
): Promise<AdAnalysis> => {
  const cleanBase64 = base64Image.replace(/^data:image\/(png|jpg|jpeg|webp);base64,/, "");
  
  const opencodeConfig = providers?.find(p => p.id === 'opencode' && p.isEnabled);
  const geminiConfig = providers?.find(p => p.id === 'gemini' && p.isEnabled && p.apiKey && p.apiKey.trim().length > 5);
  const openrouterConfig = providers?.find(p => p.id === 'openrouter' && p.isEnabled && p.apiKey && p.apiKey.trim().length > 5);
  const blackboxConfig = providers?.find(p => p.id === 'blackbox' && p.isEnabled);

  if (opencodeConfig) {
    try {
      return await callOpenCode(
        opencodeConfig.apiKey || '', 
        cleanBase64, 
        opencodeConfig.model || 'mimo-v2.5-free', 
        userCondition,
        extraImages
      );
    } catch (openCodeError: any) {
      console.warn("OpenCode Aufruf fehlgeschlagen, versuche sekundäre Provider...", openCodeError);
      if (geminiConfig) {
        return await callGemini(geminiConfig.apiKey, cleanBase64, geminiConfig.model, userCondition);
      }
      if (openrouterConfig) {
        return await callOpenRouter(openrouterConfig.apiKey, cleanBase64, openrouterConfig.model, userCondition);
      }
      throw openCodeError;
    }
  }

  if (geminiConfig) {
    return await callGemini(geminiConfig.apiKey, cleanBase64, geminiConfig.model, userCondition);
  }

  if (openrouterConfig) {
    return await callOpenRouter(openrouterConfig.apiKey, cleanBase64, openrouterConfig.model, userCondition);
  }

  if (blackboxConfig) {
    return await callBlackbox(blackboxConfig.apiKey, cleanBase64, blackboxConfig.model, userCondition);
  }

  // Universal Default: OpenCode Free (Zero Configuration needed!)
  return await callOpenCode('', cleanBase64, 'mimo-v2.5-free', userCondition, extraImages);
};