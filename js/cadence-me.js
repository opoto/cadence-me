var audioContext = null;
var gainNode;
var gainValue;
var mark4th = false;
var unlocked = false;
var isPlaying = false;      // Are we currently playing?
var current16thNote;        // What note is currently last scheduled?
var tempo = 120.0;          // tempo (in beats per minute)
var lookahead = 25.0;       // How frequently to call scheduling function
                            //(in milliseconds)
var scheduleAheadTime = 0.1;// How far ahead to schedule audio (sec)
                            // This is calculated from lookahead, and overlaps
                            // with next interval (in case the timer is late)
var nextNoteTime = 0.0;     // when the next note is due.
var noteResolution = 2;     // 0 == 16th, 1 == 8th, 2 == quarter note
var noteLength = 0.05;      // length of "beep" (in seconds)
var notesInQueue = [];      // the notes that have been put into the web audio,
                            // and may or may not have played yet. {note, time}
var timerWorker = null;     // The Web Worker used to fire timer messages
var FREQ_BIP1  = 880.0;     // high tone
var FREQ_BIP4  = 440.0;     // medium tone
var FREQ_BIP16 = 220.0;     // low tone
var patterns;

function log(msg, to) {
  if (!to) {
    to = "log";
  }
  // eslint-disable-next-line no-console
  if (console && console[to]) {
    // eslint-disable-next-line no-console
    console[to](msg);
  }
}

function nextNote() {
  // Advance current note and time by a 16th note...
  // Notice this picks up the CURRENT tempo value to calculate beat length.
  var secondsPerBeat = 60.0 / tempo;
  nextNoteTime += 0.25 * secondsPerBeat; // Add beat length to last beat time

  current16thNote++; // Advance the beat number, wrap to zero
  if (current16thNote == 16) {
    current16thNote = 0;
  }
}

function scheduleNote(beatNumber, time) {
  // push the note on the queue, even if we're not playing.
  notesInQueue.push({ note: beatNumber, time: time });

  if ((noteResolution == 1) && (beatNumber % 2)) {
    return; // we're not playing non-8th 16th notes
  }
  if ((noteResolution == 2) && (beatNumber % 4)) {
    return; // we're not playing non-quarter 8th notes
  }

  // create an oscillator
  var osc = audioContext.createOscillator();
  // Connect the oscillator to the gain node.
  osc.connect(gainNode);
  if (beatNumber % 16 === 0) {          // beat 0 == high pitch
    osc.frequency.value = FREQ_BIP1;
  } else if (beatNumber % 4 === 0) {   // quarter notes = medium pitch
    osc.frequency.value = mark4th ? FREQ_BIP4 : FREQ_BIP1;
  } else {                              // other 16th notes = low pitch
    osc.frequency.value = FREQ_BIP16;
  }


  osc.start(time);
  osc.stop(time + noteLength);
}

function scheduler() {
  // while there are notes that will need to play before the next interval,
  // schedule them and advance the pointer.
  while (nextNoteTime < audioContext.currentTime + scheduleAheadTime) {
    scheduleNote(current16thNote, nextNoteTime);
    nextNote();
  }
}

var patnum,
  patrepeat,
  pattimer;

function next() {

  if (!unlocked) {
    // play silent buffer to unlock the audio
    var buffer = audioContext.createBuffer(1, 1, 22050);
    var node = audioContext.createBufferSource();
    node.buffer = buffer;
    node.start(0);
    unlocked = true;
  }

  isPlaying = !isPlaying;
  if (!isPlaying) {
    // silence: stop playing
    timerWorker.postMessage("stop");
    pattimer = setTimeout(next, patterns[patnum].pause * 1000);
    if (patterns[patnum].repeat > patrepeat) {
      log("repeat");
      patrepeat++;
    } else {
      log("next pat");
      patnum++;
      if (patnum < patterns.length) {
        patrepeat = 1;
      } else {
        // last one, skip pause
        thisIsTheEnd();
      }
    }
  } else {
    if (patnum < patterns.length) {
      // let's rock
      tempo = patterns[patnum].tempo;
      current16thNote = 0;
      nextNoteTime = audioContext.currentTime;
      timerWorker.postMessage("start");
      pattimer = setTimeout(next, patterns[patnum].len * 1000);
    } else {
      thisIsTheEnd();
    }
  }
}

