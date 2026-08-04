"""Подсказка об опечатке в домене e-mail: «Возможно, вы имели в виду gmail.com?».

Ничего не блокирует и не отвергает: регистрация с любым валидным адресом проходит, а эта
подсказка лишь предлагает исправление (пользователь либо правит адрес, либо оставляет свой).
Поэтому здесь нет исключений — только ``str | None``.

Единственный источник правды для фронта: страницы регистрации и смены email спрашивают
подсказку через ``POST /api/v1/auth/check-email`` и НЕ держат копию словаря в TS.

Три уровня проверки (от точного к нечёткому):
1. ``KNOWN_DOMAINS`` — реальные домены; подсказку не даём никогда (``mail.by`` и ``mail.kz``
   отличаются от ``mail.ru`` на один символ, но они настоящие).
2. ``TYPO_DOMAINS`` / ``TLD_TYPOS`` — известные опечатки целиком и опечатки только в зоне
   (``mail.r`` → ``mail.ru``, ``td-engineer.con`` → ``td-engineer.com`` — работает и для
   корпоративных доменов, которых нет ни в одном списке).
3. Нечёткое сравнение с популярными доменами (Дамерау—Левенштейн: перестановка соседних
   букв стоит 1, а не 2, — «gmial.com» это самая частая опечатка вообще).
"""

# Реальные почтовые домены: для них подсказка не выдаётся ни при каких условиях.
# Сюда же — «близнецы» популярных доменов (mail.by, yandex.kz, ymail.com), иначе нечёткое
# сравнение приняло бы их за опечатку.
KNOWN_DOMAINS = frozenset({
    # Россия и СНГ
    "mail.ru", "bk.ru", "list.ru", "inbox.ru", "internet.ru",
    "yandex.ru", "ya.ru", "yandex.com", "yandex.by", "yandex.kz", "yandex.ua",
    "mail.by", "mail.kz", "mail.ua", "rambler.ru", "lenta.ru", "autorambler.ru",
    "ro.ru", "myrambler.ru", "vk.com",
    # Мир
    "gmail.com", "googlemail.com", "mail.com", "email.com", "ymail.com",
    "outlook.com", "outlook.ru", "hotmail.com", "hotmail.ru", "live.com", "live.ru",
    "msn.com", "yahoo.com", "yahoo.co.uk", "icloud.com", "me.com", "mac.com",
    "aol.com", "gmx.com", "gmx.de", "web.de", "protonmail.com", "proton.me",
    "zoho.com", "fastmail.com", "qq.com", "163.com", "126.com", "naver.com",
})

# Опечатки, которые встречаются чаще всего — точное соответствие.
TYPO_DOMAINS = {
    # gmail
    "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmal.com": "gmail.com",
    "gmaill.com": "gmail.com", "gamil.com": "gmail.com", "gmail.ru": "gmail.com",
    "gmail.co": "gmail.com", "gmail.cm": "gmail.com", "gnail.com": "gmail.com",
    "ggmail.com": "gmail.com", "gmailc.om": "gmail.com", "gmaul.com": "gmail.com",
    # yandex
    "yndex.ru": "yandex.ru", "yandx.ru": "yandex.ru", "yandes.ru": "yandex.ru",
    "yadex.ru": "yandex.ru", "yandeks.ru": "yandex.ru", "yandex.r": "yandex.ru",
    "yanex.ru": "yandex.ru", "yandex.ry": "yandex.ru", "iandex.ru": "yandex.ru",
    # mail.ru
    "mail.r": "mail.ru", "mai.ru": "mail.ru", "mial.ru": "mail.ru",
    "maill.ru": "mail.ru", "mali.ru": "mail.ru", "nail.ru": "mail.ru",
    "mail.rru": "mail.ru", "mail.u": "mail.ru", "meil.ru": "mail.ru",
    # outlook / hotmail / live
    "outlok.com": "outlook.com", "outllok.com": "outlook.com", "outook.com": "outlook.com",
    "outlook.co": "outlook.com", "oultook.com": "outlook.com",
    "hotnail.com": "hotmail.com", "hotmal.com": "hotmail.com", "hotmai.com": "hotmail.com",
    "hotmial.com": "hotmail.com", "hormail.com": "hotmail.com",
    # прочее
    "yaoo.com": "yahoo.com", "yhoo.com": "yahoo.com", "yahooo.com": "yahoo.com",
    "iclod.com": "icloud.com", "icoud.com": "icloud.com", "iclould.com": "icloud.com",
    "rambler.r": "rambler.ru", "rmabler.ru": "rambler.ru",
    "bk.r": "bk.ru", "list.r": "list.ru", "inbox.r": "inbox.ru",
}

