"""Безопасный разбор XML, приходящего извне (обмен CommerceML с МойСклад).

По умолчанию lxml (``iterparse``, а в старых версиях и обычный парсер) подставляет внешние
сущности: XML вида ``<!DOCTYPE x [<!ENTITY e SYSTEM "file:///proc/self/environ">]>…&e;…``
заставил бы сервер прочитать свой файл (там секреты из ``.env.prod``) и положить его в данные
каталога (XXE). Обмен закрыт логином/паролем, но пара обмена хранилась на взломанной VPS —
поэтому разбор не должен доверять даже «своему» XML.

Здесь: без подстановки сущностей, без загрузки DTD и без сети. МойСклад DTD и сущностей не
шлёт, стандартные ``&amp;``/``&lt;`` и числовые ссылки работают как прежде.
"""

from lxml import etree

# Общие опции для XMLParser и iterparse.
PARSE_OPTS = {"resolve_entities": False, "no_network": True, "load_dtd": False}


def parser() -> etree.XMLParser:
    """Новый безопасный парсер (XMLParser не потокобезопасен — не шарим один на всех)."""
    return etree.XMLParser(**PARSE_OPTS)


def fromstring(data: bytes | str) -> etree._Element:
    """``etree.fromstring`` с безопасным парсером."""
    return etree.fromstring(data, parser())
