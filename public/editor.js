export class Editor
{
    constructor(model)
    {
        this.model = model;
        model.addView(this);

        // Map of node ids to UI node objects
        this.nodes = new WeakMap();



        
    }

    // Apply an action to the view
    apply(action)
    {
        
    }





}
