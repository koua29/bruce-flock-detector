# 🛰️ Flock Detector — détecteur de caméras de surveillance pour Bruce

[![Bruce firmware](https://img.shields.io/badge/firmware-Bruce-8A2BE2?logo=github)](https://github.com/BruceDevices/firmware) [![Device](https://img.shields.io/badge/device-LilyGO%20T--Embed%20CC1101-1E90FF)](https://github.com/BruceDevices/firmware) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> **EN** — A **counter-surveillance** script (JavaScript) for the **[Bruce firmware](https://github.com/BruceDevices/firmware)** on the LilyGO T-Embed CC1101. It scans WiFi and flags **Flock Safety** (and similar) surveillance cameras by their **MAC OUI** or an SSID containing `flock`, sorted by signal so you can locate the nearest one. Defensive / privacy research only.

Script **JavaScript** pour le firmware **[Bruce](https://github.com/BruceDevices/firmware)** (testé sur **LilyGO T-Embed CC1101**). Il scanne le WiFi et **signale les caméras de surveillance type Flock Safety** par leur **préfixe MAC (OUI)** ou un **SSID contenant `flock`**, triées par puissance pour repérer la plus proche. Outil **défensif / vie privée**.

![Flock Detector — état RAS](docs/ras.jpg)

## ✨ Fonctionnalités (v2)

- **Scan WiFi en boucle** avec un **modèle de confiance à 4 niveaux** (repris des recherches flock-you / FlipDeFlock) :

  | Niveau | Règle | Couleur |
  |---|---|---|
  | 🔴 **CONFIRMED** | SSID `Flock-XXXXXX` (6 hex, ancré) **ou** `test_flck` (SSID de dev, **CVE-2025-59409**) → auto-identifiant | rouge |
  | 🟠 **LIKELY** | SSID contient `flock` | orange |
  | 🟡 **POSSIBLE** | MAC OUI ∈ **32 préfixes corroborés** | ambre |
  | ⚪ **WEAK** | MAC OUI ∈ liste **seed** (réelle mais non vérifiée terrain) | gris |

  > L'OUI seul est **faible volontairement** : certains préfixes (`a4:cf:12`, `3c:71:bf`…) sont des plages **Espressif génériques** partagées par d'innombrables ESP32 → faux positifs. Le signal fort, c'est le **SSID**.

- **🔊 Bip Geiger** — cadence et hauteur qui **accélèrent en te rapprochant** (mains libres, tu marches sans fixer l'écran). Coupe-le avec `BEEP = false`.
- **💾 Log SD (CSV)** — chaque **nouvelle** détection écrite dans `/flock_log.csv` (`time,ssid,mac,rssi,canal,niveau,raison`). Coupe-le avec `LOG = false`.
- **Persistance inter-scans** — une cible perdue sur un scan flaky **reste affichée** (TTL 20 s, grisée quand ancienne) au lieu de disparaître/clignoter.
- **Liste triée** par niveau puis RSSI, **barre de proximité** sur la cible vivante la plus forte, **« CLEAR »** vert quand rien n'est détecté.

## 🚀 Installation

1. Copie **`Flock Detector.js`** sur la carte SD, dans un dossier que Bruce lit : **`/BruceJS`**, `/scripts` ou `/BruceScripts`.
2. Sur l'appareil : **JS Interpreter** → ouvre `Flock Detector.js`.
3. **Maintiens le bouton ESC / retour** pour quitter (le scan WiFi bloque ~4 s ; une fenêtre réactive capte l'appui entre deux scans).

## 🔎 Signatures & sources

- **32 OUIs corroborés** (`OUI_CONF`) — recherche promiscuous de **[@NitekryDPaul](https://github.com/nitekry/nite-oui-collection)** (`my_tested_flock`, synchro **2026-07-16**) + le 32ᵉ (`82:6b:f2`) du drive-testing **[DeFlockJoplin](https://github.com/DeflockJoplin/flock-you)**.
- **6 OUIs seed** (`OUI_SEED`) — candidats **non vérifiés terrain** de **[FlipDeFlock](https://github.com/ReconGrunt/FlipDeFlock)** / WatchFlock.
- **Règles SSID** : `Flock-XXXXXX` (ancré) et `test_flck` (dev, **CVE-2025-59409**) = confirmés ; `flock` (sous-chaîne) = probable.
- *(Signal BLE : réservé à une future version firmware — l'API `ble.scan` de Bruce ne donne pas les fingerprints IE nécessaires.)*

Tu peux enrichir `OUI_CONF`, `OUI_SEED` et les règles SSID en tête du script. Autres bases : **[colonelpanichacks/flock-you](https://github.com/colonelpanichacks/flock-you)**, **[deflock.me](https://deflock.me)**.

## ⚠️ Portée & limites (honnêtes)

- Cette version JS voit les équipements qui **diffusent un réseau WiFi visible** (beacon/AP). Le détecteur de référence attrape aussi les **probe requests** via le **mode promiscuous** — ça nécessite un **module firmware** (upgrade possible).
- Les OUIs génériques (Espressif) peuvent générer des **faux positifs** : un hit **OUI seul** est marqué *« à confirmer »*, un hit **SSID:flock** est fiable.
- Outil de **sensibilisation / recherche vie privée**. Respecte la loi locale.

## 🛒 Matériel / Hardware

Le matériel utilisé pour ce projet — liens affiliés Amazon :

| [<img src="docs/hw-lilygo.jpg" width="200" alt="LilyGO T-Embed CC1101 avec antennes">](https://link.amazon/B0cgD7wou) | [<img src="docs/hw-lilygo-black.jpg" width="200" alt="LilyGO T-Embed CC1101 noir">](https://link.amazon/B071fmsbH) | [<img src="docs/hw-antenna.jpg" width="200" alt="Kit d'antennes SMA">](https://link.amazon/B0eMlSqeZ) |
|:---:|:---:|:---:|
| 🔌 **[LilyGO T-Embed CC1101](https://link.amazon/B0cgD7wou)**<br><sub>avec antennes</sub> | ⬛ **[LilyGO T-Embed CC1101](https://link.amazon/B071fmsbH)**<br><sub>noir, sans antenne</sub> | 📡 **[Kit d'antennes SMA](https://link.amazon/B0eMlSqeZ)** |

<sub>En tant que Partenaire Amazon, je réalise un bénéfice sur les achats remplissant les conditions requises. · As an Amazon Associate I earn from qualifying purchases.</sub>

## ☕ Un café ?

<img src="docs/paypal-qr.png" width="180" alt="PayPal" />

## 📄 Licence

MIT — voir [LICENSE](LICENSE). Par **koua29**. Signatures : projet flock-you / deflock.me.
