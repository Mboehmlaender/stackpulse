# Benutzerverwaltung

Die Benutzerseite ermöglicht das Anlegen, Bearbeiten und Deaktivieren von Konten. Du benötigst mindestens die Permission `users-access` (lesen) bzw. `users-edit`/`users-delete` für Änderungen.

## Benutzer anlegen
1. Button **Benutzer anlegen** klicken.
2. Formularfelder ausfüllen:
   - Benutzername (eindeutig, wird für Login genutzt)
   - Anzeigename (optional)
   - E-Mail-Adresse
   - Passwort (kann später geändert werden)
   - Gruppen auswählen (siehe Abschnitt „Benutzergruppen“)
3. Optional: Benutzer sofort aktivieren/deaktivieren.
4. Mit **Speichern** bestätigen. Der Benutzer erscheint in der Tabelle und erhält automatisch eine Sicherheitspassphrase.

## Benutzer bearbeiten
- In der Tabelle auf eine Zeile klicken, um das Detailpanel zu öffnen.
- Du kannst Anzeigename, E-Mail, Passwort und Gruppen ändern.
- Änderungen an Gruppen erfordern `users-edit` sowie Gruppenrechte (`user-groups-access`).

## Konto deaktivieren/reaktivieren
- Toggle **Aktiv** im Detailpanel.
- Deaktivierte Konten können sich nicht mehr anmelden, bleiben aber in der Historie.

## Sicherheitspassphrase
1. Button **Sicherheitspassphrase anzeigen** im Detailpanel.
2. StackPulse zeigt einen QR-Code und den alphanumerischen Code. Dieser wird nur einmal angezeigt, bis du bestätigst, dass er heruntergeladen wurde.
3. Über **Neu generieren** kannst du eine neue Phrase erstellen (Permission `users-security-phrase`). Informiere den Benutzer über die neue Phrase und markiere anschließend „heruntergeladen“.

## Passwort zurücksetzen
- Admins können direkt im Detailpanel ein neues Passwort setzen.
- Benutzer:innen selbst nutzen die Auth-Seite „Passwort vergessen“: Sie geben Username + Sicherheitsphrase ein und definieren anschließend ein neues Passwort.

## Suche & Filter
- Nutze das Suchfeld, um nach Benutzername oder E-Mail zu suchen.
- Filterchips für Status (aktiv/inaktiv) erleichtern das Auffinden gesperrter Accounts.

## Massenaktionen
- Mehrfachauswahl (Checkboxen) erlaubt das gleichzeitige Aktivieren/Deaktivieren oder Löschen mehrerer Benutzer. Vorsicht: Löschen entfernt auch Audit-Verweise.
