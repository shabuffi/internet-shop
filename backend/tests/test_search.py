"""Правила поиска по каталогу (:mod:`app.services.search`).

Регулярки проверяем «по-настоящему» — компилируя их питоновским ``re``. Единственная
несовместимость с Postgres — POSIX-класс ``[:alnum:]``, его разворачиваем в явный набор
(:func:`_pg_to_py`); остальное синтаксически совпадает.
"""

import re

import pytest
from sqlalchemy import Column, String
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import declarative_base

from app.services import search

Base = declarative_base()


class _T(Base):
    __tablename__ = "t"
    name = Column(String, primary_key=True)
    article = Column(String)


def _pg_to_py(rx: str) -> re.Pattern:
    """POSIX-регулярка Postgres → скомпилированная питоновская (регистронезависимо, как ~*)."""
    return re.compile(rx.replace("[:alnum:]", "0-9A-Za-z"), re.IGNORECASE)


def _matches(query: str, name: str) -> bool:
    """Нашёлся бы товар ``name`` по запросу ``query`` на витрине (все слова, любой вариант раскладки)."""
    return any(
        all(_pg_to_py(search.word_start_regex(w)).search(name) for w in search.tokens(v))
        for v in search.layout_variants(query)
    )


def _sql(cond) -> str:
    # %% — удвоение для paramstyle драйвера, к смыслу условия отношения не имеет
    sql = str(cond.compile(dialect=postgresql.dialect(),
                           compile_kwargs={"literal_binds": True}))
    return sql.replace("%%", "%")


# --- е ≡ ё ---------------------------------------------------------------------------------

@pytest.mark.parametrize("query, name", [
    ("елка", "Ёлка искусственная 1.8 м"),      # ввели е — в каталоге ё
    ("ёлка", "Елка искусственная 1.8 м"),      # ввели ё — в каталоге е
    ("тёрка", "Терка четырёхгранная"),
    ("терка", "Тёрка четырехгранная"),
    ("Ёршик", "Ёршик для унитаза"),
    ("зелёнка", "Зеленка 10 мл"),
    ("СВЕКЛА", "Свёкла мытая"),
])
def test_yo_and_ye_are_interchangeable(query, name):
    assert _matches(query, name)


def test_yo_folding_does_not_merge_other_letters():
    # е≡ё — не повод путать разные слова
    assert not _matches("елка", "Юлка")
    assert not _matches("мел", "мёд")


# --- совпадение по началу слова ------------------------------------------------------------

def test_matches_word_start_not_middle():
    assert _matches("тёрка", "Терка для овощей")
    assert not _matches("терка", "Стёрка школьная")     # не подстрока внутри слова
    assert not _matches("сорти", "Мыло Ассорти")


def test_matches_any_word_not_only_first():
    assert _matches("мыло", "Хозяйственное мыло 72%")


def test_word_start_after_punctuation():
    assert _matches("детское", "Мыло (детское) 90 г")
    assert _matches("100", "Салфетки, 100 шт")


# --- многословный запрос -------------------------------------------------------------------

def test_all_words_required_in_any_order():
    assert _matches("мыло детское", "Мыло туалетное ДЕТСКОЕ 90 г")
    assert _matches("детское мыло", "Мыло туалетное детское 90 г")
    assert not _matches("мыло детское", "Мыло хозяйственное 72%")


def test_words_may_be_prefixes():
    assert _matches("стир порош", "Стиральный порошок Лотос")


def test_extra_spaces_ignored():
    assert search.tokens("  мыло   детское  ") == ["мыло", "детское"]
    assert _matches("  мыло   детское ", "Детское мыло")


def test_token_count_is_capped():
    assert len(search.tokens(" ".join(f"w{i}" for i in range(20)))) == search._MAX_TOKENS


# --- неправильная раскладка ----------------------------------------------------------------

def test_wrong_layout_en_typed_as_ru():
    assert _matches("vskj", "Мыло хозяйственное")            # «мыло» в EN-раскладке
    assert _matches("ltncrjt vskj", "Мыло детское 90 г")     # «детское мыло» в EN-раскладке


def test_wrong_layout_ru_typed_as_en():
    assert _matches("Сруддун", "Chelley крем для рук")        # «Chelley» в RU-раскладке


def test_layout_variants_are_not_generated_pointlessly():
    # чистая кириллица → перевод EN→RU ничего не даёт, лишний вариант не нужен
    assert search.layout_variants("мыло") == ["мыло", "vskj"]
    assert search.layout_variants("") == []


def test_layout_variants_dedup_ignores_case():
    assert search.layout_variants("Мыло") == ["Мыло", "vskj"]


# --- построение SQL ------------------------------------------------------------------------

def test_build_filter_none_for_empty_query():
    assert search.build_filter("   ", _T.name, _T.article) is None


def test_build_filter_checks_name_and_article():
    sql = _sql(search.build_filter("мыло", _T.name, _T.article))
    assert "t.name ~* " in sql
    assert "t.article ILIKE " in sql
    assert "'мыло%'" in sql                       # витрина: артикул ищем с начала


def test_build_filter_substring_mode_for_admin():
    sql = _sql(search.build_filter("мыло", _T.name, _T.article, substring=True))
    assert "'%мыло%'" in sql
    assert "(^|" not in sql                       # подстрока — без границы слова


def test_like_wildcards_in_query_are_escaped():
    # проверяем сам параметр, а не отрендеренный SQL: literal_binds у PG-диалекта без
    # подключения удваивает бэкслеши (в живом соединении этого нет)
    cond = search._like(_T.article, "50%_", substring=False)
    assert cond.right.value == r"50\%\_%"
    assert cond.modifiers["escape"] == "\\"


def test_regex_metacharacters_in_query_are_escaped():
    # «крем (детский)» не должно упасть на несбалансированной скобке в регулярке
    rx = search.word_start_regex("крем (детский)")
    _pg_to_py(rx)                                  # компилируется — значит экранировано
    assert r"\(" in rx


def test_yo_class_in_regex():
    assert search.escape_token("ёлка") == "[еёЕЁ]лка"


# --- релевантность -------------------------------------------------------------------------

def test_relevance_case_folds_yo():
    sql = _sql(search.relevance_case("Ёлка", _T.name))
    assert "translate(lower(t.name), 'ё', 'е')" in sql
    assert "'елка'" in sql                         # запрос свёрнут к е и нижнему регистру


def test_relevance_case_covers_layout_variants():
    sql = _sql(search.relevance_case("vskj", _T.name))
    assert "'мыло'" in sql
