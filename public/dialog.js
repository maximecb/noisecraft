import { Eventable } from './eventable.js';

/**
Create a modal dialog popup showing content wrapped in a div
*/
export class Dialog extends Eventable
{
    constructor(title)
    {
        super();

        // Div that wraps the dialog
        this.wrapperDiv = document.createElement('div');
        this.wrapperDiv.className = 'dialog';

        // Form title
        let titleDiv = document.createElement('div');
        titleDiv.className = 'dialog_title';
        titleDiv.appendChild(document.createTextNode(title));
        this.wrapperDiv.appendChild(titleDiv);

        // Div to host the dialog contents (text, inputs, buttons, etc).
        this.div = document.createElement('div');
        this.wrapperDiv.appendChild(this.div);

        // Form validation error message (hidden by default)
        this.errorDiv = document.createElement('div');
        this.errorDiv.className = 'form_error';
        this.wrapperDiv.appendChild(this.errorDiv);

        // Used to detect/prevent clicks outside dialog
        this.bgDiv = document.createElement('div');
        this.bgDiv.className = 'dark_overlay';
        this.bgDiv.onclick = bgClick.bind(this);

        // Add the form to the document
        var body = document.getElementsByTagName("body")[0];
        body.appendChild(this.wrapperDiv);
        body.appendChild(this.bgDiv);

        function bgClick(evt)
        {
            this.trigger('userclose');
            this.close();
            evt.stopPropagation();
        }

        function keyHandler(evt)
        {
            this.trigger('keydown', evt.key);

            // Trigger a special handler for the enter key
            if (evt.key === "Enter")
            {
                this.trigger('enter');
            }

            // Close the dialog when the escape key is pressed
            if (evt.key === "Escape")
            {
                this.trigger('userclose');
                this.close();
            }
        }

        this.keyHandler = keyHandler.bind(this);
        body.addEventListener('keydown', this.keyHandler);
    }

    /**
     * Shorthand method to add elements to the dialog contents
     */
    appendChild(node)
    {
        this.div.appendChild(node);
    }

    /**
     * Append a new paragraph
     */
    paragraph(html)
    {
        let text = document.createElement('p');
        text.innerHTML = html;
        this.appendChild(text);
    }

    // TODO: method to create a named button with the right styling

    /**
     * Show an error message (e.g. for form validation)
     */
    showError(msg)
    {
        this.errorDiv.textContent = msg;
        this.errorDiv.style.display = 'block';
    }

    /**
     * Hide the form error message
     */
    hideError()
    {
        this.errorDiv.style.display = 'none';
    }

    /**
     * Close the dialog window
     */
    close()
    {
        var body = document.getElementsByTagName("body")[0];

        if (!body.contains(this.wrapperDiv))
            return;

        body.removeChild(this.wrapperDiv);
        body.removeChild(this.bgDiv);
        body.removeEventListener('keydown', this.keyHandler);

        this.trigger('close');
    }
}

/**
 * Show a dialog with an error message and an Ok button
 */
export function errorDialog(message)
{
    let dialog = new Dialog('Error');

    dialog.paragraph(message);

    let saveBtn = document.createElement('button');
    saveBtn.textContent = 'Ok';
    saveBtn.className = 'form_btn';
    saveBtn.onclick = () => dialog.close();
    dialog.appendChild(saveBtn);

    return dialog;
}
