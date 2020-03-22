/* globals mm */
"use strict"

const heldButtonToVisualData = new Map();
const BUTTON_MAPPING         = {0:0, 1:1, 2:2, 3:3, 4:4, 5:5, 6:6, 7:7};
const BUTTONS_DEVICE         = ['a','s','d','f','j','k','l',';'];
/** @type {HTMLDivElement[]}    */
const metronomeDoms          = [];
/** @type {HTMLButtonElement[]} */
const buttonDoms             = [];
const NUM_BUTTONS            = 8;
const TEMPERATURE            = 1;
const METRONOME_CLICKS       = 4;
const MS_CLICK_LEARNING_RATE = 0.1;
const STEPS_PER_QUARTER_REC  = 48;
let barNotes     = [];
let bpm          = 120;
let msPerClick   = bpmToMsPerClick(bpm);
let keyWhitelist = [...Array(88).keys()];
let sustaining   = false;
let lastTickTime = NaN;
let currentClick = 0;
let currentBar   = 0;

const genie = new mm.PianoGenie(CONSTANTS.GENIE_CHECKPOINT);
const genieReadyPs = genie.initialize();

const player = new Player();

const domReadyPs = new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', () => {
        document.addEventListener('keydown',onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        metronomeDoms.push(...Array.from(document.querySelectorAll('.metro > *')));
        buttonDoms.push(...Array.from(document.querySelectorAll('.keys > button')));

        buttonDoms.forEach(e => {
            e.addEventListener("mousedown",   onBtnDown);
            e.addEventListener("mouseup",     onBtnUp);
            // We need seperate touch event handlers due to the way
            // that browsers handle touch and mouse inputs seperately.
            // Without them, we could not sustain a note or play multiple
            // notes at once on a touchscreen.
            e.addEventListener("touchstart",  onBtnTouchDown);
            e.addEventListener("touchend",    onBtnTouchUp);
            e.addEventListener("touchcancel", onBtnTouchUp);
        });

        resolve();
    })
})

Promise.all([genieReadyPs, domReadyPs]).then(() => {
    const clickProperties = {
        pitchDecay: 0.008,
        envelope: {attack: 0.001, decay: 0.3, sustain: 0},
    };

    // NOTE MagentaJS is shipping the Tone.JS library as a static member
    // of Player
    const hiClick = new mm.Player.tone.MembraneSynth(clickProperties);
    const loClick = new mm.Player.tone.MembraneSynth(clickProperties);

    const vol = new mm.Player.tone.Volume(-40);
    hiClick.chain(vol, mm.Player.tone.Master);
    loClick.chain(vol, mm.Player.tone.Master);

    // The metronome would normally make a sound at each click -- we need the
    // click count to be high for the visual aid but do not want to have audible
    // clicks that frequently. Therefore we mute it and generate the clicks
    // manually for each quarter.
    const metronome = new mm.Metronome({bar: (time, index) => {
        currentBar = index;
        // This log contains a Magenta quantized note sequence of all notes
        // completed in the last bar
        // TODO The note sequence does not contain any keys that are held when
        //      the next measure begins -- include them in barNotes here.
        console.log(generateQuantizedSequence(barNotes));
        barNotes.splice(0, barNotes.length);
        hiClick.triggerAttackRelease('g5', '8n');
    }, click: (time, index) => {
        const clickTimestamp = Date.now();
        currentClick = index;
        if (index === 0) {
            // Remove all elements from the lastTick array
            metronomeDoms.forEach(e => e.classList.remove("done"));
            void metronomeDoms[0].offsetWidth;
        }
        metronomeDoms[index].classList.add("done");

        msPerClick = isNaN(lastTickTime)
            ? msPerClick
            : msPerClick + MS_CLICK_LEARNING_RATE * ((clickTimestamp - lastTickTime) - msPerClick);
        lastTickTime = clickTimestamp;
    }, quarter: (time, index) => {
        if (index > 0) loClick.triggerAttackRelease('c5', '8n');
    }}, 4)
    metronome.start();
    metronome.muted = true;

    // TODO Play MusicRNN sequence in next bar

    // TODO Run in kiosk-mode chrome on Raspberry Pi

    // TODO STRETCH visualize the MusicRNN output using a
    //              mm.PianoRollSVGVisualizer?
    // TODO STRETCH Switch conditioning of PianoGenie with extra
    //              keys / programatically

    // NOTE @magenta/music docs are available at https://magenta.github.io/magenta-js/music/index.html,
    //      demos at https://magenta.github.io/magenta-js/music/demos/, both a
    //      bit hard to find on Google
})

/**
 * Will calculate the target amount of ms per metronome click
 * @param {number} speed The bpm value to convert
 */
function bpmToMsPerClick(speed) {
    return (60 * 1000) / (speed * METRONOME_CLICKS);
}

/**
 * Will convert a timestamp to the current step count w.r.t. the current
 * resolution of metronome and recording and metronome click
 * @param {number} ts The timestamp at which the event has occurred
 */
