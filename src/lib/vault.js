import { loadVault as loadVaultFile, saveVault as saveVaultFile } from './storage.js';

export async function loadVault() {
	return await loadVaultFile();
}

export async function saveVault(vaultCipherOrObj) {
	await saveVaultFile(vaultCipherOrObj);
}


