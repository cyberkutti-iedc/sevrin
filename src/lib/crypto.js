import crypto from 'node:crypto';

const DEFAULT_MAXMEM = 256 * 1024 * 1024; // 256 MB
const SCRYPT_PARAMS = {
	N: 2 ** 15,
	r: 8,
	p: 1,
	maxmem: DEFAULT_MAXMEM,
};

export async function createMasterHash(username, masterPassword) {
	const salt = crypto.randomBytes(16);
	const pepper = crypto.randomBytes(16);
	const scryptSalt = Buffer.concat([Buffer.from(username, 'utf8'), salt]);
	const hash = await scryptAsync(masterPassword, scryptSalt, 64);
	return {
		kdf: 'scrypt',
		params: { ...SCRYPT_PARAMS },
		salt: salt.toString('base64'),
		pepper: pepper.toString('base64'),
		masterHash: hash.toString('base64'),
	};
}

export async function verifyMasterPassword(username, masterPassword, config) {
	if (!config?.salt || !config?.masterHash) return false;
	const scryptSalt = Buffer.concat([Buffer.from(username, 'utf8'), Buffer.from(config.salt, 'base64')]);
	const hash = await scryptAsync(masterPassword, scryptSalt, 64, config.params);
	return crypto.timingSafeEqual(Buffer.from(config.masterHash, 'base64'), hash);
}

export async function deriveKeyFromMaster(username, masterPassword, config) {
	const scryptSalt = Buffer.concat([Buffer.from(username, 'utf8'), Buffer.from(config.salt, 'base64'), Buffer.from(config.pepper, 'base64')]);
	const key = await scryptAsync(masterPassword, scryptSalt, 32, config.params);
	return key;
}

export async function encryptVault(vaultObj, key) {
	const plaintext = Buffer.from(JSON.stringify(vaultObj), 'utf8');
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const tag = cipher.getAuthTag();
	return {
		alg: 'aes-256-gcm',
		iv: iv.toString('base64'),
		tag: tag.toString('base64'),
		ct: ciphertext.toString('base64'),
		version: 1,
	};
}

export async function decryptVault(cipherObj, key) {
	if (!cipherObj) return null;
	const iv = Buffer.from(cipherObj.iv, 'base64');
	const tag = Buffer.from(cipherObj.tag, 'base64');
	const ct = Buffer.from(cipherObj.ct, 'base64');
	const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(tag);
	const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
	return JSON.parse(pt.toString('utf8'));
}

function scryptAsync(password, salt, keylen, params = SCRYPT_PARAMS) {
	return new Promise((resolve, reject) => {
		crypto.scrypt(password, salt, keylen, { N: params.N, r: params.r, p: params.p, maxmem: params.maxmem ?? DEFAULT_MAXMEM }, (err, derived) => {
			if (err) return reject(err);
			resolve(derived);
		});
	});
}


