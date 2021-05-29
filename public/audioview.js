// TODO: import the compiler

export class AudioView
{
    constructor(model)
    {
        this.model = model;
        model.addView(this);

        this.audioCtx = null;

        this.audioWorklet = null;
    }

    // Apply an action to the view
    apply(action)
    {
        // TODO: the audio view can use this.model.getState()
        // to recompile the graph when necessary

        switch (action.action)
        {
            case 'create_node':
            //this.createNode(action.state);
            break;

            default:
            throw TypeError(`unknown action received by audio view ${action.action}`);
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
        // Disconnect the worklet
        this.audioWorklet.disconnect();
        this.audioWorklet = null;
    }

    // TODO: interface with audio worklet
    /*
    setControl(ctrlId, value)
    {
        audioWorklet.port.postMessage({
            type: 'CTRL_CHANGE',
            ctrlId: ctrlId,
            value: value
        });
    }
    */
}
