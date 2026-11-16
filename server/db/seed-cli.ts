import 'dotenv/config';
import { getDb } from './database.ts';
import { seedDatabase } from './seed.ts';

const db = getDb();
seedDatabase(db);
console.log('Database migrations and seed completed successfully.');
