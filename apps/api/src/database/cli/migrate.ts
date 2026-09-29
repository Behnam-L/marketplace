import 'reflect-metadata';
import dataSource from '../data-source';

async function main(): Promise<void> {
  await dataSource.initialize();
  const ran = await dataSource.runMigrations({ transaction: 'each' });
  for (const m of ran) console.log(`migration applied: ${m.name}`);
  if (ran.length === 0) console.log('migrations: up to date');
  await dataSource.destroy();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
