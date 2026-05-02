"use strict";

var websocket     = null;
var uuid          = null;
var settings      = {};
var connectCalled = false;

function doConnect(inPort, inUUID, inRegisterEvent, inInfo, inActionInfo) {
  if (connectCalled) return;
  connectCalled = true;
  uuid = inUUID;
  try { settings = (JSON.parse(inActionInfo || "{}").payload || {}).settings || {}; } catch(e) {}
  applySettingsToUI(settings);

  websocket = new WebSocket("ws://127.0.0.1:" + inPort);
  websocket.onopen = function () {
    websocket.send(JSON.stringify({ event: inRegisterEvent, uuid: inUUID }));
    websocket.send(JSON.stringify({ event: "getSettings", context: uuid }));
  };
  websocket.onmessage = function (evt) {
    var msg = JSON.parse(evt.data);
    if (msg.event === "didReceiveSettings") {
      settings = msg.payload.settings || {};
      applySettingsToUI(settings);
    }
  };
}

window.connectElgatoStreamDeckSocket = doConnect;

document.addEventListener("DOMContentLoaded", function () {

  function readSettingsFromUI() {
    return {
      pair:           document.getElementById("pair").value.toUpperCase().trim(),
      refreshSeconds: parseInt(document.getElementById("refreshSeconds").value, 10),
      showLabel:      document.getElementById("showLabel").checked,
      decimals:       parseInt(document.getElementById("decimals").value, 10)
    };
  }

  function saveSettings() {
    var s = readSettingsFromUI();
    if (!s.pair) { showStatus("err", "Please enter a trading pair."); return; }
    if (!websocket || websocket.readyState !== 1) { showStatus("err", "Not connected."); return; }
    settings = s;
    websocket.send(JSON.stringify({ event: "setSettings", context: uuid, payload: settings }));
    showStatus("ok", "Settings saved.");
  }

  async function testPair() {
    var pair = document.getElementById("pair").value.toUpperCase().trim();
    if (!pair) { showStatus("err", "Enter a pair to test."); return; }
    showStatus("ok", "Fetching…");
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 8000);
    try {
      var resp = await fetch(
        "https://api.kraken.com/0/public/Ticker?pair=" + encodeURIComponent(pair),
        { signal: ctrl.signal }
      );
      clearTimeout(t);
      var data = await resp.json();
      if (data.error && data.error.length > 0) {
        showStatus("err", "Kraken error: " + data.error[0]);
      } else {
        var keys = Object.keys(data.result);
        var price = keys.length ? parseFloat(data.result[keys[0]].c[0]).toFixed(2) : "?";
        showStatus("ok", "✔ " + pair + " = " + price);
      }
    } catch (e) { clearTimeout(t); showStatus("err", "Network error: " + (e.message || e)); }
  }

  document.getElementById("btn-save").addEventListener("click", saveSettings);
  document.getElementById("btn-test").addEventListener("click", testPair);

  document.querySelectorAll(".pair-chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      document.getElementById("pair").value = chip.dataset.pair;
      saveSettings();
    });
  });

  var debounceTimer = null;
  ["pair", "refreshSeconds", "showLabel", "decimals"].forEach(function (id) {
    var el = document.getElementById(id);
    var evt = el.type === "checkbox" ? "change" : "input";
    el.addEventListener(evt, function () {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(saveSettings, 600);
    });
  });

});

function applySettingsToUI(s) {
  var p  = document.getElementById("pair");           if (!p) return;
  var r  = document.getElementById("refreshSeconds");
  var sl = document.getElementById("showLabel");
  var d  = document.getElementById("decimals");
  if (s.pair)                         p.value  = s.pair;
  if (s.refreshSeconds && r)          r.value  = String(s.refreshSeconds);
  if (s.showLabel !== undefined && sl) sl.checked = !!s.showLabel;
  if (s.decimals  !== undefined && d)  d.value  = String(s.decimals);
}

var statusTimer = null;
function showStatus(type, message) {
  var bar = document.getElementById("status");
  var txt = document.getElementById("status-text");
  if (!bar || !txt) return;
  bar.classList.remove("hidden", "ok", "err");
  bar.classList.add(type);
  txt.textContent = message;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(function () { bar.classList.add("hidden"); }, 8000);
}
