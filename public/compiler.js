import { assert } from './utils.js';
import { NODE_SCHEMA } from './model.js';
//import * as synth from './synth.js';
//import * as music from './music.js';

/*
Split delay nodes into two pseudo-nodes to break cycles
Produces a new graph reusing the same nodes
*/
function splitDelays(graph, nodeMap)
{
    let nodes = {...graph.nodes};
    let newGraph = { nodes: nodes };
    let newMap = new WeakMap()

    // Copy the graph nodes
    for (let nodeId in nodes)
    {
        let origNode = nodes[nodeId];
        let node = {...origNode};
        node.ins = [...node.ins];
        node.outs = [...node.outs];

        for (var i = 0; i < node.ins.length; ++i)
        {
            node.ins[i] = node.ins[i]? {...node.ins[i]}:undefined;
        }

        // For each output port
        for (let portIdx = 0; portIdx < node.outs.length; ++portIdx)
        {
            // Copy the output edge list
            let edges = [...node.outs[portIdx]];
            node.outs[portIdx] = edges;

            // For each edge of this output port
            for (var i = 0; i < edges.length; ++i)
            {
                edges[i] = {...edges[i]};
            }
        }

        nodes[nodeId] = node;
        newMap.set(node, nodeMap.get(origNode));
    }

    // Find max node id used in the graph
    let maxId = 0;
    for (let nodeId in nodes)
    {
        maxId = Math.max(maxId, nodeId);
    }

    // Mapping of ids of delay nodes that were split
    // to the new read and write nodes
    let splitMap = {};

    // For each node
    for (let nodeId in nodes)
    {
        let node = nodes[nodeId];

        if (node.type != 'Delay')
            continue;

        // delay_write writes a value, produces no output
        let writeNode = {...node};
        writeNode.type = 'delay_write';
        writeNode.id = ++maxId;
        writeNode.ins = [node.ins[0]]
        writeNode.outs = [];
        nodes[writeNode.id] = writeNode;
        newMap.set(writeNode, newMap.get(node));

        // delay_read takes a delay time as input, produces an output signal
        // It does not take the signal as input
        let readNode = {...node};
        readNode.type = 'delay_read';
        readNode.id = ++maxId;
        readNode.ins = [node.ins[1]]
        nodes[readNode.id] = readNode;
        newMap.set(readNode, newMap.get(node));

        // Keep track of split delays
        splitMap[node.id] = { readId: readNode.id, writeId: writeNode.id };

        // Remove the original delay node
        newMap.delete(node);
        delete nodes[node.id];
    }

    // Fixup the node connections to/from delays
    for (let nodeId in nodes)
    {
        let node = nodes[nodeId];

        // For all input side edges
        for (var i = 0; i < node.ins.length; ++i)
        {
            var edge = node.ins[i];
            if (edge && edge.nodeId in splitMap)
            {
                edge.nodeId = splitMap[edge.nodeId].readId;
            }
        }

        // For all output side edges
        for (let portIdx = 0; portIdx < node.outs.length; ++portIdx)
        {
            // For each outgoing edge
            for (let edge of node.outs[portIdx])
            {
                if (edge.nodeId in splitMap)
                {
                    let readId = splitMap[edge.nodeId].readId;
                    let writeId = splitMap[edge.nodeId].writeId;
                    edge.nodeId = (edge.portIdx == 0)? writeId:readId;
                    edge.portIdx = 0;
                }
            }
        }
    }

    return [newGraph, newMap];
}

/**
Topologically sort the nodes in a graph (Kahn's algorithm)
*/
function topoSort(graph)
{
    function countInEdges(node)
    {
        var numIns = 0;

        for (var i = 0; i < node.ins.length; ++i)
        {
            var edge = node.ins[i];

            if (!edge)
                continue;

            if (remEdges.has(edge))
                continue;

            numIns++;
        }

        return numIns;
    }

    // Set of nodes with no outgoing edges
    var S = [];

    // List sorted in reverse topological order
    var L = [];

    // Map of input-side edges removed from the graph
    var remEdges = new WeakSet();

    // Populate the initial list of nodes without input edges
    for (let nodeId in graph.nodes)
    {
        var node = graph.nodes[nodeId];

        if (countInEdges(node) == 0)
        {
            S.push(node);
        }
    }

    // While we have nodes with no inputs
    while (S.length > 0)
    {
        // Remove a node from S, add to tail of L
        var node = S.pop();
        L.push(node);

        // For each outgoing port
        for (let portIdx = 0; portIdx < node.outs.length; ++portIdx)
        {
            // For each outgoing edge
            for (let edge of node.outs[portIdx])
            {
                // Mark the edge as removed
                let dstNode = graph.nodes[edge.nodeId];
                remEdges.add(dstNode.ins[edge.portIdx]);

                // If the node has no more incoming edges
                if (countInEdges(dstNode) == 0)
                    S.push(dstNode);
            }
        }
    }

    return L;
}

