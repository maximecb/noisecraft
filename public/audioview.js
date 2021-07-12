import { assert } from './utils.js';
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

        if (action instanceof model.MoveNodes ||
            action instanceof model.SetNodeName)
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
            this.send({
                type: 'SET_PARAM',
                nodeId: action.nodeId,
                paramName: action.paramName,
                value: action.value
            });

            return;
        }

        if (action instanceof model.ToggleCell)
        {
            this.send({
                type: 'SET_CELL',
                nodeId: action.nodeId,
                patIdx: action.patIdx,
                stepIdx: action.stepIdx,
                rowIdx: action.rowIdx,
                value: action.value
            });

            return;
        }

        // Compile a new unit from the project state
        this.unit = compile(state);

        this.send({
            type: 'NEW_UNIT',
            unit: this.unit
        });
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

        this.audioWorklet.port.postMessage({
            type: 'NEW_UNIT',
            unit: this.unit
        });

        this.audioWorklet.connect(this.audioCtx.destination);
    }

    /**
     * Stop audio playback
     */
    stopAudio()
    {
        if (!this.audioWorklet)
            return;

        // Disconnect the worklet
        this.audioWorklet.disconnect();
        this.audioWorklet = null;
    }

    /**
     * Send a message to the audio thread (audio worket)
     */
    send(msg)
    {
        assert (msg instanceof Object);

        if (!this.audioWorklet)
            return;

        this.audioWorklet.port.postMessage(msg);
    }
}
