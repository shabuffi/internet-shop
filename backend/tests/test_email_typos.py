"""Подсказка об опечатке в домене e-mail (services/email_typos.py).

Главное, что здесь проверяется — обе стороны баланса: типовые опечатки ловятся, а реальные
домены (в том числе «близнецы» популярных: mail.by, yandex.kz, ymail.com) остаются нетронутыми.
Ложная подсказка на настоящем адресе вреднее пропущенной опечатки.
"""

import pytest

from app.services.email_typos import suggest_domain_fix, suggest_email_fix


# Примеры из задания + частые опечатки
@pytest.mark.parametrize("bad, good", [
    ("yndex.ru", "yandex.ru"),
    ("gmial.com", "gmail.com"),
    ("gmai.com", "gmail.com"),
    ("mail.r", "mail.ru"),
    ("outlok.com", "outlook.com"),
    ("hotnail.com", "hotmail.com"),
    ("yandx.ru", "yandex.ru"),
    ("gmaill.com", "gmail.com"),
    ("mial.ru", "mail.ru"),          # перестановка соседних букв — расстояние 1 (Дамерау)
    ("yahooo.com", "yahoo.com"),
    ("iclod.com", "icloud.com"),
])
def test_typos_are_detected(bad, good):
    assert suggest_domain_fix(bad) == good


@pytest.mark.parametrize("domain", [
    "gmail.com", "yandex.ru", "mail.ru", "outlook.com", "hotmail.com",
    "mail.by", "mail.kz", "yandex.kz", "yandex.by", "ymail.com", "mail.com",
    "bk.ru", "list.ru", "inbox.ru", "ya.ru", "proton.me",
])
def test_known_domains_never_flagged(domain):
    assert suggest_domain_fix(domain) is None


def test_corporate_domain_left_alone():
    """Корпоративный домен не похож ни на один популярный — подсказки быть не должно."""
    assert suggest_domain_fix("td-engineer.ru") is None
    assert suggest_domain_fix("some-very-long-company.ru") is None


def test_tld_typo_fixed_for_any_domain():
    """Опечатка в зоне чинится и у домена, которого нет ни в одном списке."""
    assert suggest_domain_fix("td-engineer.con") == "td-engineer.com"
    assert suggest_domain_fix("moya-firma.r") == "moya-firma.ru"


def test_short_unknown_domain_not_flagged():
    """Короткий чужой домен не «исправляем» до похожего — слишком велик риск ошибки."""
    assert suggest_domain_fix("mk.ru") is None


def test_suggest_email_fix_returns_full_address():
    assert suggest_email_fix("Ivan.Petrov@GMIAL.com") == "ivan.petrov@gmail.com"
    assert suggest_email_fix("ivan@yandex.ru") is None


@pytest.mark.parametrize("value", ["", "не-адрес", "@gmail.com", "ivan@", "ivan"])
def test_suggest_email_fix_tolerates_garbage(value):
    """Адрес могут прислать недописанным — функция обязана молча вернуть None."""
    assert suggest_email_fix(value) is None
