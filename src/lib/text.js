// Работа с текстом из игры.

const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

// Убирает HTML-теги и картинки из описания, оставляет обычный текст.
export function stripHtml(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,:;!?])/g, '$1')
    .trim();
}
