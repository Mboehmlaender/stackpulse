# Wartungsbereich

Der Wartungsbereich bündelt Maintenance-Mode, Serververwaltung (inkl. Agent-Integration), Update-Skripte und SSH-Konfiguration. Sichtbar für Benutzer:innen mit `Bereich & Navigation (Wartung)`; Unterbereiche haben eigene Rechte:

**Relevante Rechte**
- `Bereich & Navigation (Wartung)`
- `Server-Sektion`
- `Server bearbeiten` / `Server löschen`
- `SSH/Update-Skript`
- `Update durchführen`
- `Agent`
- `Doppelte Stacks`
- `mTLS Sektion`
- `Superuser löschen`

- `Server-Sektion` (lesen) zeigt die Serverübersicht.
- `Server bearbeiten` (lesen) zeigt Server-Details inkl. Portainer-Status; Felder bleiben schreibgeschützt. Vollzugriff erlaubt Bearbeiten/Speichern.
- `Server löschen` löscht Server (nur bei Vollzugriff).
- `SSH/Update-Skript` und `Update durchführen` hängen am Unterpunkt Portainer/SSH und erfordern Vollzugriff auf Server-Edit.
- `Agent` (lesen/voll) steuert die Agent-Sektion im Server-Detail.

## Maintenance-Mode
1. Schalter **Wartungsmodus aktivieren** umlegen.
2. Jede Aktivierung/Deaktivierung wird in den Logs protokolliert.

## Serververwaltung & API-Key
- Liste zeigt alle eingetragenen Portainer-Server.
  - **Server hinzufügen**/**bearbeiten**/**löschen** nur mit `Server bearbeiten` (Vollzugriff); löschen zusätzlich `Server löschen`.
- Im Server-Detail:
  - **Server-URL/Name** und **Portainer API-Key**: editierbar nur mit `Server bearbeiten` Vollzugriff; bei Leserecht sichtbar, aber gesperrt.
  - **Self-Stack-ID**: Stack-ID von StackPulse selbst; blockiert Redeploys dieses Stacks.
- **Status prüfen**: Live-Check gegen Portainer (Version, Edition, Update vorhanden). Sichtbar ab `Server bearbeiten` (lesen).

## Agent-Integration (Portainer CE / Edge)
Für die Community Edition von Stackpulse kannst du je Server einen StackPulse Agent hinterlegen. Er liefert Stack- und Portainer-Metadaten, wenn die Business-API fehlt. Hierzu muss auch der Agent auf dem Server der Portainer Instanz laufen. Der Agent wird für die Business Edition nicht benötigt.

1. Im Server-Detail **Agent konfigurieren** öffnen.
2. **Agent URL** eintragen, der **Agent Token** wird automatisch generiert und kann nicht geändert werden (Token = `AGENT_TOKEN` des Agents).
StackPulse prüft Erreichbarkeit und zeigt Online-/Fehlerstatus. Sichtbar mit `Agent` lesen, Bearbeitung mit `Agent` voll.
3. mTLS-Zertifikate verwalten:
   - **Bootstrap-Token erzeugen** (Einmal-Token) und im Agent als `AGENT_BOOTSTRAP_TOKEN` setzen.
   - Agent holt Zertifikate automatisch ab; Status im Zertifikate-Abschnitt.
   - **Zertifikate anzeigen** (PEM) (nur bei entsprechenden Rechten)
4. Portainer-Version kann gelesen werden, wenn der Agent online ist.

## SSH-Konfiguration
Erfordert `SSH/Update-Skript` (sichtbar/bearbeitbar nur bei Vollzugriff auf Server-Edit).
1. Host, Port, Benutzername und Passwort sowie eventuell notwendige Extra-Argumente eintragen.
2. Passwort wird verschlüsselt gespeichert.
3. **Verbindung testen** prüft Erreichbarkeit und meldet Ergebnis direkt.

## Update-Skript & Portainer-Update
- Standard-Skript ist sichtbar und kann überschrieben werden (Recht `SSH/Update-Skript` + Server-Edit Vollzugriff). **Zurücksetzen** stellt den Standard wieder her.
- Start eines Updates (`Update durchführen` + Server-Edit Vollzugriff):
  1) Wartungsmodus wird automatisch aktiviert.
  2) SSH-Konfiguration und Skript prüfen.
  3) **Update starten** klicken. Der Fortschritt und die Logausgaben erscheinen im Fenster.
  4) Während ein Update läuft, sind Änderungen am System gesperrt.

## Fehlerbehandlung
- SSH-/Update-Fehler werden mit Klartextausgabe angezeigt. Bei Bedarf Host/Port/User, Passwort oder Skript anpassen.
- Agent offline: URL/Token prüfen, Bootstrap-Token ggf. neu erzeugen und den Agent neu starten.
