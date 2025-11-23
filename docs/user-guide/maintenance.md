# Wartungsbereich

Der Wartungsbereich bündelt alle Funktionen rund um Maintenance-Mode, Serververwaltung, Update-Skripte und SSH-Verbindungen. Sichtbar für Benutzer:innen mit `maintenance-access` (Teilbereiche erfordern zusätzliche Unterrechte).

## Portainer-Status
- Klick auf **Status prüfen**, um eine Live-Abfrage gegen Portainer durchzuführen. Ergebnis zeigt API-Verfügbarkeit, Endpoint-IDs und Auth-Status.
- Häufige Fehler werden direkt erklärt (z. B. fehlender API-Key oder Netzwerkprobleme).

## Maintenance-Mode
1. Schalter **Wartungsmodus aktivieren** toggeln.
2. Optionale Nachricht eingeben (z. B. „Upgrade um 22:00 Uhr“); sie erscheint im gesamten UI als Banner.
3. Aktivieren/Deaktivieren protokolliert automatisch Events in den Logs.

## Server & API-Key verwalten
- Register „Server“ listet alle Portainer-Instanzen.
- Über **Server hinzufügen** kannst du Name + URL ergänzen und anschließend API-Key speichern.
- Buttons in der Tabelle:
  - **API-Key aktualisieren** – neues Token einsetzen.
  - **Server löschen** – nur möglich, wenn mindestens ein weiterer Server existiert oder du sofort neue Daten einträgst.

## Self-Stack ID
- Feld „Eigener Stack“ akzeptiert die Stack-ID, in der StackPulse selbst läuft.
- Nach dem Speichern sind Redeploy-Aktionen für diesen Stack im Dashboard deaktiviert.

## SSH-Konfiguration
Erforderliche Permission: `maintenance-ssh-update`.
1. Host, Port, Benutzername eintragen. Optional Passwort und zusätzliche SSH-Argumente (z. B. `-o StrictHostKeyChecking=no`).
2. Passwort wird verschlüsselt gespeichert; alternativ kannst du Public-Key-Auth nutzen und das Feld leer lassen.
3. **Verbindung testen**: StackPulse baut eine SSH-Verbindung auf und zeigt das Ergebnis in Echtzeit.

## Update-Skript
- Standard-Skript wird angezeigt und kann als Ausgangspunkt genutzt werden.
- Eigenes Skript: Inhalt in das Editorfeld kopieren und speichern. StackPulse prüft auf leere Zeilen und Basisbefehle.
- Skript zurücksetzen entfernt die benutzerdefinierte Variante und stellt den Default wieder her.

## Portainer-Update auslösen
1. Stelle sicher, dass Wartungsmodus aktiv ist und SSH-Konfiguration + Skript korrekt sind.
2. Klicke auf **Update starten**. Der aktuelle Fortschritt erscheint in einem Logpanel.
3. Der Button bleibt deaktiviert, solange ein Update läuft. Über **Status aktualisieren** kannst du den Fortschritt erneut abfragen.

## Fehlerbehandlung
- Bei SSH-Fehlern zeigt StackPulse die genaue Ausgabe an. Passe Host/Port/Benutzer oder Skript an.
- Falls das Update-Skript Probleme verursacht, kannst du es jederzeit stoppen, indem du Portainer manuell prüfst und ggf. das Skript anpasst.
