import { Dialog, assert, setSvg } from './utils.js';
import { NODE_DESCR } from './model.js';

export class Editor
{
    constructor(model)
    {
        // Stateful graph model
        this.model = model;
        model.addView(this);

        // Map of node ids to UI node objects
        this.nodes = new WeakMap();

        // Graph editing tab
        // This is used to scroll and to resize the editor
        this.editTab = document.getElementById('tab_edit');

        // Div that will contain graph nodes
        this.div = document.getElementById('graph_div');

        // SVG element to draw edges into
        this.svg = document.getElementById('graph_svg');

        // Text instructing the user on how to create the first node
        this.bgText = document.getElementById('graph_bg_text');

        // Node object currently being dragged
        this.drag = null;

        // Port being connected
        this.port = null;

        // Mouse movement callback
        function mouseMove(evt)
        {
            var curPos = this.getMousePos(evt);
    
            // If currently dragging a node
            if (this.drag)
            {
                this.drag.dragNode(curPos);
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

        //this.div.onmousemove = mouseMove.bind(this);
        //this.div.ontouchmove = mouseMove.bind(this);
        this.div.onclick = mouseClick.bind(this);

        // If the window is resized, adjust the graph size
        window.onresize = this.resize.bind(this);

        // Initialize the graph size to fill the window
        this.resize();
    }

    // Apply an action to the GUI view
    apply(action)
    {
        // TODO
    }

    // Resize the graph to fit all nodes
    resize()
    {
        // Initialize the graph size to the edit tab size
        setSvg(this.svg, 'width', this.editTab.clientWidth);
        setSvg(this.svg, 'height', this.editTab.clientHeight);

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
                this.newNode(nodeType, mousePos.x, mousePos.y);
                dialog.close();
                evt.stopPropagation();
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













}
