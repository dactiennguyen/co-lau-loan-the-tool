import { existsSync } from 'node:fs';
import { BASELINE } from './config.ts';

/** Connection settings for the CLIs: local .env (values already in the shell win), defaults from the verified baseline. */
export function envConnection() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const env = process.env;
  return {
    host: env.CLLT_HOST, port: Number(env.CLLT_PORT ?? BASELINE.port), serverId: Number(env.CLLT_SERVER_ID ?? BASELINE.observedServerId),
    username: env.CLLT_USERNAME, password: env.CLLT_PASSWORD, proxy: env.CLLT_PROXY || undefined,
  };
}
