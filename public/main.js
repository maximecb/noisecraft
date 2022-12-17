import { anyInputActive } from './utils.js';
import { Dialog, errorDialog } from './dialog.js';
import { Model, Paste, Play, Stop } from './model.js';
import { Editor } from './editor.js';
import { AudioView } from './audioview.js';
import { TitleView } from './titleview.js';
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

// View that updates the webpage title
let titleView = new TitleView(model);

// Most recent location of a mouse or touch event
let cursor = { x: 0, y: 0 };

document.body.onload = async function ()
{
    //browserWarning();

    // Parse the projectId from the path
    let path = location.pathname;
    let projectId = parseInt(location.pathname.replace('/',''));

    // If a projectId was supplied
    if (!isNaN(projectId))
    {
        // Download the serialized project data
        let data = await sharing.getProject(projectId);

        // Try to import the project
        importModel(data);

        return;
    }

    // If a hash location was supplied
    if (location.hash)
    {
        if (location.hash == '#new')
        {
            model.new();

            // Avoid erasing saved state on refresh/reload
            history.replaceState(null, null, ' ');

            return;
        }

        // Note: projectIds encoded in the location hash are deprecated
        // but we will keep supporting them for a bit for backwards
        // compatibility with old URLs
        //
        // Download the serialized project data
        let projectId = location.hash.slice(1);
        let data = await sharing.getProject(projectId);

        // Try to import the project
        importModel(data);

        return;
    }

    let serializedModelData = localStorage.getItem('latestModelData');

    if (!serializedModelData)
    {
        model.new();
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
        // the same data again next time
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

        // Ctrl + A (select all)
        if (event.code == 'KeyA')
        {
            event.preventDefault();
            editor.selectAll();
        }

        // Ctrl + G (group nodes)
        if (event.code == 'KeyG' && location.hostname == 'localhost')
        {
            console.log('group nodes');
            event.preventDefault();
            editor.groupSelected();
        }

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

document.oncopy = function (evt)
{
    if (anyInputActive())
        return;

    if (!editor.selected.length)
        return;

    let data = JSON.stringify(model.copy(editor.selected));
    evt.clipboardData.setData('text/plain', data);
    evt.preventDefault();
}

document.oncut = function (evt)
{
    if (anyInputActive())
        return;

    if (!editor.selected.length)
        return;

    let data = JSON.stringify(model.copy(editor.selected));
    evt.clipboardData.setData('text/plain', data);
    evt.preventDefault();

    editor.deleteSelected();
}

document.onpaste = function (evt)
{
    if (anyInputActive())
        return;

    try
    {
        let clipData = evt.clipboardData.getData('text/plain');
        let nodeData = JSON.parse(clipData)
        model.update(new Paste(nodeData, cursor.x, cursor.y));
        evt.preventDefault();
    }

    catch (e)
    {
        console.log(e);
    }
}

function handleMouseEvent(evt)
{
    cursor = editor.getMousePos(evt);
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

    input.onchange = (e) =>
    {
        if (!e || !e.target || !e.target.files)
            return;

        let file = e.target.files[0];
        if (!file)
            return;

        let reader = new FileReader();
        reader.readAsText(file, 'UTF-8');

        reader.onload = (e) =>
        {
            if (!e || !e.target)
                return;

            try
            {
                importModel(e.target.result);
            }
            catch (error)
            {
                errorDialog("Failed to load project file.");
            }

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

    // Generate a default save file name
    let saveFileName =`${inputProjectTitle.value || 'untitled_project'}.ncft`;
    saveFileName = saveFileName.toLowerCase();
    saveFileName = saveFileName.replace(/[^a-z0-9.]/gi, "_");

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
    a.download = saveFileName;

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
    btnStop.style.display = 'inline-flex';

    // Send the play action to the model
    model.update(new Play());
}

function stopPlayback()
{
    if (!model.playing)
        return;

    console.log('stopping playback');

    // Hide the stop button
    btnPlay.style.display = 'inline-flex';
    btnStop.style.display = 'none';

    // Send the stop action to the model
    model.update(new Stop());
}

// Warn users that NoiseCraft works best in Chrome
function browserWarning()
{
    console.log('browserWarning');

    let agent = navigator.userAgent;

    if (agent.includes('Chrome') || agent.includes('Edge') || agent.includes('Firefox'))
        return;

    if (localStorage.getItem('displayed_browser_warning'))
        return;

    let dialog = new Dialog('Your Browser is Unsupported :(');

    dialog.paragraph(
        'NoiseCraft uses new web audio API features and works best in Chrome or Edge ' +
        'web browsers. In other web browsers, you may find that it is not yet able to ' +
        'produce audio output.'
    );

    if (agent.includes('Firefox'))
    {
        dialog.paragraph(
            'Firefox will be fully supported once this bug is resolved: ' +
            '<a href="https://bugzilla.mozilla.org/show_bug.cgi?id=1572644" target=”_blank”>' +
            'https://bugzilla.mozilla.org/show_bug.cgi?id=1572644</a>'
        );
    }

    dialog.paragraph(
        'If you have time, please consider trying NoiseCraft in Google Chrome: ' +
        '<a href="https://chrome.google.com/" target=”_blank”>' +
        'https://chrome.google.com/</a>'
    )

    var okBtn = document.createElement('button');
    okBtn.className = 'form_btn';
    okBtn.appendChild(document.createTextNode('OK'));
    okBtn.onclick = evt => dialog.close();
    dialog.appendChild(okBtn);

    localStorage.setItem('displayed_browser_warning', true);
}

btnOpen.onclick = openModelFile;
btnSave.onclick = saveModelFile;
btnShare.onclick = shareProject;
btnPlay.onclick = startPlayback;
btnStop.onclick = stopPlayback;
