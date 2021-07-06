import { showTab } from './tabs.js';
import { login } from './session.js';
import { exportData, importData, isPlaying } from './main.js';

// New project button
let btnNew = document.getElementById('btn_new');

// Project title input (on main tab)
let projectTitle = document.getElementById('project_title');

// Share form components
var shareTitle = document.getElementById('share_title');
var shareAgree = document.getElementById('share_agree');
var shareErrorTitle = document.getElementById('share_error_title');
var shareErrorAgree = document.getElementById('share_error_agree');
var btnShare = document.getElementById('share_btn');
var shareURLDiv = document.getElementById('share_url_div');
var shareURL = document.getElementById('share_url');
var browseDiv = document.getElementById('browse_div');

// Project ids received while browsing
var projectIds = {};

// Set the displayed project title
export function setTitle(newTitle)
{
    projectTitle.value = newTitle;
    shareTitle.value = newTitle;
    window.document.title = (isPlaying()? '▶ ':'') + newTitle + ' - Zupiter Alpha';
}

// New project button clicked
btnNew.addEventListener('click', function ()
{
    setTitle('Untitled Project');

    shareErrorTitle.style.display = 'none';
    shareErrorAgree.style.display = 'none';
});

// Share button clicked
btnShare.onclick = async function ()
{
    var title = shareTitle.value

    if (!title || title.toLowerCase().includes("untitled"))
    {
        shareErrorTitle.style.display = 'block';
        return;
    }

    if (!shareAgree.checked)
    {
        shareErrorAgree.style.display = 'block';
        return;
    }

    // Get the user and session id
    let [userId, sessionId] = await login();

    // Reset the agree and error state
    shareAgree.checked = false;
    shareErrorTitle.style.display = 'none';
    shareErrorAgree.style.display = 'none';

    var project = {
        userId: userId,
        sessionId: sessionId,
        title: title,
        data: exportData()
    };

    var json = JSON.stringify(project);

    var xhr = new XMLHttpRequest()
    xhr.open("POST", 'share', true);
    xhr.setRequestHeader("Content-Type", "application/json");

    // Request response handler
    xhr.onreadystatechange = function()
    {
        if (this.readyState == 4 && this.status == 200)
        {
            var resp = JSON.parse(this.responseText);
            var projectId = resp.projectId;
            console.log('got back projectId: ', projectId);

            var url = window.location.href.split('#')[0] + '#' + projectId;

            // Show shareable URL
            shareURLDiv.style.display = 'flex';
            shareURL.value = url;

            // Change the current URL to include the project ID
            window.history.replaceState({}, '', url);
        }
    };

    xhr.send(json);

    // Disable the share button for 8 seconds
    btnShare.disabled = true;
    setTimeout(
        function()
        {
            btnShare.disabled = false;
        },
        8000
    );
}

