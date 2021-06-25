export class Eventable
{
    constructor()
    {
        this._events = {};
    }

    on(eventName, handler)
    {
        if (!this._events[eventName])
        {
            this._events[eventName] = [];
        }

        this._events[eventName].push(handler);
    }

    trigger(eventName, ...eventArgs)
    {
        let handlers = this._events[eventName] || [];

        for (let i = 0; i < handlers.length; i++)
        {
            handlers[i].apply(null, eventArgs);
        }
    }
}