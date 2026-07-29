# 🛰️ Flock Detector — détecteur de caméras de surveillance pour Bruce

[![Bruce firmware](https://img.shields.io/badge/firmware-Bruce-8A2BE2?logo=github)](https://github.com/BruceDevices/firmware) [![Device](https://img.shields.io/badge/device-LilyGO%20T--Embed%20CC1101-1E90FF)](https://github.com/BruceDevices/firmware) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> **EN** — A **counter-surveillance** script (JavaScript) for the **[Bruce firmware](https://github.com/BruceDevices/firmware)** on the LilyGO T-Embed CC1101. It scans WiFi and flags **Flock Safety** (and similar) surveillance cameras by their **MAC OUI** or an SSID containing `flock`, sorted by signal so you can locate the nearest one. Defensive / privacy research only.

Script **JavaScript** pour le firmware **[Bruce](https://github.com/BruceDevices/firmware)** (testé sur **LilyGO T-Embed CC1101**). Il scanne le WiFi et **signale les caméras de surveillance type Flock Safety** par leur **préfixe MAC (OUI)** ou un **SSID contenant `flock`**, triées par puissance pour repérer la plus proche. Outil **défensif / vie privée**.

![Flock Detector — état RAS](docs/ras.jpg)

## ✨ Fonctionnalités

- **Scan WiFi en boucle** ; pour chaque réseau :
  - **SSID contient « flock »** → 🔴 rouge, **fiable**.
  - **OUI ∈ liste des 30 préfixes Flock** → 🟠 ambre, **« à confirmer »** (certains OUIs sont des préfixes Espressif génériques → faux positif possible).
- **Compteur** de suspects + **liste triée par RSSI** (le plus proche en haut : SSID / MAC / canal).
- **Barre de proximité** sur le plus fort pour te rapprocher.
- **« RAS »** vert quand rien n'est détecté.

## 🚀 Installation

1. Copie **`Flock Detector.js`** sur la carte SD, dans un dossier que Bruce lit : **`/BruceJS`**, `/scripts` ou `/BruceScripts`.
2. Sur l'appareil : **JS Interpreter** → ouvre `Flock Detector.js`.
3. **Maintiens le bouton ESC / retour** pour quitter (le scan WiFi bloque ~4 s ; une fenêtre réactive capte l'appui entre deux scans).

## 🔎 Signatures

- **30 OUIs WiFi** (préfixes MAC) issus du projet **[flock-you](https://github.com/colonelpanichacks/flock-you)** et du dataset **[deflock.me](https://deflock.me)**.
- Mot-clé SSID : **`flock`**.
- *(Signal BLE : manufacturer ID `0x09C8` — non exploitable via l'API `ble.scan` de Bruce, réservé à une future version firmware.)*

Tu peux enrichir `FLOCK_OUIS` et `SSID_KEYWORDS` en tête du script.

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

MIT — voir [LICENSE](LICENSE). Par **koua29** (Arnaud). Signatures : projet flock-you / deflock.me.
