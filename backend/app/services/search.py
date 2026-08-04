"""Правила поиска по каталогу — единый источник для витрины и админки.

Здесь собрано всё, что отличает «поиск» от простого LIKE:

* **е ≡ ё** — «елка» находит «Ёлка», «тёрка» находит «Терка» (в каталоге МойСклад ё пишут
  как придётся, покупатель тем более);
* **неправильная раскладка** — ввёл «vskj» → ищем ещё и «мыло», и наоборот;
* **многословный запрос** — слова ищутся независимо и в любом порядке: «мыло детское»
  находит «Мыло туалетное ДЕТСКОЕ».

Витрина ищет по НАЧАЛУ слова (``substring=False``): «тёрка» не должна находить «стёрка», а
«сорти» — «ассорти». Админка ищет подстрокой (``substring=True``) — там задача обратная:
найти товар по обрывку названия, лишние совпадения не мешают.
"""

import re

from sqlalchemy import and_, case, func, literal, or_

# Раскладка клавиатуры: один и тот же физический ряд клавиш в EN (QWERTY) и RU (ЙЦУКЕН).
_EN_KEYS = "`qwertyuiop[]asdfghjkl;'zxcvbnm,./"
_RU_KEYS = "ёйцукенгшщзхъфывапролджэячсмитьбю."
_EN2RU = {e: r for e, r in zip(_EN_KEYS, _RU_KEYS)}
_RU2EN = {r: e for e, r in zip(_EN_KEYS, _RU_KEYS)}

_HAS_LATIN = re.compile(r"[a-z]", re.IGNORECASE)
_HAS_CYRILLIC = re.compile(r"[а-яё]", re.IGNORECASE)

# Класс «е или ё» в любом регистре. Оператор ~* и так регистронезависим, но регистр букв в
# самом классе оставляем: тот же шаблон используется и в регистрозависимых контекстах.
_YO_CLASS = "[еёЕЁ]"
_YO_CHARS = "еёЕЁ"

# Граница слова для POSIX-регулярки Postgres: начало строки или не-буква/цифра. а-яё
# перечислены явно, чтобы не зависеть от локали БД (в C-локали [:alnum:] не знает кириллицу).
_WORD_START = r"(^|[^[:alnum:]а-яё])"

# Максимум слов в запросе: каждое слово — отдельное сканирование по названию, а осмысленный
# поиск по каталогу редко длиннее. Лишние слова отбрасываем, а не отказываем в поиске.
_MAX_TOKENS = 6


def normalize(text: str) -> str:
    """Запрос без краевых и повторных пробелов (``"  мыло   детское "`` → ``"мыло детское"``)."""
    return " ".join((text or "").split())


def fold_yo(text: str) -> str:
    """Строка в нижнем регистре с ё→е — для сравнения «на равенство» (е ≡ ё)."""
    return text.casefold().replace("ё", "е")


def layout_variants(text: str) -> list[str]:
    """Варианты запроса с учётом неправильной раскладки: исходный + EN→RU + RU→EN.

    Перевод раскладки строим только в ту сторону, в которой он осмыслен (для запроса без
    латиницы EN→RU ничего не даст), и отбрасываем дубли без учёта регистра — каждый лишний
    вариант это лишние условия в SQL.
    """
    s = normalize(text)
    if not s:
        return []
    low = s.lower()
    variants = [s]
    if _HAS_LATIN.search(low):
        variants.append("".join(_EN2RU.get(c, c) for c in low))
    if _HAS_CYRILLIC.search(low):
        variants.append("".join(_RU2EN.get(c, c) for c in low))
    out: list[str] = []
    seen: set[str] = set()
    for v in variants:
        key = v.casefold()
        if v and key not in seen:
            seen.add(key)
            out.append(v)
    return out


def escape_token(token: str) -> str:
    """Токен как литерал POSIX-регулярки, но е и ё взаимозаменяемы."""
    return "".join(_YO_CLASS if ch in _YO_CHARS else re.escape(ch) for ch in token)


def word_start_regex(token: str) -> str:
    """Регулярка «слово начинается с токена» (совпадение внутри слова не считается)."""
    return _WORD_START + escape_token(token)


def prefix_regex(token: str) -> str:
    """Регулярка «строка начинается с токена»."""
    return "^" + escape_token(token)


def _like(col, token: str, substring: bool):
    """ILIKE по токену: префиксом (витрина) или подстрокой (админка).

    Спецсимволы LIKE экранируем — иначе «50%» в запросе стал бы шаблоном «что угодно».
    """
    esc = token.replace("\\", r"\\").replace("%", r"\%").replace("_", r"\_")
    return col.ilike(f"%{esc}%" if substring else f"{esc}%", escape="\\")


def tokens(text: str) -> list[str]:
    """Слова запроса (не больше :data:`_MAX_TOKENS`)."""
    return normalize(text).split()[:_MAX_TOKENS]


def build_filter(text: str, name_col, article_col=None, *, substring: bool = False):
    """Условие поиска по названию (и артикулу) — или ``None``, если запрос пустой.

    Логика: ``ИЛИ`` по вариантам раскладки, внутри варианта ``И`` по словам запроса —
    каждое слово должно найтись либо в названии, либо в артикуле. Порядок слов не важен.
    """
    conds = []
    for variant in layout_variants(text):
        words = tokens(variant)
        if not words:
            continue
        per_word = []
        for w in words:
            rx = escape_token(w) if substring else word_start_regex(w)
            alts = [name_col.op("~*")(rx)]
            if article_col is not None:
                alts.append(_like(article_col, w, substring))
            per_word.append(or_(*alts))
        conds.append(and_(*per_word))
    if not conds:
        return None
    return or_(*conds)


def relevance_case(text: str, name_col):
    """Ранг качества совпадения для ORDER BY — чем меньше, тем лучше:

    * ``0`` — название целиком равно запросу;
    * ``1`` — название начинается с запроса;
    * ``2`` — запрос стоит в начале какого-то слова названия (правило витрины);
    * ``3`` — запрос нашёлся только ВНУТРИ слова (так выглядит «мягкая» выдача).

    Сравнение с учётом е ≡ ё и неправильной раскладки; ``name_col`` передаётся уже очищенным
    от служебных префиксов (код склада, «ЧЗ»), чтобы «Апельсины» находились точным совпадением.
    """
    variants = layout_variants(text)
    if not variants:
        return case((True, 0), else_=0)
    folded = func.translate(func.lower(name_col), "ё", "е")
    exact = [folded == fold_yo(v) for v in variants]
    starts = [name_col.op("~*")(prefix_regex(v)) for v in variants]
    # Начало слова проверяем по запросу ЦЕЛИКОМ: у многословного запроса это отдельный,
    # более сильный сигнал, чем «каждое слово нашлось где-то» (по нему выдача и отобрана).
    in_word = [name_col.op("~*")(word_start_regex(v)) for v in variants]
    return case((or_(*exact), 0), (or_(*starts), 1), (or_(*in_word), 2), else_=3)


def match_position(text: str, name_col):
    """Позиция первого вхождения запроса в названии — «чем ближе к началу, тем релевантнее».

    Тонкая сортировка внутри одного ранга :func:`relevance_case`: по запросу «бложка»
    «Обложка для тетрадей» (позиция 2) обгоняет «Блокнот … твёрдая обложка» (позиция 40).
    Не нашлось (например, слова запроса разбросаны по названию) → в конец.
    """
    q = fold_yo(normalize(text))
    if not q:
        return literal(0)
    pos = func.strpos(func.translate(func.lower(name_col), "ё", "е"), q)
    return case((pos == 0, 9999), else_=pos)
