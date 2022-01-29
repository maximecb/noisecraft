import { assert } from './utils.js';
import { Dialog } from './dialog.js';
import * as model from './model.js';

let btnLogin = document.getElementById('btn_login');
let btnUser = document.getElementById('btn_user');

/**
 * Log the user out
 */
export function logout()
{
    localStorage.removeItem('session');

    btnLogin.style.display = 'block';
    btnUser.style.display = 'none';
}

/**
 * Get the user id and session id or make the user log in
 */
export async function login()
{
    var session = localStorage.getItem('session');

    if (session)
    {
        return JSON.parse(session);
    }

    // Prompt the user for user name and password
    session = await loginForm();

    console.log('username:', session.username);
    console.log('userId:', session.userId);
    console.log('sessionId:', session.sessionId);
    console.log('access:', session.access);
    session.admin = (session.access == 'admin');

    // Store logged in user info
    localStorage.setItem('session', JSON.stringify(session));

    // Show the logged in username
    showLogin();

    return session;
}

/**
 * Get the current session information without opening a login popup
 */
export function getSessionInfo()
{
    var sessionJson = localStorage.getItem('session');

    if (!sessionJson)
    {
        return null;
    }

    let session = JSON.parse(sessionJson);
    return session;
}

/**
 * Check if currently logged in as admin, but don't open a login popup
 */
export function isAdmin()
{
    if (isAdmin.admin !== undefined)
    {
        return isAdmin.admin;
    }

    var sessionJson = localStorage.getItem('session');

    if (!sessionJson)
    {
        return false;
    }

    let session = JSON.parse(sessionJson);

    // Cache the result to avoid repeated JSON parsing
    isAdmin.admin = session.admin;

    return session.admin;
}

/**
 * Send a login request to the server
 */
async function loginRequest(username, password)
{
    return new Promise((resolve, reject) => {
        let json = JSON.stringify({
            username: username,
            password: password,
        });

        var xhr = new XMLHttpRequest()
        xhr.open("POST", 'login', true);
        xhr.setRequestHeader("Content-Type", "application/json");

        // Request response handler
        xhr.onreadystatechange = function()
        {
            if (this.readyState == 4 && this.status == 200)
            {
                var resp = JSON.parse(this.responseText);
                resolve(resp);
            }

            if (this.readyState == 4 && this.status == 400)
            {
                reject();
            }
        };

        xhr.send(json);
    });
}

/**
Display the login/register form
Produces the username and password
*/
async function loginForm()
{
    var dialog = new Dialog('Log In');

    var regLink = document.createElement('a');
    regLink.className = 'form_link';
    regLink.textContent = 'Register / Create New Account';
    dialog.appendChild(regLink);

    var paramDiv = document.createElement('div');
    paramDiv.className = 'form_div';
    let nameElem = document.createElement('input');
    nameElem.type = 'text';
    nameElem.size = 16;
    nameElem.maxLength = 16;
    paramDiv.appendChild(document.createTextNode('Username '));
    paramDiv.appendChild(nameElem);
    dialog.appendChild(paramDiv);

    var paramDiv = document.createElement('div');
    paramDiv.className = 'form_div';
    let passElem = document.createElement('input');
    passElem.type = 'password';
    passElem.size = 16;
    passElem.maxLength = 16;
    paramDiv.appendChild(document.createTextNode('Password '));
    paramDiv.appendChild(passElem);
    dialog.appendChild(paramDiv);

    var loginBtn = document.createElement('button');
    loginBtn.className = 'form_btn';
    loginBtn.appendChild(document.createTextNode('Log in'));
    dialog.appendChild(loginBtn);

    return new Promise((resolve, reject) => {
        regLink.onclick = async function ()
        {
            dialog.close();

            let [username, password] = await register();

            try
            {
                // Send a login request to the server
                let session = await loginRequest(username, password);

                dialog.close();
                resolve(session);
            }
            catch (e)
            {
                dialog.showError('Login failed');
                reject();
            }
        }

        loginBtn.onclick = async function ()
        {
            let username = nameElem.value;
            let password = passElem.value;

            try
            {
                // Send a login request to the server
                let session = await loginRequest(username, password);

                dialog.close();
                resolve(session);
            }
            catch (e)
            {
                dialog.showError('Login failed');
                return;
            }
        }

        dialog.on('enter', loginBtn.onclick);
    });
}

