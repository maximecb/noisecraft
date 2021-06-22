import * as model from './model.js';
import { compile } from './compiler.js';

export class AudioView
{
    constructor(model)
    {
        this.model = model;
        model.addView(this);

        this.audioCtx = null;

        this.audioWorklet = null;
    }

    /** Update the audio view */
    update(state, action)
    {
        console.log('audio view update');

        if (action instanceof model.MoveNodes)
        {
            return;
        }

        if (action instanceof model.Play)
        {
            return;
        }

        if (action instanceof model.Stop)
        {
            this.stopAudio();
            return;
        }





    }

    /** Start audio playback */
    async playAudio(unit)
    {
        if (!this.audioCtx)
        {
            this.audioCtx = new AudioContext({
                latencyHint: 'interactive',
                sampleRate: 44100
            });

            await this.audioCtx.audioWorklet.addModule('audioworklet.js');
        }

        this.audioWorklet = new AudioWorkletNode(this.audioCtx, 'sample-generator');
        this.audioWorklet.connect(this.audioCtx.destination);

        this.audioWorklet.port.postMessage({
            type: 'NEW_UNIT',
            unit: unit
        });
    }

    /** Stop audio playback */
    stopAudio()
    {
        if (!this.audioWorklet)
            return;

        // Disconnect the worklet
        this.audioWorklet.disconnect();
        this.audioWorklet = null;
    }

    setParam(ctrlId, value)
    {
        if (!this.audioWorklet)
            return;

        /*
        audioWorklet.port.postMessage({
            type: 'SET_PARAM',
            ctrlId: ctrlId,
            value: value
        });
        */
    }
}
