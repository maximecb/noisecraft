# NoiseCraft

Browser-based visual programming language and platform for sound synthesis and music making.
Once NoiseCraft is more functional and stable, it will be open sourced under the GPLv2.
When the app is deployed it will be live at https://noisecraft.app. The goal is for the app
to remain free to use and ad-free for the foreseeable future.

## Design

Design principles:
- NoiseCraft follows a minimalistic philosophy:
  - No web frameworks, just bare JS/HTML/CSS
  - Intentionally keep dependencies to a minimum
  - Prioritize features the users need
  - Avoid redundant features and feature creep
- In terms of user interface design:
  - Minimize the learning curve and reduce friction
  - Keep the user interface simple and uncluttered
  - Avoid drop-down menus and hidden options if possible
  - Use key combos and controls that will likely seem familiar to most users
  - Avoid ambiguity, use known/existing terminology wherever possible
- Practical considerations:
  - Avoid images and sound samples to keep bandwidth/server costs low
  - Avoiding sound samples also forces people to think about how to generate sounds

I would like to use a multi-page design, as opposed to a single-page app. This means
the New, Help and Browse links will open new tabs. This will avoid the users accidentally
losing their work when clicking other tabs, and make it possible for us to send new users
direct links to the Browse and Help pages, for example.

The user-interface uses an immediate-mode GUI. That is, the UI gets redrawn every time
an action is performed on the model. This makes it trivial to implement features such
as undo/redo, because we can simply store copies of previous states. It also reduces
the coupling between the UI and the model. In practice, caching will be used to avoid
redrawing the entire user interface for every single state change.

The audio is produced by the `AudioView` class, which is updated when state changes
occur in the model. This compiles the audio graph into JavaScript code that can then
be run in a background process (an `AudioWorklet`). We only use the web audio API
to output sound, not for sound synthesis. This helps guarantee that the sound
produced for a given project will be the same on any browser or device.

## Contributing

We are more than happy to accept bug fixes. However, NoiseCraft follows
a minimalist philosophy and tries to minimize dependencies. As such, we will 
be conservative about the additions to the project we accept. If you would
like to contribute new features or major changes to the codebase, we
recommend that you open an issue to discuss the proposed changes first, so
that we can share feedback on what we are likely to merge and how to go
about implementing the changes. The last thing we want is to reject changes
after you have spent a significant amount of time working on them.

## Development Setup Instructions

Installing dependencies:

```
# Install nodejs and npm
sudo apt-get install -y nodejs npm

# Update npm
sudo npm install -g npm

# Install dependencies for this project
npm install
sudo npm install --global --only=dev
```

To start the server locally:

```
node server.js
```

NoiseCraft is then accessible at `http://localhost:7773/`
