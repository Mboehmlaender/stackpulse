# Getting Started

Dieser Leitfaden beschreibt ausschließlich den Docker-Deploy über die bereitgestellten GHCR-Images und die anschließende Einrichtung im UI.

## Voraussetzungen
- Docker & Docker Compose
- Portainer-Instanz (Business Edition empfohlen; bei Community/Edge zusätzlich Agent einsetzen)

## Zentrale Umgebungsvariablen (Kurzfassung)
| Variable | Erforderlich | Beschreibung |
|----------|--------------|--------------|
| `PORTAINER_URL` | Nein | Basis-URL zu Portainer; kann im Setup-UI hinterlegt werden, falls nicht gesetzt. |
| `PORTAINER_API_KEY` | Nein | API-Key; kann im Setup gespeichert werden (wird verschlüsselt). |
| `PORTAINER_SERVER_NAME` | Nein | Anzeige-Name für den initialen Servereintrag. |
| `PORTAINER_API_SECRET` | Nein | AES-Schlüssel für gespeicherte API-Keys; setze stabilen Wert, sonst muss der Key neu eingegeben werden. |
| `SUPERUSER_USERNAME`, `SUPERUSER_EMAIL`, `SUPERUSER_PASSWORD` | Nein | Legt automatisch einen Superuser an, falls noch keiner existiert; sonst im Setup-UI anlegen. |
| `SELF_STACK_ID` | Nein | ID des StackPulse-Stacks; schützt vor Self-Redeploy. |
| `AUTH_COOKIE_NAME`, `AUTH_SESSION_TTL_MS`, `AUTH_COOKIE_SECURE` | Nein | Session/Cookie-Tuning (Name, Dauer, Secure-Flag). |
| `SECURITY_PHRASE_SECRET` | Nein | Secret für verschlüsselte Sicherheitsphrasen; stabil halten, sonst Phrasen neu verteilen. |
| `PORTAINER_SSH_SECRET` | Nein | Secret für verschlüsselte SSH-Passwörter; stabil halten, sonst Passwort neu setzen. |
| `DISPLAY` | Nein | Wird an Update-Childprozesse weitergereicht (Default `:9999`). |

Weitere Variablen (Agent, Registry, mTLS) findest du im Detail unter [Umgebungsvariablen](environment.md). Einstellungen wie Server-URL/API-Key, SSH-Config oder Update-Skript kannst du alternativ im UI (Setup/Wartung) verwalten.

**Hinweis zu Secrets:**  
- `SECURITY_PHRASE_SECRET` und `PORTAINER_SSH_SECRET` steuern die AES-256-GCM-Verschlüsselung von Sicherheitsphrasen bzw. hinterlegten SSH-Passwörtern.  
- Wenn sie nicht gesetzt sind, nutzt StackPulse fixe Fallbacks (`stackpulse-security-phrase-secret` bzw. `stackpulse-portainer-ssh-secret` / API-Key). Setze in Produktion eigene, stabile Werte – ein späterer Secret-Wechsel macht zuvor gespeicherte Phrasen/Passwörter unlesbar.  
- Eine vollständige Übersicht aller Variablen (inkl. Agent) findest du unter „Technik → Umgebungsvariablen“.

## Ersteinrichtung im UI
1. Öffne das Frontend.
2. Lege den Portainer-Server und den zugehörigen API-Key an (der Wizard führt durch den Test).
3. Registriere einen Superuser oder verwende den per Umgebungsvariablen automatisch angelegten Account.
4. Nach erfolgreicher Einrichtung kannst du dich anmelden und erhältst Zugriff auf Dashboard, Logs, Benutzer & Wartung.

## Docker Run (Single Container)
```bash
docker run -d \
  -p 4001:4001 \
  -e PORTAINER_URL=https://portainer.example.com \
  -e PORTAINER_API_KEY=xxxx \
  -e SUPERUSER_USERNAME=admin \
  -e SUPERUSER_EMAIL=admin@example.com \
  -e SUPERUSER_PASSWORD=changeme \
  -e SELF_STACK_ID=123 \
  -e SECURITY_PHRASE_SECRET=$(openssl rand -hex 32) \
  -e PORTAINER_SSH_SECRET=$(openssl rand -hex 32) \
  -v stackpulse_data:/app/backend/data \
  ghcr.io/mboehmlaender/stackpulse:latest
```
Das Volume `stackpulse_data` persistiert die SQLite-Datenbank. Passen Sie Secrets und Ports an Ihre Umgebung an; weitere Variablen siehe Kapitel „Umgebungsvariablen“.

## Docker-Deployment (Compose)
```yaml
# docker-compose.yml (Auszug)
services:
  app:
    image: ghcr.io/mboehmlaender/stackpulse:latest
    ports:
      - "4001:4001"
    volumes:
      - stackpulse_data:/app/backend/data
    restart: unless-stopped
    environment:
      - PORTAINER_URL=https://portainer.example.com
      - PORTAINER_API_KEY=xxxx
      - SUPERUSER_USERNAME=admin
      - SUPERUSER_EMAIL=admin@example.com
      - SUPERUSER_PASSWORD=changeme
      - SELF_STACK_ID=123
volumes:
  stackpulse_data:
```

1. `docker compose up -d`
2. Das Frontend ist anschließend unter Port 4001 erreichbar.
3. Datenbank & Einstellungen liegen im benannten Volume `stackpulse_data`.

Damit bist du bereit für die tieferen Kapitel zu Architektur sowie Backend- und Frontend-Details.
