/* globals mm */
"use strict"

const heldButtonToVisualData = new Map();
const BUTTON_MAPPING = {0:0, 1:1, 2:2, 3:3, 4:4, 5:5, 6:6, 7:7};
const BUTTONS_DEVICE = ['a','s','d','f','j','k','l',';'];
/** @type {HTMLDivElement} */
const metronomeDoms = [];
const NUM_BUTTONS = 8;
const TEMPERATURE = 1;
let keyWhitelist = [...Array(88).keys()];
let sustaining = false;

// const TWINKLE_TWINKLE = {
//     notes: [
//         {pitch: 60, startTime: 0.0, endTime: 0.5},
//         {pitch: 60, startTime: 0.5, endTime: 1.0},
//         {pitch: 67, startTime: 1.0, endTime: 1.5},
//         {pitch: 67, startTime: 1.5, endTime: 2.0},
//         {pitch: 69, startTime: 2.0, endTime: 2.5},
//         {pitch: 69, startTime: 2.5, endTime: 3.0},
//         {pitch: 67, startTime: 3.0, endTime: 4.0},
//         {pitch: 65, startTime: 4.0, endTime: 4.5},
//         {pitch: 65, startTime: 4.5, endTime: 5.0},
//         {pitch: 64, startTime: 5.0, endTime: 5.5},
//         {pitch: 64, startTime: 5.5, endTime: 6.0},
//         {pitch: 62, startTime: 6.0, endTime: 6.5},
//         {pitch: 62, startTime: 6.5, endTime: 7.0},
//         {pitch: 60, startTime: 7.0, endTime: 8.0},
//     ],
//     totalTime: 8
// };

// const DRUMS = {
//     notes: [
//         { pitch: 36, quantizedStartStep: 0, quantizedEndStep: 1, isDrum: true },
//         { pitch: 38, quantizedStartStep: 0, quantizedEndStep: 1, isDrum: true },
//         { pitch: 42, quantizedStartStep: 0, quantizedEndStep: 1, isDrum: true },
//         { pitch: 46, quantizedStartStep: 0, quantizedEndStep: 1, isDrum: true },
//         { pitch: 42, quantizedStartStep: 2, quantizedEndStep: 3, isDrum: true },
//         { pitch: 42, quantizedStartStep: 3, quantizedEndStep: 4, isDrum: true },
//         { pitch: 42, quantizedStartStep: 4, quantizedEndStep: 5, isDrum: true },
//         { pitch: 50, quantizedStartStep: 4, quantizedEndStep: 5, isDrum: true },
//         { pitch: 36, quantizedStartStep: 6, quantizedEndStep: 7, isDrum: true },
//         { pitch: 38, quantizedStartStep: 6, quantizedEndStep: 7, isDrum: true },
//         { pitch: 42, quantizedStartStep: 6, quantizedEndStep: 7, isDrum: true },
//         { pitch: 45, quantizedStartStep: 6, quantizedEndStep: 7, isDrum: true },
//         { pitch: 36, quantizedStartStep: 8, quantizedEndStep: 9, isDrum: true },
//         { pitch: 42, quantizedStartStep: 8, quantizedEndStep: 9, isDrum: true },
//         { pitch: 46, quantizedStartStep: 8, quantizedEndStep: 9, isDrum: true },
//         { pitch: 42, quantizedStartStep: 10, quantizedEndStep: 11, isDrum: true },
//         { pitch: 48, quantizedStartStep: 10, quantizedEndStep: 11, isDrum: true },
//         { pitch: 50, quantizedStartStep: 10, quantizedEndStep: 11, isDrum: true },
//     ],
//     quantizationInfo: {stepsPerQuarter: 4},
//     tempos: [{time: 0, qpm: 120}],
//     totalQuantizedSteps: 11
// };


const genie = new mm.PianoGenie(CONSTANTS.GENIE_CHECKPOINT);
const genieReadyPs = genie.initialize();

const player = new Player();

const domReadyPs = new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', () => {
        document.addEventListener('keydown',onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        metronomeDoms.push(...Array.from(document.querySelectorAll('.metro > *')));

        resolve();
    })
})

Promise.all([genieReadyPs, domReadyPs]).then(() => {
    const metronome = new mm.Metronome({bar: () => {}, click: (time, index) => {
        if (index === 0) {
            metronomeDoms.forEach(e => e.classList.remove("done"));
            void metronomeDoms[0].offsetWidth;
        }
        metronomeDoms[index].classList.add("done");
    }, quarter: () => {}}, 4)
    metronome.start();
    metronome.muted = true;

    // TODO Save PianoGenie output as note sequence
    // TODO Play MusicRNN sequence in next bar

    // TODO Run in kiosk-mode chrome on Raspberry Pi

    // TODO STRETCH visualize the MusicRNN output using a
    // mm.PianoRollSVGVisualizer?
    // TODO STRETCH Switch conditioning of PianoGenie with extra
    // keys / programatically

    // NOTE @magenta/music docs are available at https://magenta.github.io/magenta-js/music/index.html,
    // demos at https://magenta.github.io/magenta-js/music/demos/, both a bit
    // hard to find on Google
})

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
        sustainingNotes.forEach((note) => player.playNoteUp(note, -1));
        sustainingNotes = [];
    } else {
        const button = getButtonFromKeyCode(event.key);
        if (button != null) {
            buttonUp(button);
        }
    }
}

function buttonDown(button, fromKeyDown) {
    // If we're already holding this button down, nothing new to do.
    if (heldButtonToVisualData.has(button)) {
        return;
    }

    const note = genie.nextFromKeyWhitelist(BUTTON_MAPPING[button], keyWhitelist, TEMPERATURE);
    const pitch = CONSTANTS.LOWEST_PIANO_KEY_MIDI_NOTE + note;

    // Hear it.
    player.playNoteDown(pitch, button);
    heldButtonToVisualData.set(button, {note:note});
}

function buttonUp(button) {
    const thing = heldButtonToVisualData.get(button);
    if (thing) {
        // Maybe stop hearing it.
        const pitch = CONSTANTS.LOWEST_PIANO_KEY_MIDI_NOTE + thing.note;
        if (!sustaining) {
            player.playNoteUp(pitch, button);
        } else {
            sustainingNotes.push(CONSTANTS.LOWEST_PIANO_KEY_MIDI_NOTE + thing.note);
        }
    }
    heldButtonToVisualData.delete(button);
}

function getButtonFromKeyCode(key) {
    // 1 - 8
    if (key >= '1' && key <= String(NUM_BUTTONS)) {
        return parseInt(key) - 1;
    }

    const index = BUTTONS_DEVICE.indexOf(key);
    return index !== -1 ? index : null;
}