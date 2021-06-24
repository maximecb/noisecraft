import { assert, treeCopy } from './utils.js';
import { NODE_SCHEMA } from './model.js';
import * as music from './music.js';

/**
 * Split delay nodes into two pseudo-nodes to break cycles
 * Produces a new graph reusing the same nodes
 * */
function splitDelays(graph)
{
    let nodes = {...graph.nodes};
    let newGraph = { nodes: nodes };

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

        // delay_read takes a delay time as input, produces an output signal
        // It does not take the signal as input
        let readNode = {...node};
        readNode.type = 'delay_read';
        readNode.id = ++maxId;
        readNode.ins = [node.ins[1]]
        nodes[readNode.id] = readNode;

        // Keep track of split delays
        splitMap[node.id] = { readId: readNode.id, writeId: writeNode.id };

        // Remove the original delay node
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

    return newGraph;
}

/**
 * Topologically sort the nodes in a graph (Kahn's algorithm)
 * */
function topoSort(graph)
{
    // Count the number of input edges going into a node
    function countInEdges(nodeId)
    {
        let node = graph.nodes[nodeId];
        let numIns = 0;

        for (let i = 0; i < node.ins.length; ++i)
        {
            let edge = node.ins[i];

            if (!edge)
                continue;

            if (remEdges.has(edge))
                continue;

            numIns++;
        }

        return numIns;
    }

    // Set of nodes with no incoming edges
    let S = [];

    // List sorted in reverse topological order
    let L = [];

    // Map of input-side edges removed from the graph
    let remEdges = new WeakSet();

    // Map of each node to a list of outgoing edges
    let outEdges = new Map();

    // Populate the initial list of nodes without input edges
    for (let nodeId in graph.nodes)
    {
        if (countInEdges(nodeId) == 0)
        {
            S.push(nodeId);
        }
    }

    // Initialize the set of list of output edges for each node
    for (let nodeId in graph.nodes)
    {
        outEdges.set(nodeId, []);
    }

    // Populate the list of output edges for each node
    for (let nodeId in graph.nodes)
    {
        let node = graph.nodes[nodeId];

        // For each input of this node
        for (let i = 0; i < node.ins.length; ++i)
        {
            let edge = node.ins[i];

            if (!edge)
                continue;

            let [srcId, srcPort] = node.ins[i];
            let srcOuts = outEdges.get(srcId);
            srcOuts.push([nodeId, edge]);
        }
    }

    // While we have nodes with no inputs
    while (S.length > 0)
    {
        // Remove a node from S, add to tail of L
        var nodeId = S.pop();
        L.push(nodeId);

        // Get the list of output edges for this node
        let nodeOuts = outEdges.get(nodeId);

        // For each outgoing edge
        for (let [dstId, edge] of nodeOuts)
        {
            // Mark the edge as removed
            remEdges.add(edge);

            // If the node has no more incoming edges
            if (countInEdges(dstId) == 0)
                S.push(dstId);
        }
    }

    return L;
}

/**
 * Compile a sound-generating function from a graph of nodes
 * */
