import { createStoryPublisher } from '../instagram-publish/whatsapp-bot/src/instagrapi-stories.js';
const command = process.argv[2] || 'status';
if (!['status','retry-safe'].includes(command)) throw Error('Use status or retry-safe');
const publisher = createStoryPublisher({ onStatus: result => console.log(JSON.stringify(result)) });
try {
 if (command === 'retry-safe') { publisher.resetSafeRetries(); await publisher.retry(); }
 console.log(JSON.stringify(publisher.list(), null, 2));
} finally { await publisher.close(); }