function thisIsTheEnd() {
  timerWorker.postMessage("stop");
  if (pattimer) clearTimeout(pattimer);
  pattimer = undefined;
  $("#stop").hide();
  $("#play").show();
  log("done.");
}

// create pattern object
function newPattern(tempo, len, pause, repeat) {
  return {
    'tempo': tempo,
    'len': len,
    'pause': pause,
    'repeat': repeat
  };
}
// create and add pattern object
function addNewPattern(tempo, len, pause, repeat) {
  patterns.push(newPattern(tempo, len, pause, repeat));
}
// create and add pattern object
function addPattern(pat) {
  patterns.push(pat);
}

function saveStatus() {
  if (JSON && JSON.stringify) {
    var v = JSON.stringify({
      patterns: patterns,
      gainValue: gainValue,
      mark4th: mark4th
    });
    localStorage.setItem("cm_status", v);
  }
}

function letsGo() {
  // play
  if (patterns.length > 0) {
    patnum = 0;
    patrepeat = 1;
    isPlaying = false;
    next();
    $("#stop").show();
    $("#play").hide();
  }
}

function clearInputs() {
  $("table.tinputs input").val("");
}

// eslint-disable-next-line no-unused-vars
function editPattern(tr) {
  var i = parseInt(tr.attr("patid"));
  openInputs(patterns[i], tr);
}

var inputPat;
var okFunc;
var cancelFunc;
function openInputs(pat, tr) {
  inputPat = tr;
  $("#input-tempo").val(pat.tempo);
  $("#input-lenmin").val(Math.floor(pat.len / 60));
  $("#input-lensec").val((pat.len % 60));
  $("#input-pausemin").val(Math.floor(pat.pause / 60));
  $("#input-pausesec").val((pat.pause % 60));
  $("#input-repeat").val(pat.repeat);
  $("#input-box").css("display", "block");
  $("#input-tempo").select();
  okFunc = validateInputs;
  cancelFunc = closeInputsBox;
}

function closeInputsBox() {
  $("#input-box").hide();
}

function validateInputs() {
  var i;
  if (!inputPat) {
    addPattern({});
    var table = $("#patterns");
    i = patterns.length - 1;
    inputPat = addPatternRow(table, i);
  } else {
    i = parseInt(inputPat.attr("patid"));
  }

  var pat = patterns[i];
  pat.tempo = intInput($("#input-tempo"));
  pat.len = (intInput($("#input-lenmin")) * 60) + intInput($("#input-lensec"));
  pat.pause = (intInput($("#input-pausemin")) * 60) + intInput($("#input-pausesec"));
  pat.repeat = intInput($("#input-repeat"));
  setPatternRow(inputPat, pat.tempo, pat.len, pat.pause, pat.repeat);
  closeInputsBox();
  saveStatus();
}

function closeExport() {
  $("#export-box").hide();
}
function openExport() {
  if (supportsBase64() && JSON && JSON.stringify) {
    $("#export-box").css("display", "block");
    var v = JSON.stringify({
      patterns: patterns
    });
    var data = b64EncodeUnicode(v);
    var valelt = $("#export-val");
    valelt.val(window.location.toString() + "?import=" + data);
    valelt.select();

    okFunc = closeExport;
    cancelFunc = closeExport;
  } else {
    alert("Your browser does not support this feature");
  }
}

function setGainValue(v) {
  var fraction = v / 100;
  gainNode.gain.value = fraction;
}
function changeVolume(event) {
  gainValue = parseInt(event.target.value);
  setGainValue(gainValue);
  saveStatus();
}

