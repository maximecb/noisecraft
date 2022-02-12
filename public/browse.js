import { getSessionInfo } from './session.js';

let featuredDiv = document.getElementById('featured_div');
let latestDiv = document.getElementById('latest_div');

// Project ids received while browsing
let projectIds = {};

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
function fillChunk(chunkDiv, fromIdx, rows)
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

// Populate a div with a chunk of projects to display
function populate(sectionDiv, fromIdx, queryStr, chunkDiv)
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
            fillChunk(chunkDiv, fromIdx, rows);

            // Create a new chunk to receive the next batch
            if (rows.length > 0)
            {
                createChunk(
                    sectionDiv,
                    fromIdx + rows.length,
                    queryStr
                );
            }
        }
    };

    xhr.send();
}

// Create a chunk of project listings to be populated
function createChunk(sectionDiv, fromIdx, queryStr)
{
    //console.log('creating chunk, from', fromIdx);

    // Create a div for this chunk
    var chunkDiv = document.createElement('div');
    sectionDiv.appendChild(chunkDiv);

    function visCheck()
    {
        var rect = chunkDiv.getBoundingClientRect();
        var elemTop = rect.top;

        // If the top of the chunk is almost visible
        if (elemTop < window.innerHeight + 400)
        {
            // Populate the chunk
            populate(
                sectionDiv,
                fromIdx,
                queryStr,
                chunkDiv
            );

            window.removeEventListener("scroll", visCheck);
        }
    }

    window.addEventListener("scroll", visCheck);
    visCheck();
}

// Create the first chunk for the featured and latest project sections
createChunk(featuredDiv, 0, '?featured=1');
createChunk(latestDiv, 0, '');
