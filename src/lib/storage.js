import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const appDir = path.join(os.homedir(), '.sevrin');
const cfgPath = path.join(appDir, 'config.json');
const vaultPath = path.join(appDir, 'vault.json');

export async function ensureAppDirs() {
	await fs.mkdir(appDir, { recursive: true });
}

export async function loadConfig() {
	try {
		const data = await fs.readFile(cfgPath, 'utf8');
		return JSON.parse(data);
	} catch (e) {
		return null;
	}
}

export async function saveConfig(cfg) {
	await fs.writeFile(cfgPath, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

export async function loadVault() {
	try {
		const data = await fs.readFile(vaultPath, 'utf8');
		return JSON.parse(data);
	} catch (e) {
		return null;
	}
}

export async function saveVault(vaultCipherOrObj) {
	await fs.writeFile(vaultPath, JSON.stringify(vaultCipherOrObj, null, 2), { mode: 0o600 });
}

export async function wipeAllData() {
	try { await fs.rm(cfgPath, { force: true }); } catch {}
	try { await fs.rm(vaultPath, { force: true }); } catch {}
}

export { appDir, cfgPath, vaultPath };


