// ============================================================
//  Flock Detector v3 — surveillance-camera detector (Bruce)
//  Scans 2.4 GHz WiFi and flags (a) Flock Safety ALPR gear and
//  (b) cheap Chinese "spy" WiFi cameras (AliExpress/Amazon), by
//  MAC OUI or SSID pattern, ranked by confidence + signal.
//  Pick FLOCK / HIDDEN CAMS / BOTH at launch. Geiger beep gets
//  faster/higher as you close in. Optional SD log.
//  Defensive / privacy research only. Author: koua29
//
//  Confidence model (from flock-you / FlipDeFlock research):
//   CONFIRMED  self-identifying SSID (Flock-XXXXXX, test_flck, or a
//              camera AP-setup name like MVxxxxxxxx / GW_IPC).   [RED]
//   LIKELY     SSID contains a brand/keyword substring.        [ORANGE]
//   POSSIBLE   MAC OUI in a corroborated / brand list.          [AMBER]
//   WEAK       MAC OUI in an unverified "seed" list.            [GREY]
//   OUI-only is weak on purpose: many camera/ALPR modules share
//   generic Espressif/HiSilicon ranges used by countless devices.
//   *** For no-name Chinese cams the SSID is the real signal, and
//   a cam already paired & silent (client, no AP) is NOT visible
//   here — that needs promiscuous mode (firmware) or a lens finder.
//
//  Quit: HOLD the ESC/back button (WiFi scan blocks ~4s; a reactive
//  window probes ESC between scans and also drives the beeper).
// ============================================================

// ---- tunables -------------------------------------------------
var LO = -95, HI = -35;          // RSSI window for the proximity bar
var BEEP = true;                 // Geiger-style audio ping
var LOG  = true;                 // append new detections to SD CSV
var LOGPATH = "/flock_log.csv";  // SD path for the log
var TTL = 20000;                 // keep a lost target on screen this long (ms)
var MODE = "both";               // flock | cam | both | lan (menu overrides)

// ---- LAN mode: scan the connected WiFi for camera hosts -------
// A dead IP costs one un-shortenable ~30s connect timeout (BJS httpFetch has
// no timeout setting), so we CANNOT probe dead IPs fast — we probe FEWER of
// them: only a window around our own IP (DHCP hands out addresses in a cluster)
// plus the gateway, and exactly ONE probe per IP.
var LAN_SPAN = 25;                // scan ownIP-SPAN .. ownIP+SPAN (+ gateway)
var LAN_CLOSED_MS = 1500;         // RST faster than this = host alive
// ports probed on a host that answered (RST) but wasn't RTSP. [port, tag]
var CAM_PORTS2 = [
  [37777,"Dahua"], [34567,"XiongMai"], [8000,"Hikvision"],
  [8899,"ONVIF"], [8554,"RTSP"], [80,"HTTP"]
];
// HTTP banner substrings that reveal a camera web UI
var CAM_BANNER = ["hikvision","dahua","reolink","foscam","ipcam","webcam",
  "netwave","onvif","boa/","webs","gsoap","milesight","axis","surveillance","camera"];

// ---- FLOCK: corroborated OUIs (POSSIBLE) — 32 prefixes --------
// NitekryDPaul promiscuous research + DeFlockJoplin (82:6b:f2).
var OUI_CONF = [
  "70c94e","3c9180","d8f3bc","803049","b83532","145afc","744ca1","083a88",
  "9c2f9d","c03532","940853","e4aaea","f46add","e00af6","24b2b9","00f48d",
  "d03957","e8d0fc","e04f43","b81ea4","700894","588e81","ec1bbd","3c71bf",
  "5800e3","9035ea","5c93a2","646e69","4827ea","a4cf12","14b5cd","826bf2"
];
// ---- FLOCK: seed OUIs (WEAK) — real but not field-verified ----
// FlipDeFlock signatures.seed.json / WatchFlock, unconfirmed.
var OUI_SEED = ["040d84","f082c0","1c34f1","385b44","943469","b4e3f9"];

