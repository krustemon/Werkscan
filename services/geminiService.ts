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

// --- Provider Implementations ---

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
      const response = await fetch("https://api.blackbox.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${keyToUse}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "blackboxai/nano-banana/edit",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Remove the background and place the main object on a clean solid white background." },
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
      console.warn("Blackbox background remove attempt failed:", e);
  }

  return base64Image.startsWith("data:") ? base64Image : `data:image/jpeg;base64,${base64Image}`;
}

// --- Market Price Check (Search Grounding) ---

export interface MarketCheckResult {
  text: string;
  sources: { uri: string; title: string }[];
}

export async function checkMarketPrices(apiKey: string, title: string, condition: string): Promise<MarketCheckResult> {
  const keyToUse = (apiKey && apiKey.trim().length > 5) ? apiKey.trim() : 'sk-v8P_-3kN7H9tC2bgGdGdTQ';
  try {
    const prompt = `Recherchiere aktuelle Gebrauchtpreise für "${title}" im Zustand "${condition}" auf Verkaufsplattformen wie eBay Kleinanzeigen.
Gib 3 konkrete Preisbeispiele oder typische Verkaufspreise an und schätze die aktuelle Nachfrage/Preisentwicklung ein.`;

    const res = await fetch("https://api.blackbox.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${keyToUse}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "blackboxai/blackbox-pro",
        messages: [
          { role: "system", content: "Du bist ein Marktanalyst für Verkaufsplattformen." },
          { role: "user", content: prompt }
        ]
      })
    });

    if (!res.ok) throw new Error(`Blackbox Fehler ${res.status}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "Keine Ergebnisse.";
    return { text, sources: [] };
  } catch (e: any) {
    console.error("Market Check Error:", e);
    throw new Error("Markt-Check fehlgeschlagen: " + e.message);
  }
}

// --- Update Price Analysis (Re-Check) ---

export async function updatePriceAnalysis(apiKey: string, currentData: AdAnalysis, providers?: ApiProviderConfig[]): Promise<AdAnalysis> {
    const blackboxConfig = providers?.find(p => p.id === 'blackbox' && p.isEnabled && p.apiKey && p.apiKey.trim().length > 5);
    const keyToUse = blackboxConfig?.apiKey || (apiKey && apiKey.length > 5 ? apiKey : '') || process.env.BLACKBOX_API_KEY || 'sk-v8P_-3kN7H9tC2bgGdGdTQ';
    const modelToUse = blackboxConfig?.model || 'blackboxai';

    return await callBlackbox(
      keyToUse, 
      "", 
      modelToUse, 
      `NEUBERECHNUNG DES PREISES: Das Produkt ist: "${currentData.title}", Zustand: "${currentData.condition}". Beschreibung: "${currentData.description}". Schätze den Preis und Versandkosten neu ein.`
    );
}


// --- Main Facade Function ---

export const analyzeImage = async (base64Image: string, providers: ApiProviderConfig[], userCondition?: string): Promise<AdAnalysis> => {
  const cleanBase64 = base64Image.replace(/^data:image\/(png|jpg|jpeg|webp);base64,/, "");
  
  const blackboxConfig = providers?.find(p => p.id === 'blackbox' && p.isEnabled && p.apiKey && p.apiKey.trim().length > 5);
  const apiKey = blackboxConfig?.apiKey || process.env.BLACKBOX_API_KEY || 'sk-v8P_-3kN7H9tC2bgGdGdTQ';
  const model = blackboxConfig?.model || 'blackboxai';

  try {
    return await callBlackbox(apiKey, cleanBase64, model, userCondition);
  } catch (error: any) {
    const errorMsg = error?.message || JSON.stringify(error);
    if (errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("RESOURCE_EXHAUSTED");
    }
    throw new Error(`Analyse fehlgeschlagen: ${errorMsg}`);
  }
};