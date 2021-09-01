var browseDiv = document.getElementById('browse_div');

// Project ids received while browsing
var projectIds = {};

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

                // Keep track of received ids
                projectIds[projectId] = true;

                var rowDiv = document.createElement('div');

                // Link to the project
                rowDiv.appendChild(document.createTextNode(projectId + '. '));
                var link = document.createElement('a');
                link.href = '../#' + projectId;
                link.target = '_blank';
                link.appendChild(document.createTextNode(row.title));
                rowDiv.appendChild(link);

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

createChunk(0);
