//import { materialize } from './audionodes.js';

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

        // Current playback position in seconds
        this.playPos = 0;
    }

    /// Receive messages from the message port
    onmessage(event)
    {
        let msg = event.data;

        switch (msg.type)
        {
            case 'NEW_UNIT':
            let src = msg.unit;
            this.genSample = new Function(
                'time',
                src
            );
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

        // For each sample to generate
        for (let i = 0; i < outChannel0.length; i++)
        {
            this.playPos += 1 / 44100;

            // FIXME: stereo?
            outChannel0[i] = this.genSample(this.playPos);
        }

        return true;
    }
}

registerProcessor('sample-generator', NCAudioWorklet)
