// Характеристики предмета для карточки на сайте: «Скорострельность: +10%», «Длительность: 4,5 с.».
// Берём ровно те свойства, которые игра показывает в подсказке (tooltip_sections), с их русскими подписями.

const MAX_LINES = 8;

// "1.25m" → 1.25 (буква — единица измерения, подпись и так есть в postfix); "-30" → -30.
function parseValue(raw) {
  const number = Number.parseFloat(String(raw ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function formatValue(number, property) {
  const text = Math.abs(number).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  const signed = String(property.prefix ?? '').includes('{s:sign}');
  const sign = number < 0 ? '−' : signed ? '+' : '';
  return `${sign}${text}${property.postfix ?? ''}`.trim();
}

// properties — свойства предмета из API (на русском), sections — tooltip_sections.
// Возвращает [{ label, value, innate }]: innate — постоянная прибавка (раздел «innate»), иначе — параметр эффекта.
export function itemStatLines(properties, sections) {
  const lines = [];
  const seen = new Set();
  for (const section of sections ?? []) {
    const innate = section.section_type === 'innate';
    for (const attribute of section.section_attributes ?? []) {
      const names = [
        ...(attribute.elevated_properties ?? []),
        ...(attribute.important_properties ?? []),
        ...(attribute.properties ?? []),
      ];
      for (const name of names) {
        if (seen.has(name)) continue;
        seen.add(name);
        const property = properties?.[name];
        const label = property?.label?.trim();
        const number = parseValue(property?.value);
        if (!label || number === null || number === 0) continue;
        if (property.disable_value !== undefined && parseValue(property.disable_value) === number) continue;
        lines.push({ label, value: formatValue(number, property), innate });
      }
    }
  }
  return lines.slice(0, MAX_LINES);
}
