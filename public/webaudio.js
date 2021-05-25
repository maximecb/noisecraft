let audioCtx = null;

let audioWorklet = null;

/**
Start audio playback
*/
export async function playAudio(unit)
{
    if (!audioCtx)
    {
        audioCtx = new AudioContext({
            latencyHint: 'interactive',
            sampleRate: 44100
        });

        await audioCtx.audioWorklet.addModule('audioworklet.js');
    }

    audioWorklet = new AudioWorkletNode(audioCtx, 'sample-generator');
    audioWorklet.connect(audioCtx.destination);

    audioWorklet.port.postMessage({
        type: 'NEW_UNIT',
        unit: unit
    });
}

export function setControl(ctrlId, value)
{
    audioWorklet.port.postMessage({
        type: 'CTRL_CHANGE',
        ctrlId: ctrlId,
        value: value
    });
}

/**
Stop audio playback
*/
export function stopAudio()
{
    // Disconnect the worklet
    audioWorklet.disconnect();
    audioWorklet = null;
}