# Опечатки в доменной зоне — применяются к ЛЮБОМУ домену, в том числе корпоративному
# (`td-engineer.con` → `td-engineer.com`). Только однозначные случаи: зоны вроде `.gu`
# (Гуам) или `.by` настоящие, поэтому их здесь нет.
TLD_TYPOS = {
    "con": "com", "cmo": "com", "ocm": "com", "comm": "com", "cpm": "com",
    "xom": "com", "vom": "com", "coom": "com", "cim": "com", "clm": "com",
    "r": "ru", "rru": "ru", "ruu": "ru",
}

# Кандидаты для нечёткого сравнения — только массовые почтовые домены.
POPULAR_DOMAINS = (
    "mail.ru", "yandex.ru", "gmail.com", "outlook.com", "hotmail.com", "yahoo.com",
    "icloud.com", "rambler.ru", "bk.ru", "list.ru", "inbox.ru", "live.com", "proton.me",
)


def _damerau_levenshtein(a: str, b: str) -> int:
    """Расстояние Дамерау—Левенштейна (optimal string alignment).

    В отличие от обычного Левенштейна перестановка соседних символов стоит 1, а не 2:
    «gmial.com» → «gmail.com» это одна ошибка, как её и воспринимает человек.
    """
    la, lb = len(a), len(b)
    # Матрица (la+1)×(lb+1): d[i][j] — расстояние между префиксами a[:i] и b[:j].
    d = [[0] * (lb + 1) for _ in range(la + 1)]
    for i in range(la + 1):
        d[i][0] = i
    for j in range(lb + 1):
        d[0][j] = j
    for i in range(1, la + 1):
        for j in range(1, lb + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            d[i][j] = min(
                d[i - 1][j] + 1,        # удаление
                d[i][j - 1] + 1,        # вставка
                d[i - 1][j - 1] + cost  # замена
            )
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)   # перестановка соседних
    return d[la][lb]


def suggest_domain_fix(domain: str) -> str | None:
    """Предполагаемый правильный домен или ``None``, если домен похож на настоящий.

    Args:
        domain: доменная часть адреса (после ``@``), в любом регистре.

    Returns:
        Исправленный домен либо ``None`` (подсказка не нужна).
    """
    domain = domain.strip().strip(".").lower()
    if not domain or "." not in domain:
        return None
    if domain in KNOWN_DOMAINS:
        return None
    if domain in TYPO_DOMAINS:
        return TYPO_DOMAINS[domain]

    # Опечатка только в зоне — чинится у любого домена, включая корпоративный.
    name, _, tld = domain.rpartition(".")
    fixed_tld = TLD_TYPOS.get(tld)
    if name and fixed_tld:
        return f"{name}.{fixed_tld}"

    # Нечёткое сравнение с популярными. Порог зависит от длины эталона: две ошибки
    # допускаем только у длинных доменов, иначе легко «исправить» чужой короткий домен.
    if len(domain) >= 6:
        best = min(POPULAR_DOMAINS, key=lambda cand: _damerau_levenshtein(domain, cand))
        dist = _damerau_levenshtein(domain, best)
        if dist and dist <= (2 if len(best) >= 9 else 1):
            return best
    return None


def suggest_email_fix(email: str) -> str | None:
    """Исправленный адрес целиком или ``None``, если опечатки не видно.

    Args:
        email: адрес как его ввёл пользователь (может быть ещё недописан).

    Returns:
        Полный адрес с исправленным доменом (``ivan@gmail.com``) либо ``None``.
    """
    email = (email or "").strip().lower()
    local, sep, domain = email.rpartition("@")
    if not sep or not local or not domain:
        return None
    fixed = suggest_domain_fix(domain)
    return f"{local}@{fixed}" if fixed and fixed != domain else None
