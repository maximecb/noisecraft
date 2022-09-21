import { Eventable } from './eventable.js';

class MIDI extends Eventable
{
    constructor()
    {
        super();

        this.midiAccess = null;

        // Try to get MIDI access
        this.getMIDIAccess();
    }

    // Try to get MIDI access from the browser
    async getMIDIAccess()
    {
        // If MIDI is not supported by this browser
        if (!('requestMIDIAccess' in navigator))
            return;

        this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });

        console.log('got MIDI access');

        // For each MIDI input
        for (let input of this.midiAccess.inputs.values())
        {
            if (input.state != "connected")
                continue;

            console.log(input.name);

            input.onmidimessage = this.makeMessageCb(input.id);
        }

        // Detect new devices being connected
        this.midiAccess.onstatechange = (evt) =>
        {
            if (evt.port.type == "input" && evt.port.state == "connected")
            {
                console.log('new device connected:', evt.port.name, evt.port.id);

                evt.port.onmidimessage = this.makeMessageCb(evt.port.id);
            }
        }
    }

    // Create an onmidimessage callback for an input port
    makeMessageCb(deviceId)
    {
        // Callback when a MIDI message is received
        function onMidiMessage(evt)
        {
            var str = '';
            for (var i = 0; i < evt.data.length; i++)
            {
                str += "0x" + evt.data[i].toString(16) + " ";
            }
            console.log(str);

            // Send the device name and the data to callbacks
            this.trigger('midimessage', deviceId, evt.data);
        }

        return onMidiMessage.bind(this);
    }

    // Send a message to all MIDI devices
    broadcast(msg, timestamp)
    {
        if (!midi)
            return;

        for (let output of this.midiAccess.outputs.values())
            output.send(msg, timestamp);
    }
}

export const midi = new MIDI();
