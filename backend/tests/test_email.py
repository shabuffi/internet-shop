"""Тесты отправки письма по SMTP (email-канал уведомлений владельцу)."""

import app.integrations.email as email_mod


def test_send_email_no_config_returns_false(monkeypatch):
    monkeypatch.setattr(email_mod, "get_smtp_config",
                        lambda: {"host": "", "user": "", "password": "", "port": 587, "from_email": ""})
    assert email_mod.send_email("to@x.ru", "s", "b") is False


def test_send_email_sends(monkeypatch):
    monkeypatch.setattr(email_mod, "get_smtp_config",
                        lambda: {"host": "smtp.x", "user": "u@x", "password": "p", "port": 587, "from_email": "u@x"})
    captured = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout=0):
            captured["host"] = host
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False
        def starttls(self):
            captured["tls"] = True
        def login(self, u, p):
            captured["login"] = (u, p)
        def sendmail(self, frm, to, msg):
            captured["to"] = to

    monkeypatch.setattr(email_mod.smtplib, "SMTP", FakeSMTP)
    assert email_mod.send_email("buyer@x.ru", "Тема", "Текст") is True
    assert captured["to"] == ["buyer@x.ru"]
    assert captured["tls"] is True
    assert captured["login"] == ("u@x", "p")


def test_send_email_invalid_from_falls_back_to_login(monkeypatch):
    """Если «От кого» не email (например «soffia») — конверт-адрес берётся из логина."""
    monkeypatch.setattr(email_mod, "get_smtp_config",
                        lambda: {"host": "smtp.x", "user": "u@x", "password": "p", "port": 587, "from_email": "soffia"})
    captured = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout=0): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def starttls(self): pass
        def login(self, u, p): pass
        def sendmail(self, frm, to, msg): captured["frm"] = frm

    monkeypatch.setattr(email_mod.smtplib, "SMTP", FakeSMTP)
    ok, detail = email_mod.send_email_detail("buyer@x.ru", "s", "b")
    assert ok is True and detail is None
    assert captured["frm"] == "u@x"   # «soffia» заменён на логин


def test_send_email_multiple_recipients(monkeypatch):
    """Несколько адресов через запятую — письмо уходит каждому (дубль уведомления владельцу)."""
    monkeypatch.setattr(email_mod, "get_smtp_config",
                        lambda: {"host": "smtp.x", "user": "u@x", "password": "p", "port": 587, "from_email": "u@x"})
    captured = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout=0): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def starttls(self): pass
        def login(self, u, p): pass
        def sendmail(self, frm, to, msg):
            captured["to"] = to
            captured["msg"] = msg

    monkeypatch.setattr(email_mod.smtplib, "SMTP", FakeSMTP)
    assert email_mod.send_email(" owner@ya.ru , shop@td.ru ", "Тема", "Текст") is True
    assert captured["to"] == ["owner@ya.ru", "shop@td.ru"]     # пробелы обрезаны
    assert "To: owner@ya.ru, shop@td.ru" in captured["msg"]     # оба видны в заголовке


def test_send_email_partial_refusal_is_success(monkeypatch):
    """Один адрес отклонён, другой принят — письмо считается отправленным."""
    monkeypatch.setattr(email_mod, "get_smtp_config",
                        lambda: {"host": "smtp.x", "user": "u@x", "password": "p", "port": 587, "from_email": "u@x"})

    class FakeSMTP:
        def __init__(self, host, port, timeout=0): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def starttls(self): pass
        def login(self, u, p): pass
        def sendmail(self, frm, to, msg):
            return {"bad@x.ru": (550, b"no such user")}

    monkeypatch.setattr(email_mod.smtplib, "SMTP", FakeSMTP)
    ok, detail = email_mod.send_email_detail("good@x.ru, bad@x.ru", "s", "b")
    assert ok is True and detail is None


def test_send_email_blank_recipient_returns_false(monkeypatch):
    """Пустое поле «кому» (или строка из запятых) — не отправляем, но и не падаем."""
    monkeypatch.setattr(email_mod, "get_smtp_config",
                        lambda: {"host": "smtp.x", "user": "u@x", "password": "p", "port": 587, "from_email": "u@x"})
    assert email_mod.send_email("", "s", "b") is False
    assert email_mod.send_email(" , ; ", "s", "b") is False


def test_send_email_handles_error(monkeypatch):
    monkeypatch.setattr(email_mod, "get_smtp_config",
                        lambda: {"host": "smtp.x", "user": "u", "password": "p", "port": 587, "from_email": "u"})

    def boom(*a, **k):
        raise RuntimeError("smtp down")
    monkeypatch.setattr(email_mod.smtplib, "SMTP", boom)
    assert email_mod.send_email("to@x.ru", "s", "b") is False  # не падает


def test_send_email_with_attachment(monkeypatch):
    """Бэкап на почту: вложение уходит отдельной частью письма, байты не искажаются."""
    import email as std_email
    monkeypatch.setattr(email_mod, "get_smtp_config",
                        lambda: {"host": "smtp.x", "user": "u@x", "password": "p", "port": 587, "from_email": "u@x"})
    captured = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout=0):
            captured["timeout"] = timeout
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False
        def starttls(self):
            pass
        def login(self, u, p):
            pass
        def sendmail(self, frm, to, msg):
            captured["msg"] = msg

    monkeypatch.setattr(email_mod.smtplib, "SMTP", FakeSMTP)
    blob = bytes(range(256)) * 10
    ok, err = email_mod.send_email_detail("me@x.ru", "Бэкап", "текст", attachments=[("b.tar.gz.age", blob)])
    assert ok and err is None
    assert captured["timeout"] >= 60                                  # большое письмо — длинный таймаут
    parsed = std_email.message_from_string(captured["msg"])
    parts = [p for p in parsed.walk() if p.get_filename()]
    assert len(parts) == 1 and parts[0].get_filename() == "b.tar.gz.age"
    assert parts[0].get_payload(decode=True) == blob


def test_backup_mail_main(monkeypatch, capsys):
    import io
    import sys
    from app.services import backup_mail
    sent = {}
    monkeypatch.setattr(backup_mail, "send_email_detail",
                        lambda to, subj, body, from_name="", attachments=None:
                        sent.update(to=to, att=attachments) or (True, None))
    monkeypatch.setattr(sys, "stdin", io.TextIOWrapper(io.BytesIO(b"AGEDATA")))
    assert backup_mail.main(["x", "me@x.ru", "f.age"]) == 0
    assert sent["to"] == "me@x.ru" and sent["att"] == [("f.age", b"AGEDATA")]
    monkeypatch.setattr(sys, "stdin", io.TextIOWrapper(io.BytesIO(b"")))
    assert backup_mail.main(["x", "me@x.ru", "f.age"]) == 1        # пустой архив — ошибка
