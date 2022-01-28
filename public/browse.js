import { isAdmin } from './session.js';

var browseDiv = document.getElementById('browse_div');

// Project ids received while browsing
var projectIds = {};

// Generate a string for how much time has passed
function timeAgo(oldTime, curTime)
{
    var secsAgo = Math.max((curTime - oldTime) / 1000, 0);
    var minsAgo = Math.floor(secsAgo / 60);
    var hoursAgo = Math.floor(minsAgo / 60);
    var daysAgo = Math.floor(hoursAgo / 24);

    if (daysAgo == 1)
        return 'yesterday';
    if (daysAgo > 1)
        return daysAgo + ' days ago';
    if (hoursAgo == 1)
        return '1 hour ago';
    if (hoursAgo > 1)
        return hoursAgo + ' hours ago';
    if (minsAgo > 1)
        return minsAgo + ' mins ago';

    return 'now';
}

// Fill a div with project listings
function fillChunk(chunkDiv, fromIdx, rows)
{
    // Check if we are an admin user
    let admin = isAdmin();

    var curTime = Date.now();

    // For each project to list
    for (var i = 0; i < rows.length; ++i)
    {
        let row = rows[i];
        let projectId = row.id;

        // Avoid showing duplicates
        if (projectId in projectIds)
            continue;

        // Keep track of received ids
        projectIds[projectId] = true;

        var rowDiv = document.createElement('div');

        // Link to the project
        rowDiv.appendChild(document.createTextNode(projectId + '. '));
        var link = document.createElement('a');
        link.href = '/' + projectId;
        //link.target = '_blank';
        link.appendChild(document.createTextNode(row.title));
        rowDiv.appendChild(link);

        rowDiv.appendChild(document.createTextNode(' by ' ));
        rowDiv.appendChild(document.createTextNode(row.username));

        let timeStr = timeAgo(row.submit_time, curTime);
        rowDiv.appendChild(document.createTextNode(' (' + timeStr + ')'));

        chunkDiv.appendChild(rowDiv);
    }
}

// Populate a div with a chunk of projects to display
function populate(chunkDiv, fromIdx)
{
    console.log('Populating from', fromIdx);

    var xhr = new XMLHttpRequest()
    xhr.open("GET", 'list/' + fromIdx, true);
    xhr.setRequestHeader("Content-Type", "application/json");

    // Request response handler
    xhr.onreadystatechange = function()
    {
        if (this.readyState == 4 && this.status == 200)
        {
            var rows = JSON.parse(this.responseText);
            fillChunk(chunkDiv, fromIdx, rows);

            // Create a new chunk to receive the next batch
            if (rows.length > 0)
            {
                createChunk(fromIdx + rows.length);
            }
        }
    };

    xhr.send();
}

// Create a chunk of project listings to be populated
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

        // If the top of the chunk is almost visible
        if (elemTop < window.innerHeight + 400)
        {
            // Populate the chunk
            populate(chunkDiv, fromIdx);
            window.removeEventListener("scroll", visCheck);
        }
    }

    window.addEventListener("scroll", visCheck);
    visCheck();
}

// Create the first chunk
createChunk(0);
