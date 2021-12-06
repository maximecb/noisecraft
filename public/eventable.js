import { assert } from './utils.js';

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

        let handlers = this._events[eventName];
        assert (handlers.indexOf(handler) == -1);
        handlers.push(handler);
    }

    removeListener(eventName, handler)
    {
        let handlers = this._events[eventName];
        let idx = handlers.indexOf(handler);

        if (idx != -1)
        {
            handlers.splice(idx, 1);
            //console.log('spliced listener', handler.name)
            //console.log('handlers.length=', handlers.length)
        }
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
