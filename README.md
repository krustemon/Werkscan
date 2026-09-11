# Werkaholic AI 🛠️📦

**Werkaholic AI** ist eine intelligente, mobile-optimierte Web- & PWA-Anwendung zur blitzschnellen Erfassung, KI-gestützten Analyse und automatisierten Einstellung von Verkaufsartikeln (Werkzeuge, Elektronik, Sammlerstücke, Gebrauchtwaren) auf Verkaufsplattformen wie **Tradera** und Kleinanzeigenmärkten.

---

## 🎯 Wofür ist die App gedacht?

Wer regelmäßig Werkzeuge, Maschinen, Elektronik oder Second-Hand-Artikel online verkauft, kennt den zeitraubenden Ablauf:
1. Fotos schießen
2. Modellnummern und technische Details recherchieren
3. Realistische Gebrauchtmarktpreise und Versandkosten ermitteln
4. Verkaufsfördernde Titel und detaillierte Beschreibungen formulieren
5. Relevante Suchbegriffe recherchieren
6. Manuell auf Verkaufsplattformen einstellen

**Werkaholic AI automatisiert diesen gesamten Workflow in wenigen Sekunden:**
Ein Foto reicht aus – die KI erkennt das Produkt, den optischen Zustand, schätzt den Marktwert und erstellt ein sofort verkaufsfertiges Inserat inklusive direkter Schnittstelle zu Tradera.

---

## ⚡ Hauptfunktionen im Überblick

### 1. 📷 KI-gestützte Produkterkennung & Mehrfach-Scan
- **Live-Kamera & Datei-Upload**: Schnelle Erfassung über Kamera mit Taschenlampen-Unterstützung oder Upload bestehender Fotos (inklusive Drag & Drop).
- **Multi-Bilderfassung**: Erfassung von Hauptansicht, Typenschild/Seriennummer, Zubehör und eventuellen Mängeln in einer Serie.
- **Batch-Scan-Modus**: Mehrere Produkte nacheinander ohne Unterbrechung fotografieren und verarbeiten.

### 2. 🧠 OpenCode AI Free-Tier (Standard-KI)
- **Zero-Config Sofortstart**: Kein bezahlter API-Schlüssel zwingend erforderlich – OpenCode Zen Free-Tier ist ab Werk integriert.
- **Top-Modelle integriert**:
  - `mimo-v2.5-free`: Optimiert für Bilderkennung, Produktdetails und Modelltypschilder.
  - `qwen3.6-plus-free`: Präzise technische Detailanalysen und Wertermittlung.
  - `deepseek-v4-flash-free`: Blitzschnelle Antworten für Serienanalysen.
  - `minimax-m2.5-free`: Ausdrucksstarke, verkaufsstarke Inseratstexte.
- **Fallback-Kaskade**: Automatische Umschaltung auf Google Gemini (`gemini-2.5-flash`), OpenRouter oder andere Anbieter bei Nichtverfügbarkeit.

### 3. 🛡️ Intelligente Stealth-Tarnung & Auto-Session-Rotation
- **Unterbrechungsfreier Free-Tier**: Bei Erreichen von temporären Server-Limits (HTTP 429 / Quota Exceeded) rotiert die App automatisch die Session-ID und passt den Client-Fingerprint an.
- **Manuelle Tarn-Steuerung**: Im Einstellungsmenü kann jederzeit per Klick eine frische Identität generiert werden.
- **Live-Verbindungstest**: Integrierter Ping-Test für alle KI-Provider direkt in den Einstellungen mit Anzeige von Latenz und HTTP-Status.

### 4. 🛒 Direkte Tradera-Marktplatz-Anbindung
- **Ein-Klick-Inserat**: Automatische Übertragung von Titel, Beschreibung, Zustand, Preis und Bildern an Tradera.
- **Auktions- & Sofortkauf-Optionen**: Laufzeit (3–14 Tage), Startpreis ab 0 SEK / EUR und optionaler Sofort-Kaufen-Preis.
- **Live-Fortschrittsanzeige**: Schrittweise Rückmeldung während der API-Übertragung.
- **Sichere Token-Verwaltung**: Tradera App-ID, App-Key und Token werden sicher im lokalen Browser-Speicher abgelegt.

### 5. 🎨 Bildbearbeitung & Freisteller
- **KI-Hintergrundentfernung**: Isoliert Werkzeuge und Artikel auf reinweißem Hintergrund für professionelle Marktplatz-Bilder.
- **Bildbearbeitung**: Drehen (90°-Schritte), Helligkeits- & Kontrastkorrektur, Farbfilter und Zuschneiden.

### 6. 💾 Lokale Datenbank & Offline-Archiv
- **IndexedDB-Speicher**: Alle gescannten Artikel und hochauflösenden Fotos bleiben persistent im Browser gespeichert – kein Datenverlust beim Neuladen.
- **Historie & Suche**: Filterung nach Kategorien, Suchbegriffen oder Zustand sowie Schnellwiederaufnahme gespeicherter Entwürfe.

### 7. 📤 Universeller Export
- **ZIP-Paket**: Lädt alle Bilder und den Inseratstext als handliches Archiv herunter (z. B. für Kleinanzeigen oder eBay).
- **PDF-Exposé**: Erzeugt ein druckfertiges Datenblatt mit Bildern und Spezifikationen.

---

## 🚀 Erste Schritte

1. **App öffnen**: Die Anwendung startet direkt im Scanner-Modus.
2. **Foto aufnehmen**: Richte die Kamera auf das Typenschild oder das Gesamtprodukt und tippe auf den Auslöser.
3. **Zustand auswählen**: Wähle optional den Zustand (z. B. *Sehr gut*, *Gebraucht*, *Defekt/Ersatzteil*).
4. **Analysieren**: Tippe auf **„ANALYSIEREN“** – die KI ermittelt Titel, Hersteller, Modell, Kategorie, Preisspanne und Beschreibung.
5. **Inserieren**: Passe die Daten nach Wunsch an und exportiere sie als ZIP, PDF oder lade sie direkt zu Tradera hoch.

---

## 🔒 Datenschutz & Privatsphäre

- Alle API-Keys, Tradera-Zugangsdaten und gescannten Artikelbilder werden **ausschließlich lokal** in Ihrem Browser (IndexedDB & LocalStorage) gespeichert.
- Es findet kein Tracking und kein Upload auf externe Drittanbieter-Datenbanken statt.
