import { anyInputActive } from './utils.js';
import { Model, Paste, Play, Stop } from './model.js';
import { Editor } from './editor.js';
import { AudioView } from './audioview.js';
import * as session from './session.js';
import * as sharing from './sharing.js';

// Project title input
let inputProjectTitle = document.getElementById('project_title');

// Menu buttons
let btnOpen = document.getElementById('btn_open');
let btnSave = document.getElementById('btn_save');
let btnShare = document.getElementById('btn_share');
let btnPlay = document.getElementById('btn_play');
let btnStop = document.getElementById('btn_stop');

// Project model/state
let model = new Model();

// Graph editor view
let editor = new Editor(model);

// Audio view of the model
let audioView = new AudioView(model);

// Most recent location of a mouse or touch event
let cursor = { x: 0, y: 0 };

document.body.onload = async function ()
{
    try
    {
        // Create a new blank project
        model.new();
    }
    catch (e)
    {
        console.log(e.stack);
    }

    if (window.location.hash)
    {
        // Avoid erasing saved state on refresh/reload
        if (window.location.hash == '#new')
        {
            history.replaceState(null, null, ' ');
            return;
        }

        // Download the serialized project data
        let projectId = window.location.hash.substr(1);
        let data = await sharing.getProject(projectId);

        // Try to import the project
        importModel(data);

        return;
    }

    let serializedModelData = localStorage.getItem('latestModelData');

    if (!serializedModelData)
    {
        return;
    }

    try
    {
        importModel(serializedModelData);
    }
    catch (e)
    {
        console.log(e.stack);

        // If loading failed, we don't want to reload
        // the same data again and error repeatedly
        localStorage.removeItem('latestModelData');

        // Reset the project
        model.new();
    }
}

window.onunload = function ()
{
    // Save the graph when unloading the page
    localStorage.setItem('latestModelData', model.serialize());
}

window.onmousedown = handleMouseEvent;
window.onmousemove = handleMouseEvent;

window.onkeydown = function (event)
{
    // If a text input box is active, do nothing
    if (document.activeElement &&
        document.activeElement.nodeName.toLowerCase() == "input")
        return;

    // Spacebar triggers play/stop
    if (event.code == 'Space')
    {
        if (model.playing)
        {
            stopPlayback();
        }
        else
        {
            startPlayback();
        }

        event.preventDefault();
    }

    // Ctrl or Command key
    if (event.ctrlKey || event.metaKey)
    {
        // Ctrl + S (save)
        if (event.code == 'KeyS')
        {
            saveModelFile();
            event.preventDefault();
        }

        // Ctrl + Z (undo)
        if (event.code == 'KeyZ')
        {
            console.log('undo');
            event.preventDefault();
            model.undo();
        }

        // Ctrl + Y (redo)
        if (event.code == 'KeyY')
        {
            console.log('redo');
            event.preventDefault();
            model.redo();
        }

        /*
        // Ctrl + G (group nodes)
        if (event.code == 'KeyG')
        {
            console.log('group nodes');
            event.preventDefault();
            editor.groupSelected();
        }
        */

        return;
    }

    // Delete or backspace key
    if (event.code == 'Backspace' || event.code == 'Delete')
    {
        console.log('delete key');
        event.preventDefault();
        editor.deleteSelected();
        return;
    }
}

document.onpaste = function(e)
{
    if (anyInputActive())
        return;

    try
    {
        model.update(new Paste(e.clipboardData.getData('text/plain'), cursor));
        e.preventDefault();
    }

    catch(e) { }
}

document.oncopy = function(e)
{
    if (anyInputActive())
        return;

    if (!editor.selected.length)
        return;

    let data = JSON.stringify(model.copy(editor.selected));
    e.clipboardData.setData('text/plain', data);
    e.preventDefault();
}

function handleMouseEvent(e)
{
    cursor = editor.getMousePos(e);
}

function importModel(serializedModelData)
{
    // Stop playback to avoid glitching
    stopPlayback();

    model.deserialize(serializedModelData);
}

function openModelFile()
{
    let input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ncft,.json,application/json,application/JSON';

    input.onchange = e =>
    {
        if (!e || !e.target || !e.target.files)
            return;

        let file = e.target.files[0];
        if (!file)
            return;

        let reader = new FileReader();
        reader.readAsText(file, 'UTF-8');

        reader.onload = e =>
        {
            if (!e || !e.target)
                return;

            importModel(e.target.result);

            // Clear any hash tag in the URL
            history.replaceState(null, null, ' ');
        }
    };

    input.click();
}

function saveModelFile()
{
    // There is no JS API in most browsers to prompt a file download. Chrome has
    // a file system API, but as of writing other browsers have no equivalent.
    //
    // Instead, a download typically occurs when your browser opens a URL and
    // decides the content should be saved as a file (rather than displayed or
    // used in a window).
    //
    // To save our file here, we will ask the browser to open a special kind of
    // of URL that uses the blob protocol. Our URL will not point to an external
    // resource, instead it will contain all data we want the user to download.
    //
    // We can ask the browser to open our URL in a few different ways. Here, we
    // will simulate a link on the page being clicked. It's a good user
    // experience compared to opening the URL in a new tab or window, which
    // takes the user away from the current page.
    let a = document.createElement('a');

    // This is what the browser will name the download by default.
    //
    // If the browser is configured to automatically save downloads in a fixed
    // location, this will be the default name for the file. If a file already
    // exists with that name, the name will be modified to prevent a conflict
    // ("example.ncft" might become "example (1).ncft") or the user will be
    // asked what to do (replace, modify the name, or cancel the download).
    //
    // If the browser is configured to prompt the user for a save location, this
    // will be the default name in the save dialog. The user can usually change
    // the name if they would like.
    a.download = `${inputProjectTitle.value || 'Untitled Project'}.ncft`;

    // This is the binary large object (blob) we would like to send to the user.
    let blob = new Blob(
        [model.serialize()],
        {type: 'application/json'}
    );

    // This is the URL we're asking the browser to open, which will prompt the
    // blob download.
    //
    // In major browsers, the maximum size for this URL is quite generous. It
    // should pose no problem here. See: https://stackoverflow.com/a/43816041
    a.href = window.URL.createObjectURL(blob);

    a.click();
}

function shareProject()
{
    sharing.shareProject(model);
}

function startPlayback()
{
    if (model.playing)
        return;

    console.log('starting playback');

    // Hide the play button
    btnPlay.style.display = 'none';
    btnStop.style.display = 'inline-block';

    document.title = '▶ ' + document.title;

    // Send the play action to the model
    model.update(new Play());
}

function stopPlayback()
{
    if (!model.playing)
        return;

    console.log('stopping playback');

    // Hide the stop button
    btnPlay.style.display = 'inline-block';
    btnStop.style.display = 'none';

    // Remove the playback indicator from the title
    document.title = document.title.substr(2);

    // Send the stop action to the model
    model.update(new Stop());
}

btnOpen.onclick = openModelFile;
btnSave.onclick = saveModelFile;
btnShare.onclick = shareProject;
btnPlay.onclick = startPlayback;
btnStop.onclick = stopPlayback;
