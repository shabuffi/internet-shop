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


def test_send_email_handles_error(monkeypatch):
    monkeypatch.setattr(email_mod, "get_smtp_config",
                        lambda: {"host": "smtp.x", "user": "u", "password": "p", "port": 587, "from_email": "u"})

    def boom(*a, **k):
        raise RuntimeError("smtp down")
    monkeypatch.setattr(email_mod.smtplib, "SMTP", boom)
    assert email_mod.send_email("to@x.ru", "s", "b") is False  # не падает
