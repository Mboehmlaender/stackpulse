# Stackpulse Agent

Der Stackpulse Agent stellt Docker- und Host-Metadaten über eine REST-API bereit. Er verbindet sich lokal über `/var/run/docker.sock`, validiert alle Anfragen per `X-Agent-Token` und läuft standardmäßig auf Port `7070`.

## Start lokal
1. Abhängigkeiten installieren: `npm install`
2. Starten: `AGENT_TOKEN=<token> npm start`
3. Optional: Port via `AGENT_PORT` anpassen.

## Als Docker-Container
```
docker build -t stackpulse-agent ./agent
docker run -d \
  -p 7070:7070 \
  -e AGENT_TOKEN=<token> \
  -v /var/run/docker.sock:/var/run/docker.sock \
  stackpulse-agent
```

Der Agent liest nur Docker-Daten und verändert keine Container oder Images.

## Stack-Image-Checks (CE-/BE-Parität)
Endpoint: `GET /stack-images?checkUpdates=true|false`
- Liefert pro Stack (Compose: `com.docker.compose.project`, Swarm: `com.docker.stack.namespace`) die verwendeten Images.
- Optional `checkUpdates=true` für lokalen/remote Digest-Vergleich (`updateAvailable`).

### Portainer-Version
- `GET /portainer/version` – liest den laufenden Portainer-Container (Image/Tag/Labels) aus, ermittelt lokale Digest und vergleicht mit Registry-Digest (Update-Indikator). Funktioniert ohne Portainer-API.

Optionale Registry-Creds (für private Registries):
- `REGISTRY_TOKEN` (Bearer)
- oder `REGISTRY_USERNAME` + `REGISTRY_PASSWORD` (Basic)

Hinweis: Für Swarm-Stacks muss der Agent Swarm-Services lesen können (`docker.listServices`). Ohne Swarm-Manager-Rolle bleibt die Swarm-Liste leer.
