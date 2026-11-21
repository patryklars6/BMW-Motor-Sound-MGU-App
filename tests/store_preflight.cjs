'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const pin = require('./store_upstream.json');
assert.ok(process.argv[2], 'Pass the pinned upstream source directory');
const upstream = path.resolve(process.argv[2]);
for (const [file, sha] of Object.entries(pin.files)) {
    const bytes = fs.readFileSync(path.join(upstream, file));
    const blob = crypto.createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
    assert.equal(blob, sha, 'Unmodified upstream required: ' + file);
}
const source = require(path.join(upstream, 'native/mgu-updater/js/sources'));
const tar = require(path.join(upstream, 'native/mgu-updater/js/tar'));
const spec = require('../apps/patryklars6_motor_sound/app.json');
const audio = require('../tools/component.json');
const work = fs.mkdtempSync(path.join(root, 'dist', 'store-preflight-'));
const deployFile = path.join(upstream, 'deploy/unit/mgu-deploy.js');
const deployCode = fs.readFileSync(deployFile, 'utf8');
const logs = [], passed = [];

function write(relative, text) {
    const file = path.join(work, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return file;
}

// The actual deployer runs unchanged. Its supported fake-root environment
// isolates hardware paths; tar still reads/extracts the real archives.
// Only the CLI exit/output and umask are captured by this host harness.
function deploy(artifact) {
    const p = rel => path.join(work, 'head-unit', rel);
    fs.mkdirSync(p('usr/lib/oap-mainapp'), { recursive: true });
    fs.mkdirSync(p('run'), { recursive: true });
    fs.mkdirSync(p('var/opt'), { recursive: true });
    fs.mkdirSync(p('etc'), { recursive: true });
    fs.writeFileSync(p('etc/group'), 'mgu_wayland:x:900:\ntm_oap_app:x:901:\n');
    const env = Object.assign({}, process.env, {
        MGU_DEPLOY_FAKE_ROOT: '1', MGU_DEPLOY_VAR_OPT: p('var/opt'), MGU_DEPLOY_ROOTFS: p(''),
        MGU_DEPLOY_ETC: p('etc'), MGU_DEPLOY_SYSTEMD: p('etc/systemd/system'),
        MGU_DEPLOY_RECMGR: p('etc/recmgr-restartlist.conf'), MGU_DEPLOY_CRASHLIST: p('etc/crashhandler-restartlist.conf'),
        MGU_DEPLOY_MAINAPP: p('usr/lib/oap-mainapp'), MGU_DEPLOY_MAINAPP21: p('usr/lib/oap-mainapp21'),
        MGU_DEPLOY_OAP: p('var/opt/public/oap'), MGU_DEPLOY_RUN: p('run'),
        MGU_DEPLOY_PROC: p('proc'), MGU_DEPLOY_PROC_STAT: p('proc/stat'), MGU_DEPLOY_PROC_MOUNTS: p('proc/mounts'),
        MGU_DEPLOY_BOOT_ID: p('proc/boot_id'), MGU_DEPLOY_CODING: p('dev/shm/rawcodingdata'),
        MGU_DEPLOY_PROV: p('usr/share/tm/prov'), MGU_DEPLOY_VMINPUT: p('usr/bin/vminput'),
        MGU_DEPLOY_PRIVACY: p('no-privacy-tool'), MGU_DEPLOY_STOCK_UNITS: p('no-stock-units'),
        MGU_DEPLOY_STOCK_BINS: p('no-stock-bins'), MGU_DEPLOY_BRIDGE_SOCKET: p('no-bridge-socket'),
        MGU_DEPLOY_TAR: process.env.LUXO_TEST_TAR || (process.platform === 'win32' ? 'C:/Windows/System32/tar.exe' : 'tar'),
        // No systemd commands or vehicle processes run on this host.
        MGU_DEPLOY_SYSTEMCTL: p('not-a-systemctl'), MGU_DEPLOY_PS: p('not-a-ps'),
        MGU_DEPLOY_DF: p('not-a-df'), MGU_DEPLOY_JOURNALCTL: p('not-a-journalctl')
    });
    let stdout = '', stderr = '', exit;
    const proc = Object.create(process);
    Object.defineProperties(proc, {
        env: { value: env }, argv: { value: [process.execPath, deployFile, 'check', '--artifact', artifact] },
        stdout: { value: { write(text) { stdout += text; } } }, stderr: { value: { write(text) { stderr += text; } } },
        exit: { value(code) { exit = code; } }, umask: { value() { return 0o022; } }
    });
    const context = vm.createContext({ require: createRequire(deployFile), process: proc, Buffer, console,
        __dirname: path.dirname(deployFile), __filename: deployFile, setTimeout, clearTimeout,
        setInterval, clearInterval, SharedArrayBuffer, Atomics });
    vm.runInContext(deployCode, context, { filename: deployFile, timeout: 15000 });
    logs.push('CHECK ' + path.basename(artifact) + '\n' + stdout + stderr + 'exit=' + exit + '\n');
    return { context, exit, stdout, stderr };
}
function check(name, fn) { fn(); passed.push(name); console.log('ok ' + passed.length + ' - ' + name); }
function refusal(fn, pattern) {
    assert.throws(fn, error => error.code === 2 && pattern.test(error.message));
}

async function main() {
    const catalog = await source.repoCatalog(relative => fs.promises.readFile(path.join(root, relative)).catch(error => {
        error.missing = error.code === 'ENOENT'; throw error;
    }), null, null);
    const appEntry = catalog.components.find(entry => entry.id === spec.id);
    const toolEntry = catalog.components.find(entry => entry.id === audio.id);
    check('real Store catalog agrees on app, tool and required version 0.2.2', () => {
        assert.deepEqual(catalog.skipped, []);
        assert.equal(appEntry.version, '0.2.2'); assert.equal(toolEntry.version, '0.2.2');
        assert.equal(appEntry.requires[audio.id], '0.2.2'); assert.equal(spec.requires[audio.id], '0.2.2');
        assert.equal(toolEntry.requires['mgu-python'], '1.0.2');
    });
    const files = ['component.json', 'overlay_bridge.py', 'systemd/luxo-motor-audio.service', 'systemd/luxo-motor-audio.socket']
        .map(name => ({ name, data: fs.readFileSync(path.join(root, 'tools', name)), mode: 0o644 }));
    const packed = await source.packComponent(toolEntry, files);
    const audioFile = path.join(root, 'dist', audio.id + '@' + audio.version + '.tgz');
    fs.writeFileSync(audioFile, packed);
    const oldFile = path.join(root, 'packages', 'luxo-motor-audio@0.2.1.tgz');
    const old = deploy(oldFile);
    check('real deployer check reproduces 0.2.1 bad enable entry with exit 2', () => {
        assert.equal(old.exit, 2); assert.match(old.stdout + old.stderr, /bad enable entry/);
        refusal(() => old.context.preflightApp(oldFile), /bad enable entry/);
    });
    const good = deploy(audioFile);
    check('real deployer check accepts the complete rebuilt 0.2.2 audio archive', () => {
        assert.equal(good.exit, 0, good.stdout + good.stderr);
        assert.match(good.stdout, /luxo-motor-audio 0\.2\.2 ok/);
        assert.match(good.stdout, /sockets\.target\.wants/);
    });
    check('real deployer installation preflight accepts 0.2.2 without installing it', () => {
        good.context.preflightApp(audioFile);
        assert.equal(fs.existsSync(path.join(work, 'head-unit/var/opt/luxo-motor-audio/current')), false);
    });
    const members = await tar.untgz(packed, 20 << 20);
    const manifest = JSON.parse(members.find(item => item.name === 'component.json').data);
    check('packed enable, units, restart and file digest describe the actual audio payload', () => {
        assert.deepEqual(manifest.enable, [{ unit: 'luxo-motor-audio.socket', target: 'sockets.target' }]);
        assert.deepEqual(manifest.restart, ['luxo-motor-audio.socket']);
        assert.deepEqual(manifest.units.map(item => item.name).sort(), ['luxo-motor-audio.service', 'luxo-motor-audio.socket']);
        assert.ok(members.find(item => item.name === 'units/luxo-motor-audio.socket').data.toString().includes('WantedBy=sockets.target'));
    });
    function damaged(name, change) {
        const entries = members.map(item => ({ name: item.name, mode: item.mode, data: Buffer.from(item.data) }));
        change(entries);
        return write(name + '.tgz', tar.tgz(entries, 1700000000));
    }
    const targetMissing = damaged('bad-enable', entries => {
        const item = entries.find(entry => entry.name === 'component.json'), data = JSON.parse(item.data);
        delete data.enable[0].target; item.data = Buffer.from(JSON.stringify(data));
    });
    check('real preflight rejects a missing enable target', () => refusal(() => good.context.preflightApp(targetMissing), /bad enable entry/));
    const payloadChanged = damaged('bad-sha', entries => { entries.find(entry => entry.name === 'files/overlay_bridge.py').data = Buffer.from('tampered'); });
    check('real preflight rejects a changed audio payload hash', () => refusal(() => good.context.preflightApp(payloadChanged), /sha256 mismatch/));
    const unitMissing = damaged('bad-unit', entries => { entries.splice(entries.findIndex(entry => entry.name === 'units/luxo-motor-audio.service'), 1); });
    check('real preflight rejects a missing service unit payload', () => refusal(() => good.context.preflightApp(unitMissing), /payload missing units/));
    const appFile = path.join(root, 'dist', spec.id + '@' + spec.version + '.tgz');
    check('real deployer validates the app archive with its unchanged ID and ID7 declaration', () => {
        const stage = path.join(work, 'app-stage'); fs.mkdirSync(stage);
        const descriptor = good.context.validateArtifact(appFile, stage);
        assert.equal(descriptor.id, 'patryklars6_motor_sound'); assert.equal(descriptor.version, '0.2.2');
        assert.equal(JSON.stringify(descriptor.hmi), '["ID7"]');
    });
    const previousApp = await tar.untgz(fs.readFileSync(path.join(root, 'packages', 'patryklars6_motor_sound@0.2.1.tgz')), 20 << 20);
    const previousSpec = JSON.parse(previousApp.find(item => item.name === 'package/javascript/kit/app-spec.json').data);
    check('settings schema and app ID remain identical to installed 0.2.1', () => {
        assert.equal(spec.id, previousSpec.id); assert.deepEqual(spec.settings, previousSpec.settings);
    });
    fs.writeFileSync(path.join(root, 'dist', 'store-preflight-0.2.2.json'), JSON.stringify({
        upstream: pin.repository, revision: pin.revision, deployerVersion: good.context.VERSION,
        host: process.platform, node: process.version, vehicleTest: false, checks: passed,
        limits: 'Unmodified upstream check/preflight in an isolated fake root; no systemd service start, donor linking, or vehicle install.',
        audioSha256: crypto.createHash('sha256').update(packed).digest('hex')
    }, null, 2) + '\n');
    fs.writeFileSync(path.join(root, 'dist', 'mgu-deploy-0.2.2-check.log'), logs.join('\n'));
    console.log('Passed ' + passed.length + ' upstream Store/deployer checks; source ' + pin.revision);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    const relative = path.relative(path.join(root, 'dist'), work);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    fs.rmSync(work, { recursive: true, force: true });
});
