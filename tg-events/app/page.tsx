"use client";

import { useState } from "react";
import Image from "next/image";
import eventsData from "@/data/events.json";

interface Event {
  id: number | string;
  title: string;
  category: string;
  price: string;
  isFree: boolean;
  date: string;
  time: string;
  location: string;
  imageUrl: string;
  sourceUrl: string;
}

export default function Home() {
  const [activeCategory, setActiveCategory] = useState("Wszystkie");
  const [onlyFree, setOnlyFree] = useState(false);

  const categories = ["Wszystkie", "plener", "muzyka", "kultura"];
  const events: Event[] = eventsData;

  const filteredEvents = events.filter((event) => {
    const categoryMatch =
      activeCategory === "Wszystkie" ||
      event.category.toLowerCase() === activeCategory.toLowerCase();
    const freeMatch = !onlyFree || event.isFree;
    return categoryMatch && freeMatch;
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-yellow-500/30">
      {/* Header Section */}
      <header className="relative border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-6 py-8 md:flex md:items-center md:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tighter text-white sm:text-5xl">
              TG <span className="text-yellow-500">EVENTS</span>
            </h1>
            <p className="mt-2 text-zinc-400 font-medium tracking-wide">
              Co dzieje się w Tarnowskich Górach
            </p>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 md:mt-0">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition-all duration-300 ${
                  activeCategory === cat
                    ? "bg-yellow-500 text-black shadow-lg shadow-yellow-500/20"
                    : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-white"
                }`}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
            <label className="flex cursor-pointer items-center gap-2 ml-2 border-l border-zinc-800 pl-5">
              <input
                type="checkbox"
                checked={onlyFree}
                onChange={() => setOnlyFree(!onlyFree)}
                className="h-4 w-4 rounded border-zinc-800 bg-zinc-900 text-yellow-500 focus:ring-yellow-500/20"
              />
              <span className="text-sm font-medium text-zinc-400">Bezpłatne</span>
            </label>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-6 py-12">
        {filteredEvents.length > 0 ? (
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {filteredEvents.map((event) => (
              <article
                key={event.id}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40 transition-all hover:border-yellow-500/40 hover:bg-zinc-900/60"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <Image
                    src={event.imageUrl}
                    alt={event.title}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 to-transparent" />
                  <span className="absolute left-4 top-4 rounded-md bg-yellow-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-black">
                    {event.category}
                  </span>
                  <span className="absolute right-4 top-4 rounded-md bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-md border border-white/10">
                    {event.price}
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-6">
                  <div className="mb-3 flex items-center gap-3 text-xs font-semibold text-yellow-500/80">
                    <div className="flex items-center gap-1.5">📅 {event.date}</div>
                    <div className="flex items-center gap-1.5">⏰ {event.time}</div>
                  </div>

                  <h3 className="mb-2 text-xl font-bold leading-tight text-white group-hover:text-yellow-500 transition-colors">
                    {event.title}
                  </h3>

                  <p className="mb-6 flex items-center gap-1.5 text-sm text-zinc-400">
                    📍 {event.location}
                  </p>

                  <div className="mt-auto">
                    <a
                      href={event.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/50 py-3 text-sm font-bold text-white transition-all hover:bg-yellow-500 hover:text-black hover:border-yellow-500"
                    >
                      Zobacz źródło ↗
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <h2 className="text-2xl font-bold text-white">Brak wydarzeń</h2>
            <p className="mt-2 text-zinc-400">
              Nie znaleziono wydarzeń spełniających wybrane kryteria.
            </p>
            <button
              onClick={() => {
                setActiveCategory("Wszystkie");
                setOnlyFree(false);
              }}
              className="mt-6 text-yellow-500 hover:underline font-medium"
            >
              Resetuj filtry
            </button>
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-900 bg-zinc-950 py-12 text-center text-sm text-zinc-500">
        &copy; {new Date().getFullYear()} TG EVENTS. Projekt promujący lokalne inicjatywy w Tarnowskich Górach.
      </footer>
    </div>
  );
}