/**
Get the user id and session id or make the user log in
Returns a promise that produces the username and password
*/
export async function register()
{
    let [username, password, email] = await registerForm();

    // Send a register request to the server
    let result = await registerRequest(username, password, email);

    return [username, password];
}

/**
Send a register request to the server
*/
async function registerRequest(username, password, email)
{
    return new Promise((resolve, reject) => {
        let json = JSON.stringify({
            username: username,
            password: password,
            email: email,
        });

        var xhr = new XMLHttpRequest()
        xhr.open("POST", 'register', true);
        xhr.setRequestHeader("Content-Type", "application/json");

        // Request response handler
        xhr.onreadystatechange = function()
        {
            if (this.readyState == 4 && this.status == 200)
            {
                var resp = JSON.parse(this.responseText);
                resolve(true);
            }

            if (this.readyState == 4 && this.status == 400)
            {
                reject();
            }
        };

        xhr.send(json);
    });
}

/**
Display the register form
Returns a promise that produces the username, password and e-mail
*/
async function registerForm()
{
    var dialog = new Dialog('Create New Account');

    var paramDiv = document.createElement('div');
    paramDiv.className = 'form_div';
    let nameElem = document.createElement('input');
    nameElem.type = 'text';
    nameElem.size = model.MAX_USERNAME_LENGTH;
    nameElem.maxLength = model.MAX_USERNAME_LENGTH;
    paramDiv.appendChild(document.createTextNode('Username '));
    paramDiv.appendChild(nameElem);
    dialog.appendChild(paramDiv);

    var paramDiv = document.createElement('div');
    paramDiv.className = 'form_div';
    let passElem = document.createElement('input');
    passElem.type = 'password';
    passElem.size = 16;
    passElem.maxLength = 16;
    paramDiv.appendChild(document.createTextNode('Password '));
    paramDiv.appendChild(passElem);
    dialog.appendChild(paramDiv);

    var paramDiv = document.createElement('div');
    paramDiv.className = 'form_div';
    let passElem2 = document.createElement('input');
    passElem2.type = 'password';
    passElem2.size = 16;
    passElem2.maxLength = 16;
    paramDiv.appendChild(document.createTextNode('Confirm password '));
    paramDiv.appendChild(passElem2);
    dialog.appendChild(paramDiv);

    var paramDiv = document.createElement('div');
    paramDiv.className = 'form_div';
    let emailElem = document.createElement('input');
    emailElem.type = 'text';
    emailElem.size = 30;
    emailElem.maxLength = 32;
    paramDiv.appendChild(document.createTextNode('E-mail (optional) '));
    paramDiv.appendChild(emailElem);
    dialog.appendChild(paramDiv);

    var registerBtn = document.createElement('button');
    registerBtn.className = 'form_btn';
    registerBtn.appendChild(document.createTextNode('Register'));
    dialog.appendChild(registerBtn);

    nameElem.onchange = function ()
    {
        let name = nameElem.value;

        try
        {
            model.validateUserName(name);
        }
        catch (e)
        {
            dialog.showError(e.message);
            registerBtn.disabled = true;
            return;
        }

        dialog.hideError();
        registerBtn.disabled = false;
    }

    passElem2.onchange = function ()
    {
        let password = passElem.value;
        let password2 = passElem2.value;

        if (password != password2)
        {
            dialog.showError('Passwords do not match');
            registerBtn.disabled = true;
            return;
        }

        if (password.length < 6)
        {
            dialog.showError('Password must be at least 6 characters');
            registerBtn.disabled = true;
            return;
        }

        dialog.hideError();
        registerBtn.disabled = false;
    }

    return new Promise((resolve, reject) => {
        registerBtn.onclick = function ()
        {
            let username = nameElem.value;
            let password = passElem.value;
            let password2 = passElem2.value;
            let email = emailElem.value;

            if (password != password2)
                return;

            dialog.close();
            resolve([username, password, email]);
        }

        dialog.on('enter', registerBtn.onclick);
    });
}

/// Show the currently logged in user
function showLogin()
{
    /// User id and session id from current session
    let session = localStorage.getItem('session');

    if (!session)
        return;

    session = JSON.parse(session);

    btnLogin.style.display = 'none';
    btnUser.style.display = 'block';
    btnUser.textContent = session.username + (session.admin? ' ★':'');
}

// If we're on a page with a login button
if (btnLogin)
{
    btnLogin.onclick = login;
    btnUser.onclick = logout;

    // TODO: send request to server to validate session id still valid?

    // Show logged in user on startup
    showLogin();
}
