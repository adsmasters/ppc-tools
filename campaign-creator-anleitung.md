# Anleitung: PPC Campaign Creator – Amazon DE

Diese Anleitung erklärt Schritt für Schritt, wie der Campaign Creator genutzt wird, um Amazon Sponsored Products Bulk Upload Sheets für den deutschen Markt (DE) zu erstellen. Die Anleitung ist so geschrieben, dass sie direkt als Arbeitsanweisung genutzt werden kann.

---

## Überblick

Der Campaign Creator erzeugt eine Excel-Datei, die direkt in Amazon Ads als Bulk-Upload hochgeladen werden kann. Alle Werte im Bulk Sheet sind auf Englisch — das gilt auch für Deutschland. Das Tool stellt das automatisch sicher.

**Wichtig für Deutschland:**  
- Marketplace ist immer **DE**  
- Alle Bulk-Sheet-Werte sind trotzdem auf **Englisch** (Amazon-Anforderung)  
- Das Tool setzt das intern automatisch um

---

## Schritt 0: Grundeinstellungen (vor dem Ausfüllen)

### Seller oder Vendor?
- **Seller** → Produkte werden über SKUs erfasst (Standard für die meisten Kunden)  
- **Vendor** → Produkte werden über ASINs erfasst  

Den richtigen Modus über die Umschalter-Buttons oben links ("Seller: SKU Listen" / "Vendor: ASIN Listen") auswählen.

### Namensgebung (Naming Convention)
Zwei Optionen:

**Standard (empfohlen):**  
Kampagnenname: `SP: Generic Keywords (Exact) - [Produktname]`  
Kein weiteres Setup nötig.

**AMZ Custom Format:**  
Kampagnenname: `AMZ_AMZ_DE_SP_[Portfolio]_[Produkt]_SP_kwexact_generic_[BidModifier]`  
Benötigt zusätzlich:
- **Land**: `DE` eingeben
- **Portfolio**: Name des Portfolios (z.B. Kunde, Marke)
- **Bid Modifier**: z.B. `all`, `tos`, `low`

Den Modus unter "Naming Convention" oben auf der Seite auswählen.

---

## Schritt 1: Beworbene Produkte

Pro Produkt einen Block ausfüllen:

| Feld | Inhalt | Hinweis |
|------|--------|---------|
| **Kampagnenname** | Produktname (z.B. "Langhantel") | Wird für die Benennung aller Kampagnen genutzt — klar und eindeutig wählen |
| **SKUs / ASINs** | Eine SKU/ASIN pro Zeile | Seller: SKU-Format, Vendor: ASIN (B0 + 8 Zeichen, z.B. B09XXXXXXX) |

Mehrere Produkte: "**+ Weiteres Produkt hinzufügen**" klicken. Jedes Produkt bekommt dann ein eigenes Kampagnen-Set mit denselben Keywords.

---

## Schritt 2: Keywords & Targeting

### Generische Keywords
Keywords, die den Hauptmarkt abdecken (keine Marken-, keine Wettbewerber-Keywords).

| Feld | Inhalt |
|------|--------|
| Keywords | Alle generischen Keywords, eine pro Zeile |
| **Keyword Allocation** | Anzahl Keywords pro Kampagne (z.B. `10` → bei 30 Keywords = 3 Kampagnen) |

**Wenn kein Allocation-Wert eingegeben:** Alle Keywords kommen in eine einzige Kampagne.

### Eigenmarken Keywords
Keywords, die den eigenen Markennamen enthalten (z.B. "Adidas Langhantel").  
Eine pro Zeile eintragen. Kein Allocation-Feld nötig — alle kommen in eine Kampagne.

### Wettbewerber Keywords
Keywords, die Markennamen von Mitbewerbern enthalten (z.B. "Kettler Hantel").

| Feld | Inhalt |
|------|--------|
| Keywords | Wettbewerber-Keywords, eine pro Zeile |
| **Wettbewerber Keyword Zuordnung** | Wie viele pro Kampagne (analog zu Generic Allocation) |

### Single Keyword-Kampagnen
Top-Performer Keywords, die jeweils eine eigene Kampagne erhalten sollen (Exact Match, eigenes Budget).  
Eine pro Zeile → jedes wird zu einer eigenständigen Kampagne.

### Produktausrichtung (Product Targeting)

