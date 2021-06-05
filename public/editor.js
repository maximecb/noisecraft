import { Dialog, assert, setSvg } from './utils.js';
import { NODE_DESCR } from './model.js';
import * as model from './model.js';

export class Editor
{
    constructor(model)
    {
        // Stateful graph model
        this.model = model;
        model.addView(this);

        // Map of node ids to UI node objects
        this.nodes = new Map();

        // Graph editing tab
        // This is used to scroll and to resize the editor
        this.editorDiv = document.getElementById('editor_div');

        // Div that will contain graph nodes
        this.graphDiv = document.getElementById('graph_div');

        // SVG element to draw edges into
        this.svg = document.getElementById('graph_svg');

        // Text instructing the user on how to create the first node
        this.bgText = document.getElementById('graph_bg_text');

        // List of currently selected nodes
        this.selected = [];

        // Mouse position at the start of a group selection
        this.startMousePos = null;

        // Last mouse position during node movement
        this.lastMousePos = null;

        // Port in the process of being connected
        this.port = null;

        // Mouse movement callback
        function mouseMove(evt)
        {
            var curPos = this.getMousePos(evt);
    
            // If currently dragging a node
            if (this.selected.length > 0)
            {
                this.moveNodes(curPos);
            }
    
            // If currently connecting a port
            if (this.port)
            {
                setSvg(this.port.line, 'x2', curPos.x);
                setSvg(this.port.line, 'y2', curPos.y);
            }
        }
    
        // Mouse click callback
        function mouseClick(evt)
        {
            console.log('mouseClick');

            /*
            // If in the process of connecting an edge, and there's a
            // click anywhere that's not another port, cancel the connection
            if (this.port)
            {
                console.log('abort edge connection');
                this.svg.removeChild(this.port.line);
                this.port = null;
                return;
            }
            */
    
            // This event may get triggered while dragging knob controls
            if (evt.target === this.svg)
            {
                this.createNodeDialog(this.getMousePos(evt));
                evt.stopPropagation();
                return;
            }
        }

        this.graphDiv.onmousemove = mouseMove.bind(this);
        this.graphDiv.ontouchmove = mouseMove.bind(this);
        this.graphDiv.onclick = mouseClick.bind(this);

        // If the window is resized, adjust the graph size
        window.onresize = this.resize.bind(this);

        // Initialize the graph size to fill the window
        this.resize();
    }

    // Update the GUI view
    update(newState, action)
    {
        // TODO
    }

    // Resize the graph to fit all nodes
    resize()
    {
        // Initialize the graph size to the edit tab size
        setSvg(this.svg, 'width', this.editorDiv.clientWidth);
        setSvg(this.svg, 'height', this.editorDiv.clientHeight);

        /*
        // Make sure the div fits all the nodes
        for (let id in this.graph.nodes)
        {
            let data = this.graph.nodes[id];
            let node = this.nodes.get(data);
            this.fitNode(node);
        }
        */
    }

    // Transform the mouse position of a mouse event relative to the SVG canvas
    getMousePos(evt)
    {
        var CTM = this.svg.getScreenCTM();

        if (evt.touches)
            evt = evt.touches[0];

        return {
            x: (evt.clientX - CTM.e) / CTM.a,
            y: (evt.clientY - CTM.f) / CTM.d
        };
    }

    // Show node creation dialog
    createNodeDialog(mousePos)
    {
        console.log('createNodeDialog');

        // Dialog contents
        var div = document.createElement('div');
        var dialog = new Dialog('Create Node', div);
        div.style['text-align'] = 'center';

        // Display the possible node types to create
        for (let nodeType in NODE_DESCR)
        {
            let descr = NODE_DESCR[nodeType];

            // Don't show internal node types
            if (descr.internal)
                continue;

            function subDivClick(evt)
            {
                dialog.close();
                evt.stopPropagation();

                this.model.update(new model.CreateNode(
                    nodeType,
                    mousePos.x,
                    mousePos.y
                ));
            }

            // TODO: migrate this to CSS
            var subDiv = document.createElement('div');
            subDiv.title = descr.description;
            subDiv.style.border = "2px solid #AAA";
            subDiv.style.display = 'inline-block';
            subDiv.style.color = '#FFF';
            subDiv.style['text-align'] = 'center';
            subDiv.style['user-select'] = 'none';
            subDiv.style.width = '100px';
            subDiv.style.margin = '4px';
            subDiv.appendChild(document.createTextNode(nodeType));
            subDiv.onclick = subDivClick.bind(this);

            // There can be only one AudioOut or Notes node
            if ((nodeType == 'AudioOut' && this.model.hasNode('AudioOut')) ||
                (nodeType == 'Notes' && this.model.hasNode('Notes')))
            {
                subDiv.style.color = '#777';
                subDiv.style.border = '2px solid #777';
                subDiv.onclick = undefined;
            }

            div.appendChild(subDiv);
        }
    }

