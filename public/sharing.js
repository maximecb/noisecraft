import { Dialog } from './dialog.js';
import { login } from './session.js';
import { SetTitle, MAX_TITLE_LENGTH } from './model.js';

export async function shareProject(model)
{
    console.log('share project');

    // Have the user login/register first
    let {userId, sessionId} = await login();

    let dialog = new Dialog('Share Your Project');
    dialog.wrapperDiv.style.width = '500px';

    dialog.paragraph(
        'One of the main goals of NoiseCraft is to create a community for the ' +
        'free exchange of musical ideas which encourages others to play, edit, remix and ' +
        're-share modified versions of your creations. Our hope to create a fertile ground ' +
        'for musical creativity and the exchange of knowledge.'
    );

    dialog.paragraph(
        'All of the projects shared on the NoiseCraft platform are available under the ' +
        'Creative Commons CC0 license, ' +
        'In order to share your project on this platform, you must agree ' +
        'to make it available under the ' +
        '<a href="https://creativecommons.org/publicdomain/zero/1.0/" target=”_blank”>' +
        'Creative Commons CC0 license</a>, ' +
        'which means you agree to renounce any rights or copyright claim over it, ' +
        'and effectively release it into the public domain. ' +
        'We also ask that you please not share copyrighted materials.'
    );

    var paramDiv = document.createElement('div');
    paramDiv.className = 'form_div';
    let titleElem = document.createElement('input');
    titleElem.type = 'text';
    titleElem.size = MAX_TITLE_LENGTH;
    titleElem.maxLength = MAX_TITLE_LENGTH;
    titleElem.value = model.state.title;
    paramDiv.appendChild(document.createTextNode('Project title '));
    paramDiv.appendChild(titleElem);
    dialog.appendChild(paramDiv);

    var paramDiv = document.createElement('div');
    paramDiv.className = 'form_div';
    let agreeElem = document.createElement('input');
    agreeElem.type = 'checkbox';
    paramDiv.appendChild(agreeElem);
    let agreeText = document.createElement('span');
    agreeText.innerHTML = (
        ' <b>I agree</b> to make this work publicly available under the terms of the Creative Commons CC0 license.'
    );
    paramDiv.appendChild(agreeText);
    dialog.appendChild(paramDiv);

    var shareBtn = document.createElement('button');
    shareBtn.className = 'form_btn';
    shareBtn.appendChild(document.createTextNode('Share'));
    dialog.appendChild(shareBtn);

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'form_btn';
    cancelBtn.appendChild(document.createTextNode('Cancel'));
    cancelBtn.onclick = evt => dialog.close();
    dialog.appendChild(cancelBtn);

    // Update the project title when it gets changed in the form
    titleElem.onchange = function ()
    {
        model.update(new SetTitle(titleElem.value));
    }

    shareBtn.onclick = async function ()
    {
        let title = model.state.title;

        if (!title || title == "New Project")
        {
            dialog.showError('Choose a title for your project');
            return;
        }

        if (!agreeElem.checked)
        {
            dialog.showError('You must agree to release this work into the public domain to share it');
            return;
        }

        try
        {
            // Serialize the project
            let data = model.serialize();

            // Send a request to share the project
            let projectId = await shareRequest(userId, sessionId, title, data);
            console.log(`projectId=${projectId}`);

            // Close this dialog
            dialog.close();

            // Show the shared project URL
            showURL(projectId);
        }
        catch (e)
        {
            console.log(e);
            dialog.showError('Failed to share project');
        }
    }
}

/**
Send a login request to the server
*/
async function shareRequest(userId, sessionId, title, data)
{
    var request = {
        userId: userId,
        sessionId: sessionId,
        title: title,
        data: data,
    };

    var json = JSON.stringify(request);

    var xhr = new XMLHttpRequest()
    xhr.open("POST", 'projects', true);
    xhr.setRequestHeader("Content-Type", "application/json");

    return new Promise((resolve, reject) => {
        // Request response handler
        xhr.onreadystatechange = function()
        {
            if (this.readyState == 4 && this.status == 201)
            {
                var resp = JSON.parse(this.responseText);
                resolve(resp.projectId);
            }

            if (this.readyState == 4 && this.status == 400)
            {
                reject('server rejected share request');
            }
        };

        xhr.send(json);
    });
}

/**
 * Show the URL for a project that was just shared
 */
function showURL(projectId)
{
    let dialog = new Dialog('Sharing Successful');

    let text = document.createElement('p');
    text.innerHTML = 'Your project is now available at the following URL:';
    dialog.appendChild(text);

    let url = window.location.origin + '/' + projectId;

    // Change the current URL to include the project ID
    window.history.replaceState({}, '', url);

    var urlDiv = document.createElement('div');
    urlDiv.className = 'form_div';
    let urlElem = document.createElement('input');
    urlElem.type = 'text';
    urlElem.size = 35;
    urlElem.value = url;
    urlDiv.appendChild(urlElem);
    dialog.appendChild(urlDiv);

    var okBtn = document.createElement('button');
    okBtn.className = 'form_btn';
    okBtn.appendChild(document.createTextNode('OK'));
    okBtn.onclick = evt => dialog.close();
    dialog.appendChild(okBtn);
}

/**
 * Download a project with a given id
 */
export async function getProject(projectId)
{
    var url = '/projects/' + projectId;

    var xhr = new XMLHttpRequest()
    xhr.open("GET", url, true);
    xhr.setRequestHeader("Content-Type", "application/json");

    return new Promise((resolve, reject) => {
        // Request response handler
        xhr.onreadystatechange = function()
        {
            if (this.readyState == 4 && this.status == 200)
            {
                var resp = JSON.parse(this.responseText);
                resolve(resp.data);
            }

            if (this.readyState == 4 && this.status == 400)
            {
                reject('could not download project data');
            }
        };

        xhr.send();
    });
}
