import { assert, isInt, isPosInt, treeCopy, treeEq, isString, isObject } from './utils.js';
import { detectCycles } from './compiler.js';
import * as music from './music.js';

// Maximum number of undo steps we support
export const MAX_UNDO_STEPS = 400;

// Number of pixels to pad the canvas along the edges
export const EDGE_PADDING = 25;

// Min/max username length
export const MIN_USERNAME_LENGTH = 2;
export const MAX_USERNAME_LENGTH = 16;

// Max project title length
export const MAX_TITLE_LENGTH = 50;

/**
 * High-level description/schema for each type of node
 */
export const NODE_SCHEMA =
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
        unique: true,
        ins: [
            { name: 'left', default: 0 },
            { name: 'right', default: 0 }
        ],
        outs: [],
        params: [],
        description: 'stereo sound output',
    },

    /*
    'BitCrush': {
        ins: [
            { name: '', default: 0 }
        ],
        outs: [''],
        params: [
            { name: 'bitdepth', default: 8 },
            { name: 'factor', default: 1 },
        ],
        description: 'bitcrusher distortion',
    },
    */

    'Clock': {
        ins: [],
        outs: [''],
        params: [
            { name: 'minVal', default: 60 },
            { name: 'maxVal', default: 240 },
            { name: 'value', default: 120 },
            { name: 'deviceId', default: null },
            { name: 'controlId', default: null },
        ],
        description: 'MIDI clock signal source with tempo in BPM',
    },

    'ClockDiv': {
        ins: [
            { name: '', default: 0 }
        ],
        outs: [''],
        params: [
            { name: 'factor', default: 2 },
        ],
        description: 'clock signal divider',
    },

    'ClockOut': {
        unique: true,
        ins: [
            { name: 'clock', default: 0 }
        ],
        outs: [],
        params: [],
        description: 'MIDI output for clock signal',
    },

    'Const': {
        ins: [],
        outs: [''],
        params: [
            { name: 'value', default: 0 },
        ],
        state: [],
        description: 'editable constant value',
    },

    'Delay': {
        ins: [
            { name: 'in', default: 0 },
            { name: 'time', default: 0 }
        ],
        outs: ['out'],
        params: [],
        state: [],
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
        state: [],
    },

    // Used during compilation, writes to a delay line
    'delay_write': {
        internal: true,
        ins: [
            { name: 'in', default: 0 },
            { name: 'time', default: 0 },
        ],
        outs: [],
        params: [],
        state: [],
    },

    'Distort': {
        ins: [
            { name: 'in', default: 0 },
            { name: 'amt', default: 0 }
        ],
        outs: ['out'],
        params: [],
        state: [],
        description: 'overdrive-style distortion',
    },

    'Div': {
        ins: [
            { name: 'in0', default: 0 },
            { name: 'in1', default: 1 }
        ],
        outs: ['out'],
        params: [],
        state: [],
        description: 'divide one input by another',
    },

    'Equal': {
        ins: [
            { name: 'in0', default: 0 },
            { name: 'in1', default: 1 }
        ],
        outs: ['out'],
        params: [],
        state: [],
        description: 'compare two values (a == b)',
    },

    'Filter': {
        ins: [
            { name: 'in', default: 0 },
            { name: 'cutoff', default: 1 },
            { name: 'reso', default: 0 }
        ],
        outs: ['out'],
        params: [],
        state: [],
        description: 'classic two-pole low-pass filter',
    },

    'Fold': {
        ins: [
            { name: "in", default: 0 },
            { name: "rate", default: 0 }
        ],
        outs: ["out"],
        params: [],
        state: [],
        description: "wavefolder"
    },

    'GateSeq': {
        ins: [
            { name: 'clock', default: 0 },
            { name: 'gateT', default: 0.1 },
        ],
        outs: [],
        params: [],
        state: ['numRows', 'patterns', 'curPattern'],
        description: 'step sequencer with multiple gate outputs',
    },

    'Greater': {
        ins: [
            { name: 'in0', default: 0 },
            { name: 'in1', default: 1 }
        ],
        outs: ['out'],
        params: [],
        state: [],
        description: 'compare two values (a > b)',
    },

    'Hold': {
        ins: [
            { name: 'in', default: 0 },
            { name: 'trig', default: 0 }
        ],
        outs: ['out'],
        params: [],
        state: [],
        description: 'sample and hold',
    },

    // Used during compilation, reads from a sample and hold
    'hold_read': {
        internal: true,
        ins: [],
        outs: ['out'],
        params: [],
        state: [],
    },

    // Used during compilation, writes to a sample and hold
    'hold_write': {
        internal: true,
        ins: [
            { name: 'in', default: 0 },
            { name: 'trig', default: 0 }
        ],
        outs: [],
        params: [],
        state: [],
    },

    'Knob': {
        ins: [],
        outs: [''],
        params: [
            { name: 'minVal', default: 0 },
            { name: 'maxVal', default: 1 },
            { name: 'value', default: 0 },
            { name: 'deviceId', default: null },
            { name: 'controlId', default: null },
        ],
        state: [],
        description: 'parameter control knob',
    },

    // MIDI input node
    // chanNo is the channel to accept input from (null means any channel)
    'MidiIn': {
        ins: [],
        outs: ['freq', 'gate'],
        params: [
            { name: 'octaveNo', default: 3 },
            { name: 'chanNo', default: null },
        ],
        state: [],
        description: 'MIDI note input (cv/gate)',
    },

    'Mod': {
        ins: [
            { name: 'in0', default: 0 },
            { name: 'in1', default: 1 }
        ],
        outs: ['out'],
        params: [],
        state: [],
        description: 'floating-point modulo',
    },

    'MonoSeq': {
        ins: [
            { name: 'clock', default: 0 },
            { name: 'gateT', default: 0.1 },
        ],
        outs: ['freq', 'gate'],
        params: [],
        state: ['scaleName', 'scaleRoot', 'numOctaves', 'patterns', 'curPattern'],
        description: 'monophonic step sequencer',
    },

    'Mul': {
        ins: [
            { name: 'in0', default: 1 },
            { name: 'in1', default: 1 }
        ],
        outs: ['out'],
        params: [],
        state: [],
        description: 'multiply input waveforms',
    },

    'Noise': {
        ins: [],
        outs: ['out'],
        params: [
            { name: 'minVal', default: -1 },
            { name: 'maxVal', default: 1 }
        ],
        state: [],
        description: 'white noise source',
    },

    'Nop': {
        ins: [
            { name: '', default: 0 },
        ],
        outs: [''],
        params: [],
        description: 'pass-through node (no-op)',
    },

    'Notes': {
        ins: [],
        outs: [],
        params: [
            { name: 'text', default: '' },
        ],
        state: [],
        description: 'text notes',
    },

    'Pulse': {
        ins: [
            { name: 'freq', default: 0 },
            { name: 'pw', default: 0.5 }
        ],
        outs: ['out'],
        params: [
            { name: 'minVal', default: -1 },
            { name: 'maxVal', default: 1 }
        ],
        state: [],
        description: 'pulse/square oscillator',
    },

    'Saw': {
        ins: [
            { name: 'freq', default: 0 }
        ],
        outs: ['out'],
        params: [
            { name: 'minVal', default: -1 },
            { name: 'maxVal', default: 1 }
        ],
        state: [],
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
        state: [],
        description: 'scope to plot incoming signals',
        sendRate: 20,
        sendSize: 5,
        historyLen: 150,
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
        state: [],
        description: 'sine wave oscillator',
    },

    'Slide': {
        ins: [
            { name: 'in', default: 0 },
            { name: 'rate', default: 1 },
        ],
        outs: ['out'],
        params: [],
        state: [],
        description: 'simple slew-rate limiter using a running average',
    },

    'Sub': {
        ins: [
            { name: 'in0', default: 0 },
            { name: 'in1', default: 0 }
        ],
        outs: ['out'],
        params: [],
        state: [],
        description: 'subtract input waveforms',
    },

    'Tri': {
        ins: [
            { name: 'freq', default: 0 }
        ],
        outs: ['out'],
        params: [
            { name: 'minVal', default: -1 },
            { name: 'maxVal', default: 1 }
        ],
        state: [],
        description: 'triangle wave oscillator',
    },

    'Module': {
        // Marked as internal because you can't create a module
        // from the node creation menu
        internal: true,
        ins: [],
        outs: [],
        params: [],
        state: [],
        description: 'user-created module (node grouping)',
    },
};

