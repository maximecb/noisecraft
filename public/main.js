import { Model } from './model.js';
import { Editor } from './editor.js';

// New, play, stop buttons
let btnNew = document.getElementById('btn_new');
let btnPlay = document.getElementById('btn_play');
let btnStop = document.getElementById('btn_stop');

// Playing/stopped flag
let playing = false;

// TODO: Project model/state
let model = new Model();

// Graph editor view
let editor = new Editor();

// TODO: Audio view


/*
export function importData(jsonData)
{
    //console.log('json data:', jsonData);

    // Stop playback to avoid glitching
    stopPlayback();

    // Show the Edit tab before loading the graph,
    // so it can resize itself correctly
    showTab('edit');

    let graph = JSON.parse(jsonData);
    editor.load(graph);
}

export function exportData()
{
    return JSON.stringify(editor.graph);
}

document.body.onload = function ()
{
    let graphData = localStorage.getItem('graph');

    if (graphData && !window.location.hash)
    {
        console.log('loading saved graph');

        try
        {
            importData(graphData);
        }
        catch (exc)
        {
            //alert('Graph failed to load');
            console.log(exc);
            localStorage.removeItem('graph');
            editor = new GraphEditor();
            editor.newGraph();
            //location.reload(false);
        }
    }
    else
    {
        editor.newGraph();
    }
}

window.onunload = function ()
{
    // Save the graph when unloading the page
    localStorage.setItem('graph', exportData());
}
*/

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
