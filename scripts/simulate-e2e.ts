import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const SIDECAR_DIR = path.join(ROOT_DIR, 'sidecar');
const SIDECAR_BIN = path.join(SIDECAR_DIR, 'nightagent-sidecar');
const TEST_LOG = path.join(SIDECAR_DIR, 'test.log');

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('🚀 Starting End-to-End Simulation...');

    // 1. Start Backend
    console.log('📦 Starting Backend...');
    const backend = spawn('npm', ['run', 'start'], { cwd: BACKEND_DIR, shell: true });

    backend.stdout.on('data', (data) => {
        console.log(`[Backend] ${data}`);
    });

    backend.stderr.on('data', (data) => {
        console.error(`[Backend Error] ${data}`);
    });

    // Wait for backend to be ready
    let backendReady = false;
    for (let i = 0; i < 30; i++) {
        try {
            await axios.get('http://localhost:3000/api/sidecar/heartbeat'); // Using heartbeat endpoint check? Or api root?
            // Actually /api/sidecar/heartbeat is POST. Let's try to get homepage or assume ready after some logs or sleep.
            // NestJS usually prints "Nest application successfully started".
            // Let's just wait 5s and then try to hit the API.
            await sleep(1000);
            backendReady = true;
            break;
        } catch (e) {
            // console.log('Waiting for backend...');
            await sleep(1000);
        }
    }

    if (!backendReady) {
        // Try one last check on a GET endpoint that exists
        try {
            await axios.get('http://localhost:3000/api/anomalies');
            backendReady = true;
        } catch (e) {
            console.error('❌ Backend failed to start.');
            backend.kill();
            process.exit(1);
        }
    }
    console.log('✅ Backend is UP.');

    // 2. Start Sidecar
    console.log('👀 Starting Sidecar...');
    // Ensure test log exists
    fs.writeFileSync(TEST_LOG, "App started\n");

    const sidecar = spawn(SIDECAR_BIN, [], { cwd: SIDECAR_DIR });
    sidecar.stdout.on('data', (data) => console.log(`[Sidecar] ${data}`));

    await sleep(2000); // Wait for sidecar to init watcher

    // 3. Inject Anomaly
    console.log('💉 Injecting Anomaly into logs...');
    const anomalyMsg = `[ERROR] DatabaseConnectionTimeout: Failed to connect to DB at ${new Date().toISOString()}`;
    fs.appendFileSync(TEST_LOG, anomalyMsg + '\n');

    // 4. Verify Backend received it
    console.log('🕵️‍♀️ Verifying Backend received anomaly...');

    let anomalyId = '';
    for (let i = 0; i < 10; i++) {
        const res = await axios.get('http://localhost:3000/api/anomalies');
        const logs = JSON.stringify(res.data);
        if (logs.includes('DatabaseConnectionTimeout')) {
            console.log('✅ Anomaly Detected by Backend!');
            anomalyId = res.data.find((a: any) => a.message.includes('DatabaseConnectionTimeout'))?.id;
            break;
        }
        await sleep(1000);
    }

    if (!anomalyId) {
        console.error('❌ Failed to detect anomaly.');
        cleanup();
        process.exit(1);
    }

    // 5. Verify Fix Proposal
    console.log('🛠 Checking for Fix Proposal...');
    for (let i = 0; i < 10; i++) {
        const res = await axios.get(`http://localhost:3000/api/fix/${anomalyId}`);
        if (res.data) {
            console.log('✅ Fix Proposal Generated!');
            console.log('--- Fix Summary ---');
            console.log(res.data.summary);
            console.log('-------------------');
            break;
        }
        await sleep(1000);
    }

    console.log('🎉 E2E Simulation SUCCESS!');
    cleanup();

    function cleanup() {
        backend.kill();
        sidecar.kill();
        // Kill any orphan node processes if spawn shell was used
        // process.kill(-backend.pid); 
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
