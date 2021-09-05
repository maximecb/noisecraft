import { assert, isPosInt } from './utils.js';
import { NODE_SCHEMA } from './model.js';
import * as synth from './synth.js';
import * as music from './music.js';

/**
 * Stateful graph that generates audio samples
 */
export class AudioGraph
{
    constructor(sampleRate, send)
    {
        assert (sampleRate == 44100);
        this.sampleRate = sampleRate;

        // Current playback position in seconds
        this.playPos = 0;

        // Compiled code to generate audio samples
        this._genSample = null;

        // Method to send messages to the main thread
        this.send = send;

        // Stateful audio processing nodes, indexed by nodeId
        this.nodes = [];
    }

    /**
     * Update the audio graph given a new compiled unit
     */
    newUnit(unit)
    {
        // Note that we don't delete any nodes, even if existing nodes are
        // currently not listed in the compiled unit, because currently
        // disconnected nodes may get reconnected, and deleting things like
        // delay lines would lose their current state.
        // All nodes get garbage collected when the playback is stopped.

        // For each audio node
        for (let nodeId in unit.nodes)
        {
            let nodeState = unit.nodes[nodeId];

            let nodeClass = (
                nodeState.type in NODE_CLASSES?
                NODE_CLASSES[nodeState.type]:
                AudioNode
            );

            // If a node with this nodeId is already mapped
            if (this.nodes[nodeId])
            {
                let node = this.nodes[nodeId];

                // The existing node must have the same type
                assert (node instanceof nodeClass);

                // Update the node's state
                node.setState(nodeState);
            }
            else
            {
                // Create a new audio node
                this.nodes[nodeId] = new nodeClass(
                    nodeId,
                    nodeState,
                    this.sampleRate,
                    this.send
                );
            }
        }

        // Create the sample generation function
        this._genSample = new Function(
            'time',
            'nodes',
            unit.src
        );
    }

    /**
     * Set a parameter value on a given node
     */
    setParam(nodeId, paramName, value)
    {
        assert (nodeId in this.nodes);
        let node = this.nodes[nodeId];
        assert (paramName in node.params);
        node.params[paramName] = value;
    }

    /**
     * Set the entire state for a given node
     */
    setState(nodeId, state)
    {
        assert (nodeId in this.nodes);
        let node = this.nodes[nodeId];
        node.setState(state);
    }

    /**
     * Set a given cell in a step sequencer
     */
    setCell(nodeId, patIdx, stepIdx, rowIdx, value)
    {
        assert (nodeId in this.nodes);
        let node = this.nodes[nodeId];

        let pattern = node.state.patterns[patIdx];
        let numRows = pattern[stepIdx].length;

        for (let i = 0; i < numRows; ++i)
            pattern[stepIdx][i] = 0;

        pattern[stepIdx][rowIdx] = value;
    }

    /**
     * Queue the next pattern to play in a sequencer
     */
    queuePattern(nodeId, patIdx, patData)
    {
        assert (nodeId in this.nodes);
        let node = this.nodes[nodeId];
        node.queuePattern(patIdx, patData);
    }

    /**
     * Generate one [left, right] pair of audio samples
     */
    genSample()
    {
        if (!this._genSample)
            return [0, 0];

        this.playPos += 1 / 44100;
        return this._genSample(this.playPos, this.nodes);
    }
}

/**
 * Base class for stateful audio processing nodes
 */
class AudioNode
{
    constructor(id, state, sampleRate, send)
    {
        this.nodeId = id;
        this.state = state;
        this.params = state.params;
        this.sampleRate = sampleRate;
        this.sampleTime = 1 / sampleRate;
        this.send = send;
    }

    /**
     * Set/update the entire state for this node
     */
    setState(state)
    {
        this.state = state;
        this.params = state.params;
    }
}

/**
 * ADSR envelope
 */
class ADSRNode extends AudioNode
{
    constructor(id, state, sampleRate, send)
    {
        super(id, state, sampleRate, send);
        this.env = new synth.ADSREnv();
    }

    update(time, gate, attack, decay, susVal, release)
    {
        return this.env.eval(time, gate, attack, decay, susVal, release)
    }
}

/**
 * Clock source, with tempo in BPM
 */
class Clock extends AudioNode
{
    constructor(id, state, sampleRate, send)
    {
        super(id, state, sampleRate, send);
        this.phase = 0;
    }