| Feld | Inhalt |
|------|--------|
| **Eigenmarken ASINs** | Eigene ASINs, auf denen man Anzeigen zeigen will (Brand Defense) |
| **Wettbewerber ASINs** | ASINs der Mitbewerber |
| **Wettbewerber ASIN Zuordnung** | Wie viele Wettbewerber-ASINs pro Kampagne |

---

## Schritt 3: Kampagnen-Einstellungen

| Einstellung | Empfehlung DE | Optionen |
|-------------|---------------|----------|
| **Gebotsstrategie** | Dynamische Gebote – nur senken | oder: erhöhen und senken / Feste Gebote |
| **Tagesbudget** | Nach Kundenvorgabe (z.B. `10.00`) | Wird automatisch in alle Kampagnen-Typen übertragen |
| **Standardgebot** | Nach Kundenvorgabe (z.B. `0.50`) | Wird automatisch in alle Kampagnen-Typen übertragen |
| **Startdatum** | Heutiges Datum (vorausgefüllt) | Format: YYYY-MM-DD |
| **Enddatum** | Leer lassen | Nur bei zeitlich begrenzten Aktionen |

### Placement-Anpassungen (optional)
- **Top of Search (ToS) %**: Prozentualer Aufschlag für Top-of-Search-Platzierungen (z.B. `50` = +50%)  
- **Product Pages (PP) %**: Aufschlag für Produktseiten-Platzierungen

Leer lassen = keine Placement-Anpassungen.

### Negative Keywords
Vier separate Felder — jedes einzeln ausfüllen, wenn nötig:

| Feld | Ebene | Match Type |
|------|-------|------------|
| Negative Keywords (Exact) | Anzeigengruppen-Ebene | Exact |
| Negative Keywords (Phrase) | Anzeigengruppen-Ebene | Phrase |
| Kampagnen Negative Keywords (Exact) | Kampagnen-Ebene | Exact |
| Kampagnen Negative Keywords (Phrase) | Kampagnen-Ebene | Phrase |

**Empfehlung:** Markennamen in "Kampagnen Negative Keywords (Phrase)" eintragen, damit sie aus den Generic-Kampagnen ausgeschlossen werden.

### Negatives Produkt-Targeting
Eigene ASINs hier eintragen, damit die eigenen Produkte nicht gegenseitig beworben werden (wenn relevant).

---

## Schritt 4: Kampagnen-Vorlagen auswählen

Jeden gewünschten Kampagnentyp **ankreuzen**. Für jeden aktivierten Typ kann Gebot und Budget individuell angepasst werden (überschreibt den Standardwert aus Schritt 3).

### Verfügbare Kampagnentypen

| Kampagnentyp | Targeting | Match Type | Wann nutzen |
|-------------|-----------|------------|-------------|
| **SP: Auto-Kampagne** | Auto (Amazon wählt) | — | Immer als Basis |
| SP: Generic-Keyword (Exact) | Generische KWs | Exact | Hauptkampagne für generische Terms |
| SP: Generic-Keyword (Broad) | Generische KWs | Broad | Zum Discovery von neuen Keywords |
| SP: Brand-Keyword (Exact) | Eigenmarken KWs | Exact | Brand Defense |
| SP: Brand-Keyword (Broad) | Eigenmarken KWs | Broad | Brand Defense breiter |
| SP: Brand-Keyword (Phrase) | Eigenmarken KWs | Phrase | Brand Defense mittlere Breite |
| SP: Competitor-Keyword (Exact) | Wettbewerber KWs | Exact | Attack-Kampagnen |
| SP: Competitor-Keyword (Broad) | Wettbewerber KWs | Broad | Attack-Kampagnen breiter |
| SP: Produktausrichtung (Competitor ASIN) | Wettbewerber ASINs | ASIN Targeting | Auf Produktseiten der Konkurrenz |
| SP: Produktausrichtung (Brand ASIN) | Eigenmarken ASINs | ASIN Targeting | Eigene PDPs absichern |
| SP: Single Keyword-Kampagne | Single KWs | Exact | Top-Performer mit eigenem Budget |

### Auto-Kampagne: Sonder-Optionen

**Sub-Targets** (4 Amazon-Targeting-Typen, einzeln aktivierbar + eigenes Gebot):
- Enge Übereinstimmung (Close Match)
- Entfernte Übereinstimmung (Loose Match)
- Ersatz (Substitutes)
- Ergänzungen (Complements)

