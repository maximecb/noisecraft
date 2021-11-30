import { assert } from './utils.js';
//import * as model from './model.js';

/**
 * Model view that updates the webpage title
 */
 export class TitleView
 {
     constructor(model)
     {
         this.model = model;
         model.addView(this);

         this.title = '';
     }

     /** Update the audio view */
     update(state, action)
     {
         let title = state.title + ' - NoiseCraft';
         assert (typeof title == 'string');

         if (this.model.playing)
             title = '▶ ' + title;

         if (title != this.title)
         {
             document.title = title;
             this.title = title;
         }
     }
 }
