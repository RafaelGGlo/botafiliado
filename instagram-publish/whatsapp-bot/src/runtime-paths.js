import path from 'node:path';
export const projectRoot = path.resolve(import.meta.dirname, '../../..');
// One account, one state directory, regardless of entrypoint or shell cwd.
export const stateRoot = path.join(projectRoot, 'whatsapp-bot');