// ---- CAM: SSID patterns of spy-cam AP/setup mode --------------
// CONFIRMED: distinctive default AP names (camera in pairing mode).
// [regex, brand]. Anchored where the whole SSID is the signature.
var CAM_SSID_CONF = [
  [/^mv\d{8}$/,        "V380"],        // V380/V380 Pro:  MV + 8 digits
  [/^gw[_-](ipc|ap)/,  "Yoosee"],      // Yoosee/Gwell:   GW_IPC.. / GW_AP..
  [/^accq/,            "JXLCAM/A9"],   // A9 / JXLCAM:    ACCQ....
  [/^cams_/,           "A9"],          // A9 variant:     CAMS_....
  [/^a9[-_]?mini/,     "A9mini"],      // A9mini_XXXX
  [/jxlcam/,           "JXLCAM"],      // JXLCAM hotspot
  [/hd?wificam/,       "HDWiFiCam"],   // HDWiFiCam / HWiFiCam
  [/^v720/,            "V720"],        // V720 app cams
  [/^ipcam[-_]/,       "CamHi"],       // CamHi/CamHiPro: IPCAM-XXXXXX
  [/^dgk-/,            "DGK"],         // DGK-XXX-XXX
  [/^cam_\w/,          "IPcam"],       // generic CAM_XXXX setup AP
  [/^escam[-_]/,       "ESCAM"],       // ESCAM-XXXX
  [/^genbolt/,         "GENBOLT"],     // GENBOLT hotspot
  [/^ezviz[-_]/,       "EZVIZ"],       // EZVIZ_<serial> (Hikvision sub-brand)
  [/^ubox_/,           "UBox"],        // UBox app (Javiscam...): UBox_XXXX
  [/^llm_/,            "Linklemo"],    // Linklemo app (A9 clones): LLM_XXXX
  [/^fty/,             "FtyCam"],      // FtyCam/FtyCamPro/FtyCamBq: FTY....
  [/^@mc/,             "O-KAM"],       // O-KAM (Tuya): @MCXXXX
  [/^ipc_ap/,          "Zosi"],        // Zosi: IPC_AP_XXXX
  [/^ring[ _-]?setup/, "Ring"],        // Ring doorbell/cam setup AP
  [/^nax_/,            "Naxclow"],     // A9/V720 naxclow: Nax_2100002...
  [/^ipc[-_]/,         "IPcam"]        // HopeWay & generic IPC- / IPC_ (last: less specific)
];
// LIKELY: brand / keyword substrings (weaker but still cam-ish).
// [substring, brand]. Kept to camera-specific compound words.
var CAM_SSID_LIKE = [
  ["smartlife","SmartLife/Tuya"], ["ycc365","YCC365"], ["cloudedge","CloudEdge"],
  ["icsee","iCSee"], ["xmeye","XMEye"], ["chuangmi","Xiaomi"], ["yoosee","Yoosee"],
  ["v380","V380"], ["anran","Anran"], ["sricam","Sricam"], ["escam","ESCAM"],
  ["anbiux","Anbiux"], ["foscam","Foscam"], ["iegeek","ieGeek"], ["genbolt","GENBOLT"],
  ["lookcam","LookCam"], ["camhi","CamHi"], ["fredi","Fredi"], ["tinycam","TinyCam"],
  ["hdsmartipc","HDSmartIPC"], ["reolink","Reolink"], ["ezviz","EZVIZ"], ["ubox","UBox"],
  ["linklemo","Linklemo"], ["ular","ULar"], ["ucocare","UCOCARE"], ["wiwacam","WIWACAM"],
  ["hdminicam","HDMiniCam"], ["ftycam","FtyCam"], ["o-kam","O-KAM"], ["okam","O-KAM"],
  ["zosi","Zosi"], ["vstarcam","VStarcam"], ["coolcam","Coolcam"], ["tuya","Tuya"],
  ["carecam","CareCam"], ["littlestars","LittleStars"], ["hopeway","HopeWay"],
  ["naxclow","Naxclow"], ["imcam","iMCam"], ["tutk","TUTK"], ["xiaoin","XiaoIn"],
  ["iwfcam","iWFCam"], ["ipcamera","IPcam"],
  ["ipcam","IPcam"], ["webcam","Webcam"], ["spycam","SpyCam"], ["wificam","WiFiCam"],
  ["netcam","NetCam"], ["smartcam","SmartCam"], ["minicam","MiniCam"], ["ptz","PTZ-cam"],
  ["cctv","CCTV"], ["camera","camera"]
];
// POSSIBLE: registered camera-brand OUIs (extend freely).
// [oui, vendor]. Router-first brands (TP-Link...) excluded on purpose:
// on an AP scan their OUI is a false-positive magnet. Espressif/HiSilicon
// generic chip ranges are handled as WEAK by the Flock lists, not here.
var CAM_OUI = [
  ["1868cb","Hikvision"], ["2857be","Hikvision"], ["4419b6","Hikvision"], ["4cbd8f","Hikvision"],
  ["54c415","Hikvision"], ["64db8b","Hikvision"], ["94e1ac","Hikvision"], ["a41437","Hikvision"],
  ["b4a382","Hikvision"], ["bcad28","Hikvision"], ["c056e3","Hikvision"], ["c42f90","Hikvision"],
  ["2c3ecf","Hikvision"], ["68c90b","Hikvision"], ["8ce748","Hikvision"], ["accc8e","Hikvision"],
  ["c8028f","Hikvision"], ["d016b4","Hikvision"], ["d0f725","Hikvision"], ["d4e853","Hikvision"],
  ["dc0d30","Hikvision"], ["50d2f5","Hikvision"], ["20dce6","Dahua"], ["3cef8c","Dahua"],
  ["4c11bf","Dahua"], ["7085c8","Dahua"], ["9002a9","Dahua"], ["90da4e","Dahua"],
  ["a8154d","Dahua"], ["ec71db","Reolink"], ["406f2a","Reolink"], ["d03f27","Wyze"],
  ["2caa8e","Wyze"], ["7c78b2","Wyze"], ["00122e","Hikvision"], ["000f7c","Dahua"],
  ["9c8ecd","Dahua"], ["00626e","Foscam"], ["841b5e","Foscam"], ["68ff7b","Wyze"],
  ["2caaa2","Wyze"], ["accf23","Ring"], ["f0b429","Ring"]
];
function camOuiVendor(o){ for (var i=0;i<CAM_OUI.length;i++) if (CAM_OUI[i][0]===o) return CAM_OUI[i][1]; return ""; }
// database sizes (shown in the UI)
var CAM_DB   = CAM_SSID_CONF.length + CAM_SSID_LIKE.length + CAM_OUI.length;
var FLOCK_DB = OUI_CONF.length + OUI_SEED.length + 3;  // +3 SSID rules

