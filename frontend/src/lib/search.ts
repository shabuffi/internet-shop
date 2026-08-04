/** Правила поиска в списках НА КЛИЕНТЕ (выбор категории и т.п.).
 *  Те же принципы, что на бэкенде (app/services/search.py): е ≡ ё и слова в любом порядке —
 *  чтобы «елка»/«ёлка» и «мыло детское»/«детское мыло» вели себя одинаково везде. */

/** Строка для сравнения: нижний регистр и ё→е. */
export function foldSearch(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е");
}

/** Слова запроса (без пустых). */
export function searchWords(query: string): string[] {
  return foldSearch(query).split(/\s+/).filter(Boolean);
}

/** Содержит ли текст ВСЕ слова запроса (в любом порядке, е ≡ ё). */
export function matchesSearch(text: string, words: string[]): boolean {
  const hay = foldSearch(text);
  return words.every((w) => hay.includes(w));
}