/**
 * Normalize older project formats to match the current schema
 * This method exists to enable backwards-compatibility
 */
export function normalizeProject(project)
{
    assert (project instanceof Object);

    // For each node
    for (let nodeId in project.nodes)
    {
        assert (typeof nodeId === 'string');
        let node = project.nodes[nodeId];
        project.nodes[nodeId] = normalizeNode(node);
    }

    return project;
}

/**
 * Normalize older node formats to match the current schema
 */
export function normalizeNode(node)
{
    let schema = NODE_SCHEMA[node.type];

    // Convert the coordinates to integers
    node.x = Math.round(node.x);
    node.x = Math.round(node.x);

    // Make sure that the number of inputs matches the schema
    if (node.ins.length < schema.ins.length)
    {
        let curLen = node.ins.length;
        node.ins.length = schema.ins.length;
        node.ins.fill(null, curLen, node.ins.length);
    }

    if (!node.inNames)
    {
        node.inNames = schema.ins.map(s => s.name);
    }

    // Make sure that there is an input name for every schema input
    if (node.inNames.length < schema.ins.length)
    {
        for (let i = node.inNames.length; i < schema.ins.length; ++i)
        {
            node.inNames[i] = schema.ins[i].name;
        }
    }

    if (!node.outNames)
    {
        node.outNames = schema.outs.map(n => n);
    }

    // Make sure that there is an output name for every schema output
    if (node.outNames.length < schema.outs.length)
    {
        for (let i = node.outNames.length; i < schema.outs.length; ++i)
        {
            node.outNames[i] = schema.outs[i];
        }
    }

    // If minVal and maxVal are inverted
    if ('minVal' in node.params && 'maxVal' in node.params)
    {
        if (node.params.minVal > node.params.maxVal)
        {
            console.log('flipping minVal and maxVal');
            let maxVal = node.params.minVal;
            node.params.minVal = node.params.maxVal;
            node.params.maxVal = maxVal;
        }
    }

    // Rename controlNo to controlId
    if ('controlNo' in node.params)
    {
        node.params.controlId = node.params.controlNo;
        delete node.params.controlNo;
    }

    // Add missing parameters
    for (let param of schema.params)
    {
        if (param.name in node.params)
            continue;

        //console.log(node.type, param.name);
        node.params[param.name] = param.default;
    }

    return node;
}

/**
 * Validate a username
 */
export function validateUserName(name)
{
    if (name.length < MIN_USERNAME_LENGTH)
    {
        throw TypeError('username too short');
    }

    if (name.length > MAX_USERNAME_LENGTH)
    {
        throw TypeError('username too long');
    }

    // Spaces and hyphens are only allowed in the middle of the username
    let regex = /^[a-zA-Z0-9_]+[a-zA-Z0-9_\- ]*[a-zA-Z0-9_]+$/;

    if (!name.match(regex))
    {
        throw TypeError('username contains invalid characters');
    }
}

/**
 * Validate the state encoding for a project
 */
export function validateProject(project)
{
    assert (project instanceof Object);

    // Validate the project title
    assert (typeof project.title === 'string');
    assert (project.title.length <= MAX_TITLE_LENGTH);

    assert (project.nodes instanceof Object);

    // Validate each individual node
    for (let nodeId in project.nodes)
    {
        // Validate the nodeId
        assert (typeof nodeId === 'string');
        assert (nodeId.length <= 10);
        assert (/^\d+$/.test(nodeId));

        let node = project.nodes[nodeId];
        validateNode(node);
    }

    // Validate that there are no extraneous properties
    for (let key in Object.keys(project))
    {
        assert (key in ['title', 'nodes']);
    }
}

/**
 * Validate the state encoding of a node
 */
