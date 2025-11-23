# Frontend

Das Frontend basiert auf React 18, Vite und dem Material Tailwind Dashboard. Es nutzt Context Provider für Authentifizierung, Seitenstatus, Toaster und Wartungsinformationen.

## Build & Skripte
| Befehl | Beschreibung |
|--------|--------------|
| `npm run dev` | Startet den Vite Dev-Server (Port 5173, HMR aktiviert). |
| `npm run build` | Erstellt ein Production-Bundle (`frontend/dist`). Das Dockerfile kopiert dieses Paket ins Backend (`backend/public`). |
| `npm run preview` | Vorschau auf das gebaute Bundle.

## Projektstruktur
```
frontend/src
├── App.jsx                # Entry-Point, registriert Layouts & Provider
├── components/           # AuthProvider, PermissionGate, Toast/Maintenance/PageProvider
├── layouts/              # Dashboard-Layout (Sidebar, Navbar) & Auth-Layout
├── pages/
│   ├── auth/             # SignIn, SignUp, ForgotPassword, SignOut
│   ├── dashboard/        # Stacks, Logs, Maintenance, Users, Usergroups, Detailseiten
│   └── setup/            # Setup-Wizard & Helper Screens
├── routes.jsx            # zentrale Navigationsdefinition inkl. Permissions
├── widgets/, data/, configs/, assets/
└── tailwind.css          # Tailwind Layer & Custom Styles
```

## Routing & Navigation
- `routes.jsx` beschreibt sowohl Dashboard- als auch Auth-Routen. Jede Dashboard-Seite besitzt optional ein `permission`-Objekt, das vom `PermissionGate` ausgewertet wird.
- Der Layout-Switch erfolgt über `layouts/index.jsx`, das wiederum Sidebar/Topbar-Komponenten aus dem Material Tailwind Dashboard nutzt.
- Auth-Routen (`/sign-in`, `/sign-up`, `/forgot-password`, `/logout`) werden im Auth-Layout ohne Sidebar dargestellt.

## State-Management & Contexts
| Provider | Aufgabe |
|----------|---------|
| `AuthProvider` | Speichert User, Permissions, Session-Status. Stellt `refreshSession`, `logout`, `hasPermission` bereit. |
| `PageProvider` | Zentrale UI-Zustände (z. B. Ladeanzeigen, modale Dialoge) für Dashboard-Komponenten. |
| `ToastProvider` | Globale Notifications (z. B. Redeploy-Erfolg/Fehler). |
| `MaintenanceProvider` | Cached Maintenance-Status, erkennt aktive Maintenance Modes und zeigt Hinweise. |

## Wichtige Seiten
- **Stacks (`pages/dashboard/stacks.jsx`)**: Hauptübersicht mit Tabellen, Suche, Filtern, Bulk- und Einzelredeploy. Bindet `socket.io-client` für Live-Updates (`redeployStatus`).
- **Logs (`pages/dashboard/logs.jsx`)**: Tabellenansicht mit Statusfarben, Filterchips, Export-/Delete-Aktionen. Nutzt axios-Queries gegen `/api/logs`.
- **Maintenance (`pages/dashboard/maintenance.jsx`)**: Formulare zur Verwaltung von Update-Skript, SSH-Konfiguration, Maintenance-Mode-Toggle und Portainer-Statusprüfung.
- **Users / Usergroups**: CRUD-Oberfläche für Benutzer, Gruppen, Berechtigungszuweisung inkl. Sicherheitsphrasen-Handling.
- **Setup (`pages/setup`)**: Schrittweiser Wizard (Server -> API-Key -> Superuser). Wird solange angezeigt, bis `/api/setup/status` vollständig ist.

## Datenzugriff
- HTTP-Anfragen erfolgen via `axios` (global konfiguriert in `frontend/src/components/AuthProvider` bzw. direkt in den Seiten). Cookies werden automatisch vom Browser beigesteuert (`credentials: 'include'`).
- Socket.IO wird nur im Stack-Dashboard verwendet; Verbindungsaufbau erfolgt in `stacks.jsx` (`io('/', { path: '/socket.io' })`).
- Fehlerbehandlung: Jede Seite zeigt Toasts und/oder Inline-Warnungen. Auth-Fehler leiten zur Loginseite um.

## Styling & Komponenten
- Tailwind Utility-Klassen liefert Material Tailwind bereits vordefiniert (Theme in `configs`).
- Custom-Komponenten wie Tabellen, Filterchips oder Formulare sind überwiegend in `widgets/` ausgelagert.
- Icons stammen aus `@heroicons/react`. Farben/Typografie folgen Creative Tim Vorgaben, können aber zentral in `frontend/src/configs` angepasst werden.

## Erweiterungshinweise
1. **Neue Seiten**: Route in `routes.jsx` ergänzen, optional `PermissionGate` konfigurieren und Seite unter `pages/dashboard` oder `pages/auth` anlegen.
2. **API-Anbindungen**: Verwende `axios` und achte auf `try/catch`, damit 401/403 sauber abgefangen werden. Bei kritischen Anforderungen `refreshSession` aufrufen.
3. **State teilen**: Nutze bestehende Provider bzw. erzeuge einen eigenen Context in `components/`.
4. **Deployment**: `npm run build` liefert ein Self-Contained Bundle. Das Backend dient anschließend als Static Host (`express.static`).

Damit bietet das Frontend eine anpassbare, klar strukturierte Oberfläche, die eng mit den Backend-Permissions verzahnt ist.