// ---- optional modules (guarded: never break the scan) ---------
var audio = null, storage = null;
try { audio = require("audio"); } catch (eA) {}
try { storage = require("storage"); } catch (eB) {}
function ms() { try { return now(); } catch (eC) { return 0; } }

function C(r,g,b){ return display.color(r,g,b); }
var BLACK=C(0,0,0), WHITE=C(235,240,238), GREY=C(120,130,128);
var RED=C(255,60,55), ORANGE=C(255,120,0), AMBER=C(255,180,40),
    GREEN=C(40,225,90), BG=C(8,10,14), ACCENT=C(90,200,255),
    DIM=C(70,80,88), PANEL=C(20,26,34);

// tiers (higher = stronger)
var T_CONF=3, T_LIKELY=2, T_POSS=1, T_WEAK=0.5;
function tierColor(t){ return t>=T_CONF?RED : t>=T_LIKELY?ORANGE : t>=T_POSS?AMBER : GREY; }
function tierName(t){ return t>=T_CONF?"CONFIRMED" : t>=T_LIKELY?"LIKELY" : t>=T_POSS?"POSSIBLE" : "WEAK"; }
function tierChar(t){ return t>=T_CONF?"!" : t>=T_LIKELY?"L" : t>=T_POSS?"P" : "?"; }

// ---- screen helpers (styled after Lan Scanner) ----------------
function W(){ return display.width(); }
function H(){ return display.height(); }
function clear(){ display.fill(BG); }
function at(x,y,txt,col){ display.setTextColor(col); display.drawString(""+txt, x, y); }
function header(t, right){
  clear();
  display.setTextSize(2); at(6,5,t,ACCENT);
  display.setTextSize(1);
  if (right) at(W()-String(right).length*6-6, 3, right, ACCENT);
  display.drawFastHLine(0, 25, W(), DIM);
}
function footer(txt){
  display.drawFastHLine(0, H()-14, W(), DIM);
  at(6, H()-11, txt, GREY);
}
// camera picto (body + lens)
function icoCam(x,y,col){
  display.drawRoundRect(x, y+3, 15, 10, 2, col);
  display.drawFillRect(x+3, y+1, 4, 3, col);       // top hump
  display.drawFillCircle(x+8, y+8, 3, col);        // lens
  display.drawPixel(x+8, y+8, BG);
}
// ALPR picto (license plate)
function icoPlate(x,y,col){
  display.drawRoundRect(x, y+3, 15, 9, 2, col);
  display.drawFastVLine(x+5, y+5, 5, col);
  display.drawFastVLine(x+9, y+5, 5, col);
}
// both picto (eye)
function icoEye(x,y,col){
  display.drawCircle(x+7, y+7, 6, col);
  display.drawFillCircle(x+7, y+7, 2, col);
}
// LAN picto (linked nodes)
function icoNet(x,y,col){
  display.drawWideLine(x+7,y+7,x+1,y+1,1,col);
  display.drawWideLine(x+7,y+7,x+13,y+1,1,col);
  display.drawWideLine(x+7,y+7,x+1,y+13,1,col);
  display.drawFillCircle(x+7,y+7,2,col);
  display.drawFillCircle(x+1,y+1,1,col); display.drawFillCircle(x+13,y+1,1,col);
  display.drawFillCircle(x+1,y+13,1,col);
}
// WiFi picto (arcs)
function icoWifi(x,y,col){
  display.drawCircle(x+7,y+12,8,col); display.drawCircle(x+7,y+12,5,col);
  display.drawFillCircle(x+7,y+12,2,col);
}
// database / cloud-update picto (cylinder + down arrow)
function icoDb(x,y,col){
  display.drawRoundRect(x+1,y+2,12,10,2,col);
  display.drawFastHLine(x+1,y+6,12,col);
  display.drawWideLine(x+7,y+7,x+7,y+11,2,col);
  display.drawWideLine(x+4,y+9,x+7,y+12,2,col); display.drawWideLine(x+10,y+9,x+7,y+12,2,col);
}
function radar(cx, cy, r, ang, col){
  display.drawCircle(cx, cy, r, DIM);
  display.drawCircle(cx, cy, Math.round(r*0.6), DIM);
  display.drawFastHLine(cx-r, cy, 2*r, DIM);
  display.drawFastVLine(cx, cy-r, 2*r, DIM);
  var x = cx + Math.round(r*Math.cos(ang)), y = cy + Math.round(r*Math.sin(ang));
  display.drawWideLine(cx, cy, x, y, 2, col);
  display.drawFillCircle(cx, cy, 2, col);
}
// rounded proximity gauge, prox 0..1
function gauge(x, y, w, prox, col){
  display.drawRoundRect(x, y, w, 10, 3, DIM);
  var iw = Math.round((w-4)*prox);
  if (iw > 0) display.drawFillRect(x+2, y+2, iw, 6, col);
}
function checkIcon(cx, cy, s, col){
  display.drawWideLine(cx-s, cy, cx-Math.round(s*0.25), cy+s, 4, col);
  display.drawWideLine(cx-Math.round(s*0.25), cy+s, cx+s, cy-s, 4, col);
}