    update()
    {
        let freq = music.CLOCK_PPQ * this.params.value / 60;
        let duty = 0.5;
        this.phase += this.sampleTime * freq;
        let cyclePos = this.phase % 1;
        return (cyclePos < duty)? -1:1;
    }
}

/**
 * Delay line node
 */
class Delay extends AudioNode
{
    constructor(id, state, sampleRate, send)
    {
        super(id, state, sampleRate, send);

        // Stateful delay line object
        this.delay = new synth.Delay(sampleRate);
    }
}

/**
 * Overdrive-style distortion
 */
class Distort extends AudioNode
{
    constructor(id, state, sampleRate, send)
    {
        super(id, state, sampleRate, send);
    }

    update(input, amount)
    {
        return synth.distort(input, amount);
    }
}

/**
 * Pulse wave oscillator
 */
class PulseOsc extends AudioNode
{
    constructor(id, state, sampleRate, send)
    {
        super(id, state, sampleRate, send);

        this.phase = 0;
    }

    update(freq, duty)
    {
        this.phase += this.sampleTime * freq;
        let cyclePos = this.phase % 1;
        return (cyclePos < duty)? -1:1;
    }
}

/**
 * Sawtooth wave oscillator
 */
class SawOsc extends AudioNode
{
    constructor(id, state, sampleRate, send)
    {
        super(id, state, sampleRate, send);

        // Current time position
        this.phase = 0;
    }

    update(freq)
    {
        this.phase += this.sampleTime * freq;
        let cyclePos = this.phase % 1;
        return -1 + 2 * cyclePos;
    }
}

/**
 * Sine wave oscillator
 */
class SineOsc extends AudioNode
{
    constructor(id, state, sampleRate, send)
    {
        super(id, state, sampleRate, send);

        // Current time position
        this.phase = 0;

        // Current sync input sign (positive/negative)
        this.syncSgn = false;
    }

    update(freq, sync)
    {
        let minVal = this.params.minVal;
        let maxVal = this.params.maxVal;

        if (!this.syncSgn && sync > 0)
            this.phase = 0;

        this.syncSgn = (sync > 0);

        let cyclePos = this.phase % 1;
        this.phase += this.sampleTime * freq;

        let v = Math.sin(cyclePos * 2 * Math.PI);
        let normVal = (v + 1) / 2;

        return minVal + normVal * (maxVal - minVal);
    }
}

/**
 * Triangle wave oscillator
 */
class TriOsc extends AudioNode
{
    constructor(id, state, sampleRate, send)
    {
        super(id, state, sampleRate, send);

        // Current time position
        this.phase = 0;
    }

    update(freq)
    {
        this.phase += this.sampleTime * freq;
        let cyclePos = this.phase % 1;

        if (cyclePos < 0.5)
            return -1 + (4 * cyclePos);

        return 1 - (4 * (cyclePos - 0.5));
    }
}

/**
 * Scope to plot incoming signals
 */
class Scope extends AudioNode
{
    constructor(id, state, sampleRate, send)
    {
        super(id, state, sampleRate, send);

        const SEND_SIZE = NODE_SCHEMA.Scope.sendSize;
        const SEND_RATE = NODE_SCHEMA.Scope.sendRate;

        // How often to gather samples
        this.sampleInterv = sampleRate / (SEND_SIZE * SEND_RATE);
        assert (isPosInt(this.sampleInterv));

        // Buffer of samples to be send
        this.buffer = new Array(SEND_SIZE);

        // How many samples we've seen in total
        this.numSamples = 0;

        // How many samples we have ready to send
        this.numReady = 0;
    }

    update(inVal)
    {
        if (this.numSamples % this.sampleInterv == 0)
        {
            this.buffer[this.numReady] = inVal;
            this.numReady++;

            if (this.numReady == this.buffer.length)
            {
                // Send the current step back to the main thread
                this.send({
                    type: 'SEND_SAMPLES',
                    nodeId: this.nodeId,
                    samples: this.buffer
                });

                this.numReady = 0;
            }
        }

        this.numSamples++;
    }
}

/**
 * Slide/portamento node
 */
class Slide extends AudioNode
{
    constructor(id, state, sampleRate, send)
    {
        super(id, state, sampleRate, send);

        // Current state
        this.s = 0;
    }

