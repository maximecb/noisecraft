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

    // Update the audio view
    update(newState, action)
    {
        // TODO
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
