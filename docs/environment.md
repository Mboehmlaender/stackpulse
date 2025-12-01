# Umgebungsvariablen

Diese Seite sammelt alle relevanten Umgebungsvariablen für StackPulse (Backend) und den optionalen StackPulse Agent. Werte ohne Default sind in der Regel optional, sofern sie nicht explizit als „erforderlich“ markiert sind.

## StackPulse Backend
| Variable | Default | Erforderlich | Beschreibung |
|----------|---------|--------------|--------------|
| `PORTAINER_URL` | – | Nein | Basis-URL zu Portainer. Kann im Setup-UI hinterlegt werden; ohne Wert schlägt Portainer-Zugriff fehl, bis ein Server gespeichert ist. |
| `PORTAINER_API_KEY` | – | Nein | API-Key für Portainer. Kann im Setup-UI gespeichert (verschlüsselt) werden; ohne Wert keine API-Aufrufe. |
| `PORTAINER_SERVER_NAME` | – | Nein | Anzeigename für den initialen Servereintrag (nur kosmetisch). |
| `PORTAINER_API_SECRET` | `stackpulse-portainer-api-key` | Nein | AES-Schlüssel für gespeicherte API-Keys. Stabil halten, sonst müssen Keys neu eingetragen werden. |
| `SUPERUSER_USERNAME` | – | Nein | Legt beim Start einen Superuser an, falls noch keiner existiert; alternativ im Setup-UI anlegen. |
| `SUPERUSER_EMAIL` | – | Nein | E-Mail des initialen Superusers. |
| `SUPERUSER_PASSWORD` | – | Nein | Passwort des initialen Superusers. |
| `SELF_STACK_ID` | – | Nein | ID des StackPulse-Stacks; verhindert Self-Redeploy im UI. |
| `AUTH_COOKIE_NAME` | `sp_auth_token` | Nein | Name des Auth-Cookies. |
| `AUTH_SESSION_TTL_MS` | `43200000` (12h) | Nein | Session-Lebensdauer in Millisekunden. |
| `AUTH_COOKIE_SECURE` | `false` | Nein | Setzt Cookie nur über HTTPS, wenn `true`. |
| `SECURITY_PHRASE_SECRET` | `stackpulse-security-phrase-secret` | Nein | Secret für verschlüsselte Sicherheitsphrasen; stabil halten, sonst Phrasen neu verteilen. |
| `PORTAINER_SSH_SECRET` | – (Fallback API-Key/Default) | Nein | Secret für verschlüsselte SSH-Passwörter; stabil halten, sonst Passwort neu setzen. |
| `AGENT_MTLS_KEY` | generiert | Nein | Optional: eigenes PEM-Key für internen mTLS-Server, falls nicht automatisch erzeugt. |
| `AGENT_MTLS_CERT` | generiert | Nein | Optional: eigenes PEM-Zertifikat für internen mTLS-Server. |
| `AGENT_MTLS_PORT` | `4441` | Nein | Port des internen mTLS-Endpunkts (Agent). |
| `DISPLAY` | `:9999` | Nein | Wird an Child-Prozesse (Update-Skript) weitergereicht. |

## StackPulse Agent
| Variable | Default | Erforderlich | Beschreibung |
|----------|---------|--------------|--------------|
| `AGENT_PORT` | `7070` | Nein | Listenport des Agents (HTTPS mit mTLS). |
| `AGENT_TOKEN` | – | Ja | Shared Secret für Auth (`X-Agent-Token`) bei allen Agent-Endpoints. |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Nein | Pfad zum Docker-Socket; nötig für Stack-/Image-Infos. |
| `CONTROL_PLANE_URL` | – | Ja (für Bootstrap/Restore) | Basis-URL des StackPulse-Backends für Zertifikatsabruf ohne mTLS (z. B. `https://stackpulse:4001`). |
| `CONTROL_PLANE_MTLS_URL` | – | Nein (empfohlen) | Bevorzugte mTLS-URL des Backends (z. B. `https://stackpulse:4441`). Wird für alle Agent→Backend-Calls genutzt, sobald Zertifikate vorliegen; fehlt sie, wird aus `CONTROL_PLANE_URL` + `AGENT_MTLS_PORT` abgeleitet. |
| `AGENT_BOOTSTRAP_TOKEN` | – | Nein (für Erstbootstrap) | Einmal-Token aus dem Wartungsbereich, um mTLS-Zertifikate zu ziehen. Pflicht, wenn keine Zertifikate vorliegen und das Backend noch kein Material für den Agent gespeichert hat. |
| `AGENT_MTLS_PORT` | `4441` | Nein | Fallback-Port, falls `CONTROL_PLANE_MTLS_URL` keinen Port enthält. |
| `AGENT_SERVER_KEY` / `AGENT_SERVER_CERT` | – | Nein | PEM-Material für den Agent-Server; nur nötig bei eigenen Zertifikaten statt Backend-CA. |
| `AGENT_CLIENT_KEY` / `AGENT_CLIENT_CERT` / `AGENT_CA_CERT` | – | Nein | PEM-Material für Client/CA; nur bei eigener PKI nötig. |
| `REGISTRY_TOKEN` | – | Nein | Bearer-Token für Registry-Abfragen (Digest-Vergleich). |
| `REGISTRY_USERNAME` / `REGISTRY_PASSWORD` | – | Nein | Basic-Auth-Creds für Registries. |
| `GITHUB_USERNAME` / `GITHUB_TOKEN` / `GITHUB_PAT` | – | Nein | Alternative Credential-Quellen für GitHub Packages. |


Agent-Betrieb (wähle eine Variante):

  - **Dynamisch über Backend (empfohlen)**  
    - Pflicht: `AGENT_TOKEN` + `CONTROL_PLANE_URL` (optional `CONTROL_PLANE_MTLS_URL`).  
    - Falls keine Zertifikate existieren: einmaliges `AGENT_BOOTSTRAP_TOKEN` setzen.  
    - Der Agent zieht Zertifikate vom Backend, schaltet auf mTLS um und braucht danach kein Bootstrap-Token mehr.
  - **Statisch per ENV**  
    - Liefere PEMs: `AGENT_SERVER_KEY`/`AGENT_SERVER_CERT` + `AGENT_CLIENT_KEY`/`AGENT_CLIENT_CERT`/`AGENT_CA_CERT`.  
    - Dann kein `CONTROL_PLANE_URL`/Bootstrap nötig, da mTLS-Material bereits vorhanden ist.  
    - `AGENT_TOKEN` bleibt erforderlich.
    
Hinweise:

  - Server-URL und API-Key kannst du im Setup-UI pflegen; Umgebungsvariablen setzen nur den Initialzustand.
  - Secrets (`SECURITY_PHRASE_SECRET`, `PORTAINER_SSH_SECRET`, `PORTAINER_API_SECRET`) in Produktion einmalig setzen und stabil halten – sonst werden bestehende verschlüsselte Werte unlesbar.

  - `CONTROL_PLANE_MTLS_URL`: bevorzugte mTLS-Zieladresse. Fehlt sie, leitet der Agent sie aus `CONTROL_PLANE_URL` + `AGENT_MTLS_PORT` ab und nutzt sie für alle Aufrufe, sobald Zertifikate vorliegen.
