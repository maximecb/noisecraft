/*
Nodes
=====

Each node has:
- a node type (string)
- node name (string)
- global id number (integer)
- params (list of values, user-editable)
  - some of these can be invisible to the user
  - some of these are reset after playback
- a map of input connections for each input port
  - pairs of (node_id, out_port_name), no property if no connection
- private state that is used for audio
  - this is not persisted and not tracked by the model

For example, the currently active step in the sequencer needs to
be synced between the GUI and audio, but is not user-editable and
also not persisted across playback.

Actions
=======

Here is a tentative list of various types of actions that can be performed on the model:

// Set the project title
set_title <new_title>

create_node <type> <init_state> // Init state can be null if creating new node
delete_node <id>
connect <src_node> <out_port> <dst_node> <out_port>
disconnect <src_node> <out_port> <dst_node> <out_port>
move_node <id> <new_x> <new_y>

// Creating a module will cause the model to
// Move nodes inside the module
create_module <list_of_node_ids>
split_module <node_id>

// Copying and pasting actions are necessary
// Because we can modify the graph after copying
copy <list_of_node_ids>
paste <min_x> <min_y>

// Sent by the play/stop buttons
play 
stop

// Sent by the audio thread so the UI can reflect playback position 
set_play_pos <time>

// The model keeps an internal queue of events for undo/redo
undo
redo

// Actions to edit the contents of nodes
set_name <node_id> <name>
set_param <node_id> <param_name> <new_val>
send_audio_data <node_id> <float array> // To visualize audio data in the UI

We may also need to send a set_param from the audio thread to
set the current position of MonoSeqs, because this is dependent
on a clock input node.
*/

