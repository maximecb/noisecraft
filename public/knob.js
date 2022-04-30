import { assert } from './utils.js';
import { Eventable } from './eventable.js';
import { Dialog } from './dialog.js';
import { midi } from './midi.js';

/**
 * Reusable knob control component
 * */
export class Knob extends Eventable
{
    constructor(minVal, maxVal, value, deviceId, controlId)
    {
        super();

        this.minVal = minVal;
        this.maxVal = maxVal;
        this.value = value;

        // Div containing the whole knob
        this.div = document.createElement('div');
        this.div.style['padding'] = '4px';
        this.div.style['text-align'] = 'center';

        // Canvas to draw the rotating part of the knob
        var canvas = document.createElement('canvas');
        canvas.width = 30;
        canvas.height = 30;
        this.ctx = canvas.getContext('2d');
        this.ctx.width = canvas.width;
        this.ctx.height = canvas.height;
        this.div.appendChild(canvas);

        // Div to display the knob's current value
        this.valDiv = document.createElement('div');
        this.valDiv.style['font-size'] = '12px';
        this.valDiv.style.color = '#BBB';
        this.valDiv.appendChild(document.createTextNode('1.00'));
        this.div.appendChild(this.valDiv);

        // Current knob state
        let knobMoving = false;
        let lastY = null;

        // Last time the knob was clicked
        let lastClickTime = 0;

        function onPointerDown(evt)
        {
            // Double-clicking triggers the bind MIDI dialog
            // This hack is necessary because we block mouse events
            // while the knob is being moved
            let curTime = Date.now();
            if (curTime - lastClickTime < 400)
            {
                this.midiDialog();
            }
            lastClickTime = curTime;

            if (knobMoving)
                return;

            evt.stopPropagation();

            knobMoving = true;
            lastY = evt.screenY;

            // Make it so we receive all pointer events until the knob is done moving
            document.body.style['pointer-events'] = 'none';
            this.pointerUpListener = onPointerUp.bind(this);
            this.pointerMoveListener = onPointerMove.bind(this);
            window.addEventListener('pointerup', this.pointerUpListener);
            window.addEventListener('pointermove', this.pointerMoveListener);
        }

        function onPointerUp(evt)
        {
            if (!knobMoving)
                return;

            evt.stopPropagation();

            knobMoving = false;

            // Undo pointer event capture
            document.body.style['pointer-events'] = 'auto';
            window.removeEventListener('pointerup', this.pointerUpListener);
            window.removeEventListener('pointermove', this.pointerMoveListener);
        }

        function onPointerMove(evt)
        {
            if (!knobMoving)
                return;

            // Map the current value in [0, 1]
            let normVal = this.getNormVal();

            // Normally we would use evt.movementY, but we
            // avoid this because of a bug in Safari
            let deltaY = -(evt.screenY - lastY)
            lastY = evt.screenY

            let scaleY = 1 / 100;

            // If the shift key is down, fine-tune mode
            if (evt.shiftKey)
                scaleY /= 5;

            // Update the control value
            normVal += deltaY * scaleY;
            normVal = Math.min(normVal, 1);
            normVal = Math.max(normVal, 0);
            this.setNormVal(normVal);
        }

        /*
        function onDoubleClick(evt)
        {
            evt.stopPropagation();
            this.midiDialog();
        }
        */

        this.div.onpointerdown = onPointerDown.bind(this);
        //this.div.ondblclick = onDoubleClick.bind(this);

        // Bind the controller to MIDI
        if (deviceId)
        {
            this.bindMidi(deviceId, controlId);
        }

        // Rotate the knob to its initial position
        this.drawKnob();
    }

    /**
     * Release resources acquired by this knob
     */
    destroy()
    {
        // Remove the MIDI event listener
        if (this.listener)
        {
            midi.removeListener('midimessage', this.listener);
        }

        if (this.pointerMoveListener)
        {
            document.body.style['pointer-events'] = 'auto';
            window.removeEventListener('pointerup', this.pointerUpListener);
            window.removeEventListener('pointermove', this.pointerMoveListener);
        }
    }

    /**
     * Compute the normalized value of this knob, in the [0,1] range
     * */
    getNormVal()
    {
        var value = this.value;
        var minVal = this.minVal;
        var maxVal = this.maxVal;

        if (minVal == maxVal)
            return minVal;

        return (value - minVal) / (maxVal - minVal);
    }

