// ============================================================
//  Flock Detector v2 — surveillance-camera detector (Bruce)
//  Scans 2.4 GHz WiFi and flags Flock Safety (and similar) ALPR
//  gear by MAC OUI or SSID pattern, ranked by confidence + signal.
//  Geiger beep gets faster/higher as you close in. Optional SD log.
//  Defensive / privacy research only. Author: koua29
//
//  Confidence model (from the flock-you / FlipDeFlock research):
//   CONFIRMED  SSID == "Flock-XXXXXX" (6 hex, anchored) or "test_flck"
//              (dev SSID, CVE-2025-59409) -> self-identifying.  [RED]
//   LIKELY     SSID contains "flock" (substring).              [ORANGE]
//   POSSIBLE   MAC OUI in the 32 corroborated prefixes.        [AMBER]
//   WEAK       MAC OUI in the unverified "seed" prefixes.      [GREY]
//   OUI-only is weak on purpose: some prefixes (a4:cf:12, 3c:71:bf...)
//   are generic Espressif ranges shared by countless ESP32 devices.
//
//  Sources: NitekryDPaul list (synced 2026-07-16), DeFlockJoplin,
//  FlipDeFlock seed set, deflock.me. See README for links.
//  Quit: HOLD the ESC/back button (WiFi scan blocks ~4s; a reactive
//  window probes ESC between scans and also drives the beeper).
// ============================================================

// ---- tunables -------------------------------------------------
var LO = -95, HI = -35;          // RSSI window for the proximity bar
var BEEP = true;                 // Geiger-style audio ping
var LOG  = true;                 // append new detections to SD CSV
var LOGPATH = "/flock_log.csv";  // SD path for the log
var TTL = 20000;                 // keep a lost target on screen this long (ms)

// ---- corroborated OUIs (POSSIBLE) — 32 prefixes ---------------
// NitekryDPaul promiscuous research + DeFlockJoplin (82:6b:f2).
var OUI_CONF = [
  "70c94e","3c9180","d8f3bc","803049","b83532","145afc","744ca1","083a88",
  "9c2f9d","c03532","940853","e4aaea","f46add","e00af6","24b2b9","00f48d",
  "d03957","e8d0fc","e04f43","b81ea4","700894","588e81","ec1bbd","3c71bf",
  "5800e3","9035ea","5c93a2","646e69","4827ea","a4cf12","14b5cd","826bf2"
];
// ---- seed OUIs (WEAK) — real but not field-verified -----------
// FlipDeFlock signatures.seed.json / WatchFlock, unconfirmed.
var OUI_SEED = ["040d84","f082c0","1c34f1","385b44","943469","b4e3f9"];

// ---- optional modules (guarded: never break the scan) ---------
var audio = null, storage = null;
try { audio = require("audio"); } catch (eA) {}
try { storage = require("storage"); } catch (eB) {}
function ms() { try { return now(); } catch (eC) { return 0; } }

function C(r,g,b){ return display.color(r,g,b); }
var BLACK=C(0,0,0), WHITE=C(235,240,238), GREY=C(120,130,128);
var RED=C(255,60,55), ORANGE=C(255,120,0), AMBER=C(255,180,40),
    GREEN=C(40,225,90), BG=C(8,10,14);

// tiers (higher = stronger)
var T_CONF=3, T_LIKELY=2, T_POSS=1, T_WEAK=0.5;
function tierColor(t){ return t>=T_CONF?RED : t>=T_LIKELY?ORANGE : t>=T_POSS?AMBER : GREY; }
function tierName(t){ return t>=T_CONF?"CONFIRMED" : t>=T_LIKELY?"LIKELY" : t>=T_POSS?"POSSIBLE" : "WEAK"; }

function norm(s){ return String(s||"").replace(/[^0-9a-fA-F]/g,"").toLowerCase(); }
function oui(mac){ return norm(mac).substring(0,6); }
function inList(o,arr){ for (var i=0;i<arr.length;i++) if (o===arr[i]) return true; return false; }

// returns {tier, label} or null
function classify(ap){
  var s = String(ap.SSID||"").toLowerCase();
  if (/^flock-[0-9a-f]{6}$/.test(s)) return { tier:T_CONF,   label:"SSID Flock-######" };
  if (s.indexOf("test_flck") >= 0)   return { tier:T_CONF,   label:"SSID test_flck (CVE)" };
  if (s.indexOf("flock") >= 0)       return { tier:T_LIKELY, label:"SSID contains flock" };
  var o = oui(ap.MAC);
  if (inList(o,OUI_CONF))            return { tier:T_POSS,   label:"OUI (corroborated)" };
  if (inList(o,OUI_SEED))            return { tier:T_WEAK,   label:"OUI (seed/unverified)" };
  return null;
}