**Cross-Negation** (stark empfohlen bei gleichzeitiger Auto + Keyword-Kampagne):  
✓ aktivieren → Eigenmarken-KWs werden als Negative Phrase in die Auto-Kampagne eingetragen, Generische KWs als Negative Exact. Verhindert Kannibalisierung zwischen Auto und manuellen Kampagnen.

**Negative KW** Checkbox pro Kampagnentyp:  
✓ = Die negativen Keywords aus Schritt 3 werden in diese Kampagne eingetragen.

---

## Workflow: Wie wird das Bulk Sheet erstellt?

### Ein Produkt
1. Schritte 1–4 ausfüllen
2. **"Produkt hinzufügen +"** klicken (oder **Strg+Enter**)
3. Produkt erscheint in der Akkumulator-Liste unten
4. **"Excel für Amazon herunterladen"** klicken
5. Datei wird als `Bulk-Upload YYYY-MM-DD.xlsx` gespeichert

### Mehrere Produkte (ein nach dem anderen)
1. Schritt 1–4 für Produkt 1 ausfüllen
2. "Produkt hinzufügen +" → Keywords werden geleert, Produkt wird zur Liste hinzugefügt
3. Schritt 1–4 für Produkt 2 ausfüllen (Keywords/Einstellungen neu eingeben)
4. "Produkt hinzufügen +" erneut klicken
5. Wiederholen bis alle Produkte in der Liste
6. "Excel für Amazon herunterladen" — ein Excel mit allen Produkten

### Produkt nachträglich bearbeiten
In der Akkumulator-Liste auf den **Stift-Button** (✏) klicken → Formular wird mit den gespeicherten Werten befüllt, Produkt aus der Liste entfernt → nach Korrektur erneut "Produkt hinzufügen +"

---

## Vorlagen (Presets)

Häufig genutzte Einstellungen können als Vorlage gespeichert werden:
- **Strg+S** (oder Dropdown → Speichern) → Vorlagenname eingeben
- Vorlage laden: Dropdown → Vorlage wählen → "Laden"
- Vorlagen-Export/Import: JSON-Format, für Übertragung zwischen Geräten

---

## Standard-Setup für Deutschland (Empfehlung)

```
Modus: Seller (SKU Listen)
Naming: Standard
Gebotsstrategie: Dynamische Gebote – nur senken
Tagesbudget: [nach Kundenvorgabe, z.B. 10.00 €]
Standardgebot: [nach Kundenvorgabe, z.B. 0.50 €]
Startdatum: Heute

Kampagnen-Vorlagen (minimal):
✓ SP: Auto-Kampagne
  ✓ Enge Übereinstimmung
  ✓ Entfernte Übereinstimmung
  ✓ Cross-Negation
✓ SP: Generic-Keyword (Exact)
✓ SP: Brand-Keyword (Exact)  [wenn Brand-KWs vorhanden]

Optional je nach Strategie:
✓ SP: Generic-Keyword (Broad)
✓ SP: Competitor-Keyword (Exact)
✓ SP: Produktausrichtung (Competitor ASIN)
```

---

## Was Claude vor der Erstellung fragen muss

Bevor das Bulk Sheet erstellt werden kann, folgende Informationen vom Nutzer erfragen:

1. **Seller oder Vendor?**
2. **Produktname(n)** (für Kampagnenbenennung)
3. **SKUs oder ASINs** (je nach Seller/Vendor, eine pro Zeile)
4. **Generische Keywords** + wie viele Keywords pro Kampagne (Allocation)
5. **Eigenmarken-Keywords** (optional)
6. **Wettbewerber-Keywords** + Allocation (optional)
7. **Single Keywords** – Top-Performer mit eigenem Budget (optional)
8. **Wettbewerber-ASINs** (optional) + wie viele pro Kampagne
9. **Eigenmarken-ASINs** (optional)
10. **Tagesbudget** und **Standardgebot**
11. **Startdatum** (Standard: heute)
12. **Negative Keywords** (optional)
13. **Welche Kampagnentypen** sollen erstellt werden? (Auto, Exact, Broad, etc.)
14. **Placement-Anpassungen** ToS % und PP % (optional)
15. **Naming Convention**: Standard oder AMZ Custom? (bei AMZ Custom: Land=DE, Portfolio, Bid Modifier)
