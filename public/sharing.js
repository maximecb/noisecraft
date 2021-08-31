import { Dialog } from './dialog.js';
import { login } from './session.js';
import { SetTitle } from './model.js';

export async function shareProject(model)
{
    console.log('share project');

    // Have the user login/register first
    let [userId, sessionId] = await login();

    let div = document.createElement('div');
    let dialog = new Dialog('Share Your Creation', div);
    dialog.div.style.width = '500px';

    let text = document.createElement('p');
    text.innerHTML = '' +
    'You can instantly share the project you created with NoiseCraft. ' +
    'One of the main goals of NoiseCraft is to create a community for the ' +
    'free exchange of musical ideas which encourages others to play, edit and ' +
    're-share modified versions of your creations. As such, to share your work ' +
    'on our platform, you must agree to renounce any rights over this work and ' +
    'release it into the ' +
    '<a href="https://en.wikipedia.org/wiki/Public_domain" target=”_blank”>public domain</a>. ';
    div.appendChild(text);

    var paramDiv = document.createElement('div');
    paramDiv.className = 'form_div';
    let titleElem = document.createElement('input');
    titleElem.type = 'text';
    titleElem.size = 50;
    titleElem.maxLength = 50;
    titleElem.value = model.state.title;
    paramDiv.appendChild(document.createTextNode('Project title '));
    paramDiv.appendChild(titleElem);
    div.appendChild(paramDiv);

    var paramDiv = document.createElement('div');
    paramDiv.className = 'form_div';
    let agreeElem = document.createElement('input');
    agreeElem.type = 'checkbox';
    paramDiv.appendChild(agreeElem);
    let boldNode = document.createElement('b');
    boldNode.innerHTML = ' I agree';
    paramDiv.appendChild(boldNode);
    paramDiv.appendChild(document.createTextNode(
        ' to release this work into the public ' +
        'domain and renounce any copyright claims over it.'
    ));
    div.appendChild(paramDiv);

    var shareBtn = document.createElement('button');
    shareBtn.className = 'form_btn';
    shareBtn.appendChild(document.createTextNode('Share'));
    div.appendChild(shareBtn);

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'form_btn';
    cancelBtn.appendChild(document.createTextNode('Cancel'));
    div.appendChild(cancelBtn);
    cancelBtn.onclick = evt => dialog.close();

    // Update the project title when it gets changed in the form
    titleElem.onchange = function ()
    {
        model.update(new SetTitle(titleElem.value));
    }

    shareBtn.onclick = async function ()
    {
        if (!agreeElem.checked)
        {
            dialog.showError('You must agree to release this work into the public domain to share it');
            return;
        }

        try
        {
            // Serialize the project
            let title = model.state.title;
            let data = model.serialize();

            // Send a request to share the project
            let projectId = await shareRequest(userId, sessionId, title, data);
            console.log(`projectId=${projectId}`);

            // Change the current URL to include the project ID
            var url = window.location.href.split('#')[0] + '#' + projectId;
            window.history.replaceState({}, '', url);

            // TODO: we can show the shared project id in another dialog later

            dialog.close();
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
    xhr.open("POST", 'share', true);
    xhr.setRequestHeader("Content-Type", "application/json");

    return new Promise((resolve, reject) => {
        // Request response handler
        xhr.onreadystatechange = function()
        {
            if (this.readyState == 4 && this.status == 200)
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