function norm(s){ return String(s||"").replace(/[^0-9a-fA-F]/g,"").toLowerCase(); }
function oui(mac){ return norm(mac).substring(0,6); }
function inList(o,arr){ for (var i=0;i<arr.length;i++) if (o===arr[i]) return true; return false; }

// each classifier returns {tier, label} or null
function flockClassify(ap){
  var s = String(ap.SSID||"").toLowerCase();
  if (/^flock-[0-9a-f]{6}$/.test(s)) return { tier:T_CONF,   label:"FLOCK Flock-######" };
  if (s.indexOf("test_flck") >= 0)   return { tier:T_CONF,   label:"FLOCK test_flck CVE" };
  if (s.indexOf("flock") >= 0)       return { tier:T_LIKELY, label:"FLOCK ssid~flock" };
  var o = oui(ap.MAC);
  if (inList(o,OUI_CONF))            return { tier:T_POSS,   label:"FLOCK OUI" };
  if (inList(o,OUI_SEED))            return { tier:T_WEAK,   label:"FLOCK OUI?" };
  return null;
}
function camClassify(ap){
  var s = String(ap.SSID||"").toLowerCase();
  var i;
  for (i=0;i<CAM_SSID_CONF.length;i++)
    if (CAM_SSID_CONF[i][0].test(s)) return { tier:T_CONF, label:"CAM " + CAM_SSID_CONF[i][1] + " AP" };
  for (i=0;i<CAM_SSID_LIKE.length;i++)
    if (s.indexOf(CAM_SSID_LIKE[i][0]) >= 0) return { tier:T_LIKELY, label:"CAM " + CAM_SSID_LIKE[i][1] };
  var cv = camOuiVendor(oui(ap.MAC));
  if (cv)                           return { tier:T_POSS, label:"CAM " + cv + " OUI" };
  return null;
}
// pick the strongest match across the enabled detectors
function classify(ap){
  var best = null;
  if (MODE === "flock" || MODE === "both"){ var f = flockClassify(ap); if (f && (!best || f.tier > best.tier)) best = f; }
  if (MODE === "cam"   || MODE === "both"){ var c = camClassify(ap);   if (c && (!best || c.tier > best.tier)) best = c; }
  return best;
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

function purgeKeys(){ for (var i=0;i<6;i++){ keyboard.getAnyPress(); delay(8); } }

// ===== downloadable signature DB (GitHub) ======================
var SIGS_URLS  = [   // tried in order (raw first, jsdelivr TLS fallback)
  "https://raw.githubusercontent.com/koua29/bruce-flock-detector/main/sigs.json",
  "https://cdn.jsdelivr.net/gh/koua29/bruce-flock-detector@main/sigs.json"
];
var SIGS_CACHE = "/flock_sigs.json";     // SD cache (persists across runs)
                                         // Offline update: drop this file on SD.

function hasSub(arr, s){ for (var i=0;i<arr.length;i++) if (arr[i][0]===s) return true; return false; }
function hasRe(arr, src){ for (var i=0;i<arr.length;i++) if (arr[i][0].source===src) return true; return false; }
// merge a parsed sigs object into the in-memory DB; returns count added.
function mergeSigs(o){
  var add = 0, i;
  if (o.cam_ssid_conf) for (i=0;i<o.cam_ssid_conf.length;i++){
    var rc = o.cam_ssid_conf[i]; if (!hasRe(CAM_SSID_CONF, rc[0])){ try { CAM_SSID_CONF.push([new RegExp(rc[0]), rc[1]]); add++; } catch (eR){} } }
  if (o.cam_ssid_like) for (i=0;i<o.cam_ssid_like.length;i++){
    var lc = o.cam_ssid_like[i]; if (!hasSub(CAM_SSID_LIKE, lc[0])){ CAM_SSID_LIKE.push([lc[0], lc[1]]); add++; } }
  if (o.cam_oui) for (i=0;i<o.cam_oui.length;i++){
    var oc = o.cam_oui[i]; if (!camOuiVendor(oc[0])){ CAM_OUI.push([oc[0], oc[1]]); add++; } }
  if (o.flock_oui) for (i=0;i<o.flock_oui.length;i++){
    if (!inList(o.flock_oui[i], OUI_CONF)){ OUI_CONF.push(o.flock_oui[i]); add++; } }
  if (o.flock_seed) for (i=0;i<o.flock_seed.length;i++){
    if (!inList(o.flock_seed[i], OUI_SEED)){ OUI_SEED.push(o.flock_seed[i]); add++; } }
  CAM_DB   = CAM_SSID_CONF.length + CAM_SSID_LIKE.length + CAM_OUI.length;
  FLOCK_DB = OUI_CONF.length + OUI_SEED.length + 3;
  return add;
}
// load SD cache at startup (best-effort) so past updates persist.
function loadCachedSigs(){
  if (!storage) return 0;
  try {
    var txt = storage.read(SIGS_CACHE);
    if (txt) return mergeSigs(JSON.parse(txt));
  } catch (eLC){}
  return 0;
}
// fetch sigs.json from GitHub, merge, cache to SD. Shows a styled report.
function updateCams(){
  purgeKeys();
  header("UPDATE CAMS", "github");
  if (!wifi.connected()){
    at(6,34,"No WiFi / internet.",AMBER);
    at(6,50,"Connect Bruce to WiFi first.",GREY);
    footer("press ESC");
    while (!keyboard.getEscPress()) delay(60); return;
  }
  at(6,34,"downloading sigs.json ...",WHITE);
  radar(W()-40,50,20,0.9,ACCENT);
  footer("please wait (TLS)");
  var body = "", err = "";
  for (var u=0; u<SIGS_URLS.length && !body; u++){
    try {
      var r = wifi.httpFetch(SIGS_URLS[u], { method:"GET" });
      body = "" + (r.body || "");
      if (!body) err = "empty body (status " + (r.status || "?") + ")";
    } catch (eU){ err = ("" + eU); }
  }
  header("UPDATE CAMS", "github");
  if (!body){
    at(6,34,"Download failed:",RED);
    at(6,48,(err || "unknown").substring(0,40),GREY);
    at(6,64,"HTTPS may fail on Bruce (TLS).",DIM);
    at(6,78,"Offline: copy sigs.json to SD",WHITE);
    at(6,90,"as " + SIGS_CACHE + " (loads at boot).",WHITE);
    footer("press ESC"); while (!keyboard.getEscPress()) delay(60); return;
  }
  var obj = null; try { obj = JSON.parse(body); } catch (eP){ obj = null; }
  if (!obj){
    at(6,34,"Bad JSON.",RED); footer("press ESC");
    while (!keyboard.getEscPress()) delay(60); return;
  }
  var before = CAM_DB + FLOCK_DB;
  var added = mergeSigs(obj);
  if (storage && added){ try { storage.write(SIGS_CACHE, body, "write"); } catch (eW){} }
  checkIcon(W()-70,60,14,GREEN);
  display.setTextSize(2); at(6,40,"UPDATED",GREEN); display.setTextSize(1);
  at(6,70,"version: " + (obj.version || "?"),WHITE);
  at(6,84,"+" + added + " new signatures",added?GREEN:GREY);
  at(6,98,"DB now " + CAM_DB + " cam / " + FLOCK_DB + " flock",GREY);
  at(6,112,added?"cached to SD":"already up to date",DIM);
  footer("press ESC");
  while (!keyboard.getEscPress()) delay(60);
}

// ---- 2-level menu: category -> subcategory --------------------
// sub rows: {ic, s, sub, val}. Categories: {ic, s, rows:[...]}.
function MENU(){ return [
  { ic:icoWifi, s:"WiFi scan", rows:[
      { ic:icoCam,   s:"Hidden cams",  sub:CAM_DB + " signatures",            val:"cam"   },
      { ic:icoPlate, s:"Flock (ALPR)", sub:FLOCK_DB + " signatures",          val:"flock" },
      { ic:icoEye,   s:"Both",         sub:(CAM_DB+FLOCK_DB) + " signatures", val:"both"  } ] },
  { ic:icoNet,  s:"LAN scan", rows:[
      { ic:icoNet,   s:"Camera hosts", sub:"scan connected WiFi",             val:"lan"   } ] },
  { ic:icoDb,   s:"Cam list", rows:[
      { ic:icoDb,    s:"Brands & models", sub:CAM_DB + " cam signatures",     val:"camlist" },
      { ic:icoPlate, s:"Flock signals",   sub:FLOCK_DB + " signatures",       val:"flocklist" } ] }
];}

// generic vertical list picker; returns index, or -1 on ESC/back.
function listPick(title, right, hint, rows){
  var sel = 0, dirty = true; purgeKeys();
  while (true){
    if (dirty){
      header(title, right);
      var LH = 28, top0 = 34;
      for (var i=0;i<rows.length;i++){
        var r = rows[i], y = top0 + i*LH, on = (i===sel);
        if (on) display.drawFillRoundRect(4, y-2, W()-8, LH-4, 4, PANEL);
        display.drawRoundRect(4, y-2, W()-8, LH-4, 4, on?ACCENT:DIM);
        r.ic(12, y+2, on?ACCENT:WHITE);
        at(34, y, r.s, on?WHITE:GREY);
        if (r.sub) at(34, y+12, r.sub, DIM);
      }
      footer(hint); dirty = false;
    }
    if (keyboard.getPrevPress()){ sel = (sel+rows.length-1)%rows.length; dirty = true; }
    else if (keyboard.getNextPress()){ sel = (sel+1)%rows.length; dirty = true; }
    else if (keyboard.getSelPress()) return sel;
    else if (keyboard.getEscPress()) return -1;
    delay(40);
  }
}
// walk category -> subcategory; returns a val (scan mode or action).
function navMenu(){
  while (true){
    var cats = MENU();
    var ci = listPick("DETECTOR v3", "ESC=quit", "rotate=move  click=open", cats);
    if (ci < 0) return "quit";                   // ESC on top level: exit app
    var cat = cats[ci];
    var si = listPick(cat.s, "ESC=back", "rotate=move  click=select", cat.rows);
    if (si < 0) continue;                         // ESC in sub: back to categories
    return cat.rows[si].val;
  }
}
// build the camera catalog: unique brand/model -> how it's detected.
function catalogRows(){
  var map = {}, order = [], i, k;
  function add(label, kind){
    if (!label) return;
    if (!map[label]){ map[label] = { ssid:false, oui:false }; order.push(label); }
    map[label][kind] = true;
  }
  for (i=0;i<CAM_SSID_CONF.length;i++) add(CAM_SSID_CONF[i][1], "ssid");
  for (i=0;i<CAM_SSID_LIKE.length;i++) add(CAM_SSID_LIKE[i][1], "ssid");
  for (i=0;i<CAM_OUI.length;i++)       add(CAM_OUI[i][1], "oui");
  order.sort(function(a,b){ var x=a.toLowerCase(), y=b.toLowerCase(); return x<y?-1:x>y?1:0; });
  var rows = [];
  for (i=0;i<order.length;i++){
    k = order[i]; var t = map[k];
    var tag = (t.ssid && t.oui) ? "SSID+OUI" : t.oui ? "OUI" : "SSID";
    rows.push({ name:k, tag:tag });
  }
  return rows;
}
// scrollable catalog viewer (rotate = scroll, ESC = back).
function scrollCatalog(title, right, header2, rows){
  var LH = 13, top0 = 44, top = 0, dirty = true;
  var per = Math.floor((H() - top0 - 16) / LH); if (per < 1) per = 1;
  var max = Math.max(0, rows.length - per);
  purgeKeys();
  while (true){
    if (dirty){
      header(title, right);
      at(6, 29, header2, ACCENT);
      for (var i=0;i<per;i++){
        var idx = top + i; if (idx >= rows.length) break;
        var y = top0 + i*LH, r = rows[idx];
        at(10, y, r.name, WHITE);
        at(W()-56, y, r.tag, r.tag==="OUI"?AMBER:r.tag==="SSID+OUI"?GREEN:ACCENT);
      }
      if (rows.length > per){                       // scrollbar
        var th = per*LH, bh = Math.max(10, Math.round(th*per/rows.length));
        var by = top0 + Math.round((th-bh)*(max?top/max:0));
        display.drawFastVLine(W()-4, top0, th, DIM);
        display.drawFillRect(W()-5, by, 3, bh, ACCENT);
      }
      footer("rotate=scroll   ESC=back"); dirty = false;
    }
    if (keyboard.getPrevPress()){ if (top>0){ top--; dirty=true; } }
    else if (keyboard.getNextPress()){ if (top<max){ top++; dirty=true; } }
    else if (keyboard.getSelPress()){ if (top<max){ top++; dirty=true; } }
    else if (keyboard.getEscPress()) return;
    delay(40);
  }
}
function camList(){
  var rows = catalogRows();
  scrollCatalog("CAM LIST", rows.length + " brands",
    CAM_DB + " signatures (" + CAM_SSID_CONF.length + " SSID+" + CAM_SSID_LIKE.length + " kw+" + CAM_OUI.length + " OUI)",
    rows);
}
function flockList(){
  var rows = [
    { name:"SSID Flock-XXXXXX", tag:"SSID" },
    { name:"SSID test_flck (CVE)", tag:"SSID" },
    { name:"SSID ~flock", tag:"SSID" },
    { name:OUI_CONF.length + " corroborated OUIs", tag:"OUI" },
    { name:OUI_SEED.length + " seed OUIs (unverified)", tag:"OUI" }
  ];
  scrollCatalog("FLOCK LIST", "ALPR", FLOCK_DB + " Flock signatures", rows);
}

// startup: load any cached signature update from SD, then run the menu.
loadCachedSigs();
var picked;
while (true){
  picked = navMenu();
  if (picked === "camlist"){ camList(); continue; }
  if (picked === "flocklist"){ flockList(); continue; }
  break;                                          // a scan mode, or "quit"
}
var RUN = (picked !== "quit");
if (picked === "flock" || picked === "cam" || picked === "both" || picked === "lan") MODE = picked;
var TITLE = MODE === "flock" ? "FLOCK RADAR" : MODE === "cam" ? "CAM RADAR"
          : MODE === "lan" ? "LAN CAMS" : "CAM+FLOCK RADAR";

// DB label shown in the UI (depends on active mode)
var DBLABEL = MODE === "flock" ? (FLOCK_DB + " flock sigs")
            : MODE === "cam"   ? (CAM_DB + " cam sigs")
            : MODE === "lan"   ? "camera ports/banners"
            : (CAM_DB + " cam + " + FLOCK_DB + " flock");

// ---- splash (skipped when the user quit from the menu) --------
if (RUN){
  clear();
  radar(Math.round(W()/2), 58, 30, 0.9, MODE==="flock"?AMBER:GREEN);
  display.setTextSize(2);
  var st = "SCANNING";
  at(Math.round(W()/2)-st.length*6, 98, st, ACCENT);
  display.setTextSize(1);
  at(Math.round(W()/2)-String(DBLABEL).length*3, 122, DBLABEL, GREY);
  delay(900); purgeKeys();
}

// ===== LAN mode ================================================
function nowMs(){ try { return Date.now(); } catch (eN) { return ms(); } }
function ipBase(){
  var ip = "" + wifi.getIPAddress();
  var p = ip.lastIndexOf(".");
  return (p > 0) ? ip.substring(0, p+1) : "";
}
// probe ip:port over HTTP; classify by how the TCP connection behaves.
function lanProbe(ip, port){
  var url = "http://" + ip + ":" + port + "/";
  var t0 = nowMs();
  try {
    var r = wifi.httpFetch(url, { method:"GET" });
    return { st:"open", ms:(nowMs()-t0), r:r };
  } catch (eF){
    var dt = nowMs() - t0, m = ("" + eF).toLowerCase();
    if (m.indexOf("refused") >= 0 || m.indexOf("not connected") >= 0)
      return (dt <= LAN_CLOSED_MS) ? { st:"closed", ms:dt } : { st:"none", ms:dt };
    return { st:"open", ms:dt };   // handshake ok but not HTTP = open TCP port
  }
}
// single stop flag: ESC pressed DURING a blocking probe is latched by
// getEscPress() and caught the instant the probe returns.
var lanStop = false;
function lanEsc(){ if (keyboard.getEscPress()) lanStop = true; return lanStop; }
// look for a camera brand string in the HTTP banner/title
function bannerBrand(resp){
  try {
    var s = (JSON.stringify(resp.headers || "") + " " + (resp.body || "")).toLowerCase();
    for (var i=0;i<CAM_BANNER.length;i++) if (s.indexOf(CAM_BANNER[i]) >= 0) return CAM_BANNER[i];
  } catch (eB2){}
  return "";
}
// ONE probe per IP for the common case: 554 first.
//  open  -> camera (RTSP)         none -> dead (single timeout, skip)
//  closed(RST) -> host alive -> probe a few more cam ports.
// returns {state:"cam"|"alive"|"dead"|"stop", why}
function scanIp(ip){
  var r = lanProbe(ip, 554);
  if (lanEsc()) return { state:"stop" };
  if (r.st === "open") return { state:"cam", why:"RTSP 554" };
  if (r.st === "none") return { state:"dead" };          // dead IP: done in 1 probe
  for (var i=0;i<CAM_PORTS2.length;i++){                  // host is alive (RST)
    var p = CAM_PORTS2[i][0], tag = CAM_PORTS2[i][1];
    var q = lanProbe(ip, p);
    if (lanEsc()) return { state:"stop" };
    if (q.st === "open"){
      if (p === 80){ var b = bannerBrand(q.r || {}); if (b) return { state:"cam", why:"web:"+b }; }
      else return { state:"cam", why:tag + " " + p };
    }
  }
  return { state:"alive" };
}
// smart sweep: gateway + a window around our own IP (DHCP clusters there),
// styled UI, one probe per dead IP, ESC honoured between probes.
function runLanScan(){
  lanStop = false; purgeKeys();
  if (!wifi.connected()){
    header("LAN CAMS"); at(6,34,"Not connected to WiFi.",AMBER);
    at(6,52,"Join the target WiFi first",GREY);
    at(6,64,"(Bruce > WiFi > Connect).",GREY);
    footer("press ESC");
    while (!keyboard.getEscPress()) delay(60);
    return;
  }
  var base = ipBase();
  var ownLast = parseInt(("" + wifi.getIPAddress()).split(".").pop(), 10) || 100;
  if (!base){
    header("LAN CAMS"); at(6,34,"No IP address.",AMBER); footer("press ESC");
    while (!keyboard.getEscPress()) delay(60);
    return;
  }
  // build target list: gateway .1 then own-SPAN..own+SPAN (deduped, skip self)
  var a = Math.max(1, ownLast - LAN_SPAN), b = Math.min(254, ownLast + LAN_SPAN);
  var targets = [], h;
  if (a > 1) targets.push(1);                 // gateway if outside the window
  for (h=a; h<=b; h++) if (h !== ownLast) targets.push(h);
  var hits = [], live = 0, spin = 0, total = targets.length;
  for (var t=0; t<total; t++){
    if (lanEsc()) break;
    var ip = base + targets[t]; spin++;
    header("LAN CAMS", base + "0/24");
    radar(58, 80, 26, spin*0.7, ACCENT);
    at(6, 30, "probing " + ip, WHITE);
    at(6, 112, (t+1) + "/" + total + "   live " + live + "   cams " + hits.length, GREY);
    at(6, 124, "window ." + a + "-." + b + " (near us)", DIM);
    footer("HOLD ESC to stop (ends after probe)");
    var res = scanIp(ip);
    if (res.state === "stop") break;
    if (res.state !== "dead") live++;
    if (res.state === "cam") hits.push({ ip:ip, why:res.why });
  }
  lanResults(base, hits, live, lanStop, a, b);
}
function lanResults(base, hits, live, aborted, a, b){
  purgeKeys();
  header("LAN CAMS", live + " live");
  if (hits.length === 0){
    checkIcon(W()-78, 76, 16, GREEN);
    display.setTextSize(2); at(W()-124, 100, "CLEAR", GREEN); display.setTextSize(1);
    at(6, 40, (aborted?"(stopped) ":"") + "no camera host found", DIM);
    at(6, 54, "scanned " + base + a + "-." + b, DIM);
    footer("press ESC");
    while (!keyboard.getEscPress()) delay(60);
    return;
  }
  at(6, 30, hits.length + " camera host" + (hits.length>1?"s":"") + " on " + base + "0/24", RED);
  var y = 46;
  for (var k=0; k<hits.length && k<4; k++){
    var hh = hits[k];
    display.drawFillRoundRect(4, y-2, W()-8, 22, 4, PANEL);
    display.drawRoundRect(4, y-2, W()-8, 22, 4, RED);
    display.drawFillRoundRect(8, y+1, 16, 14, 3, RED);
    display.setTextColor(BLACK); display.drawString("!", 14, y+4);
    at(30, y, hh.ip, WHITE);
    at(30, y+9, hh.why, AMBER);
    y += 26;
  }
  footer("cameras on this WiFi  -  press ESC");
  while (!keyboard.getEscPress()) delay(60);
}

// draw one hit row (badge + ssid + rssi + label), highlight = strongest
function drawRow(h, y, strongest){
  var stale = (ms() - h.last) > 5000;
  var col = stale ? GREY : tierColor(h.tier);
  if (strongest) display.drawFillRoundRect(4, y-2, W()-8, 24, 4, PANEL);
  display.drawRoundRect(4, y-2, W()-8, 24, 4, stale?DIM:col);
  // tier badge
  display.drawFillRoundRect(8, y+1, 16, 16, 3, col);
  display.setTextColor(BLACK); display.drawString(tierChar(h.tier), 13, y+5);
  // ssid + mac
  var name = String(h.ssid);
  if (name.length > 20) name = name.substring(0,20);
  at(30, y, name, stale?GREY:WHITE);
  at(30, y+10, norm(h.mac).substring(0,8) + " ch" + h.ch, DIM);
  // rssi (right)
  at(W()-46, y, h.rssi + "dB", stale?GREY:col);
  at(W()-58, y+10, h.label, stale?DIM:col);
}

// ---- LAN mode: run its own flow, then finish ------------------
if (RUN && MODE === "lan") runLanScan();

// ---- main loop (RF radar) -------------------------------------
var running = (RUN && MODE !== "lan"), spin = 0;
while (running) {
  var nets = wifi.scan(0) || [];
  for (var i=0;i<nets.length;i++){
    var cls = classify(nets[i]);
    if (cls) upsert(nets[i], cls);
  }
  var hits = activeHits();
  spin += 1;

  header(TITLE, nets.length + " nets");

  if (hits.length === 0) {
    // LEFT: live scanning radar   |   RIGHT: CLEAR verdict
    radar(60, 88, 30, spin*0.9, GREEN);
    at(44, 124, "scanning", DIM);
    checkIcon(W()-78, 76, 16, GREEN);
    display.setTextSize(2); at(W()-124, 100, "CLEAR", GREEN);
    display.setTextSize(1);
    at(W()-150, 124, nets.length + " nets - 0 suspect", DIM);
    footer("watching " + DBLABEL + "   -   hold ESC");
    if (waitOrQuit(LO, null)) running = false;
    continue;
  }

  var top = hits[0];
  // summary band
  at(6, 30, hits.length + " suspect" + (hits.length>1?"s":"") + " - top: " + tierName(top.tier), tierColor(top.tier));

  var y = 46;
  for (var k=0; k<hits.length && k<3; k++){ drawRow(hits[k], y, k===0); y += 27; }

  // proximity gauge for the strongest live target
  var pr = Math.max(LO, Math.min(HI, top.rssi));
  var prox = (pr - LO)/(HI - LO);
  at(6, H()-27, "nearest", GREY);
  gauge(58, H()-28, W()-66, prox, prox>0.6?RED:AMBER);
  var more = hits.length > 3 ? ("  +" + (hits.length-3) + " more") : "";
  footer("DB " + DBLABEL + more + "   -   hold ESC");

  if (waitOrQuit(top.rssi, top.tier)) running = false;
}

clear();
checkIcon(Math.round(W()/2)-2, 66, 16, ACCENT);
display.setTextSize(2);
at(Math.round(W()/2)-(RUN?30:24), 96, RUN?"DONE":"BYE", ACCENT);
if (RUN && audio) { try { audio.tone(880,80); } catch (eE) {} }