    // Create a new node
    createNode(id, state)
    {
        console.log(`Editor.createNode, id=${id}`);

        let node = new Node(id, state, this);
        this.nodes.set(id, node);

        this.graphDiv.appendChild(node.nodeDiv);
    }

    // Move selected nodes to a new position
    moveNodes(mousePos)
    {
        assert (this.lastMousePos);
        let dx = mousePos.x - this.lastMousePos.x;
        let dy = mousePos.y - this.lastMousePos.y;
        this.lastMousePos = mousePos;

        this.model.update(new model.MoveSelected(
            dx,
            dy
        ));
    }
}

/** Represent a node in the UI */
class Node
{
    constructor(id, state, editor)
    {
        // Graph editor
        this.editor = editor;

        // Descriptor for this node type
        this.desc = NODE_DESCR[state.type];

        this.nodeId = id;
        this.nodeType = state.type;
        this.nodeName = state.name;
        this.x = state.x;
        this.y = state.y;
        this.numIns = this.desc.ins.length;
        this.numOuts = this.desc.outs.length;

        // DOM div wrapping the whole node
        this.nodeDiv = null;

        // DOM div for the node header
        this.headerDiv = null;

        // DOM div wrapping center elements
        this.centerDiv = null;

        // DOM divs for port connectors, mapped by port name
        this.inPorts = {};
        this.outPorts = {};

        // Input and output edges, mapped by port names
        this.inEdges = {};
        this.outEdges = {};

        // There can be multiple output edges per output port
        for (let portName in this.outEdges)
            this.outEdges[portName] = [];

        this.genNodeDOM(state.name);
    }

    // Setup DOM elements for this node
    genNodeDOM()
    {
        function startDrag(evt)
        {
            // Shift + click is delete node
            if (evt.shiftKey)
                return;

            // Can't drag a node while connecting a port
            if (this.port)
                return;

            console.log('start drag node:', this.nodeType);

            this.editor.model.update(new model.SelectNodes([this.nodeId]));
            this.editor.lastMousePos = this.editor.getMousePos(evt);
            this.startX = this.x;
            this.startY = this.y;

            evt.stopPropagation();
        }

        function endDrag(evt)
        {
            if (this.editor.selected)
            {
                console.log('end drag');
                this.editor.model.update(new model.Deselect([this.nodeId]));
                this.editor.lastMousePos = null;
            }
        }

        function delNode(evt)
        {
            // Only delete on shift+click
            if (evt.shiftKey && !this.editor.port)
                this.editor.delNode(this);

            evt.preventDefault();
            evt.stopPropagation();
        }

        // Top-level element for this node
        this.nodeDiv = document.createElement('div');
        this.nodeDiv.className = 'node';
        this.nodeDiv.style.left = this.x;
        this.nodeDiv.style.top = this.y;
        this.nodeDiv.onmousedown = startDrag.bind(this);
        this.nodeDiv.ontouchstart = startDrag.bind(this);
        this.nodeDiv.onmouseup = endDrag.bind(this);
        this.nodeDiv.ontouchend = endDrag.bind(this);
        this.nodeDiv.onclick = delNode.bind(this);
        //this.nodeDiv.ondblclick = this.paramsDialog.bind(this);

        // Node header text
        this.headerDiv = document.createElement('div');
        this.headerDiv.className = 'node_header';
        this.headerDiv.textContent = this.nodeName;
        this.headerDiv.title = this.nodeType;
        this.nodeDiv.appendChild(this.headerDiv);

        let contentDiv = document.createElement('div');
        contentDiv.className = 'node_content';
        this.nodeDiv.appendChild(contentDiv);

        let inPortsDiv = document.createElement('div');
        inPortsDiv.className = 'node_in_ports';
        contentDiv.appendChild(inPortsDiv);

        // Create a div to contain center display elements (if any)
        this.centerDiv = document.createElement('div');
        this.centerDiv.className = 'node_center';
        contentDiv.appendChild(this.centerDiv);

        let outPortsDiv = document.createElement('div');
        outPortsDiv.className = 'node_out_ports';
        contentDiv.appendChild(outPortsDiv);

        // Create the inputs
        for (var i = 0; i < this.numIns; ++i)
        {
            this.genPortDOM(
                inPortsDiv,
                i,
                this.desc.ins[i].name,
                'input'
            );
        }

        // Create the outputs
        for (var i = 0; i < this.numOuts; ++i)
        {
            this.genPortDOM(
                outPortsDiv,
                i,
                this.desc.outs[i],
                'output'
            );
        }
    }

