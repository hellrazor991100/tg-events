import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ApifyClient } from 'apify-client';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Bezpieczne ładowanie .env na środowisku lokalnym (nie zgłasza błędu na GitHub Actions)
try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (e) {
  // Ignoruj w środowisku CI/CD, gdzie zmienne są przekazywane z Secrets
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Weryfikacja wymaganych kluczy API
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!APIFY_TOKEN || !GEMINI_API_KEY) {
  console.error('BŁĄD: Brak wymaganych zmiennych środowiskowych APIFY_TOKEN lub GEMINI_API_KEY.');
  process.exit(1);
}

// Inicjalizacja klientów API
const apifyClient = new ApifyClient({ token: APIFY_TOKEN });
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Lista stron/profilu do scrapowania (możesz tu dodać kolejne profile FB)
const FB_PAGES = [
  'https://www.facebook.com/TarnogorskieCentrumKultury'
];

/**
 * Uruchamia scraper Apify w celu pobrania najnowszych postów z Facebooka
 */
async function fetchFacebookPosts() {
  console.log('Fetching posts from Facebook via Apify...');
  
  // Używamy oficjalnego scrapera Apify do Facebook Posts
  const run = await apifyClient.actor('apify/facebook-posts-scraper').call({
    startUrls: FB_PAGES.map(url => ({ url })),
    resultsLimit: 10, // Pobieramy 10 najnowszych postów
  });

  const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
  console.log(`Fetched ${items.length} raw posts from Facebook.`);
  return items;
}

/**
 * Przetwarza tekst posta za pomocą Gemini API i zwraca ustrukturyzowany obiekt wydarzenia
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
  "date": "Data wydarzenia w formacie RRRR-MM-DD (jeśli brak roku, załóż bieżący)",
  "time": "Godzina rozpoczęcia, np. 18:00 (lub null)",
  "location": "Miejsce wydarzenia (np. TCK Tarnowskie Góry)",
  "description": "Krótki, atrakcyjny opis wydarzenia (2-3 zdania)",
  "category": "Kategoria, np. Koncert, Teatr, Warsztaty, Wystawa, Inne",
  "price": "Cena biletu / wstęp wolny (lub null)"
}

Jeśli tekst NIE jest wydarzeniem (np. powitanie, życzenia, zwykły komunikat, podziękowania), zwróć:
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
    
    // Czyszczenie ewentualnych znaczników markdown
    const cleanJson = responseText.replace(/```json/g, '').replace(/