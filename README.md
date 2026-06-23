# Daybase

Lokale, modulare Produktivitäts-App (React + Vite + TypeScript). Alle Daten
liegen im Browser in **IndexedDB** – nichts verlässt das Gerät.

## Tech-Stack

- **React 18 + Vite + TypeScript**
- **Dexie.js** als IndexedDB-Wrapper ([Begründung](#warum-dexie))
- **react-router-dom** für die Navigation

## Architektur

Das Herzstück ist **ein gemeinsames `Entry`-Objekt für alle Module** – kein
separates Schema pro Modul. Jeder Eintrag hat einen `type`
(`journal | task | weekplan | trade | habit | note`) und ein flexibles
`meta`-Feld für typ-spezifische Daten.

```
src/
  types.ts        # Entry-Interface + meta-Shapes je Typ
  db.ts           # Dexie-Setup (eine "entries"-Tabelle, indexiert)
  repository.ts   # generisches CRUD + Queries (by-type, by-date-range, ...)
  modules.ts      # Definition der 6 Module (Single Source of Truth)
  App.tsx         # Routing
  components/Layout.tsx
  pages/Dashboard.tsx
  pages/ModulePlaceholder.tsx
```

### CRUD / Query-API (`entriesRepo`)

- `create`, `get`, `getAll`, `update`, `remove`
- `queryByType(type)`
- `queryByDateRange(from, to)`
- `queryByTypeAndDateRange(type, from, to)`
- `queryByTag(tag)`, `queryByTypeOnDate(type, date)`

### Warum Dexie?

Gegenüber dem reinen `idb`-Wrapper bietet Dexie deklarative Indizes (schnelle
`query-by-type` / `query-by-date-range` über echte IndexedDB-Indizes statt
manueller Scans), eingebaute Versionierung/Migrationen und mit
`dexie-react-hooks` reaktive Queries für React. `idb` ist nur ein dünner
Promise-Wrapper – Querying & Indexing müsste man selbst bauen.

## Setup

Voraussetzung: **Node.js ≥ 18** (inkl. npm).

```bash
npm install
npm run dev      # Dev-Server (http://localhost:5173)
npm run build    # Production-Build
npm run preview  # Build lokal ansehen
```

## Status

Fundament steht: generisches Entry-CRUD, Navigation mit 6 Platzhalter-Routen,
Dashboard mit Platzhalter-Text. Modul-spezifische UI/Logik folgt in weiteren
Schritten.