function changeMark4th(event) {
  mark4th = event.target.checked;
  saveStatus();
}

function closeSettings() {
  $("#settings-box").hide();
}
function openSettings() {
  $("#setting-gain").val(gainValue);
  $("#setting-mark4th").attr("checked", mark4th);
  $("#settings-box").css("display", "block");
  okFunc = closeSettings;
  cancelFunc = closeSettings;
}

function copyOnClick(event) {
  if (event.target && document.execCommand) {
    var elt = $("#" + event.target.id.substring(1));
    elt.select();
    document.execCommand("copy");
    var tmp = elt.val();
    elt.val("Text copied to clipboard");
    setTimeout(function () {
      elt.val(tmp);
      elt.select();
    }, 2000);
  }
}


function clearTable() {
  $("#patterns div.pattern").remove();
}

function clearAllPatterns() {
  if (confirm("Clear all patterns?")) {
    clearTable();
    patterns = [];
    saveStatus();
  }
}

// eslint-disable-next-line no-unused-vars
function deletePattern(pat) {
  if (confirm("Delete this pattern?")) {
    var i = parseInt(pat.attr("patid"));
    patterns.splice(i, 1);
    pat.remove();
    $("#patterns .pattern").each(function (i, elt) {
      $(elt).attr("patid", i);
    });
    saveStatus();
  }
}

function addPatternRow(patternsDiv, i) {
  var pat = $(document.createElement("div"));
  pat.attr("patid", i);
  pat.attr("class", "pattern");
  var row = "";
  row += "<span class='drag-handle'><i class='fa fa-ellipsis-v'></i></span>";
  row += "<span class='vtempo'></span>";
  row += "<span class='vlen'></span>";
  row += "<span class='vpause'></span>";
  row += "<span class='vrepeat'></span>";
  row += "<span class='editdelete'><a title='Edit this pattern' onclick='editPattern($(this).parents(\"div.pattern\"))'><i class='fa fa-edit'></i></a>";
  row += "    <a title='Delete this pattern' onclick='deletePattern($(this).parents(\"div.pattern\"))'><i class='fa fa-trash'></i></a></span>";
  pat.html(row);
  patternsDiv.append(pat);
  return pat;
}

function setPatternRow(tr, tempo, len, pause, repeat) {
  tr.find(".vtempo").text(tempo);
  tr.find(".vlen").text(Math.floor(len / 60) + "'" + (len % 60) + "\"");
  tr.find(".vpause").text(Math.floor(pause / 60) + "'" + (pause % 60) + "\"");
  tr.find(".vrepeat").text(repeat);
}

function createPattern() {
  var pat = newPattern(180, 10, 120, 2);
  openInputs(pat, null);
}

function initTable() {
  clearTable();
  var table = $("#patterns");
  for (var i = 0; i < patterns.length; i++) {
    var tr = addPatternRow(table, i);
    setPatternRow(tr, patterns[i].tempo, patterns[i].len, patterns[i].pause, patterns[i].repeat);
  }
}

// --------------------------- Utility methods --------------------------------

function intInput(elt) {
  try {
    var v = parseInt(elt.val().trim(), 10);
    return v || 0;
  } catch (err) {
    return 0;
  }
}