// Populate a div with a chunk of projects to display
function populate(chunkDiv, fromIdx)
{
    console.log('Populating from', fromIdx);

    var xhr = new XMLHttpRequest()
    xhr.open("GET", 'browse/' + fromIdx, true);
    xhr.setRequestHeader("Content-Type", "application/json");

    // Request response handler
    xhr.onreadystatechange = function()
    {
        if (this.readyState == 4 && this.status == 200)
        {
            var curTime = Date.now();

            var rows = JSON.parse(this.responseText);

            // For each project to list
            for (var i = 0; i < rows.length; ++i)
            {
                let row = rows[i];
                let projectId = row.id;

                // Avoid showing duplicates
                if (projectId in projectIds)
                    continue;





                if (row.title.startsWith('NS ') && !(localStorage.getItem('username') == 'feren_isles' || localStorage.getItem('username') == 'Max'))
                    continue;
                if (row.username == 'feren_isles' && !(localStorage.getItem('username') == 'feren_isles' || localStorage.getItem('username') == 'Max'))
                    continue;






                // Keep track of received ids
                projectIds[projectId] = true;

                var rowDiv = document.createElement('div');

                // Link to the project
                rowDiv.appendChild(document.createTextNode(projectId + '. '));
                var link = document.createElement('a');
                link.href = '#' + projectId;
                link.appendChild(document.createTextNode(row.title));
                rowDiv.appendChild(link);

                // If this is a link to the current project, show the edit tab
                link.onclick = function ()
                {
                    if (projectId == window.location.hash.substr(1))
                        showTab('edit');
                };

                rowDiv.appendChild(document.createTextNode(' by ' ));
                rowDiv.appendChild(document.createTextNode(row.username));

                var secsAgo = Math.max((curTime - row.submit_time) / 1000, 0);
                var minsAgo = Math.floor(secsAgo / 60);
                var hoursAgo = Math.floor(minsAgo / 60);
                var daysAgo = Math.floor(hoursAgo / 24);

                var timeStr;
                if (daysAgo == 1)
                    timeStr = 'yesterday';
                else if (daysAgo > 1)
                    timeStr = daysAgo + ' days ago';
                else if (hoursAgo == 1)
                    timeStr = '1 hour ago';
                else if (hoursAgo > 1)
                    timeStr = hoursAgo + ' hours ago';
                else if (minsAgo > 1)
                    timeStr = minsAgo + ' mins ago';
                else
                    timeStr = 'now';

                rowDiv.appendChild(document.createTextNode(' (' + timeStr + ')'));

                chunkDiv.appendChild(rowDiv);
            }

            // Create a new chunk to receive the next batch
            if (rows.length > 0)
                createChunk(fromIdx + rows.length);
        }
    };

    xhr.send();
}

function createChunk(fromIdx, visCheck)
{
    //console.log('creating chunk, from', fromIdx);

    // Create a div for this chunk
    var chunkDiv = document.createElement('div');
    browseDiv.appendChild(chunkDiv);

    function visCheck()
    {
        var rect = chunkDiv.getBoundingClientRect();
        var elemTop = rect.top;
        var elemBottom = rect.bottom;

        // Partially visible elements return true:
        if (elemTop < window.innerHeight && elemBottom > 0)
        {
            populate(chunkDiv, fromIdx);
            window.removeEventListener("scroll", visCheck);
        }
    }

    window.addEventListener("scroll", visCheck);
    visCheck();
}

projectTitle.onchange = function ()
{
    // Reflect the title on the input field on the share tab
    setTitle(projectTitle.value);
}

shareTitle.onchange = function ()
{
    // Reflect the title on the input field on the main tab
    setTitle(shareTitle.value);
}

// Executed when the "Share" tab button is clicked
tablink_share.addEventListener('click', function ()
{
    // Hide the shareable URL
    shareURLDiv.style.display = 'none';
});

// Executed when the "Browse" tab button is clicked
tablink_browse.addEventListener('click', function ()
{
    // Clear the browse div
    while (browseDiv.firstChild)
        browseDiv.removeChild(browseDiv.firstChild);

    // Clear received project ids
    projectIds = {};

    createChunk(0);
});

// Load a project from a given id
function loadProject(projectId)
{
    var url = 'get_project/' + projectId;

    var xhr = new XMLHttpRequest()
    xhr.open("GET", url, true);
    xhr.setRequestHeader("Content-Type", "application/json");

    // Request response handler
    xhr.onreadystatechange = function()
    {
        if (this.readyState == 4 && this.status == 200)
        {
            var project = JSON.parse(this.responseText);
            setTitle(project.title);
            importData(project.data);
            window.location.hash = projectId;
        }
    };

    xhr.send();
}

// Executed when the project id part of the URL is changed
function loadProjectFromURL(evt)
{
    if (!window.location.hash)
        return;

    var projectId = window.location.hash.substr(1);
    loadProject(projectId);
}

// Load the project from URL on hash change and at page load
window.addEventListener('hashchange', loadProjectFromURL);
window.addEventListener('load', loadProjectFromURL);
