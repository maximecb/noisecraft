/**
 * Format H1/H2/H3 subsections. Add numbering and horizontal separators.
 */
function formatSections(elem)
{
    let nums = [0, 0, 0, 0, 0, 0];

    let lastLevel = 0;

    // For each child node of the help contents
    for (let child of Array.from(elem.childNodes))
    {
        if (!child.tagName)
            continue;

        let tag = child.tagName.toUpperCase();

        // If this is not a section heading tag, skip it
        if (tag[0] != 'H' || tag.length != 2)
            continue;

        // Get the heading level
        let level = parseInt(tag[1]) - 1;

        // Increment the numbering at this level
        nums[level] += 1;

        // When going back to a lower level of heading
        // Reset numbering at deeper levels of nesting
        if (level < lastLevel)
        {
            for (var i = level + 1; i < nums.length; ++i)
            {
                nums[i] = 0;
            }
        }

        lastLevel = level;

        // Format the numbering string
        let numStr = '';
        for (var i = 1; i < nums.length; ++i)
        {
            if (nums[i] == 0)
                break;

            if (numStr != '')
                numStr += '.';

            numStr += nums[i];
        }

        // Store the numbering string and original section name
        child.dataset.numStr = numStr;
        child.dataset.sectionName = child.textContent;

        // Add the numbering string to the visible section name
        child.textContent = numStr + ' ' + child.textContent;
    }

    let sections = []

    // Create a list of major sections
    for (let child of elem.childNodes)
    {
        if (child.tagName && child.tagName.toUpperCase() == 'H2')
        {
            sections.push(child);
        }
    }

    // Add hr separators between sections
    for (var i = 1; i < sections.length; ++i)
    {
        let hr = document.createElement('hr');
        elem.insertBefore(hr, sections[i]);
    }

    // Add section anchors
    for (let child of Array.from(elem.childNodes))
    {
        if (child.dataset && child.dataset.sectionName)
        {
            // Get the section name
            let name = child.dataset.sectionName;

            let anchorId = name.trim().toLowerCase().replace(/[\W]/g, '_');
            let anchor = document.createElement("a");
            anchor.id = anchorId;

            elem.insertBefore(anchor, child);
        }
    }
}

let help = document.getElementById('helpcontents');
formatSections(help);