    update(input, rate)
    {
        // Remap so the useful range is around [0, 1]
        rate = rate * 1000;

        if (rate < 1)
            rate = 1;

        this.s += (1 / rate) * (input - this.s);

        return this.s;
    }
}

/**
 * Two-pole low-pass filter
 */
 class Filter extends AudioNode
 {
     constructor(id, state, sampleRate, send)
     {
         super(id, state, sampleRate, send);

         this.filter = new synth.TwoPoleFilter();
     }

     update(input, cutoff, reso)
     {
        return this.filter.apply(input, cutoff, reso);
     }
}

/**
 * Monophonic note sequencer
 */
class MonoSeq extends AudioNode
{
    constructor(id, state, sampleRate, send)
    {
        super(id, state, sampleRate, send);

        // Current clock sign (positive/negative)
        this.clockSgn = false;

        // Number of clock ticks until the next step is triggered
        this.clockCnt = 0;

        // Next step to trigger
        this.nextStep = 0;

        // Time the last note was triggered
        this.trigTime = 0;

        // Amount of time the gate stays open for each step
        // This is currently not configurable
        this.gateTime = 0.1;

        // Output frequency and gate values
        this.freq = 0;
        this.gate = 0;

        // Currently playing pattern
        this.patIdx = state.curPattern;

        // Next pattern that is queued for playback
        this.nextPat = undefined;

        // Generate the scale notes
        this.scale = music.genScale(state.scaleRoot, state.scaleName, state.numOctaves);
    }

    /**
     * Set/update the entire state for this node
     */
    setState(state)
    {
        AudioNode.prototype.setState.call(this, state);

        // Generate the scale notes
        this.scale = music.genScale(state.scaleRoot, state.scaleName, state.numOctaves);

        this.patIdx = state.curPattern;
    }

    /**
     * Queue the next pattern to play
     */
    queuePattern(patIdx, patData)
    {
        console.log(`got queuePattern, patIdx=${patIdx}`);

        this.state.patterns[patIdx] = patData;
        this.nextPat = patIdx;
    }

    /**
     * Takes the current time and clock signal as input.
     * Produces frequency and gate signals as output.
     */
    update(time, clock)
    {
        if (!this.clockSgn && clock > 0)
        {
            // If we are at the beginning of a new sequencer step
            if (this.clockCnt == 0)
            {
                var grid = this.state.patterns[this.patIdx];

                this.clockCnt = music.CLOCK_PPS;
                var stepIdx = this.nextStep % grid.length;
                this.nextStep++;

                // Send the current step back to the main thread
                this.send({
                    type: 'SET_CUR_STEP',
                    nodeId: this.nodeId,
                    stepIdx: stepIdx
                });

                this.gate = 0;
                this.trigTime = 0;

                for (var rowIdx = 0; rowIdx < this.scale.length; ++rowIdx)
                {
                    if (!grid[stepIdx][rowIdx])
                        continue

                    let note = this.scale[rowIdx];
                    this.freq = note.getFreq();
                    this.gate = 1;
                    this.trigTime = time;
                }

                // If this is the last step of this pattern
                if (stepIdx === grid.length - 1)
                {
                    this.nextStep = 0;

                    if (this.nextPat !== undefined)
                    {
                        // Send the pattern change to the main thread
                        this.send({
                            type: 'SET_PATTERN',
                            nodeId: this.nodeId,
                            patIdx: this.nextPat
                        });

                        // Move to the next pattern
                        this.patIdx = this.nextPat;
                        this.nextPat = undefined;
                    }
                }
            }

            this.clockCnt--;
        }

        // If we are past the end of the note
        if (this.gate > 0)
        {
            if (time - this.trigTime > this.gateTime)
            {
                this.gate = 0;
                this.trigTime = 0;
            }
        }

        this.clockSgn = (clock > 0);

        assert (!isNaN(this.freq), 'MonoSeq freq is NaN');
        assert (!isNaN(this.gate), 'MonoSeq gate is NaN');
        return [this.freq, this.gate];
    }
}

/**
 * Map of node types to classes
 */
let NODE_CLASSES =
{
    ADSR: ADSRNode,
    Clock: Clock,
    Delay: Delay,
    Distort: Distort,
    Pulse: PulseOsc,
    Saw: SawOsc,
    Sine: SineOsc,
    Tri: TriOsc,
    Scope: Scope,
    Slide: Slide,
    Filter: Filter,
    MonoSeq: MonoSeq,
};
