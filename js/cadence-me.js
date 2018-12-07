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
var program;

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

var prgnum, 
    prgrepeat,
    isPlaying,
    prgtimer;

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
      prgtimer = setTimeout(next, program[prgnum].pause * 1000);
      if (program[prgnum].repeat > prgrepeat) {
        console.log("repeat");
        prgrepeat++;
      } else {
        console.log("next prg");
        prgnum++;
        if (prgnum < program.length) {
          prgrepeat = 1;
        } else {
          // last one, skip pause
          thisIsTheEnd();
        }
      }
    } else {
      if (prgnum < program.length) {
        // let's rock
        tempo = program[prgnum].tempo;
        current16thNote = 0;
        nextNoteTime = audioContext.currentTime;
        timerWorker.postMessage("start");
        prgtimer = setTimeout(next, program[prgnum].len * 1000);
      } else {
        thisIsTheEnd();
      }
  }
}

function thisIsTheEnd() {
    timerWorker.postMessage("stop");
    if (prgtimer) clearTimeout(prgtimer);
    prgtimer = undefined;
    hide(get("stop"));
    show(get("play"));
    console.log("done.");
}

function letsGo() {
    // read config
    program = [];
    forEach("input.tempo", function(elt, i) {
      try {
        var elttempo = intInput(elt);
        elt = elt.parentElement.nextElementSibling.firstElementChild;
        var eltlen = intInput(elt) * 60;
        elt = elt.nextElementSibling;
        eltlen += intInput(elt);
        elt = elt.parentElement.nextElementSibling.firstElementChild;
        var eltpause = intInput(elt) * 60;
        elt = elt.nextElementSibling;
        eltpause += intInput(elt);
        elt = elt.parentElement.nextElementSibling.firstElementChild;
        var eltrepeat = intInput(elt);
        if ((elttempo > 0) 
          && (eltlen > 0)
          && (eltpause > 0)
          && (eltrepeat > 0)) {
            var prg = {
              'tempo': elttempo,
              'len': eltlen,
              'pause': eltpause,
              'repeat': eltrepeat
            };
            program.push(prg);
          }
      } catch(err) {
        console.log(err);
      }
    });
    
    // play
    if (program.length > 0) {
      prgnum = 0;
      isPlaying = false;
      next();
      show(get("stop"));
      hide(get("play"));
    }
}

function clearInput() {
    forEach("td input", function(elt, i) {
      elt.value = "";
    });
}

function forEach(selector, func) {
  var elements = document.querySelectorAll(selector);
  Array.prototype.forEach.call(elements, func);
}
function get(id) {
  return document.getElementById(id);
}
function intInput(elt) {
    try {
      var v = parseInt(elt.value.trim(), 10);
      return v || 0;
    } catch(err) {
      return 0;
    }
}
function hide(elt) {
  elt.style.display = "none";
}
function show(elt) {
  elt.style.display = "";
}

function init(){
    get("play").onclick = letsGo;
    get("stop").onclick = thisIsTheEnd;
    get("clear").onclick = clearInput;
    hide(get("stop"));
    show(get("play"));

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