export function validateNode(node)
{
    assert (node instanceof Object);
    assert (node.type in NODE_SCHEMA);
    let schema = NODE_SCHEMA[node.type];
    assert (!schema.internal);

    // Node name
    assert (typeof node.name == 'string');
    assert (node.name.length <= 12);

    // Node x/y position
    assert (typeof node.x === 'number');
    assert (typeof node.y === 'number');
    assert (isInt(node.x));
    assert (isInt(node.y));

    // Validate input format
    assert (node.ins instanceof Array);
    assert (node.ins.length >= schema.ins.length);
    for (let input of node.ins)
    {
        if (input)
        {
            assert (input instanceof Array);
            assert (input.length == 2);
            assert (typeof input[0] == 'string');
            assert (typeof input[1] == 'number');
            assert (input[1] >= 0);
        }
    }

    // Validate the input names
    assert (node.inNames.length == node.ins.length);
    assert (node.inNames.length >= schema.ins.length);
    for (var i = 0; i < node.inNames.length; ++i)
    {
        assert (typeof node.inNames[i] == 'string');
    }

    // Validate the output names
    assert (node.outNames.length >= schema.outs.length);
    for (var i = 0; i < node.outNames.length; ++i)
    {
        assert (typeof node.outNames[i] == 'string');
    }

    // Validate the node parameters
    validateParams(node.type, node.params);

    // Validate that there are no extraneous node properties
    for (let key in node)
    {
        switch (key)
        {
            case 'type':
            case 'name':
            case 'x':
            case 'y':
            case 'ins':
            case 'inNames':
            case 'outNames':
            case 'params':
            continue;

            default:
            if (schema.state.indexOf(key) == -1)
            {
                throw TypeError(`unknown node property ${key} for ${node.type}`)
            }
        }
    }

    // Validate sequencer state
    if ('numRows' in node)
    {
        assert (isPosInt(node.numRows) && node.numRows <= 16);
    }
}

/**
 * Validate the parameters for a node of a given type
 */
export function validateParams(nodeType, params)
{
    assert (params instanceof Object);
    assert (nodeType in NODE_SCHEMA);
    let schema = NODE_SCHEMA[nodeType];

    // Validate the parameter names
    let paramNames = new Set(schema.params.map(p => p.name));
    for (let name in params)
    {
        assert (paramNames.has(name));
    }

    // Validate the parameter types
    for (let param of schema.params)
    {
        // If this parameter is not present, skip it
        if (!(param.name in params))
        {
            continue;
        }

        let value = params[param.name];
        //console.log(param.name, value);

        if (typeof param.default == 'number')
        {
            if (typeof value != 'number')
                throw RangeError(`${param.name} must be a number`);
            if (isNaN(value))
                throw RangeError(`${param.name} must be a number`);
        }
        else if (typeof param.default == 'string')
        {
            if (typeof value != 'string')
                throw RangeError(`${param.name} must be a string`);
        }
        else
        {
            if (value !== null &&
                typeof value !== 'number' &&
                typeof value !== 'string')
                throw RangeError(`invalid value for ${param.name}`);
        }
    }

    // Validate value/minVal/maxVal
    if ('value' in params && 'minVal' in params)
    {
        assert (typeof params.value === 'number');
        assert (typeof params.minVal === 'number');
        assert (typeof params.maxVal === 'number');

        if (params.value < params.minVal)
            throw RangeError('value cannot be set below minVal');
        if (params.value > params.maxVal)
            throw RangeError('value cannot be set above maxVal');
    }

    // Validate minVal/maxVal
    if ('minVal' in params)
    {
        assert (typeof params.minVal === 'number');
        assert (typeof params.maxVal === 'number');

        if (params.minVal > params.maxVal)
            throw RangeError('maxVal must be set above minVal');
    }

    // Validate ClockDiv factor
    if ('factor' in params)
    {
        if (!isPosInt(params.factor))
            throw RangeError('factor must be a positive integer');
    }

    // MIDI channel number
    if ('chanNo' in params)
    {
        if (params.chanNo != null && !isPosInt(params.chanNo))
            throw RangeError('chanNo must be null or a positive integer');

        if (params.chanNo != null && (params.chanNo < 1 || params.chanNo > 16))
            throw RangeError('chanNo must be between 1 and 16 inclusively');
    }
}

/**
 * Remove non-persistent state variables from the model's state
 */
function resetState(project)
{
    // Properties found on every node
    let nodeProps = new Set([
        'type',
        'name',
        'x',
        'y',
        'ins',
        'inNames',
        'outNames',
        'params'
    ]);

    // For each node
    for (let id in project.nodes)
    {
        let node = project.nodes[id];
        let keys = Object.keys(node);
        let schema = NODE_SCHEMA[node.type];
        let stateVars = new Set(schema.state);

        // For each property of the node
        for (let key of keys)
        {
            if (!nodeProps.has(key) && !stateVars.has(key))
            {
                console.log('deleting', node.type, key);
                delete node[key];
            }
        }
    }
}

/**
 * Reposition the nodes towards the top-left of the canvas
 * This is used when projects are shared, because some people
 * have really large monitors and will place nodes far away from
 * the top-left corner.
 */
export function reposition(project)
{
    // Compute the minimum x/y coordinates
    let xMin = Infinity;
    let yMin = Infinity;
    for (let nodeId in project.nodes)
    {
        let node = project.nodes[nodeId];
        xMin = Math.min(xMin, node.x);
        yMin = Math.min(yMin, node.y);
    }

    let dx = EDGE_PADDING - xMin;
    let dy = EDGE_PADDING - yMin;

    // Reposition the nodes and convert the
    // coordinates to integers
    for (let nodeId in project.nodes)
    {
        let node = project.nodes[nodeId];
        node.x = Math.round(node.x + dx);
        node.y = Math.round(node.y + dy);
    }
}

/**
 * Base class for all model update actions.
 * As a general rule, we only create actions for things we can undo.
 * Moving nodes is an action, but selecting or copying nodes is not.
 */
export class Action
{
    // Test if this action can be combined with the previous
    // This is used to simplify the undo queue
    combinable(prev)
    {
        // Action can't be combined
        return false;
    }

    // Update the model based on this action
    update(model)
    {
        throw TypeError("unimplemented");
    }

    // By default, actions can be undone
    get undoable()
    {
        return true;
    }
}

/**
 * Set the project title
 */
export class SetTitle extends Action
{
    constructor(title)
    {
        super();
        this.title = title;
    }

    update(model)
    {
        model.state.title = this.title;
    }
}

/**
 * Initialize a new blank pattern for a sequencer node
 */
