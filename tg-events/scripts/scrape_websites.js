import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (e) {
  // Ignoruj w środowisku CI/CD
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('BŁĄD: Brak zmiennej środowiskowej GEMINI_API_KEY.');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Lista portali do scrapowania
const SOURCES = [
  { name: 'TCK', url: 'https://tck.net.pl' },
  { name: 'Tylko Tarnowskie Góry', url: 'https://tylkotarnowskiegory.pl/wydarzenia' },
  { name: 'Oficjalny Portal TG', url: 'https://tarnowskiegory.pl/nadchodzace-wydarzenia/' },
  { name: 'Naszemiasto TG', url: 'https://tarnowskiegory.naszemiasto.pl/kalendarz-imprez' }
];

/**
 * Pobiera stronę i oczyszcza ją ze zbędnych elementów HTML
 */
async function fetchCleanPageText(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);

    // Usuwanie zbędnych sekcji
    $('script, style, nav, footer, header, iframe, noscript').remove();

    // Wyciąganie tekstu z kontenerów wydarzeń / głównej treści
    const pageText = $('body').text().replace(/\s+/g, ' ').trim();
    return pageText.substring(0, 8000); // Ograniczenie długości dla Gemini API
  } catch (error) {
    console.error(`Błąd podczas pobierania ${url}:`, error.message);
    return null;
  }
}

/**
 * Analizuje tekst strony www przez Gemini i zwraca tablicę wydarzeń
 */
async function extractEventsWithGemini(pageText, sourceName, sourceUrl) {
  if (!pageText || pageText.length < 50) return [];

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `
Przeanalizuj poniższy tekst ze strony internetowej (${sourceName}) i wyciągnij z niego WSZYSTKIE nadchodzące wydarzenia kulturalne, rozrywkowe lub sportowe.

Zwróć WYŁĄCZNIE czysty tablicowy JSON (bez markdowna, bez \`\`\`json) zawierający obiekty o strukturze:
[
  {
    "title": "Tytuł wydarzenia",
    "date": "Data w formacie DD.MM.YYYY (np. 18.09.2026)",
    "time": "Godzina w formacie HH:MM (np. 19:00 lub null)",
    "location": "Miejsce wydarzenia (np. Tarnogórskie Centrum Kultury)",
    "category": "Kategoria małymi literami (np. plener, muzyka, kultura, teatr, warsztaty)",
    "price": "Cena biletu (np. 'Bezpłatne', 'od 40 zł', '60 zł')",
    "isFree": true_lub_false_boolean,
    "imageUrl": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600"
  }
]

Jeśli na stronie brak wydarzeń, zwróć pustą tablicę [].

Tekst ze strony:
"""
${pageText}
"""
  `;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    
    const cleanJson = responseText
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const events = JSON.parse(cleanJson);

    return Array.isArray(events) ? events.map(event => ({
      id: String(Date.now() + Math.floor(Math.random() * 10000)),
      ...event,
      sourceUrl
    })) : [];
  } catch (error) {
    console.error(`Błąd przetwarzania Gemini dla ${sourceName}:`, error.message);
    return [];
  }
}

/**
 * Główna funkcja
 */
async function main() {
  console.log('=== Rozpoczynanie scrapowania stron WWW ===\n');
  const fetchedEvents = [];

  for (const source of SOURCES) {
    console.log(`Scrapowanie: ${source.name} (${source.url})...`);
    const text = await fetchCleanPageText(source.url);

    if (text) {
      const events = await extractEventsWithGemini(text, source.name, source.url);
      console.log(`  -> Znaleziono wydarzeń: ${events.length}`);
      fetchedEvents.push(...events);
    }
  }

  // Odczyt i aktualizacja events.json
  const dataDirPath = path.join(__dirname, '../data');
  const eventsFilePath = path.join(dataDirPath, 'events.json');

  if (!fs.existsSync(dataDirPath)) {
    fs.mkdirSync(dataDirPath, { recursive: true });
  }

  let existingEvents = [];
  if (fs.existsSync(eventsFilePath)) {
    try {
      existingEvents = JSON.parse(fs.readFileSync(eventsFilePath, 'utf-8'));
    } catch (e) {
      existingEvents = [];
    }
  }

  // Łączenie danych z pominięciem duplikatów o tym samym tytule i dacie
  const combined = [...fetchedEvents];
  for (const oldEv of existingEvents) {
    const exists = combined.some(
      e => e.title.toLowerCase() === oldEv.title.toLowerCase() && e.date === oldEv.date
    );
    if (!exists) {
      combined.push(oldEv);
    }
  }

  fs.writeFileSync(eventsFilePath, JSON.stringify(combined, null, 2), 'utf-8');
  console.log(`\nPomyślnie zaktualizowano bazę. Łącznie wydarzeń: ${combined.length}`);
}

main();