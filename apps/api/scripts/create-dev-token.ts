import 'dotenv/config';

import { loadApiConfig } from '@vms/config';

import { LocalJwtAuthenticationAdapter } from '../src/modules/identity/infrastructure/local-jwt-authentication.adapter.js';

const developmentUserId = '20000000-0000-4000-8000-000000000001';
const userId = process.argv[2] ?? developmentUserId;
const expiresIn = process.argv[3] ?? '365d';
const token = await new LocalJwtAuthenticationAdapter(loadApiConfig()).issueDevelopmentToken(
  userId,
  expiresIn,
);

process.stdout.write(`${token}\n`);
