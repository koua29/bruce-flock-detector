// ============================================================
//  Flock Detector — detecteur de cameras de surveillance (Bruce)
//  Scanne le WiFi et signale les equipements type Flock Safety
//  par leur OUI (prefixe MAC) ou un SSID contenant "flock".
//  Defensif / recherche vie privee.
//
//  Sortie : MAINTIENS le bouton ESC/retour (le scan WiFi bloque
//  ~4s ; une fenetre reactive sonde ESC entre 2 scans).
//
//  NB: version JS = scan d'AP visibles. Detection complete
//  (probe requests, signatures IE) = mode promiscuous = firmware.
//  Signatures: projet "flock-you" + deflock.me. Auteur: koua29
// ============================================================

var LO = -95, HI = -35;

var FLOCK_OUIS = [
  "70c94e","3c9180","d8f3bc","803049","b83532",
  "145afc","744ca1","083a88","9c2f9d","c03532",
  "940853","e4aaea","f46add","f8a2d6","24b2b9",
  "00f48d","d03957","e8d0fc","e04f43","b81ea4",
  "700894","588e81","ec1bbd","3c71bf","5800e3",
  "9035ea","5c93a2","646e69","4827ea","a4cf12"
];
var SSID_KEYWORDS = ["flock"];

function C(r,g,b){ return display.color(r,g,b); }
var BLACK=C(0,0,0), WHITE=C(235,240,238), GREY=C(120,130,128);
var RED=C(255,60,55), GREEN=C(40,225,90), AMBER=C(255,180,40), BG=C(8,10,14);

function norm(s){ return String(s||"").replace(/[^0-9a-fA-F]/g,"").toLowerCase(); }
function oui(mac){ return norm(mac).substring(0,6); }
function classify(ap){
  var s = String(ap.SSID||"").toLowerCase();
  for (var i=0;i<SSID_KEYWORDS.length;i++) if (s.indexOf(SSID_KEYWORDS[i])>=0) return "SSID:flock";
  var o = oui(ap.MAC);
  for (var j=0;j<FLOCK_OUIS.length;j++) if (o===FLOCK_OUIS[j]) return "OUI";
  return null;
}
// fenetre reactive ~1.3s : sonde ESC tous les 60ms. true = on quitte.
function waitOrQuit() {
  for (var w=0; w<22; w++) { if (keyboard.getEscPress()) return true; delay(60); }
  return false;
}

display.fill(BG); display.setTextColor(WHITE);
display.setTextSize(2); display.drawString("Flock Detector", 12, 12);
display.setTextSize(1); display.drawString("scan WiFi...", 12, 46);
delay(400); keyboard.getEscPress();

var running = true;
while (running) {
  var nets = wifi.scan(0) || [];

  var hits = [];
  for (var i=0;i<nets.length;i++){
    var why = classify(nets[i]);
    if (why) hits.push({ ssid: nets[i].SSID||"(cache)", mac: nets[i].MAC, rssi: nets[i].RSSI, ch: nets[i].channel, why: why });
  }
  hits.sort(function(a,b){ return b.rssi - a.rssi; });

  display.fill(BG);
  display.setTextColor(WHITE); display.setTextSize(1);
  display.drawString("FLOCK DETECTOR  (" + nets.length + " res.)", 8, 6);
  display.setTextColor(GREY); display.drawString("Maintiens ESC = quitter", 8, 158);
  display.setTextColor(WHITE);

  if (hits.length === 0) {
    display.drawFillCircle(60, 92, 34, C(10,60,25));
    display.drawCircle(60, 92, 34, GREEN);
    display.setTextColor(GREEN);
    display.setTextSize(3); display.drawString("RAS", 120, 66);
    display.setTextSize(1); display.drawString("aucune camera detectee", 120, 100);
    display.setTextColor(WHITE);
  } else {
    display.setTextColor(RED);
    display.setTextSize(4); display.drawString("!" + hits.length, 8, 24);
    display.setTextSize(1); display.drawString("SUSPECT(S)", 8, 62);
    display.setTextColor(WHITE);
    var y = 76;
    for (var k=0; k<hits.length && k<4; k++){
      var h = hits[k];
      display.setTextColor(h.why === "SSID:flock" ? RED : AMBER);
      display.drawString(h.rssi + "dBm ch" + h.ch + " " + h.why, 96, y);
      display.setTextColor(WHITE);
      var name = (h.ssid.length>13 ? h.ssid.substring(0,13) : h.ssid);
      display.drawString(name + " " + h.mac.substring(0,8), 96, y+10);
      y += 24;
    }
    var r = Math.max(LO, Math.min(HI, hits[0].rssi));
    var prox = (r - LO)/(HI - LO);
    display.drawRect(8, 118, 78, 12, GREY);
    display.drawFillRect(9, 119, Math.round(76*prox), 10, prox>0.6?RED:AMBER);
    display.setTextColor(GREY); display.drawString("plus proche ->", 8, 134);
    display.setTextColor(WHITE);
  }

  if (waitOrQuit()) running = false;   // <-- sortie fiable ici
}

display.fill(BLACK); display.setTextColor(WHITE);
display.setTextSize(2); display.drawString("Fin.", 130, 74);
