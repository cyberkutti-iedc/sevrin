import figlet from 'figlet';
import gradient from 'gradient-string';
import inquirer from 'inquirer';
import ora from 'ora';
import clipboard from 'clipboardy';
import crypto from 'node:crypto';
import boxen from 'boxen';
import Table from 'cli-table3';
import { ensureAppDirs, loadConfig, saveConfig, wipeAllData } from './lib/storage.js';
import { createMasterHash, verifyMasterPassword, deriveKeyFromMaster, encryptVault, decryptVault } from './lib/crypto.js';
import { loadVault, saveVault } from './lib/vault.js';

const APP_NAME = 'Sevrin';

function sleep(ms) {
	return new Promise(r => setTimeout(r, ms));
}

async function showBanner() {
	const banner = figlet.textSync(APP_NAME, { horizontalLayout: 'fitted' });
	console.log(gradient.pastel.multiline(banner));
}

async function promptFirstRun() {
	console.log(gradient.vice("Welcome! Let's create your local account (username + master password)."));
	const { username } = await inquirer.prompt([
		{ name: 'username', message: 'Choose a username:', validate: v => v.trim() ? true : 'Username required' }
	]);
	const { master, confirm } = await inquirer.prompt([
		{ name: 'master', message: 'Choose a master password:', type: 'password', mask: '*', validate: v => v.length >= 8 ? true : 'Min 8 chars' },
		{ name: 'confirm', message: 'Confirm master password:', type: 'password', mask: '*', validate: (v, a) => v === a.master ? true : 'Passwords do not match' }
	]);
	const spinner = ora('Securing your vault...').start();
	const masterHashData = await createMasterHash(username, master);
	const cfg = {
		username,
		...masterHashData,
		createdAt: new Date().toISOString(),
	};
	await saveConfig(cfg);
	const key = await deriveKeyFromMaster(username, master, cfg);
	const cipher = await encryptVault({ entries: [] }, key);
	await saveVault(cipher);
	await sleep(600);
	spinner.succeed('Vault initialized');
}

async function preLoginMenu(config) {
	while (true) {
		const { pre } = await inquirer.prompt([
			{ name: 'pre', type: 'list', message: `Welcome, ${config.username}.`, choices: [
				{ name: 'Login', value: 'login' },
				{ name: 'Reset account (ERASE ALL)', value: 'reset' },
				{ name: 'Exit', value: 'exit' },
			]}
		]);
		if (pre === 'exit') return 'exit';
		if (pre === 'reset') {
			const { sure } = await inquirer.prompt([{ name: 'sure', type: 'confirm', message: 'This will erase ALL data. Continue?' }]);
			if (sure) {
				const sp = ora('Erasing...').start();
				await wipeAllData();
				await sleep(400);
				sp.succeed('All data erased. Re-run to set up again.');
				return 'exit';
			}
			continue;
		}
		return 'login';
	}
}

async function promptLogin(config) {
	console.log(gradient.cristal(`Hello ${config.username}. Please login.`));
	const { username } = await inquirer.prompt([
		{ name: 'username', message: 'Username:', default: config.username }
	]);
	const { master } = await inquirer.prompt([
		{ name: 'master', message: 'Master password:', type: 'password', mask: '*'}
	]);
	const spinner = ora('Verifying...').start();
	const ok = await verifyMasterPassword(username, master, config);
	await sleep(400);
	if (!ok) {
		spinner.fail('Invalid credentials');
		process.exitCode = 1;
		return null;
	}
	spinner.succeed('Welcome back');
	return { username, master };
}

async function getDecryptedVault(context) {
	try {
		const vaultCipher = await loadVault();
		if (!vaultCipher) return { entries: [] };
		const key = await deriveKeyFromMaster(context.username, context.master, context.config);
		const vault = await decryptVault(vaultCipher, key);
		return vault ?? { entries: [] };
	} catch (e) {
		ora().fail('Vault is corrupted or cannot be decrypted.');
		throw e;
	}
}

async function saveEncryptedVault(context, vault) {
	const key = await deriveKeyFromMaster(context.username, context.master, context.config);
	const cipher = await encryptVault(vault, key);
	await saveVault(cipher);
}

