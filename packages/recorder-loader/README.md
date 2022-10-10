# Meticulous Recorder loader

Utiliy package used to aid the injection of the Meticulous recorder snippet on web apps.

## Installing

```shell
npm install @alwaysmeticulous/recorder-loader --save
# or with yarn
yarn add @alwaysmeticulous/recorder-loader
```

## Usage

Within your app entrypoint:

```javascript
import { loadAndStartRecorder } from '@alwaysmeticulous/recorder-loader'

async function startApp() {
    // Start the Meticulous recorder before you initialise your app.
    try {
        await loadAndStartRecorder({
            projectId: '<project ID>',
        })
    } catch (err) {
        console.error(`Meticulous failed to initialise ${err}`)
    }

    // Initalise app after Meticulous' snippet, e.g:
    ReactDOM.render(component, document.getElementById('root'))
}


startApp();
```