// ---- persistent registry (survives flaky scans) ---------------
var seen = {};   // key = normalized MAC
function upsert(ap, cls){
  var k = norm(ap.MAC);
  var e = seen[k];
  var r = ap.RSSI;
  if (!e){
    e = { ssid: ap.SSID||"(hidden)", mac: ap.MAC, ch: ap.channel,
          tier: cls.tier, label: cls.label, rssi: r, best: r, first: ms(), last: ms() };
    seen[k] = e;
    logHit(e);           // log only on first discovery
  } else {
    e.rssi = r; e.last = ms(); e.ch = ap.channel;
    if (r > e.best) e.best = r;
    if (cls.tier > e.tier){ e.tier = cls.tier; e.label = cls.label; }
    if (ap.SSID) e.ssid = ap.SSID;
  }
  return e;
}
function activeHits(){
  var out = [], t = ms();
  for (var k in seen){
    var e = seen[k];
    if (t - e.last <= TTL) out.push(e);
    else delete seen[k];
  }
  out.sort(function(a,b){ return (b.tier-a.tier) || (b.rssi-a.rssi); });
  return out;
}

// ---- SD logging (best-effort) ---------------------------------
var logInit = false;
function logHit(e){
  if (!LOG || !storage) return;
  try {
    if (!logInit){
      try { storage.write(LOGPATH, "time_ms,ssid,mac,rssi,channel,tier,reason\n"); } catch (eH) {}
      logInit = true;
    }
    var line = e.first + "," + String(e.ssid).replace(/,/g," ") + "," + e.mac + "," +
               e.rssi + "," + e.ch + "," + tierName(e.tier) + "," + e.label + "\n";
    storage.write(LOGPATH, line, "append");
  } catch (eL) {}
}

// ---- Geiger beeper: cadence + pitch scale with proximity -------
var nextBeep = 0;
function beep(bestRssi, tier){
  if (!BEEP || !audio || tier == null) return;
  var t = ms();
  if (t < nextBeep) return;
  var r = Math.max(LO, Math.min(HI, bestRssi));
  var prox = (r - LO) / (HI - LO);              // 0 far .. 1 near
  var interval = Math.round(900 - 800 * prox);  // 900ms far .. 100ms near
  var pitch = Math.round(1200 + 1800 * prox);   // 1200Hz .. 3000Hz
  if (tier >= T_CONF) pitch += 400;             // confirmed = shriller
  try { audio.tone(pitch, 40); } catch (eT) {}
  nextBeep = t + interval;
}

// reactive window ~1.4s: probes ESC every 60ms, beeps on schedule.
// true = user asked to quit.
function waitOrQuit(bestRssi, tier){
  for (var w=0; w<24; w++){
    if (keyboard.getEscPress()) return true;
    beep(bestRssi, tier);
    delay(60);
  }
  return false;
}

// ---- splash ---------------------------------------------------
display.fill(BG); display.setTextColor(WHITE);
display.setTextSize(2); display.drawString("Flock Detector", 12, 12);
display.setTextColor(GREY); display.setTextSize(1);
display.drawString("v2  -  scanning WiFi...", 12, 46);
delay(400); keyboard.getEscPress();

// ---- main loop ------------------------------------------------
var running = true;
while (running) {
  var nets = wifi.scan(0) || [];
  for (var i=0;i<nets.length;i++){
    var cls = classify(nets[i]);
    if (cls) upsert(nets[i], cls);
  }
  var hits = activeHits();

  display.fill(BG);
  display.setTextColor(WHITE); display.setTextSize(1);
  display.drawString("FLOCK DETECTOR  (" + nets.length + " nets)", 8, 6);
  display.setTextColor(GREY); display.drawString("Hold ESC = quit", 8, 158);
  display.setTextColor(WHITE);

  if (hits.length === 0) {
    display.drawFillCircle(60, 92, 34, C(10,60,25));
    display.drawCircle(60, 92, 34, GREEN);
    display.setTextColor(GREEN);
    display.setTextSize(3); display.drawString("CLEAR", 108, 66);
    display.setTextColor(GREY); display.setTextSize(1);
    display.drawString("no camera detected", 108, 100);
    display.setTextColor(WHITE);
    if (waitOrQuit(LO, null)) running = false;
    continue;
  }

  var top = hits[0];
  display.setTextColor(tierColor(top.tier));
  display.setTextSize(4); display.drawString("!" + hits.length, 8, 24);
  display.setTextSize(1); display.drawString(tierName(top.tier), 8, 62);
  display.setTextColor(WHITE);

  var y = 72;
  for (var k=0; k<hits.length && k<4; k++){
    var h = hits[k];
    var stale = (ms() - h.last) > 5000;
    display.setTextColor(stale ? GREY : tierColor(h.tier));
    display.drawString(h.rssi + "dBm ch" + h.ch + "  " + h.label, 88, y);
    display.setTextColor(stale ? GREY : WHITE);
    var name = (String(h.ssid).length>14 ? String(h.ssid).substring(0,14) : h.ssid);
    display.drawString(name + " " + norm(h.mac).substring(0,8), 88, y+9);
    y += 22;
  }

  // proximity bar on the strongest live target
  var r = Math.max(LO, Math.min(HI, top.rssi));
  var prox = (r - LO)/(HI - LO);
  display.drawRect(8, 120, 72, 12, GREY);
  display.drawFillRect(9, 121, Math.round(70*prox), 10, prox>0.6?RED:AMBER);
  display.setTextColor(GREY); display.drawString("closer ->", 8, 136);
  display.setTextColor(WHITE);

  if (waitOrQuit(top.rssi, top.tier)) running = false;
}

display.fill(BLACK); display.setTextColor(WHITE);
display.setTextSize(2); display.drawString("Done.", 120, 74);
if (audio) { try { audio.tone(880,80); } catch (eE) {} }
