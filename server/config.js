import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  port: Number(process.env.PORT) || 3001,
  youtubeKey: process.env.YOUTUBE_API_KEY || '',
  openaiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  openaiResearchModel: process.env.OPENAI_RESEARCH_MODEL || 'gpt-4o',
  openaiIdeasModel: process.env.OPENAI_IDEAS_MODEL || 'gpt-4o',
  dbPath: path.resolve(ROOT, process.env.DB_PATH || 'data/trendframe.db'),
};

// youtubeCategoryIds: YouTube's own category IDs used for mostPopular charts.
// Categories with no good YouTube equivalent rely on keyword search instead.
export const DEFAULT_CATEGORIES= [
  { key: 'tech_ai',       label: 'Technology and AI',    youtubeCategoryIds: ['28'], queries: ['artificial intelligence', 'AI breakthrough'] },
  { key: 'business',      label: 'Business',             youtubeCategoryIds: [],     queries: ['business news', 'startup company'] },
  { key: 'finance',       label: 'Finance',              youtubeCategoryIds: [],     queries: ['stock market', 'economy inflation'] },
  { key: 'geopolitics',   label: 'Geopolitics',          youtubeCategoryIds: ['25'], queries: ['geopolitics', 'international conflict'] },
  { key: 'history',       label: 'History',              youtubeCategoryIds: [],     queries: ['history documentary', 'historical event'] },
  { key: 'entertainment', label: 'Entertainment',        youtubeCategoryIds: ['24'], queries: ['entertainment news'] },
  { key: 'science',       label: 'Science',              youtubeCategoryIds: [],     queries: ['science discovery', 'space exploration'] },
  { key: 'gaming',        label: 'Gaming',               youtubeCategoryIds: ['20'], queries: ['video game'] },
  { key: 'sports',        label: 'Sports',               youtubeCategoryIds: ['17'], queries: ['sports highlights'] },
  { key: 'nature',        label: 'Nature and exploration', youtubeCategoryIds: [],   queries: ['nature documentary', 'wildlife exploration'] },
];

// Live list. Edited in Settings and mutated in place, so every importer sees the change.
export const CATEGORIES = DEFAULT_CATEGORIES.map((c) => ({ ...c }));
export const setCategories = (list) => CATEGORIES.splice(0, CATEGORIES.length, ...list);