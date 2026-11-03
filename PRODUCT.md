# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Befragte (Hauptgruppe):** Menschen in der Schweiz zwischen 16 und 65, die eine Banking-App nutzen. Sie kommen über einen Kanallink oder QR-Code (WhatsApp, Instagram, Aushang, Schule, Organisation) und füllen die Umfrage meist am Handy aus, freiwillig und ohne Vorwissen. Job: in sechs bis acht Minuten ehrlich sagen, was sie vom Kundendienst ihrer Banking-App erwarten und erlebt haben.
- **Projektgruppe (Team-App unter /team):** fünf Studierende der Klasse 601/H25-B (HFW, KV Business School Zürich), Laptop und Handy. Job: Umfrage teilen, Servicetest (B) durchführen und erfassen, Bewertungen (C) codieren, Aufgaben und Fristen erledigen. Die Leitung (Salah) sieht zusätzlich alle Personen lesend.

## Product Purpose

Datenerhebung für die Praxisarbeit PA6 im Auftrag von Yuh: Wie kann Yuh seinen Kundendienst als echten Vorteil positionieren? Die Umfrage (Methode A) liefert Erwartungen und Erfahrungen. Erfolg heisst viele vollständige, unverzerrte Antworten aus möglichst unterschiedlichen Gruppen bis 01.12.2026.

## Positioning

Eine Studierendenumfrage, keine Marketingaktion: neutral, anonym, kurz, mit klarer Herkunft (Studierende der KV Business School Zürich). Sie gewinnt Teilnahme durch Respekt vor der Zeit und eine angenehme Bedienung, nicht durch Druck.

## Operating Context

- Erreichbar über umfrage.hydeout.ch und Kanalpfade (/w, /i, /f, /l, /r, /g, /c, /j, /k, /s, /a, /d, /h/<code>, /o/<code>, /t). Der Pfad zählt den Kanal, nie die Person.
- Antworten gehen per POST an einen Google-Apps-Script-Empfänger; Ergebnisse sind bis 02.12.2026 gesperrt (Ergebnisneutralität).
- Statische Seiten auf GitHub Pages, ohne Framework, CSP mit `script-src 'self'` (Inline-Skripte nur per sha256), Schrift Nunito lokal.
- Sprachen der Umfrage: Deutsch, Französisch, Italienisch, Englisch (sprachen.js); Datenschutz und Teilnahmebedingungen je Sprache.
- Verlosung eines Gutscheins über 100 Franken unter vollständigen Antworten.

## Capabilities and Constraints

- **Instrument ist fix:** Fragen, Wortlaut, Reihenfolge, Antwortoptionen, Filterlogik und gespeicherte Felder dürfen sich durch Design nicht ändern; jede Gestaltungsänderung muss die gesendeten Daten byte-gleich lassen und wird so geprüft.
- Keine Personendaten im Link, keine Tracking-Pixel, keine Drittanbieter-Skripte.
- Team-App: Rollen (Mitglied, Leitung, «Ansicht von» nur lesend), Werkzeuge A/B/C, Fristen, Pia (Assistentin).

## Brand Commitments

- **Umfrage neutral:** keine Bank-Marke, kein Yuh-Logo, kein Yuh-Farbstil, damit die Antworten nicht verzerrt werden. Absender sind die Studierenden der KV Business School Zürich (Logo kvbsz_logo.svg, Wortmarke kvbsz_wortmarke.png vorhanden).
- **Team-App:** darf Yuh-nah wirken, aber ohne Yuh-Logo (Freigabe durch Yuh fehlt).
- Massstab für Qualität: Consumer Grade auf Niveau Ramp, Clay, Linear; für die Umfrage Typeform als Vorbild für das Ausfüllgefühl.
- Ton: Du/Sie je nach Sprache wie bestehend, freundlich, ohne Marketingsprache; Schweizer Rechtschreibung (ss statt ß).

## Evidence on Hand

- Bestehende Umfrage index.html mit sprachen.js, Kanalseiten, Aushang-PDFs je Organisation (o/<code>/aushang_<sprache>.pdf), Datenschutz- und Teilnahmebedingungen.
- Keine Testimonials, Kundenstimmen oder Zahlen zu Ergebnissen; vor 02.12.2026 dürfen keine Ergebnisse gezeigt werden.

## Product Principles

1. Ergebnisoffen vor gefällig: Gestaltung darf keine Antwort nahelegen.
2. Respekt vor der Zeit: jeder Bildschirm hat einen Zweck, Fortschritt ist immer sichtbar.
3. Vertrauen durch Klarheit: Absender, Anonymität und Zweck sind jederzeit erkennbar.
4. Handy zuerst, ohne Abstriche am Laptop.
5. Gleiche Daten, besseres Erlebnis: Design verbessert nur die Bedienung.

## Accessibility & Inclusion

WCAG 2.2 AA: Kontrast, vollständige Tastaturbedienung, Screenreader-Beschriftung, Fokus sichtbar, Schrift skalierbar, reduzierte Bewegung respektiert; vier Sprachen gleichwertig; verständlich für 16- bis 65-Jährige ohne Fachwissen.
