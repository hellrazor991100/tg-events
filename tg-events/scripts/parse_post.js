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
    
    // Czyszczenie znaczników markdown (bezpieczne rozbicie na linie)
    const cleanJson = responseText
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const parsedData = JSON.parse(cleanJson);

    if (parsedData.isEvent) {
      delete parsedData.isEvent;
      return {
        id: Buffer.from(postUrl || String(Date.now())).toString('base64').substring(0, 12),
        ...parsedData,
        sourceUrl: postUrl || null,
        updatedAt: new Date().toISOString()
      };
    }
  } catch (error) {
    console.error('Błąd podczas przetwarzania posta przez Gemini:', error.message);
  }

  return null;
}