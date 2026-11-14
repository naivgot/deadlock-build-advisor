// Чтение и запись JSON-файлов.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

// Создаёт папку, если её нет, и пишет файл с отступами (чтобы его можно было читать глазами).
export async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}
