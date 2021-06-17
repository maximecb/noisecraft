import { Model } from './model.js';
import { Editor } from './editor.js';
import { AudioView } from './audioview.js';

// New, play, stop buttons
let btnNew = document.getElementById('btn_new');
let btnPlay = document.getElementById('btn_play');
let btnStop = document.getElementById('btn_stop');

// Playing/stopped flag
let playing = false;

// Project model/state
let model = new Model();

model.on('loading', () => {
    // Stop playback to avoid glitching
    stopPlayback();

    // Show the Edit tab before loading the graph,
    // so it can resize itself correctly
    /* showTab('edit'); */
});

// Graph editor view
let editor = new Editor(model);

// Audio view of the model
let audioView = new AudioView(model);

// Create a new project
model.new();

document.body.onload = function ()
{
    if (window.location.hash)
        return;

    let modelData = localStorage.getItem('model');
    if (!modelData)
        return;

    if (model.deserialize(modelData)) {
        console.log('model restored from previous session');
    } else {
        console.warn('could not restore model from previous session');
    }
}

window.onunload = function ()
{
    // Save the graph when unloading the page
    localStorage.setItem('model', model.serialize());
}

window.onkeydown = function (event)
{
    // If a text input box is active, do nothing
    if (document.activeElement &&
        document.activeElement.nodeName.toLowerCase() == "input")
        return;

    // Spacebar triggers play/stop
    if (event.keyCode == 0x20)
    {
        if (playing)
        {
            btnStop.onclick();
        }
        else
        {
            btnPlay.onclick();
        }

        event.preventDefault();
    }

    // Ctrl / Command
    if (event.ctrlKey || event.metaKey)
    {
        // Ctrl + Z (undo)
        if (event.keyCode == 90)
        {
            console.log('undo');
            model.undo();
            event.preventDefault();
        }

        // Ctrl + G (group)
        if (event.keyCode == 71)
        {
            console.log('group nodes');
            editor.groupSelected();
            event.preventDefault();
        }

        return;
    }

    // Delete or backspace key
    if (event.keyCode == 46 || event.keyCode == 8)
    {
        console.log('delete key');
        editor.deleteSelected();
        event.preventDefault();
        return;
    }
}

export function startPlayback()
{
    if (playing)
        return;

    console.log('starting playback');

    // Hide the play button
    btnPlay.style.display = 'none';
    btnStop.style.display = 'inline-block';

    document.title = '▶ ' + document.title;

    



    playing = true;
}

export function stopPlayback()
{
    if (!playing)
        return;

    console.log('stopping playback');

    // Remove the playback indicator from the title
    document.title = document.title.substr(2);


    





    playing = false;
}

export function newProject()
{
    /*
    if (playing)
        btnStop.onclick();

    let ok = confirm(
        'You will lose any unsaved work.'
    );

    if (ok)
    {
        showTab('edit');
        editor.clear();
        history.pushState(null, null, '.');
    }
    */
}

btnPlay.onclick = startPlayback;
btnStop.onclick = stopPlayback;
btnNew.onclick = newProject;
