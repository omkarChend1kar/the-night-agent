import { exec } from 'child_process';
import util from 'util';
import axios from 'axios';

const execAsync = util.promisify(exec);

async function main() {
    console.log('🔍 Verifying Environment for Real Integrations...');
    let hasErrors = false;

    // 1. Check Cline CLI
    try {
        const { stdout } = await execAsync('cline --version');
        console.log(`✅ Cline CLI found: ${stdout.trim()}`);
    } catch (error) {
        console.warn('⚠️  Cline CLI not found or not in PATH.');
        console.warn('   (This is expected if you haven\'t installed it on this machine yet)');
        hasErrors = true;
    }

    // 2. Check Kestra
    const kestraUrl = process.env.KESTRA_URL || 'http://localhost:8080';
    try {
        await axios.get(`${kestraUrl}/api/v1/ui/config`); // UI config is usually a safe public endpoint
        console.log(`✅ Kestra is reachable at ${kestraUrl}`);
    } catch (error) {
        console.warn(`⚠️  Kestra not reachable at ${kestraUrl}`);
        console.warn('   (This is expected if Kestra server is not running)');
        hasErrors = true;
    }

    if (hasErrors) {
        console.log('\nℹ️  Note: You can still use the system in Mock mode (default).');
        console.log('   To use Real mode, ensure tools are installed and set USE_KESTRA=true / USE_CLINE=true.');
    } else {
        console.log('\n🎉 Environment is fully ready for REAL integration!');
    }
}

main();
