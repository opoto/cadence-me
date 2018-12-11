var audioContext = null;
var unlocked = false;
var isPlaying = false;      // Are we currently playing?
var startTime;              // The start time of the entire sequence.
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
var FREQ_BIP1 = 880.0;
var FREQ_BIP4  = 440.0;
var FREQ_BIP16 = 220.0;
var patterns;

function nextNote() {
    // Advance current note and time by a 16th note...
    var secondsPerBeat = 60.0 / tempo;    // Notice this picks up the CURRENT
                                          // tempo value to calculate beat length.
    nextNoteTime += 0.25 * secondsPerBeat;    // Add beat length to last beat time

    current16thNote++;    // Advance the beat number, wrap to zero
    if (current16thNote == 16) {
        current16thNote = 0;
    }
}

function scheduleNote( beatNumber, time ) {
    // push the note on the queue, even if we're not playing.
    notesInQueue.push( { note: beatNumber, time: time } );

    if ( (noteResolution==1) && (beatNumber%2))
        return; // we're not playing non-8th 16th notes
    if ( (noteResolution==2) && (beatNumber%4))
        return; // we're not playing non-quarter 8th notes

    // create an oscillator
    var osc = audioContext.createOscillator();
    osc.connect( audioContext.destination );
    if (beatNumber % 16 === 0)    // beat 0 == high pitch
        osc.frequency.value = FREQ_BIP1;
    else if (beatNumber % 4 === 0 )    // quarter notes = medium pitch
        osc.frequency.value = FREQ_BIP1;
    else                        // other 16th notes = low pitch
        osc.frequency.value = FREQ_BIP16;

    osc.start( time );
    osc.stop( time + noteLength );
}

function scheduler() {
    // while there are notes that will need to play before the next interval,
    // schedule them and advance the pointer.
    while (nextNoteTime < audioContext.currentTime + scheduleAheadTime ) {
        scheduleNote( current16thNote, nextNoteTime );
        nextNote();
    }
}

var patnum,
    patrepeat,
    isPlaying,
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
        console.log("repeat");
        patrepeat++;
      } else {
        console.log("next pat");
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
    console.log("done.");
}

function addPattern(tempo, len, pause, repeat) {
  var pat = {
    'tempo': tempo,
    'len': len,
    'pause': pause,
    'repeat': repeat
  };
  patterns.push(pat);
}

function saveStatus() {
  if (JSON && JSON.stringify) {
    v = JSON.stringify({
      patterns: patterns
    });
    localStorage.setItem("cm_status", v);
  }
}

function letsGo() {
    // play
    if (patterns.length > 0) {
      patnum = 0;
      isPlaying = false;
      next();
      $("#stop").show();
      $("#play").hide();
    }
}

function clearInputs() {
    $("table.tinputs input").val("");
}

var inputPat;
var okFunc;
var cancelFunc;
function openInputs(tr) {
  inputPat = tr;
  var i = parseInt(tr.attr("patid"));
  $("#input-tempo").val(patterns[i].tempo);
  $("#input-lenmin").val(Math.floor(patterns[i].len/60));
  $("#input-lensec").val((patterns[i].len%60));
  $("#input-pausemin").val(Math.floor(patterns[i].pause/60));
  $("#input-pausesec").val((patterns[i].pause%60));
  $("#input-repeat").val(patterns[i].repeat);
  $("#input-box").css("display", "block");
  $("#input-tempo").select();
  okFunc = validateInputs;
  cancelFunc = closeInputsBox;
}

function closeInputsBox() {
  $("#input-box").hide();
}

function validateInputs() {
  var i = parseInt(inputPat.attr("patid"));
  patterns[i].tempo = intInput($("#input-tempo"));
  patterns[i].len = (intInput($("#input-lenmin")) * 60) + intInput($("#input-lensec"));
  patterns[i].pause = (intInput($("#input-pausemin")) * 60) + intInput($("#input-pausesec"));
  patterns[i].repeat = intInput($("#input-repeat"));
  setPatternRow(inputPat, patterns[i].tempo, patterns[i].len, patterns[i].pause, patterns[i].repeat);
  closeInputsBox();
  saveStatus();
}

