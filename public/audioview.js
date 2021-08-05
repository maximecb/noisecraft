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
        if (action instanceof model.MoveNodes ||
            action instanceof model.SetNodeName ||
            action instanceof model.SetCurStep ||
            action instanceof model.SetPattern)
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

        if (action instanceof model.QueuePattern)
        {
            let node = state.nodes[action.nodeId];

            this.send({
                type: 'QUEUE_PATTERN',
                nodeId: action.nodeId,
                patIdx: action.patIdx,
                patData: node.patterns[action.patIdx]
            });

            return;
        }

        console.log('recompile unit');

        // Compile a new unit from the project state
        this.unit = compile(state);

        this.send({
            type: 'NEW_UNIT',
            unit: this.unit
        });
    }

    /**
     * Start audio playback
     */
    async playAudio()
    {
        assert (!this.audioCtx);

        this.audioCtx = new AudioContext({
            latencyHint: 'interactive',
            sampleRate: 44100
        });

        await this.audioCtx.audioWorklet.addModule('audioworklet.js');

        this.audioWorklet = new AudioWorkletNode(
            this.audioCtx,
            'sample-generator',
            { outputChannelCount: [2] }
        );

        // Callback to receive messages from the audioworklet
        this.audioWorklet.port.onmessage = this.onmessage.bind(this);

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
        assert (this.audioCtx);

        this.audioWorklet.disconnect();
        this.audioWorklet = null;

        this.audioCtx.close();
        this.audioCtx = null;
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

    /**
     * Receive a message fro the audio thread (audio worklet)
     */
    onmessage(event)
    {
        let msg = event.data;

        switch (msg.type)
        {
            case 'SET_CUR_STEP':
            this.model.update(new model.SetCurStep(msg.nodeId, msg.stepIdx));
            break;
        }
    }
}
