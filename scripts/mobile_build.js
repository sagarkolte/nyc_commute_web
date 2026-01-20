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

const moved = moveDir(apiDir, hiddenApiDir);

try {
    console.log('Starting Next.js static export...');
    execSync('NEXT_PUBLIC_IS_EXPORT=true NEXT_PUBLIC_API_BASE_URL=https://nyc-commute-web.vercel.app next build', { stdio: 'inherit' });
} catch (error) {
    console.error('Build failed!');
    process.exit(1);
} finally {
    if (moved) {
        moveDir(hiddenApiDir, apiDir);
        console.log('Restored API directory');
    }
}
