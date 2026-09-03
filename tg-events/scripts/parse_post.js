import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ApifyClient } from 'apify-client';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Bezpieczne ładowanie .env na środowisku lokalnym (nie zgłasza błędu w GitHub Actions)
try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (e) {
  // Ignoruj w środowisku CI/CD
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Weryfikacja kluczy API
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!APIFY_TOKEN || !GEMINI_API_KEY) {
  console.error('BŁĄD: Brak wymaganych zmiennych środowiskowych APIFY_TOKEN lub GEMINI_API_KEY.');
  process.exit(1);
}

const apifyClient = new ApifyClient({ token: APIFY_TOKEN });
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Profile do scrapowania
const FB_PAGES = [
  'https://www.facebook.com/TarnogorskieCentrumKultury'
];

/**
 * Pobiera posty z Facebooka za pomocą Apify
 */
async function fetchFacebookPosts() {
  console.log('Fetching posts from Facebook via Apify...');
  
  const run = await apifyClient.actor('apify/facebook-posts-scraper').call({
    startUrls: FB_PAGES.map(url => ({ url })),
    resultsLimit: 10,
  });

  const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
  console.log(`Fetched ${items.length} raw posts from Facebook.`);
  return items;
}

/**
 * Analizuje tekst posta przez Gemini i zwraca schemat zgodny z events.json
 */
async function parsePostWithGemini(postText, postUrl) {
  if (!postText || postText.trim().length < 20) return null;

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `
Przeanalizuj poniższy tekst posta z Facebooka i ustal, czy dotyczy on konkretnego wydarzenia (koncert, wystawa, warsztaty, spektakl, spotkanie itp.).

Jeśli tekst opisuje wydarzenie, wyciągnij z niego informacje i zwróć WYŁĄCZNIE czysty obiekt JSON (bez markdowna, bez \`\`\`json) o strukturze:
{
  "isEvent": true,
  "title": "Tytuł wydarzenia",
  "date": "Data w formacie DD.MM.YYYY (np. 18.09.2026)",
  "time": "Godzina w formacie HH:MM (np. 19:00 lub null)",
  "location": "Miejsce wydarzenia (np. Tarnogórskie Centrum Kultury)",
  "category": "Kategoria małymi literami (np. plener, muzyka, kultura, teatr, warsztaty)",
  "price": "Cena biletu (np. 'Bezpłatne', 'od 40 zł', '60 zł')",
  "isFree": true_lub_false_boolean,
  "imageUrl": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600"
}

Użyj przykładowego linku Unsplash dla imageUrl, jeśli w treści brak obrazka.

Jeśli tekst NIE jest wydarzeniem, zwróć:
{
  "isEvent": false
}

Tekst do analizy:
"""
${postText}
"""
  `;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    
    const cleanJson = responseText
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const parsedData = JSON.parse(cleanJson);

    if (parsedData.isEvent) {
      delete parsedData.isEvent;
      return {
        id: String(Date.now() + Math.floor(Math.random() * 1000)),
        ...parsedData,
        sourceUrl: postUrl || "https://tck.net.pl"
      };
    }
  } catch (error) {
    console.error('Błąd podczas przetwarzania posta przez Gemini:', error.message);
  }

  return null;
}

/**
 * Główna logika
 */
async function main() {
  try {
    const posts = await fetchFacebookPosts();
    const newEvents = [];

    for (const post of posts) {
      const text = post.text || post.caption || '';
      const url = post.url || post.postUrl || '';

      console.log(`Analyzing post: ${url || 'brak URL'}...`);
      const eventData = await parsePostWithGemini(text, url);

      if (eventData) {
        console.log(`  -> Znaleziono wydarzenie: "${eventData.title}" (${eventData.date})`);
        newEvents.push(eventData);
      }
    }

    const dataDirPath = path.join(__dirname, '../data');
    const eventsFilePath = path.join(dataDirPath, 'events.json');

    if (!fs.existsSync(dataDirPath)) {
      fs.mkdirSync(dataDirPath, { recursive: true });
    }

    let existingEvents = [];
    if (fs.existsSync(eventsFilePath)) {
      try {
        const fileContent = fs.readFileSync(eventsFilePath, 'utf-8');
        existingEvents = JSON.parse(fileContent);
      } catch (e) {
        existingEvents = [];
      }
    }

    // Scalanie wydarzeń bez duplikowania istniejących
    const combinedEvents = [...newEvents];
    for (const oldEv of existingEvents) {
      if (!combinedEvents.some(e => (e.sourceUrl && e.sourceUrl === oldEv.sourceUrl) || e.id === oldEv.id)) {
        combinedEvents.push(oldEv);
      }
    }

    fs.writeFileSync(eventsFilePath, JSON.stringify(combinedEvents, null, 2), 'utf-8');
    console.log(`\nPomyślnie zapisano ${combinedEvents.length} wydarzeń do ${eventsFilePath}`);

  } catch (error) {
    console.error('Błąd podczas wykonywania skryptu:', error);
    process.exit(1);
  }
}

main();