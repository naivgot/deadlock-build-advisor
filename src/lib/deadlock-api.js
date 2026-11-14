// Обёртка над Deadlock API: собирает адрес и подставляет ключ, если он есть.
import { fetchJson } from './http.js';

export const API_BASE = 'https://api.deadlock-api.com';

// Собирает полный адрес; параметры со значением undefined/null пропускает.
export function apiUrl(path, params = {}) {
  const url = new URL(path, API_BASE);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function apiGet(path, params = {}, options = {}) {
  const key = process.env.DEADLOCK_API_KEY;
  const headers = key ? { 'X-API-KEY': key } : {};
  return fetchJson(apiUrl(path, params), { headers, ...options });
}
