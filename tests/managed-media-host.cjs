'use strict';
// Host AudioManager fixture, never a BMW route/speaker proof.
const fs = require('fs');
const { MediaRoute } = require('../tools/media_source');
const evidence = process.argv[2], calls = [];
let list = [{ sourceID: 13, sinkID: 71, mainConnectionID: 2, connectionState: 'CS_CONNECTED' }];
const cc = { async callMethod(method, args) {
    calls.push([method, args]);
    if (method === 'getListMainSources') return { listSources: [{ name: 'CarLifeMedia', sourceID: 24, availability: { availability: 'A_AVAILABLE' } }] };
    if (method === 'getListMainSinks') return { listSinks: [{ name: 'MediaSink_Front', sinkID: 71 }] };
    if (method === 'getListMainConnections') return { listConnections: list };
    if (method === 'connect') { list = [{ ...args, mainConnectionID: 7, connectionState: 'CS_CONNECTED' }]; return { amError: 'E_OK', mainConnectionID: 7 }; }
    if (method === 'disconnect') { list = []; return { amError: 'E_OK' }; }
    throw Error(method);
} };
const route = new MediaRoute(cc, { async callMethod() {} }, [{ name: 'smartx:CarLifeMedia_CF_48_STEREO' }]);
process.stdin.resume();
process.stdin.on('end', async () => { await route.release(); fs.writeFileSync(evidence, JSON.stringify(calls)); process.exit(0); });
route.start().then(result => process.stdout.write(JSON.stringify({ ready: true, route: result }) + '\n'),
    error => { process.stdout.write(JSON.stringify({ error: error.code }) + '\n'); process.exit(1); });
