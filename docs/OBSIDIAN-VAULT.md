# Obsidian Vault — Ablageort

Der Vault liegt **auf dem Desktop im Ordner `FBE`**.

Weil der Desktop via OneDrive gespiegelt wird, ist der reale Pfad:

```
C:\Users\dm\OneDrive - Flüssigboden Engineering GmbH\Desktop\FBE
```

Kurzschreibweise reicht meistens auch: `Desktop\FBE`.

## Wichtig für Claude / Sessions

Die Cloud-Session hat **keinen Zugriff** auf diesen Pfad
(Linux-Container ohne Windows/OneDrive-Mount).

**Verfahren für Changelogs & Doku, die in den Vault sollen:**

1. Datei im Repo unter `docs/…-CHANGELOG.md` (o. ä.) erzeugen.
2. Nach `git pull` auf dem lokalen Rechner rüberziehen — PowerShell-Zweizeiler:

```powershell
Copy-Item ".\docs\OBSIDIAN-CHANGELOG.md" `
  "$env:USERPROFILE\Desktop\FBE\FBA-Teilnahmemanagement-Changelog.md"
```

(`$env:USERPROFILE\Desktop` folgt automatisch der OneDrive-Umleitung.)