    /**
     * Set the normalized value of this knob (in the [0,1] range)
     * */
    setNormVal(normVal)
    {
        // Map the new value to its actual range
        this.value = this.minVal + normVal * (this.maxVal - this.minVal);

        // Rotate the knob to its new position
        this.drawKnob();

        // Call the change event callbacks
        this.trigger('change', this.value);
    }

    /**
     * Draw the knob at its current position
     * */
    drawKnob()
    {
        // Map the current value in [0, 1]
        var value = this.value;
        var minVal = this.minVal;
        var maxVal = this.maxVal;
        var normVal = (value - minVal) / (maxVal - minVal);

        // Map the value to a knob angle
        var drawAngle = -140 + 280 * normVal;

        var ctx = this.ctx;
        var centerX = ctx.width / 2;
        var centerY = ctx.height / 2;
        var radius = ctx.width * 0.4;

        ctx.clearRect(0, 0, ctx.width, ctx.height);

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(drawAngle * Math.PI/180);

        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, 2 * Math.PI, false);
        ctx.fillStyle = '#555';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -radius);
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        ctx.restore();

        let max = Math.max(Math.abs(minVal), Math.abs(maxVal))
        let log10 = Math.floor(Math.log10(max));
        let numDecs = Math.max(0, 2 - Math.max(0, log10));
        let valStr = value.toFixed(numDecs);

        if (minVal < 0 && value >= 0)
            valStr = '+' + valStr;

        this.valDiv.textContent = valStr;
    }

    /**
     * Create a dialog to bind this knob to a MIDI control number
     * */
    midiDialog()
    {
        console.log('bind MIDI');

        var dialog = new Dialog('MIDI Control Mapping');

        dialog.appendChild(document.createTextNode(
            'Move a knob or fader on your MIDI controller to map the ' +
            'control to this knob. Note that the MIDI controller should ' +
            'be connected before NoiseCraft is loaded. Press escape to unmap ' +
            'the knob.'
        ));

        let knob = this;

        function map(deviceId, msg)
        {
            var msgType = msg[0] & 0xF0;

            // MIDI control change
            if (msgType == 0xB0 && msg.length == 3)
            {
                let cc = msg[1];
                knob.bindMidi(deviceId, cc, true);
                dialog.close();
            }

            // MIDI pitch bend
            if (msgType == 0xE0 && msg.length == 3)
            {
                knob.bindMidi(deviceId, 'pitch_bend', true);
                dialog.close();
            }
        }

        // When the user closes the dialog without binding
        function abort()
        {
            // Undo the current MIDI binding
            knob.bindMidi(null, null, true);
        }

        // When the dialog is closed for any reason
        function close()
        {
            midi.removeListener('midimessage', map);
        }

        midi.on('midimessage', map);
        dialog.on('userclose', abort);
        dialog.on('close', close);
    }

    /**
     * Bind this knob to a MIDI control
     * */
    bindMidi(deviceId, controlId, notify)
    {
        function onMidiMessage(deviceId, msg)
        {
            if (deviceId != this.deviceId)
                return;

            var msgType = msg[0] & 0xF0;

            // MIDI control change
            if (msgType == 0xB0 && msg.length == 3)
            {
                let cc = msg[1];
                let val = msg[2]

                // Only respond to a specific controller
                if (cc != this.controlId)
                    return;

                let normVal = val / 127;
                this.setNormVal(normVal);
            }

            // MIDI pitch bend
            if (msgType == 0xE0 && msg.length == 3)
            {
                // Only respond if bound to pitch bend
                if (this.controlId != 'pitch_bend')
                    return;

                let lsb = msg[1];
                let msb = msg[2];
                let val = (msb << 7) | lsb;
                let normVal = val / 16383;
                this.setNormVal(normVal);
            }
        }

        if (this.listener)
        {
            midi.removeListener('midimessage', this.listener);
            this.listener = null;
        }

        if (deviceId !== null && controlId !== null)
        {
            this.listener = onMidiMessage.bind(this);
            midi.on('midimessage', this.listener);
        }

        // Check if the MIDI binding has changed
        let changed = (deviceId != this.deviceId || controlId != this.controlId);

        // Update the binding parameters
        this.deviceId = deviceId;
        this.controlId = controlId;

        // Call the MIDI bind callbacks
        if (changed && notify)
        {
            this.trigger('bindmidi', deviceId, controlId);
        }
    }
}
