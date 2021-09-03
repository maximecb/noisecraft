import { Eventable } from './eventable.js';

/**
Create a modal dialog popup showing content wrapped in a div
*/
export class Dialog extends Eventable
{
    constructor(title)
    {
        super();

        function bgClick(evt)
        {
            this.close();
            evt.stopPropagation();
        }

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

        function keyHandler(evt)
        {
            this.trigger('keydown', evt.key);

            // Close the dialog when the escape key is pressed
            if (evt.key === "Escape")
                this.close();
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