    // Setup DOM nodes for a connection port
    genPortDOM(parentDiv, portIdx, portName, side)
    {
        let editor = this.editor;

        function portClick(evt)
        {
            evt.stopPropagation();

            console.log('port click');

            let [cx, cy] = this.getPortPos(portIdx, side);

            if (!editor.port)
            {
                // If this is an input port, remove previous connections
                if (side == 'input')
                {
                    this.disconnect(portIdx);
                    editor.onGraphChange(editor.graph, editor.nodes);
                }

                var line = makeSvg('line');
                setSvg(line, 'x1', this.x + cx);
                setSvg(line, 'y1', this.y + cy);
                setSvg(line, 'x2', this.x + cx);
                setSvg(line, 'y2', this.y + cy);
                setSvg(line, 'stroke', '#FFF');
                setSvg(line, 'stroke-width', '2');
                editor.svg.appendChild(line);

                editor.port = {
                    node: this,
                    portIdx: portIdx,
                    side: side,
                    line: line,
                    cx: cx,
                    cy: cy
                };

                return;
            }

            // Must connect in to out
            if (editor.port.side == side)
                return;

            if (side == 'input')
            {
                // Remove previous connections on this input port
                this.disconnect(portIdx);

                this.connect(
                    editor.port.node,
                    editor.port.portIdx,
                    this,
                    portIdx,
                    editor.port.line,
                );
            }
            else
            {
                this.connect(
                    this,
                    portIdx,
                    editor.port.node,
                    editor.port.portIdx,
                    editor.port.line
                );
            }

            // Connected
            editor.port = null;

            //editor.onGraphChange(editor.graph, editor.nodes);
        }

        let portDiv = document.createElement('div');
        portDiv.className = (side == 'input')? 'node_in_port':'node_out_port';
        portDiv.onclick = portClick.bind(this);
        parentDiv.appendChild(portDiv);

        // Port name text
        let textDiv = document.createElement('div');
        textDiv.className = 'port_text';
        textDiv.appendChild(document.createTextNode(portName));
        portDiv.appendChild(textDiv);

        let connDiv = document.createElement('div');
        connDiv.className = 'port_conn';
        portDiv.appendChild(connDiv);

        /*
        if (side == 'input')
        {
            this.inPorts[portIdx] = connDiv;
        }
        else
        {
            this.outPorts[portIdx] = connDiv;
        }
        */
    }

    moveTo(x, y)
    {
        //console.log(`moving node to x=${x}, y=${y}`);

        // Move the node
        this.nodeDiv.style.left = x;
        this.nodeDiv.style.top = y;

        /*
        for (var i = 0; i < this.inLines.length; ++i)
        {
            var line = this.inLines[i];
            if (line)
            {
                var x2 = Number(getSvg(line, 'x2'));
                var y2 = Number(getSvg(line, 'y2'));
                setSvg(line, 'x2', x2 + dx);
                setSvg(line, 'y2', y2 + dy);
            }
        }

        for (var i = 0; i < this.outLines.length; ++i)
        {
            var lines = this.outLines[i];

            for (var j = 0; j < lines.length; ++j)
            {
                var line = lines[j];

                if (line)
                {
                    var x1 = Number(getSvg(line, 'x1'));
                    var y1 = Number(getSvg(line, 'y1'));
                    setSvg(line, 'x1', x1 + dx);
                    setSvg(line, 'y1', y1 + dy);
                }
            }
        }
        */

        // Adjust the graph to fit this node
        //this.editor.fitNode(this, true);
    }
}

/** Represent a connection between UI nodes */
class Edge
{
    constructor()
    {
    }




}