function closeExport() {
  $("#export-box").hide();
}
function openExport() {
  if (supportsBase64() && JSON && JSON.stringify) {
    $("#export-box").css("display", "block");
    v = JSON.stringify({
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

function copyOnClick(event) {
  if (event.target && document.execCommand) {
    var elt = $("#" + event.target.id.substring(1));
    elt.select();
    document.execCommand("copy");
    var tmp = elt.val();
    elt.val("Text copied to clipboard");
    setTimeout(function(){
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

function deletePattern(pat) {
  if (confirm("Delete this pattern?")) {
    var i = parseInt(pat.attr("patid"));
    patterns.splice(i, 1);
    pat.remove();
    $("#patterns .pattern").each(function(i, elt) {
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
  row += "<span class='editdelete'><a title='Edit this pattern' onclick='openInputs($(this).parents(\"div.pattern\"))'><i class='fa fa-edit'></i></a>";
  row += "    <a title='Delete this pattern' onclick='deletePattern($(this).parents(\"div.pattern\"))'><i class='fa fa-trash'></i></a></span>";
  pat.html(row);
  patternsDiv.append(pat);
  return pat;
}

function setPatternRow(tr, tempo, len, pause, repeat) {
  tr.find(".vtempo").text(tempo);
  tr.find(".vlen").text(Math.floor(len / 60) + "'" + (len%60) + "\"");
  tr.find(".vpause").text(Math.floor(pause / 60) + "'" + (pause%60) + "\"");
  tr.find(".vrepeat").text(repeat);
}

function newPattern() {
  addPattern(180, 10, 120, 2);
  var table = $("#patterns");
  var i = patterns.length - 1;
  var tr = addPatternRow(table, i);
  openInputs(tr);
}

function initTable() {
  clearTable();
  var table = $("#patterns");
  for (var i=0; i < patterns.length; i++) {
    var tr = addPatternRow(table, i);
    setPatternRow(tr, patterns[i].tempo, patterns[i].len, patterns[i].pause, patterns[i].repeat);
  }
}

// --------------------------- Utility methods --------------------------------

function intInput(elt) {
    try {
      var v = parseInt(elt.val().trim(), 10);
      return v || 0;
    } catch(err) {
      return 0;
    }
}

function supportsBase64() {
  return btoa && atob ? true : false;
}
function b64EncodeUnicode(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) {
    return String.fromCharCode('0x' + p1);
  }));
}
function b64DecodeUnicode(str) {
  return decodeURIComponent(Array.prototype.map.call(atob(str), function(c) {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
}
// Extract URL parameters from current location
function getParameterByName(name, defaultValue) {
  name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
  var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
    results = regex.exec(location.search);
  return results === null ? ((defaultValue != undefined) ? defaultValue : "") : decodeURIComponent(results[1].replace(/\+/g, " "));
}

function init() {

    // init patterns
    var toimport = getParameterByName("import");
    if (toimport && JSON && JSON.parse && supportsBase64()) {
      var v = JSON.parse(b64DecodeUnicode(toimport));
      patterns = v.patterns;
      window.history.pushState({}, document.title, window.location.pathname);
    } else {
      var v = localStorage.getItem("cm_status");
      if (v) try {
        var status = v && JSON && JSON.parse ? JSON.parse(v) : undefined;
        patterns = status.patterns;
      } catch (ex) {
        console.error("Invalid status in storage");
      }
    }

    // warning: safari assigns patterns with #patterns DOM element
    if (!Array.isArray(patterns)) {
      // default value
      patterns = [];
      addPattern(170, 30, 10, 3);
      addPattern(60, 15, 10, 2);
      addPattern(180, 30, 10, 5);
    }
    saveStatus();
    initTable();

    $("#play").click(letsGo);
    $("#stop").click(thisIsTheEnd);
    $("#clear").click(clearAllPatterns);
    $("#share").click(openExport);
    $("#add").click(newPattern);
    $("#input-ok").click(validateInputs);
    $("#input-cancel").click(closeInputsBox);
    $("#input-clear").click(clearInputs);
    $("#export-close").click(closeExport);
    $(".copyonclick").click(copyOnClick);

    $("#email").click(function() {
      function doEmail(d, i, tail) {
        location.href = "mailto:" + i + "@" + d + tail;
      }
      doEmail("gmail.com", "olivier.potonniee", "?subject=" + "cadence-me");
      return false;
    });


    function promptKeyEvent(event) {
      if (event.which == 27) {
        cancelFunc();
      } else if (event.keyCode == 13) {
        okFunc();
      }
    }

    $(".tinputs input").keyup(promptKeyEvent);
    $("#export-box input").keyup(promptKeyEvent);

    // sortable
    $("#patterns").sortable({
      //scroll: true,
      nodes: ".pattern",
      handle: ".drag-handle, .vtempo, .vlen, .vpause, .vrepeat",
      update: function(evt) {
        newpatterns = [];
        $("#patterns div.pattern").each(function(i, elt){
          var id = parseInt($(elt).attr("patid"));
          newpatterns.push(patterns[id]);
          $(elt).attr("patid", i);
        });
        patterns = newpatterns;
        saveStatus();
      }
    });

    // NOTE: THIS RELIES ON THE MONKEYPATCH LIBRARY BEING LOADED FROM
    // Http://cwilso.github.io/AudioContext-MonkeyPatch/AudioContextMonkeyPatch.js
    // TO WORK ON CURRENT CHROME!!  But this means our code can be properly
    // spec-compliant, and work on Chrome, Safari and Firefox.

    audioContext = new AudioContext();

    // if we wanted to load audio files, etc., this is where we should do it.

    timerWorker = new Worker("js/metronomeworker.js");

    timerWorker.onmessage = function(e) {
        if (e.data == "tick") {
            // console.log("tick!");
            scheduler();
        }
        else
            console.log("message: " + e.data);
    };
    timerWorker.postMessage({"interval":lookahead});
}

window.addEventListener("load", init );