function initPattern(node, patIdx)
{
    // If the pattern already exists, stop
    if (node.patterns[patIdx])
        return;

    // Compute the number of rows
    let numRows;
    switch (node.type)
    {
        case 'GateSeq':
        numRows = node.numRows;
        break;

        case 'MonoSeq':
        let scaleNotes = music.genScale(node.scaleRoot, node.scaleName, node.numOctaves);
        numRows = scaleNotes.length;
        break;

        default:
        assert (false, "unknown node type in initPattern");
        break;
    }

    // Initialize an empty pattern
    let numSteps = 16;
    let grid = new Array(numSteps);

    for (let step = 0; step < grid.length; ++step)
    {
        grid[step] = new Array(numRows);
        grid[step].fill(0);
    }

    node.patterns[patIdx] = grid;
}

/**
 * Create a new node
 */
export class CreateNode extends Action
{
    constructor(nodeType, x, y)
    {
        // Ensure that the coordinates are integers
        assert(isInt(x));
        assert(isInt(y));

        super();
        this.nodeType = nodeType;
        this.x = x;
        this.y = y;
    }

    update(model)
    {
        let schema = NODE_SCHEMA[this.nodeType];

        let node = {
            type: this.nodeType,
            name: this.nodeType,
            x: this.x,
            y: this.y,
            ins: Array(schema.ins.length).fill(null),
            inNames: schema.ins.map(s => s.name),
            outNames: schema.outs.map(n => n),
            params: {},
        };

        // Initialize node parameters to default values
        for (let param of schema.params)
        {
            node.params[param.name] = param.default;
        }

        // If this is a gate sequencer node
        if (this.nodeType == 'GateSeq')
        {
            // Set the default scale
            node.numRows = 4;

            // Create the output ports
            node.outNames = ['gate0', 'gate1', 'gate2', 'gate3'];

            // Currently active pattern
            node.curPattern = 0;

            // Initialize an empty pattern
            node.patterns = [];
            initPattern(node, 0);
        }

        // If this is a monophonic  sequencer node
        if (this.nodeType == 'MonoSeq')
        {
            // Set the default scale
            node.scaleName = 'minor pentatonic';
            node.scaleRoot = 'C2';
            node.numOctaves = 1;

            // Currently active pattern
            node.curPattern = 0;

            // Initialize an empty pattern
            node.patterns = [];
            initPattern(node, 0);
        }

        // Add the node to the state
        let nodeId = model.getFreeId();
        model.state.nodes[nodeId] = node;

        return nodeId;
    }
}

/**
 * Move one or more nodes
 */
export class MoveNodes extends Action
{
    constructor(nodeIds, dx, dy)
    {
        // Ensure that node coordinates remain integers
        assert(isInt(dx));
        assert(isInt(dy));

        super();
        this.nodeIds = nodeIds;
        this.dx = dx;
        this.dy = dy;
    }

    combinable(prev)
    {
        if (this.prototype != prev.prototype)
            return false;

        if (!treeEq(this.nodeIds, prev.nodeIds))
            return false;

        return true;
    }

    update(model)
    {
        for (let nodeId of this.nodeIds)
        {
            let node = model.state.nodes[nodeId];
            node.x += this.dx;
            node.y += this.dy;
        }
    }
}

/**
 * Delete one or more nodes
 */
export class DeleteNodes extends Action
{
    constructor(nodeIds)
    {
        super();
        assert (nodeIds instanceof Array);
        this.nodeIds = nodeIds;
    }

    update(model)
    {
        // For each node to be deleted
        for (let nodeId of this.nodeIds)
        {
            assert (nodeId in model.state.nodes);
            delete model.state.nodes[nodeId];
        }

        // For each node in the model
        for (let nodeId in model.state.nodes)
        {
            let nodeState = model.state.nodes[nodeId];

            // For each input-side port
            for (let dstPort = 0; dstPort < nodeState.ins.length; ++dstPort)
            {
                if (!nodeState.ins[dstPort])
                    continue;

                let [srcId, srcPort] = nodeState.ins[dstPort];

                // If the source node is being deleted
                if (this.nodeIds.indexOf(srcId) != -1)
                {
                    delete nodeState.ins[dstPort];
                }
            }
        }
    }
}

/**
 * Pastes one or more nodes
 *
 * The constructor will throw an exception if it is not pastable,
 * or if the paste would have no effect on the model.
 */
export class Paste extends Action
{
    constructor(data, x, y)
    {
        super();

        this.nodesData = data.nodes;
        assert (this.nodesData instanceof Object);
        assert (Object.keys(this.nodesData).length);

        for (let nodeId in this.nodesData)
        {
            assert (/^\d+$/.test(nodeId));

            // Normalize and validate the node data
            let nodeData = this.nodesData[nodeId];
            nodeData = normalizeNode(nodeData);
            validateNode(nodeData);
            this.nodesData[nodeId] = nodeData;
        }

        this.x = x;
        this.y = y;
        assert (typeof this.x == 'number');
        assert (typeof this.y == 'number');

        // Node ids for pasted nodes.
        // This is set after the action has been executed.
        this.pastedIds = null;
    }