async function mainMenu(context) {
	const header = gradient.summer(`Logged in as ${context.username}`);
	console.log(header);
	while (true) {
		const { action } = await inquirer.prompt([
			{ name: 'action', type: 'list', message: 'Choose an action', choices: [
				{ name: 'Add credential', value: 'add' },
				{ name: 'List credentials', value: 'list' },
				{ name: 'Search', value: 'search' },
				{ name: 'Copy username', value: 'copy_user' },
				{ name: 'Copy password', value: 'copy_pass' },
				{ name: 'Reset account (ERASE ALL)', value: 'reset' },
				{ name: 'Exit', value: 'exit' },
			]}
		]);
		if (action === 'exit') break;
		if (action === 'reset') {
			const { sure } = await inquirer.prompt([
				{ name: 'sure', type: 'confirm', message: 'This will erase ALL data. Continue?' }
			]);
			if (sure) {
				const sp = ora('Erasing...').start();
				await wipeAllData();
				await sleep(500);
				sp.succeed('All data erased. Re-run to set up again.');
				process.exit(0);
			}
			continue;
		}

		let vault = await getDecryptedVault(context);

		switch (action) {
			case 'add': {
				const answers = await inquirer.prompt([
					{ name: 'name', message: 'Service name (e.g. google):', validate: v => v.trim()? true : 'Required' },
					{ name: 'login', message: 'Login/Username:', validate: v => v.trim()? true : 'Required' },
					{ name: 'password', message: 'Password:', type: 'password', mask: '*', validate: v => v ? true : 'Required' }
				]);
				vault.entries.push({ id: crypto.randomUUID(), ...answers, createdAt: new Date().toISOString() });
				await saveEncryptedVault(context, vault);
				ora().succeed('Saved');
				break;
			}
			case 'list': {
				if (vault.entries.length === 0) { console.log(gradient.pastel('No entries yet')); break; }
				const table = new Table({
					head: [gradient.retro('Service'), gradient.retro('Login')],
					colWidths: [30, 40],
					style: { head: [], border: [] }
				});
				vault.entries.forEach(e => table.push([e.name, e.login]));
				console.log(boxen(table.toString(), { padding: 1, borderColor: 'cyan', borderStyle: 'round' }));
				break;
			}
			case 'search': {
				const { q } = await inquirer.prompt([{ name: 'q', message: 'Search term:' }]);
				const term = q.toLowerCase();
				const results = vault.entries.filter(e => e.name.toLowerCase().includes(term) || e.login.toLowerCase().includes(term));
				if (results.length === 0) { console.log(gradient.passion('No matches')); break; }
				const table = new Table({ head: ['Service', 'Login'], colWidths: [30, 40], style: { head: [], border: [] } });
				results.forEach(e => table.push([e.name, e.login]));
				console.log(boxen(table.toString(), { padding: 1, borderColor: 'magenta', borderStyle: 'classic' }));
				break;
			}
			case 'copy_user':
			case 'copy_pass': {
				if (vault.entries.length === 0) { console.log('No entries'); break; }
				const { pick } = await inquirer.prompt([
					{ name: 'pick', type: 'list', message: 'Select entry', choices: vault.entries.map(e => ({ name: `${e.name} - ${e.login}`, value: e.id })) }
				]);
				const entry = vault.entries.find(e => e.id === pick);
				if (!entry) { console.log('Not found'); break; }
				const text = action === 'copy_user' ? entry.login : entry.password;
				try {
					await clipboard.write(text);
					ora().succeed(action === 'copy_user' ? 'Username copied' : 'Password copied');
				} catch (e) {
					ora().fail('Clipboard not available');
				}
				break;
			}
		}
	}
}

async function run() {
	await ensureAppDirs();
	await showBanner();
	const config = await loadConfig();
	if (!config) {
		await promptFirstRun();
		return;
	}
	const pre = await preLoginMenu(config);
	if (pre === 'exit') return;
	const auth = await promptLogin(config);
	if (!auth) return;
	await mainMenu({ ...auth, config });
}

run().catch(err => {
	ora().fail(err?.message || String(err));
	process.exitCode = 1;
});