/** Prototypes/descriptors for each type of node */
export const nodeDescs =
{
    'Add': {
        ins: [
            { name: 'in0', default: 0 },
            { name: 'in1', default: 0 }
        ],
        outs: ['out'],
        params: [],
        description: 'add input waveforms',
    },

    'ADSR': {
        ins: [
            { name: 'gate', default: 0 },
            { name: 'att', default: 0.02 },
            { name: 'dec', default: 0.1 },
            { name: 'sus', default: 0.2 },
            { name: 'rel', default: 0.1 }
        ],
        outs: ['out'],
        params: [],
        description: 'ADSR envelope generator',
    },

    'AudioOut': {
        ins: [
            { name: 'left', default: 0 },
            { name: 'right', default: 0 }
        ],
        outs: [],
        params: [],
        description: 'stereo sound output',
    },

    'Clock': {
        ins: [],
        outs: [''],
        params: [
            { name: 'value', default: 120 },
            { name: 'minVal', default: 60 },
            { name: 'maxVal', default: 240 },
            { name: 'controlNo', default: null },
        ],
        description: 'MIDI clock signal source with tempo in BPM',
    },

    /*
    'ClockOut': {
        ins: [
            { name: 'clock', default: 0 }
        ],
        outs: [],
        params: [],
        description: 'MIDI clock output',
    },
    */

    'Const': {
        ins: [],
        outs: [''],
        params: [
            { name: 'value', default: 0 },
        ],
        description: 'editable constant value',
    },

    'Delay': {
        ins: [
            { name: 'in', default: 0 },
            { name: 'time', default: 0 }
        ],
        outs: ['out'],
        params: [],
        description: 'delay line',
    },

    // Used during compilation, reads from a delay line
    'delay_read': {
        internal: true,
        ins: [
            { name: 'time', default: 0 }
        ],
        outs: ['out'],
        params: [],
    },

    // Used during compilation, writes to a delay line
    'delay_write': {
        internal: true,
        ins: [
            { name: 'in', default: 0 },
        ],
        outs: [],
        params: [],
    },

    'Distort': {
        ins: [
            { name: 'in', default: 0 },
            { name: 'amt', default: 0 }
        ],
        outs: ['out'],
        params: [],
        description: 'overdrive-style distortion',
    },

    'Div': {
        ins: [
            { name: 'in0', default: 0 },
            { name: 'in1', default: 1 }
        ],
        outs: ['out'],
        params: [],
        description: 'divide one input by another',
    },

    'Filter': {
        ins: [
            { name: 'in', default: 0 },
            { name: 'cutoff', default: 1 },
            { name: 'reso', default: 0 }
        ],
        outs: ['out'],
        params: [],
        description: 'low-pass filter',
    },

    'Knob': {
        ins: [],
        outs: [''],
        params: [
            { name: 'value', default: 0 },
            { name: 'minVal', default: 0 },
            { name: 'maxVal', default: 1 },
            { name: 'controlNo', default: null },
        ],
        description: 'parameter control knob',
    },

    'MidiIn': {
        ins: [],
        outs: ['freq', 'gate'],
        params: [],
        description: 'MIDI note input (cv/gate)',
    },

    'MonoSeq': {
        ins: [
            { name: 'clock', default: 0 },
            { name: 'gateTime', default: 0.1 },
        ],
        outs: ['freq', 'gate'],
        params: [],
        description: 'monophonic step sequencer',
    },

    'Mul': {
        ins: [
            { name: 'in0', default: 1 },
            { name: 'in1', default: 1 }
        ],
        outs: ['out'],
        params: [],
        description: 'multiply input waveforms',
    },

    'Noise': {
        ins: [],
        outs: ['out'],
        params: [],
        description: 'white noise source',
    },

    'Notes': {
        ins: [],
        outs: [],
        params: [],
        description: 'text notes',
    },

    'Pulse': {
        ins: [
            { name: 'freq', default: 0 },
            { name: 'pw', default: 0.5 }
        ],
        outs: ['out'],
        params: [],
        description: 'pulse/square oscillator',
    },

    'Saw': {
        ins: [
            { name: 'freq', default: 0 }
        ],
        outs: ['out'],
        params: [],
        description: 'sawtooth oscillator',
    },

    'Scope': {
        ins: [
            { name: '', default: 0 }
        ],
        outs: [],
        params: [
            { name: 'minVal', default: -1 },
            { name: 'maxVal', default: 1 },
        ],
        description: 'scope to plot incoming signals',
    },

    'Sine': {
        ins: [
            { name: 'freq', default: 0 },
            { name: 'sync', default: 0 },
        ],
        outs: ['out'],
        params: [
            { name: 'minVal', default: -1 },
            { name: 'maxVal', default: 1 }
        ],
        description: 'sine wave oscillator',
    },

    'Slide': {
        ins: [
            { name: 'in', default: 0 },
            { name: 'rate', default: 1 },
        ],
        outs: ['out'],
        params: [],
        description: 'simple slew-rate limiter using a running average',
    },

    'Sub': {
        ins: [
            { name: 'in0', default: 0 },
            { name: 'in1', default: 0 }
        ],
        outs: ['out'],
        params: [],
        description: 'subtract input waveforms',
    },

    'Tri': {
        ins: [
            { name: 'freq', default: 0 }
        ],
        outs: ['out'],
        params: [],
        description: 'triangle oscillator',
    },
};

/** Graph of nodes model, operates on internal state data */
export class Model
{
    constructor()
    {
        // List of views subscribed to model updates
        this.views = [];

        // List of past actions tracked for undo/redo
        this.undoQueue = [];

        this.new();
    }

    // Register a view
    addView(view)
    {
        this.views.push(view);
    }

    // Reinitialize the state for a brand new project
    new()
    {
        // Persistent state
        this.state = {
            title: 'New Project',
            nodes: {}
        };

        this.load(this.state);
    }

    // Load the JSON state into the model
    load(state)
    {
        // Current playback position
        this.play_pos = 0;

        // Next node id to be allocated
        this.nextId = 0;







        // TODO: broadcast load state action(s)
    }

    // Serialize the state to JSON
    serialize()
    {
        return this.state;
    }

    // Apply an action to the model
    apply(action)
    {
        switch (action.type)
        {


        }

        // TODO: handle undo queue
    }
}
