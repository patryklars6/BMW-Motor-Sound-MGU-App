'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const cp = require('node:child_process');
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
    check('real Store catalog agrees on app, tool and required version 0.4.0', () => {
        assert.deepEqual(catalog.skipped, []);
        assert.equal(appEntry.version, '0.4.0'); assert.equal(toolEntry.version, '0.4.0');
        assert.equal(appEntry.requires[audio.id], '0.4.0'); assert.equal(spec.requires[audio.id], '0.4.0');
        assert.equal(toolEntry.requires['mgu-python'], '1.0.2');
    });

    // Load the full, hash-verified upstream Updater unchanged. Adjacent UI,
    // credentials, networking and build helpers are inert because this test
    // invokes only its real requirementMet/findRequirement/installPlan methods.
    const updaterFile = path.join(upstream, 'native/mgu-updater/js/updater.js');
    const upstreamRequire = createRequire(updaterFile), upstreamModule = { exports: {} };
    const isolatedRequire = Object.assign(name => {
        if (['./login', './tokens', './build', './uids', './client', './tunnel'].includes(name)) return {};
        return upstreamRequire(name);
    }, { main: require.main });
    const updaterContext = vm.createContext({ require: isolatedRequire, module: upstreamModule,
        exports: upstreamModule.exports, process, __dirname: path.dirname(updaterFile), __filename: updaterFile,
        Buffer, console, setTimeout, clearTimeout, setImmediate, setInterval, clearInterval });
    vm.runInContext(fs.readFileSync(updaterFile, 'utf8'), updaterContext, { filename: updaterFile, timeout: 5000 });
    function planner(installed, providePython) {
        const instance = Object.create(upstreamModule.exports.Updater.prototype);
        const entries = [appEntry, toolEntry].concat(providePython ?
            [{ id: 'mgu-python', kind: 'tool', version: '1.0.2', requires: {} }] : []);
        const rows = new Map(entries.map(entry => [entry.id, { entry, source: 'fixture-github' }]));
        Object.assign(instance, { src: new Map([['fixture-github', {}]]),
            resolved: () => rows, defs: () => [{ id: 'fixture-github' }],
            installedOf: id => installed[id] ? { version: installed[id] } : null,
            // Platform acceptance is covered by the real deployer tests below.
            incompatible: () => null, providerIds: () => [] });
        return instance.installPlan(rows.get(spec.id), []);
    }
    check('real Store install plan queues Python and the complete audio tool before the existing app', () => {
        const plan = JSON.parse(JSON.stringify(planner({}, true)));
        assert.deepEqual(plan.map(item => item.id), ['mgu-python', 'luxo-motor-audio', spec.id]);
    });
    check('real Store update plan upgrades an old audio service while retaining a sufficient Python runtime', () => {
        const plan = JSON.parse(JSON.stringify(planner({ 'mgu-python': '1.0.2', 'luxo-motor-audio': '0.3.0',
            [spec.id]: '0.3.0' }, false)));
        assert.deepEqual(plan.map(item => item.id), ['luxo-motor-audio', spec.id]);
    });
    check('real Store refuses the app when no installed or available Python satisfies the audio tool', () => {
        assert.throws(() => planner({ 'mgu-python': '1.0.1' }, false), /needs mgu-python 1\.0\.2 or newer/);
    });
    const files = ['component.json'].concat(audio.files.map(item => item.from || item.path), audio.units.map(item => item.from || item.name))
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
    check('real deployer check accepts the complete rebuilt 0.4.0 audio archive', () => {
        assert.equal(good.exit, 0, good.stdout + good.stderr);
        assert.ok(good.stdout.includes('luxo-motor-audio ' + spec.version + ' ok'));
        assert.match(good.stdout, /sockets\.target\.wants/);
    });
    check('real deployer installation preflight accepts 0.4.0 without installing it', () => {
        good.context.preflightApp(audioFile);
        assert.equal(fs.existsSync(path.join(work, 'head-unit/var/opt/luxo-motor-audio/current')), false);
    });
    const members = await tar.untgz(packed, 20 << 20);
    const manifest = JSON.parse(members.find(item => item.name === 'component.json').data);
    check('packed enable, units, restart and file digest describe the actual audio payload', () => {
        assert.deepEqual(manifest.enable, [
            { unit: 'luxo-motor-audio.socket', target: 'sockets.target' },
            { unit: 'luxo-motor-diagnostics.socket', target: 'sockets.target' }
        ]);
        assert.deepEqual(manifest.restart, ['luxo-motor-audio.socket', 'luxo-motor-audio.service',
            'luxo-motor-diagnostics.socket', 'luxo-motor-diagnostics.service']);
        assert.deepEqual(manifest.units.map(item => item.name).sort(), ['luxo-motor-audio.service', 'luxo-motor-audio.socket',
            'luxo-motor-diagnostics.service', 'luxo-motor-diagnostics.socket']);
        assert.ok(members.find(item => item.name === 'units/luxo-motor-audio.socket').data.toString().includes('WantedBy=sockets.target'));
        const diagnosticUnit = members.find(item => item.name === 'units/luxo-motor-diagnostics.service').data.toString();
        assert.match(diagnosticUnit, /current\/diagnostics_bridge\.py/);
        assert.doesNotMatch(diagnosticUnit, /Requires=luxo-motor-audio/);
        assert.ok(members.find(item => item.name === 'files/diagnostic_support.py'));
        assert.ok(members.find(item => item.name === 'files/media_source.js'));
        assert.ok(members.find(item => item.name === 'files/managed_media.py'));
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
        assert.equal(descriptor.id, 'patryklars6_motor_sound'); assert.equal(descriptor.version, '0.4.0');
        assert.equal(JSON.stringify(descriptor.hmi), '["ID7"]');
    });
    const previousApp = await tar.untgz(fs.readFileSync(path.join(root, 'packages', 'patryklars6_motor_sound@0.2.1.tgz')), 20 << 20);
    const previousSpec = JSON.parse(previousApp.find(item => item.name === 'package/javascript/kit/app-spec.json').data);
    check('existing settings and app ID are preserved; new controls are additive', () => {
        assert.equal(spec.id, previousSpec.id);
        for (const old of previousSpec.settings) assert.deepEqual(spec.settings.find(row => row.key === old.key), old);
    });
    const optionalRoot = path.join(work, 'optional-source');
    cp.execFileSync(process.env.LUXO_TEST_PYTHON || 'python', ['-B', path.join(root, 'tools/build_soundpack.py'),
        path.join(root, 'apps/patryklars6_motor_sound/audio'), '--output', optionalRoot]);
    const optionalCatalog = await source.repoCatalog(relative => fs.promises.readFile(path.join(optionalRoot, relative)), null, null);
    const optionalEntry = optionalCatalog.components.find(entry => entry.id === 'luxo-soundpack');
    const optionalSpec = JSON.parse(fs.readFileSync(path.join(optionalRoot, 'pack/component.json')));
    const optionalFiles = ['component.json'].concat(optionalSpec.files.map(item => item.from)).map(name => ({ name,
        data: fs.readFileSync(path.join(optionalRoot, 'pack', name)), mode: 0o644 }));
    const optionalArchive = await source.packComponent(optionalEntry, optionalFiles);
    const optionalPath = write('optional-soundpack.tgz', optionalArchive);
    check('optional recording pack built by the real Store passes actual deployer preflight', () => {
        const result = deploy(optionalPath); assert.equal(result.exit, 0, result.stdout + result.stderr);
        result.context.preflightApp(optionalPath);
    });
    fs.writeFileSync(path.join(root, 'dist', 'store-preflight-0.4.0.json'), JSON.stringify({
        upstream: pin.repository, revision: pin.revision, deployerVersion: good.context.VERSION,
        host: process.platform, node: process.version, vehicleTest: false, checks: passed,
        limits: 'Unmodified upstream check/preflight in an isolated fake root; no systemd service start, donor linking, or vehicle install.',
        audioSha256: crypto.createHash('sha256').update(packed).digest('hex')
    }, null, 2) + '\n');
    fs.writeFileSync(path.join(root, 'dist', 'mgu-deploy-0.4.0-check.log'), logs.join('\n'));
    console.log('Passed ' + passed.length + ' upstream Store/deployer checks; source ' + pin.revision);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    const relative = path.relative(path.join(root, 'dist'), work);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    fs.rmSync(work, { recursive: true, force: true });
});