    update(model)
    {
        console.log('paste nodes');

        let nodeIdMap = {};

        // Don't paste unique nodes if an instance already
        // Exists in this project
        for (let nodeId in this.nodesData)
        {
            let node = this.nodesData[nodeId];
            let schema = NODE_SCHEMA[node.type];
            if (schema.unique && model.hasNode(node.type))
                delete this.nodesData[nodeId];
        }

        // Before adding any nodes, determine their final offsets.
        let offset = { x: Infinity, y: Infinity };
        for (let nodeId in this.nodesData)
        {
            let nodeData = this.nodesData[nodeId];

            offset.x = Math.min(nodeData.x, offset.x);
            offset.y = Math.min(nodeData.y, offset.y);
        }

        assert (offset.x !== Infinity && offset.y !== Infinity);

        offset.x = this.x - offset.x;
        offset.y = this.y - offset.y;

        // Start by adding the pasted nodes without port connections.
        for (let nodeId in this.nodesData)
        {
            let nodeData = this.nodesData[nodeId];
            let schema = NODE_SCHEMA[nodeData.type];

            let node = treeCopy(nodeData);
            node.x = nodeData.x + offset.x;
            node.y = nodeData.y + offset.y;

            // Keep param values that are aligned with the schema. They must be
            // null or match the schema's default value type, otherwise the
            // default value will be assigned.
            for (let param of schema.params)
            {
                let value = nodeData.params[param.name];

                if (value !== null && typeof value !== typeof param.default)
                    value = param.default;

                node.params[param.name] = value;
            }

            // Add the node and track the new ID.
            let mappedNodeId = model.getFreeId();
            nodeIdMap[nodeId] = mappedNodeId;
            model.state.nodes[mappedNodeId] = node;
        }

        // Now that all the nodes have mapped IDs, fill in the port connections.
        for (let nodeId in this.nodesData)
        {
            let mappedNodeId = nodeIdMap[nodeId];
            let node = model.state.nodes[mappedNodeId];

            node.ins = this.nodesData[nodeId].ins.map(input => {
                if (!(input instanceof Array) || input.length != 2)
                    return null;

                let [inputNodeId, inputPortId] = input;
                if (inputNodeId in nodeIdMap)
                    return [nodeIdMap[inputNodeId], inputPortId];

                return null;
            });
        }

        // Store the node ids of pasted nodes
        this.pastedIds = Object.values(nodeIdMap);
    }
}

/**
 * Set a node parameter to a given value
 */
export class SetNodeName extends Action
{
    constructor(nodeId, name)
    {
        super();
        this.nodeId = nodeId;
        this.name = name;
    }

    update(model)
    {
        if (this.name.length == 0)
            throw TypeError('node name cannot be empty');

        let node = model.state.nodes[this.nodeId];
        node.name = this.name;
    }
}

/**
 * Set the name of an input port for a given node
 */
export class SetInName extends Action
{
    constructor(nodeId, portIdx, name)
    {
        super();
        this.nodeId = nodeId;
        this.portIdx = portIdx;
        this.name = name;
    }

    update(model)
    {
        let node = model.state.nodes[this.nodeId];
        node.inNames[this.portIdx] = this.name;
    }
}

/**
 * Set the name of an output port for a given node
 */
export class SetOutName extends Action
{
    constructor(nodeId, portIdx, name)
    {
        super();
        this.nodeId = nodeId;
        this.portIdx = portIdx;
        this.name = name;
    }

    update(model)
    {
        let node = model.state.nodes[this.nodeId];
        node.outNames[this.portIdx] = this.name;
    }
}

/**
 * Set a node parameter to a given value
 */
export class SetParam extends Action
{
    constructor(nodeId, paramName, value)
    {
        super();
        this.nodeId = nodeId;
        this.paramName = paramName;
        this.value = value;
    }

    combinable(prev)
    {
        if (this.prototype != prev.prototype)
            return false;

        if (this.nodeId != prev.nodeId)
            return false;

        if (this.paramName != prev.paramName)
            return false;

        if (this.paramName != "value")
            return false;

        return true;
    }

    update(model)
    {
        let node = model.state.nodes[this.nodeId];
        assert (this.paramName in node.params);
        node.params[this.paramName] = this.value;
    }
}

/**
 * Connect two nodes with an edge
 */
export class ConnectNodes extends Action
{
    constructor(srcId, srcPort, dstId, dstPort)
    {
        super();
        this.srcId = srcId;
        this.srcPort = srcPort;
        this.dstId = dstId;
        this.dstPort = dstPort;
    }

    update(model)
    {
        assert (this.srcId != this.dstId);
        let srcNode = model.state.nodes[this.srcId];
        let dstNode = model.state.nodes[this.dstId];
        assert (srcNode);
        assert (dstNode);

        // An input port can only have one incoming connection
        dstNode.ins[this.dstPort] = [this.srcId, this.srcPort];
    }
}

/**
 * Remove the connection attached to an input port
 */
export class Disconnect extends Action
{
    constructor(dstId, dstPort)
    {
        super();
        this.dstId = dstId;
        this.dstPort = dstPort;
    }

    update(model)
    {
        let dstNode = model.state.nodes[this.dstId];
        assert (dstNode);
        dstNode.ins[this.dstPort] = null;
    }
}

/**
 * Group the selected nodes into a user-created module
 * Currently, the way this works is that the selected nodes will become
 * a black box with inputs and outputs corresponding to the nodes/ports it's
 * connected to outside the group. Eventually, we will also make it possible
 * to rename module input and output ports after the module is created. We
 * could make it possible to expose specific knobs inside the group on the
 * module's UI.
 */
export class GroupNodes extends Action
{
    constructor(nodeIds)
    {
        super();
        this.nodeIds = nodeIds;
    }

    update(model)
    {
        console.log('grouping nodes');

        // Create a module node
        let module = {
            type: 'Module',
            name: 'Module',
            x: Infinity,
            y: Infinity,
            ins: [],
            inNames: [],
            outNames: [],
            params: {},
            nodes: {}
        };

        // Add the new module node to the state
        let moduleId = model.getFreeId();
        model.state.nodes[moduleId] = module;

        // Can't group nodes that must remain unique
        this.nodeIds = this.nodeIds.filter(function (nodeId)
        {
            let node = model.state.nodes[nodeId];
            let schema = NODE_SCHEMA[node.type];
            return !schema.unique;
        });

        // Add the nodes to the module and remove them from the global graph
        for (let nodeId of this.nodeIds)
        {
            let node = model.state.nodes[nodeId];
            module.nodes[nodeId] = node;
            delete model.state.nodes[nodeId];
        }

        // Compute the position of the group node
        for (let nodeId of this.nodeIds)
        {
            let node = module.nodes[nodeId];
            module.x = Math.min(module.x, node.x);
            module.y = Math.min(module.y, node.y);
        }

        function findInList(list, tuple)
        {
            for (let idx = 0; idx < list.length; ++idx)
            {
                if (treeEq(list[idx], tuple))
                    return idx;
            }

            return -1;
        }

        // For each node in the module
        for (let nodeId of this.nodeIds)
        {
            let node = module.nodes[nodeId];

            // For each input port
            for (let dstPort in node.ins)
            {
                if (!node.ins[dstPort])
                    continue;

                let srcPort = node.ins[dstPort];
                let [srcNode, portIdx] = srcPort;

                // If this input connection leads to a port outside of the group
                if (srcNode in model.state.nodes)
                {
                    let listIdx = findInList(module.ins, srcPort);

                    // If we aren't tracking this port yet
                    if (listIdx == -1)
                    {
                        listIdx = module.ins.length;
                        module.ins.push(srcPort);
                        module.inNames.push('in' + listIdx);
                    }

                    // Keep track of the fact that this is an external connection
                    node.ins[dstPort] = listIdx;
                }
            }
        }

        console.log(`num module ins: ${module.ins.length}`);

        // List of output ports (tuples) that are connected to outside nodes
        let outPorts = [];

        // For each node outside the module
        for (let nodeId in model.state.nodes)
        {
            let node = model.state.nodes[nodeId];

            // For each input port
            for (let dstPort in node.ins)
            {
                if (!node.ins[dstPort])
                    continue;

                let srcPort = node.ins[dstPort];
                let [srcNode, portIdx] = srcPort;

                // If this input connection leads to a port inside of the group
                if (srcNode in module.nodes)
                {
                    let listIdx = findInList(outPorts, srcPort);

                    // If we aren't tracking this port yet
                    if (listIdx == -1)
                    {
                        listIdx = outPorts.length;
                        outPorts.push(srcPort);
                        module.outNames.push('out' + listIdx);
                    }

                    // Keep track of the fact that this is an external connection
                    node.ins[dstPort] = [String(moduleId), listIdx];
                }
            }
        }

        console.log(`num module outs: ${module.outNames.length}`);
    }
}

