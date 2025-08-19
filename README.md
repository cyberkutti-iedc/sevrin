# AegisPass

A stylish, secure local CLI password manager.

- AES-256-GCM encrypted vault
- Scrypt-based master password hashing/derivation
- Local username + master password login
- Reset account wipes all data
- Add/list/search credentials
- Copy username/password to clipboard

Install (global):
- Open a terminal in this folder and run: `npm install --global .`

Run:
- `aegispass`

Dev:
- `npm install`
- `npm start`

Data:
- Windows: %USERPROFILE%\.aegispass
- macOS/Linux: ~/.aegispass

License: MIT
