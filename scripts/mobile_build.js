const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const apiDir = path.join(__dirname, '../src/app/api');
const hiddenApiDir = path.join(__dirname, '../src/app/_api_hidden');

function moveDir(src, dest) {
    if (fs.existsSync(src)) {
        fs.renameSync(src, dest);
        console.log(`Moved ${src} to ${dest}`);
        return true;
    }
    return false;
}

let moved = false;
try {
    // 1. Rename API folder to hide it from static export
    moved = moveDir(apiDir, hiddenApiDir);

    console.log('Cleaning clean build...');
    const nextDir = path.join(__dirname, '../.next');
    const outDir = path.join(__dirname, '../out');
    if (fs.existsSync(nextDir)) fs.rmSync(nextDir, { recursive: true, force: true });
    if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });

    console.log('Starting Next.js static export...');
    // IMPORTANT: Inject the Production API URL so the static app can talk to the backend.
    execSync('export NEXT_PUBLIC_IS_EXPORT=true && export NEXT_PUBLIC_API_BASE_URL=https://nyc-commute-web.vercel.app && npm run build', { stdio: 'inherit' });

    // 2. Restore API folder immediately after successful build
    if (moved) {
        moveDir(hiddenApiDir, apiDir);
        moved = false; // Prevent finally from renaming again
    }

    console.log('Syncing to Capacitor...');
    execSync('npx cap sync', { stdio: 'inherit' });

    console.log('✅ Mobile Build Complete!');

} catch (error) {
    console.error('❌ Build failed!');
    // Restore if needed before exiting
    if (moved) {
        moveDir(hiddenApiDir, apiDir);
    }
    process.exit(1);
}