/**
 * Start playbacks
 */
export class Play extends Action
{
    constructor()
    {
        super();
    }

    update(model)
    {
        model.playing = true;
    }

    get undoable()
    {
        return false;
    }
}

/**
 * Stop playback
 */
 export class Stop extends Action
 {
    constructor()
    {
        super();
    }

    update(model)
    {
        model.playing = false;
        resetState(model.state);
    }

    get undoable()
    {
        return false;
    }
}

/**
 * Toggle the value of a grid cell for a sequencer
 */
export class ToggleCell extends Action
{
    constructor(nodeId, patIdx, stepIdx, rowIdx)
    {
        super();
        this.nodeId = nodeId;
        this.patIdx = patIdx;
        this.stepIdx = stepIdx;
        this.rowIdx = rowIdx;
    }

    update(model)
    {
        let node = model.state.nodes[this.nodeId];
        assert (node.type == 'MonoSeq' || node.type == 'GateSeq');
        let grid = node.patterns[this.patIdx];
        assert (grid instanceof Array);
        assert (this.stepIdx < grid.length);
        let numRows = grid[this.stepIdx].length;
        assert (this.rowIdx < numRows);

        // Get the current value of this cell
        let curVal = grid[this.stepIdx][this.rowIdx];
        let newVal = curVal? 0:1;

        // If this is a monophonic sequencer,
        // zero-out all other cells at this step
        if (node.type == 'MonoSeq')
        {
            for (let i = 0; i < numRows; ++i)
                grid[this.stepIdx][i] = 0;
        }

        grid[this.stepIdx][this.rowIdx] = newVal;

        // Tag the new value on the action to make
        // view updates easier
        this.value = newVal;
    }
}

/**
 * Set the current step to be highlighted in a sequencer
 */
export class SetCurStep extends Action
{
    constructor(nodeId, stepIdx)
    {
        super();
        this.nodeId = nodeId;
        this.stepIdx = stepIdx;
    }

    update(model)
    {
        // The pattern may have shrunk since the audio
        // thread sent this message
        let node = model.state.nodes[this.nodeId];
        let grid = node.patterns[node.curPattern];
        this.stepIdx = this.stepIdx % grid.length;
    }

    get undoable()
    {
        return false;
    }
}

/**
 * Queue the next pattern to play for a sequencer.
 */
export class QueuePattern extends Action
{
    constructor(nodeId, patIdx)
    {
        super();
        this.nodeId = nodeId;
        this.patIdx = patIdx;
    }

    update(model)
    {
        // Initialize the pattern if it doesn't already exist
        let node = model.state.nodes[this.nodeId];
        initPattern(node, this.patIdx);
    }

    get undoable()
    {
        return false;
    }
}

/**
 * Transpose the scale of a sequencer
 */
export class SetScale extends Action
{
    constructor(nodeId, scaleRoot, scaleName, numOctaves)
    {
        assert (isPosInt(numOctaves));
        super();
        this.nodeId = nodeId;
        this.scaleRoot = scaleRoot;
        this.scaleName = scaleName;
        this.numOctaves = numOctaves;
    }

    update(model)
    {
        let node = model.state.nodes[this.nodeId];

        let oldScale = music.genScale(
            node.scaleRoot,
            node.scaleName,
            node.numOctaves
        );

        let newScale = music.genScale(
            this.scaleRoot,
            this.scaleName,
            this.numOctaves
        );

        // Compute the old and new number of scale degrees
        let oldDegs = (oldScale.length - 1) / node.numOctaves;
        let newDegs = (newScale.length - 1) / this.numOctaves;
        assert (isPosInt(oldDegs));
        assert (isPosInt(newDegs));

        // Tranpose each pattern
        for (let patIdx = 0; patIdx < node.patterns.length; ++patIdx)
        {
            let oldGrid = node.patterns[patIdx];

            // Grid to transpose the pattern into
            let newGrid = new Array(oldGrid.length);
            for (let step = 0; step < newGrid.length; ++step)
            {
                newGrid[step] = new Array(newScale.length);
                newGrid[step].fill(0);
            }

            // For each step
            for (let step = 0; step < oldGrid.length; ++step)
            {
                // For each row
                for (let row = 0; row < oldGrid[step].length; ++row)
                {
                    if (!oldGrid[step][row])
                        continue;

                    var oct = Math.floor(row / oldDegs);
                    var deg = row % oldDegs;

                    if (deg >= newDegs)
                        continue;

                    var newIdx = oct * newDegs + deg;

                    if (newIdx >= newGrid[step].length)
                        continue;

                    newGrid[step][newIdx] = 1;
                }
            }

            node.patterns[patIdx] = newGrid;
        }

        // Update the scale parameters
        node.scaleRoot = this.scaleRoot;
        node.scaleName = this.scaleName;
        node.numOctaves = this.numOctaves;
    }
}