function getStepCountFromTimestamp(ts) {
    const diffToLastMetroClick = ts - lastTickTime;
    const msPerRecordingBeat = (msPerClick * METRONOME_CLICKS) / STEPS_PER_QUARTER_REC;

    const stepOffset = (currentClick / METRONOME_CLICKS) * STEPS_PER_QUARTER_REC;

    return Math.floor((diffToLastMetroClick / msPerRecordingBeat) + stepOffset)
}

function generateQuantizedSequence(notes) {
    const newNotes = notes.slice(0).map(e => {
        if (e.startBar !== e.endBar) {
            e.quantizedStartStep = 0
        }
        return e;
    });
    return {
        notes: newNotes,
        quantizationInfo: {stepsPerQuarter: STEPS_PER_QUARTER_REC},
        tempos: [{time: 0, qpm: bpm}],
        totalQuantizedSteps: STEPS_PER_QUARTER_REC * 4,
    }
}

function onKeyDown(event) {
    // Keydown fires continuously and we don't want that.
    if (event.repeat) {
        return;
    }
    if (event.key === ' ') {  // sustain pedal
        sustaining = true;
    } else if (event.key === '0' || event.key === 'r') {
        console.log('🧞‍♀️ resetting!');
        genie.resetState();
    } else {
        const button = getButtonFromKeyCode(event.key);
        if (button != null) {
            buttonDown(button, true);
        }
    }
}

function onKeyUp(event) {
    if (event.key === ' ') {  // sustain pedal
        sustaining = false;

        // Release everything.
        sustainingNotes.forEach((note) => {
            try {
                player.playNoteUp(note, -1);
            } catch (e) {
                console.log(e);
            }
        });
        sustainingNotes = [];
    } else {
        const button = getButtonFromKeyCode(event.key);
        if (button != null) {
            buttonUp(button);
        }
    }
}

/**
 * To be triggered if a UI button is held down
 * @param {MouseEvent} args
 */
function onBtnDown(args) {
    const buttonIndex = buttonDoms.indexOf(args.currentTarget);
    if (buttonIndex < 0 || buttonIndex > NUM_BUTTONS) return;

    buttonDown(buttonIndex, true);
}

/**
 * To be triggered if a UI button is released
 * @param {MouseEvent} args
 */
function onBtnUp(args) {
    const buttonIndex = buttonDoms.indexOf(args.currentTarget);
    if (buttonIndex < 0 || buttonIndex > NUM_BUTTONS) return;

    buttonUp(buttonIndex, true);
}

/**
 * To be triggered if a UI button is held down
 * @param {TouchEvent} args
 */
function onBtnTouchDown(args) {
    const buttonIndex = buttonDoms.indexOf(args.currentTarget);
    if (buttonIndex < 0 || buttonIndex > NUM_BUTTONS) return;

    // We need to prevent things like zooming that would be standard behavior
    // for multi-touch. Instead, multiple buttons should be able to be pressed
    // at once.
    args.preventDefault();

    buttonDown(buttonIndex, true);
}

/**
 * To be triggered if a UI button is released
 * @param {TouchEvent} args
 */
function onBtnTouchUp(args) {
    const buttonIndex = buttonDoms.indexOf(args.currentTarget);
    if (buttonIndex < 0 || buttonIndex > NUM_BUTTONS) return;

    buttonUp(buttonIndex, true);
}

function buttonDown(button, fromKeyDown) {
    // If we're already holding this button down, nothing new to do.
    if (heldButtonToVisualData.has(button)) return;

    buttonDoms[button].classList.add("active");

    const note = genie.nextFromKeyWhitelist(BUTTON_MAPPING[button], keyWhitelist, TEMPERATURE);
    const pitch = CONSTANTS.LOWEST_PIANO_KEY_MIDI_NOTE + note;

    // Hear it.
    player.playNoteDown(pitch, button);
    heldButtonToVisualData.set(button, {
        note: note,
        quantizedStartStep: getStepCountFromTimestamp(Date.now()),
        startBar: currentBar,
    });
}

function buttonUp(button) {
    const thing = heldButtonToVisualData.get(button);
    if (thing) {
        // Maybe stop hearing it.
        const pitch = CONSTANTS.LOWEST_PIANO_KEY_MIDI_NOTE + thing.note;
        if (!sustaining) {
            try {
                player.playNoteUp(pitch, button);
            } catch (e) {
                console.log(e);
            }
        } else {
            sustainingNotes.push(CONSTANTS.LOWEST_PIANO_KEY_MIDI_NOTE + thing.note);
        }
        thing.quantizedEndStep = getStepCountFromTimestamp(Date.now());
        thing.pitch = pitch;
        thing.endBar = currentBar;
        barNotes.push(thing);
    }
    buttonDoms[button].classList.remove("active");

    heldButtonToVisualData.delete(button);
}

/**
 * Will return the button index for a keyboard char string
 * @param {string} key
 */
function getButtonFromKeyCode(key) {
    // 1 - 8
    if (key >= '1' && key <= String(NUM_BUTTONS)) {
        return parseInt(key) - 1;
    }

    const index = BUTTONS_DEVICE.indexOf(key);
    return index !== -1 ? index : null;
}