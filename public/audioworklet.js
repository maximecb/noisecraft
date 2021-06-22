import { makeFun } from './compiler.js';

// Great intro to audio worklets:
// https://developers.google.com/web/updates/2017/12/audio-worklet
//
// Mozilla reference:
// https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode

class NCAudioWorklet extends AudioWorkletProcessor
{
    constructor()
    {
        super();

        this.port.onmessage = this.onmessage.bind(this);
    }

    /// Receive messages from the message port
    onmessage(event)
    {
        let msg = event.data;

        switch (msg.type)
        {
            case 'NEW_UNIT':
            //this.unit = msg.unit;
            //this.genSample = makeFun(this.unit);
            break;

            case 'SET_PARAM':
            //let ctrlId = msg.ctrlId;
            //let value = msg.value;
            //this.unit.state[ctrlId] = value;
            break;

            default:
            throw new TypeError('unknown message type');
        }
    }

    process(inputs, outputs, parameters)
    {
        const output = outputs[0];
        const outChannel0 = output[0];

        if (!this.genSample)
            return false;

        for (let i = 0; i < outChannel0.length; i++)
        {
            outChannel0[i] = this.genSample()
        }

        return true;
    }
}

registerProcessor('sample-generator', NCAudioWorklet)