/**
 * Transpose the number of rows for a sequencer
 */
export class SetNumRows extends Action
{
    constructor(nodeId, numRows)
    {
        assert (isPosInt(numRows));
        super();
        this.nodeId = nodeId;
        this.numRows = numRows;
    }

    update(model)
    {
        let node = model.state.nodes[this.nodeId];

        // Update each pattern
        for (let patIdx = 0; patIdx < node.patterns.length; ++patIdx)
        {
            let oldGrid = node.patterns[patIdx];

            // Grid to transpose the pattern into
            let newGrid = new Array(oldGrid.length);
            for (let step = 0; step < newGrid.length; ++step)
            {
                newGrid[step] = new Array(this.numRows);
                newGrid[step].fill(0);
            }

            // For each step
            for (let step = 0; step < newGrid.length; ++step)
            {
                // For each row in the new grid that maps to a row in the old grid
                for (let i = 0; i < Math.min(this.numRows, node.numRows); ++i)
                {
                    let newRowIdx = this.numRows - (i + 1);
                    let oldRowIdx = node.numRows - (i + 1);
                    newGrid[step][newRowIdx] = oldGrid[step][oldRowIdx];
                }
            }

            node.patterns[patIdx] = newGrid;
        }

        // Update the outputs, one output per row/gate
        node.outNames = [];
        for (let i = 0; i < this.numRows; ++i)
            node.outNames[i] = 'gate' + i;

        node.numRows = this.numRows;

        // For each node in the graph
        for (let nodeId in model.state.nodes)
        {
            let node = model.state.nodes[nodeId];

            // For each input port
            for (let dstPort in node.ins)
            {
                if (!node.ins[dstPort])
                    continue;

                let [srcNode, portIdx] = node.ins[dstPort];

                // Remove the connection if it maps to a row that no longer exists
                if (srcNode == this.nodeId && portIdx >= this.numRows)
                {
                    node.ins[dstPort] = null;
                }
            }
        }
    }
}

/**
 * Immediately set the currently playing pattern in a sequencer
 * Note that the editor will send QueuePattern during playback instead.
 */
export class SetPattern extends Action
{
    constructor(nodeId, patIdx)
    {
        super();
        this.nodeId = nodeId;
        this.patIdx = patIdx;
    }

    update(model)
    {
        // Initialize the pattern if it doesn't already exist
        let node = model.state.nodes[this.nodeId];
        initPattern(node, this.patIdx);

        // Set the currently active pattern
        node.curPattern = this.patIdx;
    }

    get undoable()
    {
        return false;
    }
}

/**
 * Extend the current sequencer pattern
 */
export class ExtendPattern extends Action
{
    constructor(nodeId, numSteps)
    {
        if (numSteps === undefined)
            numSteps = 16;

        super();
        this.nodeId = nodeId;
        this.numSteps = numSteps;
    }

    update(model)
    {
        let node = model.state.nodes[this.nodeId];
        let grid = node.patterns[node.curPattern];
        let numRows = grid[0].length;

        for (let stepIdx = 0; stepIdx < this.numSteps; ++stepIdx)
        {
            let newStep = new Array(numRows);
            newStep.fill(0);
            grid.push(newStep);
        }
    }
}

/**
 * Extend the current sequencer pattern by copying previous steps
 */
export class ExtendCopy extends Action
{
    constructor(nodeId, numSteps)
    {
        if (numSteps === undefined)
            numSteps = 16;

        super();
        this.nodeId = nodeId;
        this.numSteps = numSteps;
    }

    update(model)
    {
        let node = model.state.nodes[this.nodeId];
        let grid = node.patterns[node.curPattern];
        assert (this.numSteps <= grid.length);
        let fromIdx = grid.length - this.numSteps;

        for (let stepIdx = 0; stepIdx < this.numSteps; ++stepIdx)
        {
            let prevStep = grid[fromIdx + stepIdx]
            let newStep = prevStep.slice();
            grid.push(newStep);
        }
    }
}

/**
 * Shrink the current sequencer pattern
 */
export class ShrinkPattern extends Action
{
    constructor(nodeId, numSteps)
    {
        if (numSteps === undefined)
            numSteps = 16;

        super();
        this.nodeId = nodeId;
        this.numSteps = numSteps;
    }

    update(model)
    {
        let node = model.state.nodes[this.nodeId];
        let grid = node.patterns[node.curPattern];
        assert (grid);

        assert (this.numSteps < grid.length);
        grid.length -= this.numSteps;
    }
}

/**
 * Send audio samples from the audio thread to the model
 */
export class SendSamples extends Action
{
    constructor(nodeId, samples)
    {
        super();
        this.nodeId = nodeId;
        this.samples = samples;
    }

    update(model)
    {
        let node = model.state.nodes[this.nodeId];

        // If no samples are stored on this node, initialize the array
        if (!node.samples)
        {
            node.samples = Array(NODE_SCHEMA.Scope.historyLen).fill(0);
        }

        // Remove samples from the front, add new samples at the end
        let numStored = node.samples.length
        assert (this.samples.length < numStored);
        node.samples = node.samples.slice(this.samples.length).concat(this.samples);
        assert (node.samples.length == numStored);
    }

    get undoable()
    {
        return false;
    }
}

/**
 * Note on message.
 * Velocity zero means note off.
 */
export class NoteOn extends Action
{
    constructor(nodeId, noteNo, velocity)
    {
        super();
        this.nodeId = nodeId;
        this.noteNo = noteNo;
        this.velocity = velocity;
    }

    update(model)
    {
    }

    get undoable()
    {
        return false;
    }
}

/**
 * Clock pulse message.
 * Used by the ClockOut node.
 */
export class ClockPulse extends Action
{
    constructor(nodeId, time)
    {
        super();
        this.nodeId = nodeId;
        this.time = time;
    }

    update(model)
    {
    }

    get undoable()
    {
        return false;
    }
}

/**
 * Graph of nodes model, operates on internal state data
 */
export class Model
{
    constructor()
    {
        // List of views subscribed to model updates
        this.views = [];

        // Persistent state
        this.state = null;
    }

    // Register a view
    addView(view)
    {
        this.views.push(view);
    }

