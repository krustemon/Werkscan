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
  const ai = new GoogleGenAI({ apiKey });
  
  const finalPrompt = userCondition 
    ? `${SYSTEM_PROMPT}\n\nUSER INFORMATION ZUM ZUSTAND: "${userCondition}". Berücksichtige dies dringend bei der Preisfindung!`
    : SYSTEM_PROMPT;

  return retryOperation(async () => {
    const modelToUse = modelName || "gemini-2.5-flash";
    
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

async function callBlackbox(apiKey: string, base64Image: string, modelName: string, userCondition?: string): Promise<AdAnalysis> {
  const executeCall = async (modelToUse: string) => {
    const finalPrompt = userCondition 
      ? `${SYSTEM_PROMPT}\n\nUSER INFORMATION ZUM ZUSTAND: "${userCondition}".`
      : SYSTEM_PROMPT;

    const response = await fetch("https://api.blackbox.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey.trim()}`,
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
            content: [
              { type: "text", text: "Analysiere dieses Bild und liefere die strukturierte Verkaufsanalyse als JSON zurück." },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      if (response.status === 429) throw new Error(`429 Rate Limit (Blackbox AI): ${err}`);
      throw new Error(`Blackbox AI Error (${response.status}): ${err}`);
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
  };

  const primaryModel = (modelName && modelName.trim()) ? modelName.trim() : "blackboxai";

  return retryOperation(async () => {
    try {
      return await executeCall(primaryModel);
    } catch (err: any) {
      // If primary model failed with 400 (e.g. invalid model name) and wasn't 'blackboxai', fallback to 'blackboxai'
      if (primaryModel !== "blackboxai" && (err?.message?.includes("400") || err?.message?.includes("Invalid model"))) {
        console.warn(`Modell '${primaryModel}' bei Blackbox ungültig. Automatischer Fallback auf 'blackboxai'...`);
        return await executeCall("blackboxai");
      }
      throw err;
    }
  });
}

// --- Image Editing ---

export async function removeBackground(apiKey: string, base64Image: string): Promise<string> {
  if (!apiKey || apiKey.length < 5) {
     throw new Error("API Key fehlt für Bildbearbeitung.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const cleanBase64 = base64Image.replace(/^data:image\/(png|jpg|jpeg|webp);base64,/, "");

  try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: cleanBase64,
              },
            },
            {
              // English prompt works better for image editing operations
              text: 'Segment the main object in this image and place it on a solid white background (#FFFFFF). Do not crop the object. Return only the image.',
            },
          ],
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
  } catch (e: any) {
      console.error("BG Remove Error:", e);
      throw new Error("Fehler beim Freistellen. Bitte später versuchen.");
  }
  
  throw new Error("Kein Bild generiert.");
}

// --- Market Price Check (Search Grounding) ---

export interface MarketCheckResult {
  text: string;
  sources: { uri: string; title: string }[];
}

export async function checkMarketPrices(apiKey: string, title: string, condition: string): Promise<MarketCheckResult> {
  if (!apiKey || apiKey.length < 5) throw new Error("API Key fehlt.");

  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `Recherchiere aktuelle Gebrauchtpreise für "${title}" im Zustand "${condition}" auf Plattformen wie eBay, Kleinanzeigen oder Rebuy.
  Nenne 3 konkrete Preisbeispiele, die du online findest.
  Gib am Ende eine kurze Einschätzung, ob der Preis aktuell eher steigt oder fällt.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "Keine Informationen gefunden.";
    const sources: { uri: string; title: string }[] = [];
    
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    for (const chunk of chunks) {
      if (chunk.web?.uri && chunk.web?.title) {
        sources.push({ uri: chunk.web.uri, title: chunk.web.title });
      }
    }

    return { text, sources };

  } catch (e: any) {
    console.error("Market Check Error:", e);
    throw new Error("Markt-Check fehlgeschlagen: " + e.message);
  }
}

// --- Update Price Analysis (Re-Check) ---

export async function updatePriceAnalysis(apiKey: string, currentData: AdAnalysis): Promise<AdAnalysis> {
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `NEUBERECHNUNG DES PREISES:
    Das Produkt ist: "${currentData.title}"
    Der Zustand ist: "${currentData.condition}"
    Beschreibung: "${currentData.description}"
    
    Bitte schätze den Preis basierend auf diesen korrigierten Daten neu ein.
    Behalte die anderen Felder bei, wenn sie noch passen. Update besonders 'price_estimate', 'shipping_cost' und 'reasoning'.`;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: adAnalysisSchema,
        }
    });

    if (response.text) {
        return JSON.parse(response.text) as AdAnalysis;
    }
    throw new Error("Keine Antwort bei Neuberechnung.");
}


// --- Main Facade Function ---

export const analyzeImage = async (base64Image: string, providers: ApiProviderConfig[], userCondition?: string): Promise<AdAnalysis> => {
  const cleanBase64 = base64Image.replace(/^data:image\/(png|jpg|jpeg|webp);base64,/, "");
  
  const activeProviders = providers.filter(p => p.isEnabled && p.apiKey.length > 5);

  if (activeProviders.length === 0) {
    if (process.env.BLACKBOX_API_KEY) {
       console.log("Using env Blackbox AI key (Backup)");
       return callBlackbox(process.env.BLACKBOX_API_KEY, cleanBase64, "blackboxai", userCondition);
    }
    if (process.env.API_KEY) {
       console.log("Using env Gemini key (Backup)");
       return callGemini(process.env.API_KEY, cleanBase64, "gemini-2.5-flash", userCondition);
    }
    throw new Error("Keine aktiven API-Anbieter konfiguriert.");
  }

  let lastError: any = null;

  for (const provider of activeProviders) {
    console.log(`Versuche Analyse mit ${provider.name} (${provider.model})...`);
    try {
      if (provider.id === 'gemini') {
        return await callGemini(provider.apiKey, cleanBase64, provider.model, userCondition);
      } else if (provider.id === 'openrouter') {
        return await callOpenRouter(provider.apiKey, cleanBase64, provider.model, userCondition);
      } else if (provider.id === 'blackbox') {
        return await callBlackbox(provider.apiKey, cleanBase64, provider.model, userCondition);
      }
    } catch (error: any) {
      console.warn(`Fehler bei ${provider.name}:`, error);
      lastError = error;
    }
  }

  // Backup fallback using environment key if user providers failed
  if (process.env.API_KEY || process.env.GEMINI_API_KEY) {
    const sysKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    console.log("Nutze System Gemini API Key als automatisches Fallback...");
    try {
      return await callGemini(sysKey!, cleanBase64, "gemini-2.5-flash", userCondition);
    } catch (fallbackError: any) {
      console.warn("System Gemini Fallback fehlgeschlagen:", fallbackError);
    }
  }

  const errorMsg = lastError?.message || JSON.stringify(lastError);
  if (errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("RESOURCE_EXHAUSTED");
  }
  
  throw new Error(`Analyse fehlgeschlagen: ${errorMsg}`);
};