import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

console.log('⚡ Cliently background worker initialized (Standby for Phase 6 Queues)...');
