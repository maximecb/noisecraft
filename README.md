# NoiseCraft

Browser-based visual programming language and platform for sound synthesis.

## Contributing

We are more than happy to accept bug fixes. However, if you would like to
contribute new features or larger changes to the codebase, we recommend
that you open an issue to discuss the proposed changes first, so that we
can share feedback on what we are likely to merge and how to go about
implementing the changes.

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
