# Setup-Assistent

Beim ersten Start erscheint automatisch der Setup-Bereich. Du erreichst ihn später jederzeit über `/setup`, solange nicht alle Schritte abgeschlossen sind.

## Voraussetzungen
- Portainer Business Edition mit gültigem API-Key
- Superuser-Zugangsdaten (entweder schon per Umgebungsvariablen gesetzt oder über diesen Assistenten festlegen)

## Schritt 1: Portainer-Server anlegen
1. Formularfelder **Server-URL** und optional **Name** ausfüllen.
   - URL inkl. Protokoll (z. B. `https://portainer.example.com`).
   - Bezeichnung dient ausschließlich als Anzeige im Dashboard.
2. Auf **Verbindung testen** klicken.
   - Erfolgreich: grüner Hinweis, die Endpoints werden erkannt.
   - Fehlgeschlagen: Fehlermeldung prüfen (häufig Zertifikats-/Firewall-Themen).
3. Mit **Speichern & Weiter** bestätigst du den Servereintrag. StackPulse legt ihn verschlüsselt in SQLite ab.

## Schritt 2: API-Key hinterlegen
1. API-Key im Feld **Portainer API Key** einfügen.
2. Optional kannst du über **Stacks laden** kontrollieren, ob Portainer Stacks zurückliefert.
3. Mit **Speichern** wird der Schlüssel verschlüsselt gespeichert. Du kannst ihn später im Maintenance-Bereich austauschen.

## Schritt 3: Superuser registrieren
1. Falls du `SUPERUSER_*` Variablen gesetzt hast, zeigt StackPulse an, dass bereits ein Superuser existiert – du kannst direkt weiter.
2. Ansonsten Benutzername, E-Mail und Passwort vergeben. Das Passwort dient nur für diesen Account; weitere Benutzer folgen später.
3. Auf **Superuser anlegen** klicken. Nach Erfolg wird der Login-Button eingeblendet.

## Abschluss & Login
- Sobald alle drei Schritte abgeschlossen sind, erscheint die Schaltfläche **Zum Login**.
- Melde dich mit dem Superuser an. StackPulse legt im Hintergrund initiale Berechtigungen, Default-Gruppen und Sicherheitspassphrasen an.

## Setup wiederholen oder ändern
- Über das Dashboard → **Wartung** → Abschnitt *Serververwaltung* kannst du zusätzliche Portainer-Server hinzufügen oder entfernen.
- Superuser lässt sich im Bereich **Benutzer** löschen, sofern du `maintenance-superuser-delete` besitzt.
- Der Self-Stack (StackPulse-eigener Stack) kann in der Wartung gepflegt werden, damit er nicht versehentlich redeployed wird.
