import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function exists(p) {
	try { await fs.access(p); return true; } catch { return false; }
}

async function findLinuxBinary() {
	const dist = path.join(__dirname, '..', 'dist');
	const entries = await fs.readdir(dist);
	const candidate = entries.find(f => /sevrin.*linux/i.test(f));
	if (!candidate) throw new Error('Linux binary not found in dist. Run: npm run build:pkg');
	return path.join(dist, candidate);
}

async function ensureFileExec(p) {
	try {
		await fs.chmod(p, 0o755);
	} catch {}
}

async function writeDesktopFile(appDir) {
	const desktop = `[Desktop Entry]\nType=Application\nName=Sevrin\nExec=sevrin\nTerminal=true\nCategories=Utility;Security;\n`;
	const appsDir = path.join(appDir, 'usr', 'share', 'applications');
	await fs.mkdir(appsDir, { recursive: true });
	await fs.writeFile(path.join(appsDir, 'sevrin.desktop'), desktop);
}

async function writeAppRun(appDir) {
	const appRunPath = path.join(appDir, 'AppRun');
	const script = `#!/bin/sh\nHERE=\"$(dirname \"$0\")\"\nexec \"$HERE/usr/bin/sevrin\" "$@"\n`;
	await fs.writeFile(appRunPath, script);
	await fs.chmod(appRunPath, 0o755);
}

async function buildAppImage() {
	if (os.platform() !== 'linux') {
		console.log('AppImage build must run on Linux. Please run this script in WSL/WSL2 or a Linux machine.');
		return;
	}
	const dist = path.join(__dirname, '..', 'dist');
	const appDir = path.join(dist, 'AppDir');
	await fs.rm(appDir, { recursive: true, force: true });
	await fs.mkdir(path.join(appDir, 'usr', 'bin'), { recursive: true });
	const linuxBin = await findLinuxBinary();
	const targetBin = path.join(appDir, 'usr', 'bin', 'sevrin');
	await fs.copyFile(linuxBin, targetBin);
	await ensureFileExec(targetBin);
	await writeDesktopFile(appDir);
	await writeAppRun(appDir);

	const appimagetool = 'appimagetool';
	const hasTool = await exists('/usr/bin/appimagetool') || await exists('/usr/local/bin/appimagetool');
	if (!hasTool) {
		console.log('appimagetool not found. Install via: sudo apt-get install -y appimagetool (or download from AppImageKit).');
		console.log(`AppDir prepared at: ${appDir}`);
		return;
	}

	await new Promise((resolve, reject) => {
		const child = spawn(appimagetool, [appDir, path.join(dist, 'sevrin-x86_64.AppImage')], { stdio: 'inherit' });
		child.on('exit', code => code === 0 ? resolve() : reject(new Error(`appimagetool exit ${code}`)));
	});
	console.log('AppImage created in dist/.');
}

buildAppImage().catch(err => {
	console.error(err?.message || err);
	process.exit(1);
});


