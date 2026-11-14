// Чтение и запись JSON-файлов.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

// Создаёт папку, если её нет, и пишет файл.
// По умолчанию — с отступами (удобно читать глазами); compact: true — в одну строку (меньше места).
export async function writeJson(path, data, { compact = false } = {}) {
  await mkdir(dirname(path), { recursive: true });
  const text = compact ? JSON.stringify(data) : JSON.stringify(data, null, 2);
  await writeFile(path, text + '\n', 'utf8');
}
