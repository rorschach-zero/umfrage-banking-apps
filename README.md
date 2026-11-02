# Umfrage Kundendienst von Banking-Apps

Anonyme Umfrage einer Studierendengruppe der HFW, KV Business School Zuerich.

## Team-App lokal prüfen

Vor einer Veröffentlichung die Standardsuite im benachbarten PA6-Repository ausführen:

```sh
cd ../PA6
python3 99_system/tests/run_regression.py
```

Voraussetzungen und Prüfungsumfang stehen dort in `99_system/tests/README.md`. Die Suite prüft unter anderem alle Inline-Skript-Hashes der Meta-CSP sowie den Start von B und C mit aktivem CSP im Browser. Änderungen an Inline-Skripten erfordern passende SHA-256-Hashes. Ein roter Lauf blockiert die fachliche Freigabe; der Testlauf veröffentlicht nichts.