function supportsBase64() {
  return btoa && atob ? true : false;
}
function b64EncodeUnicode(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (match, p1) {
    return String.fromCharCode('0x' + p1);
  }));
}
function b64DecodeUnicode(str) {
  return decodeURIComponent(Array.prototype.map.call(atob(str), function (c) {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
}
// Extract URL parameters from current location
function getParameterByName(name, defaultValue) {
  name = name.replace(/[[]/, "\\[").replace(/[\]]/, "\\]");
  var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
    results = regex.exec(location.search);
  return results === null ? ((defaultValue != undefined) ? defaultValue : "") : decodeURIComponent(results[1].replace(/\+/g, " "));
}

function init() {

  var saved = localStorage.getItem("cm_status");
  var status;
  if (saved) try {
    status = saved && JSON && JSON.parse ? JSON.parse(saved) : undefined;
    patterns = status.patterns;
    gainValue = status.gainValue ? status.gainValue : 1;
    mark4th = status.mark4th ? status.mark4th : false;
  } catch (ex) {
    log("Invalid status in storage", "error");
  }

  // init patterns
  var toimport = getParameterByName("import");
  if (toimport && JSON && JSON.parse && supportsBase64()) {
    var jsparsed = JSON.parse(b64DecodeUnicode(toimport));
    patterns = jsparsed.patterns;
    window.history.pushState({}, document.title, window.location.pathname);
  } else if (saved) {
    patterns = status.patterns;
  }

  // warning: safari assigns patterns with #patterns DOM element
  if (!Array.isArray(patterns)) {
    // default value
    patterns = [];
    addNewPattern(170, 30, 10, 3);
    addNewPattern(60, 15, 10, 2);
    addNewPattern(180, 30, 10, 5);
  }
  saveStatus();
  initTable();

  $("#play").click(letsGo);
  $("#stop").click(thisIsTheEnd);
  $("#clear").click(clearAllPatterns);
  $("#share").click(openExport);

  $("#settings").click(openSettings);
  $("#setting-gain").change(changeVolume);
  $("#setting-mark4th").change(changeMark4th);
  $("#settings-close").click(closeSettings);

  $("#add").click(createPattern);
  $("#input-ok").click(validateInputs);
  $("#input-cancel").click(closeInputsBox);
  $("#input-clear").click(clearInputs);
  $("#export-close").click(closeExport);
  $(".copyonclick").click(copyOnClick);

  $("#email").click(function () {
    function doEmail(d, i, tail) {
      location.href = "mailto:" + i + "@" + d + tail;
    }
    doEmail("gmail.com", "olivier.potonniee", "?subject=" + "cadence-me");
    return false;
  });


  function onKeyEvent(event) {
    if (event.which == 27) {
      if (cancelFunc) {
        cancelFunc();
        cancelFunc = undefined;
      }
    } else if (event.keyCode == 13) {
      if (okFunc) {
        okFunc();
        okFunc = undefined;
      }
    }
  }

  $("body").keyup(onKeyEvent);

  // sortable
  $("#patterns").sortable({
    //scroll: true,
    nodes: ".pattern",
    handle: ".drag-handle, .vtempo, .vlen, .vpause, .vrepeat",
    update: function () {
      var newpatterns = [];
      $("#patterns div.pattern").each(function (i, elt) {
        var id = parseInt($(elt).attr("patid"));
        newpatterns.push(patterns[id]);
        $(elt).attr("patid", i);
      });
      patterns = newpatterns;
      saveStatus();
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(function (registration) {
        // Registration was successful
        log('[SW registration success] scope: ', registration.scope);
      }, function (err) {
        // registration failed :(
        log('[SW registration fail]: ', err);
      });
  }

  // NOTE: THIS RELIES ON THE MONKEYPATCH LIBRARY BEING LOADED FROM
  // Http://cwilso.github.io/AudioContext-MonkeyPatch/AudioContextMonkeyPatch.js
  // TO WORK ON CURRENT CHROME!!  But this means our code can be properly
  // spec-compliant, and work on Chrome, Safari and Firefox.

  audioContext = new AudioContext();
  gainNode = audioContext.createGain();
  setGainValue(gainValue);
  gainNode.connect(audioContext.destination);

  // if we wanted to load audio files, etc., this is where we should do it.

  timerWorker = new Worker("js/metronomeworker.js");
  timerWorker.onmessage = function(e) {
    if (e.data == "tick") {
      // log("tick!");
      scheduler();
    } else {
      log("message: " + e.data);
    }
  };
  timerWorker.postMessage({
    "interval": lookahead
  });
}

window.addEventListener("load", init);