/**
Compile a graph into a sound generating function
*/
export function compile(graph, nodeMap)
{
    function outName(node, idx)
    {
        return 'n' + node.id + '_' + idx;
    }

    function inVal(node, idx)
    {
        let desc = nodeDescs[node.type];
        let edge = node.ins[idx];
        let defVal = desc.ins[idx].default;

        if (!edge)
            return defVal;

        let srcNode = graph.nodes[edge.nodeId];
        return outName(srcNode, edge.portIdx);
    }

    function addLine(str)
    {
        if (src)
            src += '\n';
        src += '    ' + str;
    }

    function addLet(name, str)
    {
        addLine('let ' + name + ' = ' + str);
    }

    function addDef(node, str)
    {
        addLet(outName(node, 0), str);
    }

    function addObj(prefix, obj)
    {
        if (typeof obj != 'object')
            throw 'addObj failed, not an object';

        let idx = Object.keys(lib.objs).length;
        let name = 'lib.objs.' + prefix + idx;
        lib.objs[prefix + idx] = obj;
        return name;
    }

    // TODO: addCall, format arguments?

    // Split delay nodes
    [graph, nodeMap] = splitDelays(graph, nodeMap);

    let numNodes = Object.keys(graph.nodes).length
    console.log('num nodes: ', numNodes);

    // Produce a topological sort of the graph
    let order = topoSort(graph);

    /*
    for (let node of order)
    {
        console.log(node.type, node.id);
    }
    console.log();
    */

    // Find the audio output node
    let audioOut = null;

    for (let node of order)
    {
        if (node.type == 'AudioOut')
        {
            if (audioOut)
                throw 'there can be only one AudioOut node';
            audioOut = node;
        }
    }

    // Library/helper object for the generated function
    let lib = {
        'pulse': synth.pulseOsc,
        'distort': synth.distort,
        'objs': {},
    };

    // Source code generated
    let src = '';

    for (let node of order)
    {
        console.log('compiling', node.type, node.id);

        let nodeObj = nodeMap.get(node);

        if (node.type == 'Add')
        {
            addDef(node, inVal(node, 0) + ' + ' + inVal(node, 1));
            continue;
        }

        if (node.type == 'ADSR')
        {
            let obj = addObj('adsr', nodeObj.env);

            addDef(
                node,
                obj + '.eval(time, ' +
                inVal(node, 0) + ', ' +
                inVal(node, 1) + ', ' +
                inVal(node, 2) + ', ' +
                inVal(node, 3) + ', ' +
                inVal(node, 4) + ')'
            );

            continue;
        }

        if (node.type == 'AudioOut')
        {
            // Multiply by 0.5 to manage loudness and help avoid clipping
            addLet(outName(node, 0), '0.3 * ' + inVal(node, 0));
            addLet(outName(node, 1), '0.3 * ' + inVal(node, 1));
            continue;
        }

        if (node.type == 'Clock')
        {
            let params = addObj('clock', node.params);
            addDef(node, 'lib.pulse(time, ' + music.CLOCK_PPQ + ' * ' + params + '.value/60, 0.5)');
            continue;
        }

        if (node.type == 'ClockOut')
        {
            let clockNode = addObj('clockout', nodeObj);
            addLine(clockNode + '.update(' + inVal(node, 0) + ')');
            continue;
        }

        if (node.type == 'Const')
        {
            let params = addObj('const', node.params);
            addLet(outName(node, 0), params + '.value');
            continue;
        }

        if (node.type == 'delay_write')
        {
            let delay = addObj('delay', nodeObj.delay);
            addLine(delay + '.write(' + inVal(node, 0) + ')');
            continue;
        }

        if (node.type == 'delay_read')
        {
            let delay = addObj('delay', nodeObj.delay);

            addDef(
                node,
                delay + '.' + 'read(' +
                inVal(node, 0) + ', ' +
                'sampleRate)'
            );

            continue;
        }

        if (node.type == 'Distort')
        {
            addDef(
                node,
                'lib.distort(' +
                inVal(node, 0) + ', ' +
                inVal(node, 1) + ')'
            );

            continue;
        }

        if (node.type == 'Div')
        {
            addDef(node, inVal(node, 0) + '? (' + inVal(node, 0) + ' / ' + inVal(node, 1) + '):0');
            continue;
        }

        if (node.type == 'Filter')
        {
            let obj = addObj('filter', new synth.TwoPoleFilter);
            addDef(
                node,
                obj + '.apply(' +
                inVal(node, 0) + ', ' +
                inVal(node, 1) + ', ' +
                inVal(node, 2) + ')'
            );

            continue;
        }

        if (node.type == 'Knob')
        {
            let params = addObj('knob', node.params);
            addLet(outName(node, 0), params + '.value');
            continue;
        }

        if (node.type == 'MidiIn')
        {
            let obj = addObj('midiin', nodeObj);
            addLet(outName(node, 0), obj + '.freq');
            addLet(outName(node, 1), obj + '.gate');
            continue;
        }

        if (node.type == 'MonoSeq')
        {
            let seq = addObj('seq', nodeObj);

            addLine(
                'let [' + outName(node, 0) + ', ' + outName(node, 1) + '] = ' +
                seq + '.update(time, ' + inVal(node, 0) + ', ' + inVal(node, 1) + ')'
            );

            continue;
        }

        if (node.type == 'Mul')
        {
            addDef(node, inVal(node, 0) + ' * ' + inVal(node, 1));
            continue;
        }

        if (node.type == 'Noise')
        {
            // Produce a random value in [-1, 1]
            addDef(node, '2 * Math.random() - 1');
            continue;
        }

        if (node.type == 'Notes')
        {
            continue;
        }

        if (node.type == 'Pulse')
        {
            let obj = addObj('pulse', nodeObj);
            addDef(node, obj + '.update(' + inVal(node, 0) + ', ' + inVal(node, 1) + ', sampleTime)');
            continue;
        }

        if (node.type == 'Saw')
        {
            let obj = addObj('saw', nodeObj);
            addDef(node, obj + '.update(' + inVal(node, 0) + ', sampleTime)');
            continue;
        }

        if (node.type == 'Scope')
        {
            let obj = addObj('scope', nodeObj);
            addDef(node, obj + '.update(' + inVal(node, 0) + ', sampleRate)');
            continue;
        }

        if (node.type == 'Sine')
        {
            let obj = addObj('sine', nodeObj);
            addDef(node, obj + '.update(' + inVal(node, 0) + ', ' + inVal(node, 1) + ', sampleTime)');
            continue;
        }

        if (node.type == 'Slide')
        {
            let obj = addObj('slide', nodeObj);
            addDef(node, obj + '.update(' + inVal(node, 0) + ', ' + inVal(node, 1) + ')');
            continue;
        }

        if (node.type == 'Sub')
        {
            addDef(node, inVal(node, 0) + ' - ' + inVal(node, 1));
            continue;
        }

        if (node.type == 'Tri')
        {
            let obj = addObj('tri', nodeObj);
            addDef(node, obj + '.update(' + inVal(node, 0) + ', sampleTime)');
            continue;
        }

        throw 'unknown node type "' + node.type + '"';
    }

    // Return the audio output values
    if (audioOut)
    {
        addLine('return [' + outName(audioOut, 0) + ', ' + outName(audioOut, 1) + ']');
    }
    else
    {
        addLine('return [0, 0]');
    }

    console.log(src);

    let _genSample = new Function(
        'lib',
        'time',
        'sampleRate',
        'sampleTime',
        src
    );

    function genSample(time, sampleRate, sampleTime)
    {
        return _genSample(lib, time, sampleRate, sampleTime);
    }

    return genSample;
}