export function compile(graph)
{
    function outName(nodeId, idx)
    {
        assert (typeof nodeId == 'number' || typeof nodeId == 'string');
        return 'n' + nodeId + '_' + idx;
    }

    function inVal(node, idx)
    {
        let schema = NODE_SCHEMA[node.type];
        let defVal = schema.ins[idx].default;

        if (!node.ins[idx])
            return defVal;

        let [srcId, portIdx] = node.ins[idx];
        let srcNode = graph.nodes[srcId];
        return outName(srcId, portIdx);
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

    function addDef(nodeId, str)
    {
        addLet(outName(nodeId, 0), str);
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

    // Split delay nodes
    //graph = splitDelays(graph);

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
    let audioOutId = null;

    for (let nodeId of order)
    {
        let node = graph.nodes[nodeId];

        if (node.type == 'AudioOut')
        {
            if (audioOutId !== null)
                throw 'there can be only one AudioOut node';

            audioOutId = nodeId;
        }
    }

    // Source code generated
    let src = '';

    for (let nodeId of order)
    {
        let node = graph.nodes[nodeId];

        console.log('compiling', node.type, nodeId);

        if (node.type == 'Add')
        {
            addDef(nodeId, inVal(node, 0) + ' + ' + inVal(node, 1));
            continue;
        }

        /*
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
        */

        if (node.type == 'AudioOut')
        {
            // Multiply by 0.5 to manage loudness and help avoid clipping
            addLet(outName(nodeId, 0), '0.3 * ' + inVal(node, 0));
            addLet(outName(nodeId, 1), '0.3 * ' + inVal(node, 1));
            continue;
        }

        /*
        if (node.type == 'Clock')
        {
            let params = addObj('clock', node.params);
            addDef(node, 'lib.pulse(time, ' + music.CLOCK_PPQ + ' * ' + params + '.value/60, 0.5)');
            continue;
        }
        */

        /*
        if (node.type == 'ClockOut')
        {
            let clockNode = addObj('clockout', nodeObj);
            addLine(clockNode + '.update(' + inVal(node, 0) + ')');
            continue;
        }
        */

        if (node.type == 'Const')
        {
            //let params = addObj('const', node.params);
            //addLet(outName(nodeId, 0), params + '.value');

            // FIXME: we need a proper UI node
            // The logic will be the same as for knobs
            addLet(outName(nodeId, 0), node.params.value);
            continue;
        }

        /*
        if (node.type == 'delay_write')
        {
            let delay = addObj('delay', nodeObj.delay);
            addLine(delay + '.write(' + inVal(node, 0) + ')');
            continue;
        }
        */

        /*
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
        */

        /*
        if (node.type == 'Distort')
        {
            addDef(
                nodeId,
                'lib.distort(' +
                inVal(node, 0) + ', ' +
                inVal(node, 1) + ')'
            );

            continue;
        }
        */

        if (node.type == 'Div')
        {
            addDef(nodeId, inVal(node, 0) + '? (' + inVal(node, 0) + ' / ' + inVal(node, 1) + '):0');
            continue;
        }

        /*
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
        */

        /*
        if (node.type == 'Knob')
        {
            let params = addObj('knob', node.params);
            addLet(outName(node, 0), params + '.value');
            continue;
        }
        */

        /*
        if (node.type == 'MidiIn')
        {
            let obj = addObj('midiin', nodeObj);
            addLet(outName(node, 0), obj + '.freq');
            addLet(outName(node, 1), obj + '.gate');
            continue;
        }
        */

        /*
        if (node.type == 'MonoSeq')
        {
            let seq = addObj('seq', nodeObj);

            addLine(
                'let [' + outName(node, 0) + ', ' + outName(node, 1) + '] = ' +
                seq + '.update(time, ' + inVal(node, 0) + ', ' + inVal(node, 1) + ')'
            );

            continue;
        }
        */

        if (node.type == 'Mul')
        {
            addDef(nodeId, inVal(node, 0) + ' * ' + inVal(node, 1));
            continue;
        }

        if (node.type == 'Noise')
        {
            // Produce a random value in [-1, 1]
            addDef(nodeId, '2 * Math.random() - 1');
            continue;
        }

        if (node.type == 'Notes')
        {
            continue;
        }

        /*
        if (node.type == 'Pulse')
        {
            let obj = addObj('pulse', nodeObj);
            addDef(node, obj + '.update(' + inVal(node, 0) + ', ' + inVal(node, 1) + ', sampleTime)');
            continue;
        }
        */

        /*
        if (node.type == 'Saw')
        {
            let obj = addObj('saw', nodeObj);
            addDef(node, obj + '.update(' + inVal(node, 0) + ', sampleTime)');
            continue;
        }
        */

        /*
        if (node.type == 'Scope')
        {
            let obj = addObj('scope', nodeObj);
            addDef(node, obj + '.update(' + inVal(node, 0) + ', sampleRate)');
            continue;
        }
        */

        /*
        if (node.type == 'Sine')
        {
            let obj = addObj('sine', nodeObj);
            addDef(node, obj + '.update(' + inVal(node, 0) + ', ' + inVal(node, 1) + ', sampleTime)');
            continue;
        }
        */

        /*
        if (node.type == 'Slide')
        {
            let obj = addObj('slide', nodeObj);
            addDef(node, obj + '.update(' + inVal(node, 0) + ', ' + inVal(node, 1) + ')');
            continue;
        }
        */

        if (node.type == 'Sub')
        {
            addDef(nodeId, inVal(node, 0) + ' - ' + inVal(node, 1));
            continue;
        }

        /*
        if (node.type == 'Tri')
        {
            let obj = addObj('tri', nodeObj);
            addDef(node, obj + '.update(' + inVal(node, 0) + ', sampleTime)');
            continue;
        }
        */

        throw 'unknown node type "' + node.type + '"';
    }

    // Return the audio output values
    if (audioOutId != null)
    {
        addLine('return [' + outName(audioOutId, 0) + ', ' + outName(audioOutId, 1) + ']');
    }
    else
    {
        addLine('return [0, 0]');
    }

    console.log(src);

    return src;
}
