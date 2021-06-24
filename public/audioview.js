import * as model from './model.js';
import { compile } from './compiler.js';

export class AudioView
{
    constructor(model)
    {
        this.model = model;
        model.addView(this);

        // Web Audio context
        this.audioCtx = null;

        // Background audio thread
        this.audioWorklet = null;

        // Latest compiled unit
        this.unit = null;
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
            this.playAudio();
            return;
        }

        if (action instanceof model.Stop)
        {
            this.stopAudio();
            return;
        }

        if (action instanceof model.SetParam)
        {
            // TODO
            return;
        }

        // Compile a new unit from the project state
        this.unit = compile(state);

        if (this.audioWorklet)
        {
            this.audioWorklet.port.postMessage({
                type: 'NEW_UNIT',
                unit: this.unit
            });
        }
    }

    /** Start audio playback */
    async playAudio()
    {
        if (!this.audioCtx)
        {
            this.audioCtx = new AudioContext({
                latencyHint: 'interactive',
                sampleRate: 44100
            });

            await this.audioCtx.audioWorklet.addModule('audioworklet.js');
        }

        this.audioWorklet = new AudioWorkletNode(
            this.audioCtx,
            'sample-generator',
            { outputChannelCount: [2] }
        );
        this.audioWorklet.connect(this.audioCtx.destination);

        this.audioWorklet.port.postMessage({
            type: 'NEW_UNIT',
            unit: this.unit
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

    setParam(nodeId, value)
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
