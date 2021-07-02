import { Eventable } from './eventable.js';

/**
Create a modal dialog popup showing content wrapped in a div
*/
export class Dialog extends Eventable
{
    constructor(title, div)
    {
        super();

        function bgClick(evt)
        {
            this.close();
            evt.stopPropagation();
        }

        this.div = document.createElement('div');
        this.div.className = 'dialog';
        let titleDiv = document.createElement('div');
        titleDiv.className = 'dialog_title';
        titleDiv.appendChild(document.createTextNode(title));
        this.div.appendChild(titleDiv);
        this.div.appendChild(div);

        // Used to detect/prevent clicks outside dialog
        this.bgDiv = document.createElement('div');
        this.bgDiv.className = 'dark_overlay';
        this.bgDiv.onclick = bgClick.bind(this);

        var body = document.getElementsByTagName("body")[0];
        body.appendChild(this.div);
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
     * Close the dialog window
     */
    close()
    {
        var body = document.getElementsByTagName("body")[0];

        if (!body.contains(this.div))
            return;

        body.removeChild(this.div);
        body.removeChild(this.bgDiv);
        body.removeEventListener('keydown', this.keyHandler);

        this.trigger('close');
    }
}