    detectCycles(action)
    {
        // Slightly wasteful duplication allows us to avoid polluting the model's state before we've finished detection
        let clone = new Model();
        clone.deserialize(this.serialize());

        // Simulate updating the model with the ConnectNodes action
        action.update(clone);

        return detectCycles(clone.state);
    }

    // Reinitialize the state for a brand new project
    new()
    {
        // Persistent state
        this.state = {
            title: 'New Project',
            nodes: {},
        };

        this.load(this.state);
    }

    // Load the JSON state into the model
    load(state)
    {
        // Normalize the project state to support older formats
        normalizeProject(state);

        // Check that the state encoding is valid
        validateProject(state);

        // Initialize missing params to default values
        // This is for backwards compatibility with older projects
        for (let id in state.nodes)
        {
            let node = state.nodes[id];
            let keys = Object.keys(node);
            let schema = NODE_SCHEMA[node.type];
            for (let param of schema.params)
            {
                if (!(param.name in node.params))
                {
                    node.params[param.name] = param.default;
                }
            }
        }

        // Recursively find the maximum nodeId in a set of nodes
        function findMaxId(nodes, maxId)
        {
            for (let nodeId in nodes)
            {
                nodeId = Number(nodeId);
                maxId = Math.max(maxId, nodeId);
                let node = nodes[nodeId];
                if (node.type == 'Module')
                    maxId = findMaxId(node.nodes, maxId);
            }

            return maxId;
        }

        // Next unique nodeId to be allocated
        this.nextFreeId = findMaxId(state.nodes, -1) + 1;

        // Last undoable action performed
        this.lastAction = null;

        // Stack of past states and actions tracked for undo
        this.undoStack = [];

        // Stack of actions tracked for redo
        this.redoStack = [];

        // Store the new state
        this.state = state;

        // Flag indicating if we're playing audio or not
        this.playing = false;

        // Broadcast state update
        this.broadcast(this.state, null);
    }

    // Serializes the model into a string representation
    serialize()
    {
        // TODO: eventually, we could add some kind of compression
        // scheme in the serialization

        let state = treeCopy(this.state);
        resetState(state);
        return JSON.stringify(state);
    }

    /**
     * Tries to deserialize a JSON string representation of a model
     * Returns true if successfully deserialized and loaded, false otherwise
     */
    deserialize(data)
    {
        assert(isString(data));
        let json = JSON.parse(data);

        assert (isObject(json));
        this.load(json);
    }

    /**
     * Get the next available nodeId
     */
    getFreeId()
    {
        let nodeId = String(this.nextFreeId++);
        assert (!(nodeId in this.state.nodes));
        return nodeId;
    }

    /**
     * Get the current state for a given nodeId
     */
    getNodeState(nodeId)
    {
        assert (nodeId in this.state.nodes);
        return this.state.nodes[nodeId];
    }

    /**
     * Check if the graph contains a specific type of node
     */
    hasNode(nodeType)
    {
        // Compute the next available id
        for (let id in this.state.nodes)
        {
            let node = this.state.nodes[id];
            if (node.type == nodeType)
                return true;
        }

        return false;
    }

    /**
     * Returns the number of nodes in the model
     * This is used in unit tests
     */
    get numNodes()
    {
        return Object.keys(this.state.nodes).length;
    }

    // Returns the minimum information required to copy a set of nodes
    copy(nodeIds)
    {
        console.log('copy nodes');

        let data = {
            nodes: {}
        };

        if (!nodeIds)
            return data;

        // Start by fully copying node information.
        for (let nodeId of nodeIds)
        {
            let node = this.state.nodes[nodeId];

            if (!node)
                continue;

            data.nodes[nodeId] = treeCopy(node);
        }

        // Filter port connections. We only retain connections that start and
        // end among the nodes being copied
        for (let nodeId of nodeIds)
        {
            let node = data.nodes[nodeId];

            node.ins = node.ins.map((input) => {
                // Filter out unexpected values
                if (!(input instanceof Array))
                    return null;

                // Filter out connections outside the copied nodes
                let [inputNodeId] = input;
                if (!data.nodes[inputNodeId])
                    return null;

                return input;
            });
        }

        // Reset transient state for the copied nodes
        resetState(data);

        return data;
    }

    // Broadcast an update to all views
    broadcast(newState, action)
    {
        for (let view of this.views)
        {
            view.update(newState, action);
        }
    }

    // Apply an action to the model
    update(action)
    {
        //console.log('update model', action.constructor.name);

        assert (!('nodeId' in action) || action.nodeId in this.state.nodes);

        // If this action is undoable
        if (action.undoable)
        {
            // Save the state and action for undo
            this.addUndo(action);

            // Clear the redo stack
            this.redoStack = [];
        }

        // Update the model based on the action
        let retVal = action.update(this);

        // Broadcast the new state and action
        this.broadcast(this.state, action);

        return retVal;
    }

    // Add an action to the undo queue
    addUndo(action)
    {
        // Limit the maximum undo stack length
        if (this.undoStack.length >= MAX_UNDO_STEPS)
        {
            this.undoStack.shift();
        }

        // If there is a previous undo action
        if (this.undoStack.length > 0 && this.lastAction)
        {
            let prev = this.undoStack[this.undoStack.length-1];
            let combinable = action.combinable(this.lastAction);

            // If this action can be combined with the previous
            if (combinable)
            {
                // Don't store a copy of the current state for undo
                return;
            }
        }

        // Store a copy of the state for undo
        this.undoStack.push(treeCopy(this.state));
        this.lastAction = action;
    }

    // Undo the last action performed
    undo()
    {
        if (this.undoStack.length == 0)
            return;

        // Store the current state in the redo stack
        this.redoStack.push(treeCopy(this.state));

        // Restore the previous model state
        this.state = this.undoStack.pop();
        this.lastAction = null;

        // Broadcast the state update
        this.broadcast(this.state, null);
    }

    // Redo an action that was undone
    redo()
    {
        if (this.redoStack.length == 0)
            return;

        // Store a copy of the current state for undo
        this.undoStack.push(treeCopy(this.state));

        // Restore the redo state
        this.state = this.redoStack.pop();

        // Broadcast the state update
        this.broadcast(this.state, null);
    }
}
