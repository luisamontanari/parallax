const CONSTANTS = {
    COLORS : ['#EE2B29','#ff9800','#ffff00','#c6ff00','#00e5ff','#2979ff','#651fff','#d500f9'],
    NUM_BUTTONS : 8,
    NOTES_PER_OCTAVE : 12,
    WHITE_NOTES_PER_OCTAVE : 7,
    LOWEST_PIANO_KEY_MIDI_NOTE : 21,
    GENIE_CHECKPOINT : 'https://storage.googleapis.com/magentadata/js/checkpoints/piano_genie/model/epiano/stp_iq_auto_contour_dt_166006',
}

class Player {
    constructor() {
        this.player = new mm.SoundFontPlayer('https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus');
        this.selectOutElement = document.getElementById('selectOut');
        this.selectInElement = document.getElementById('selectIn');
        this.loadAllSamples();
    }

    loadAllSamples() {
        const seq = {notes:[]};
        for (let i = 0; i < CONSTANTS.NOTES_PER_OCTAVE * 7; i++) {
            seq.notes.push({pitch: CONSTANTS.LOWEST_PIANO_KEY_MIDI_NOTE + i});
        }
        this.player.loadSamples(seq);
    }

    playNoteDown(pitch, button) {
        // Send to MIDI out or play with the Magenta player.
        mm.Player.tone.context.resume();
        this.player.playNoteDown({pitch:pitch});
    }

    playNoteUp(pitch, button) {
        // Send to MIDI out or play with the Magenta player.
        this.player.playNoteUp({pitch:pitch});
    }
}