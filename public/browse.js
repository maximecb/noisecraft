import { getSessionInfo } from './session.js';

let featuredDiv = document.getElementById('featured_div');
let latestDiv = document.getElementById('latest_div');

// Project ids received while browsing
let projectIds = {};

// Number of projects returned by the server for each list request
const CHUNK_SIZE = 40;

// Height of a project row in pixels, must match div.project_row in style.css
const ROW_HEIGHT = 24;

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

// Create a div to display/set the featured flag for a given project
function makeFeatStar(projectId, featured)
{
    // Get the current session information
    let session = getSessionInfo();

    let div = document.createElement('div');
    div.style.display = 'inline';
    div.style.cursor = 'pointer';
    div.style.color = 'red';

    // Set the featured status for this project
    function setFeatured()
    {
        var xhr = new XMLHttpRequest()
        xhr.open("POST", 'featured/' + projectId, true);
        xhr.setRequestHeader("Content-Type", "application/json");

        // Request response handler
        xhr.onreadystatechange = function()
        {
            if (this.readyState == 4 && this.status == 200)
            {
                featured = JSON.parse(this.responseText);
                div.innerHTML = featured? '★':'☆';
            }
        };

        let request = {
            userId: session.userId,
            sessionId: session.sessionId,
            featured: !featured
        };
        xhr.send(JSON.stringify(request));
    }

    if (session && session.admin)
    {
        div.innerHTML = featured? '★':'☆';
        div.onclick = setFeatured;
    }

    return div;
}

// Fill a chunk div with project listings
function fillChunk(chunkDiv, rows)
{
    var curTime = Date.now();

    // For each project to list
    for (var i = 0; i < rows.length; ++i)
    {
        let row = rows[i];
        let projectId = row.id;

        // Avoid showing duplicates
        //if (projectId in projectIds)
        //    continue;

        // Keep track of received ids
        //projectIds[projectId] = true;

        var rowDiv = document.createElement('div');
        rowDiv.className = 'project_row';

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

        // Show the featured state
        rowDiv.appendChild(document.createTextNode(' '));
        let featStar = makeFeatStar(projectId, row.featured);
        rowDiv.appendChild(featStar);

        chunkDiv.appendChild(rowDiv);
    }
}

// Populate a chunk div with the projects starting at fromIdx
function populate(chunkDiv, fromIdx, queryStr)
{
    console.log('Populating from', fromIdx);

    let xhr = new XMLHttpRequest()
    xhr.open("GET", `list/${fromIdx}${queryStr}`, true);
    xhr.setRequestHeader("Content-Type", "application/json");

    // Request response handler
    xhr.onreadystatechange = function()
    {
        if (this.readyState == 4 && this.status == 200)
        {
            let rows = JSON.parse(this.responseText);
            fillChunk(chunkDiv, rows);

            // Size the chunk to its actual rows
            chunkDiv.style.minHeight = '';
        }
    };

    xhr.send();
}

// Create empty placeholder chunks for the whole list, sized so that the
// scrollbar reflects the full list. Each chunk is populated when it gets
// close to the visible part of the list.
function createChunks(listDiv, count, queryStr)
{
    let observer = new IntersectionObserver(entries =>
    {
        for (let entry of entries)
        {
            if (!entry.isIntersecting)
                continue;

            let chunkDiv = entry.target;
            observer.unobserve(chunkDiv);
            populate(chunkDiv, parseInt(chunkDiv.dataset.fromIdx), queryStr);
        }
    },
    {
        // Start loading chunks 400px before they become visible
        root: listDiv,
        rootMargin: '400px 0px',
    });

    for (let fromIdx = 0; fromIdx < count; fromIdx += CHUNK_SIZE)
    {
        let numRows = Math.min(CHUNK_SIZE, count - fromIdx);

        let chunkDiv = document.createElement('div');
        chunkDiv.dataset.fromIdx = fromIdx;
        chunkDiv.style.minHeight = (numRows * ROW_HEIGHT) + 'px';
        listDiv.appendChild(chunkDiv);

        observer.observe(chunkDiv);
    }
}

// Get the number of projects in a list, then create its chunks
function initList(listDiv, queryStr)
{
    let xhr = new XMLHttpRequest()
    xhr.open("GET", `list_count${queryStr}`, true);

    // Request response handler
    xhr.onreadystatechange = function()
    {
        if (this.readyState == 4 && this.status == 200)
        {
            let count = JSON.parse(this.responseText);
            createChunks(listDiv, count, queryStr);
        }
    };

    xhr.send();
}

// Create the featured and latest project lists
initList(featuredDiv, '?featured=1');
initList(latestDiv, '');
