require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { ApifyClient } = require('apify-client');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const APIFY_TOKEN = process.env.APIFY_TOKEN;

const TARGET_PAGES = [
  "https://facebook.com/barpraha",
  "https://facebook.com/onyxmusicclub",
  "https://facebook.com/undergroundpubtg"
];

async function parsePostWithGemini(postContent, sourceUrl) {
  if (!GEMINI_API_KEY) return null;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const prompt = `
Jesteś filtrem wydarzeń dla portalu TG Events (Tarnowskie Góry).
Analizujesz tekst wpisu z Facebooka.

ZASADY:
1. Sprawdź czy post dotyczy KONKRETNEGO WYDARZENIA z datą i godziną (koncert, impreza, pub quiz, warsztaty).
2. Jeśli post dotyczy TYLKO MENU, jedzenia, piwa, promocji gastronomicznej lub godzin otwarcia - ZWRÓĆ DOKŁADNIE: null.
3. Jeśli to wydarzenie, zwróć WYŁĄCZNIE czysty obiekt JSON (bez markdowna).

FORMAT JSON:
{
  "id": "${Date.now()}-${Math.floor(Math.random() * 1000)}",
  "title": "Tytuł wydarzenia",
  "date": "DD.MM.YYYY",
  "time": "HH:MM",
  "location": "Lokalizacja w Tarnowskich Górach",
  "category": "plener | muzyka | kultura",
  "price": "Cena lub Bezpłatne",
  "isFree": true/false,
  "imageUrl": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600",
  "sourceUrl": "${sourceUrl}"
}

Tekst: "${postContent.replace(/"/g, "'")}"
`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await response.json();
    if (!data.candidates || !data.candidates[0].content) return null;

    const rawText = data.candidates[0].content.parts[0].text.trim();
    if (rawText === "null" || rawText.includes("null")) return null;

    const cleanedJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanedJson);
  } catch (err) {
    return null;
  }
}

async function run() {
  console.log("🚀 Pobieranie żywych postów z FB przez Apify + Gemini AI...\n");
  
  if (!APIFY_TOKEN) {
    console.error("❌ Brak APIFY_TOKEN w .env.local!");
    return;
  }

  const client = new ApifyClient({ token: APIFY_TOKEN });
  const eventsPath = path.join(__dirname, '../data/events.json');
  let currentEvents = [];

  try {
    currentEvents = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
  } catch (e) {
    currentEvents = [];
  }

  // Uruchomienie bezpiecznego scrapera FB na Apify
  const run = await client.actor("apify/facebook-posts-scraper").call({
    startUrls: TARGET_PAGES.map(url => ({ url })),
    resultsLimit: 3
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  let addedCount = 0;

  for (const item of items) {
    const text = item.text || item.caption || "";
    const url = item.url || "https://facebook.com";

    if (!text) continue;

    console.log(`🔎 Analiza posta z: ${url}`);
    const event = await parsePostWithGemini(text, url);

    if (event) {
      const exists = currentEvents.some(e => e.title === event.title && e.date === event.date);
      if (!exists) {
        currentEvents.push(event);
        addedCount++;
        console.log(`  ✨ DODANO WYDARZENIE: "${event.title}" (${event.date})`);
      }
    } else {
      console.log(`  ❌ Odrzucono (menu/promocja)`);
    }
  }

  fs.writeFileSync(eventsPath, JSON.stringify(currentEvents, null, 2));
  console.log(`\n🎉 Zakończono! Dodano nowych wydarzeń: ${addedCount}`);
}

run();