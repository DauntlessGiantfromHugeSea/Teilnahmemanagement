# Obsidian Vault — Ablageort

Der persönliche Obsidian-Vault des Projekt-Owners liegt lokal unter:

```
C:\Users\dm\OneDrive - Flüssigboden Engineering GmbH\Desktop\FBE
```

## Wichtig für Claude / Sessions

Die Cloud-Session hat **keinen Zugriff** auf diesen Pfad
(läuft in einem Linux-Container ohne Zugriff auf Windows/OneDrive).

**Verfahren für Changelogs & Doku, die in den Vault sollen:**

1. Datei im Repo unter `docs/…-CHANGELOG.md` (o. ä.) erzeugen.
2. Nach `git pull` auf dem lokalen Rechner die Datei mit z. B. PowerShell rüberziehen:

```powershell
Copy-Item ".\docs\OBSIDIAN-CHANGELOG.md" `
  "C:\Users\dm\OneDrive - Flüssigboden Engineering GmbH\Desktop\FBE\FBA-Teilnahmemanagement-Changelog.md"
```

3. Optional per Task Scheduler / Git-Hook automatisieren.
