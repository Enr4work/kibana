/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { FtrConfigProviderContext } from '@kbn/test';
export interface CreateTestConfigOptions {
  testFiles: string[];
  junit: { reportName: string };
  kbnTestServerArgs?: string[];
  kbnTestServerEnv?: Record<string, string>;
}
import { services } from '../../../../test_serverless/api_integration/services';

export function createTestConfig(options: CreateTestConfigOptions) {
  return async ({ readConfigFile }: FtrConfigProviderContext) => {
    const svlSharedConfig = await readConfigFile(
      require.resolve('../../../../test_serverless/shared/config.base.ts')
    );
    return {
      ...svlSharedConfig.getAll(),
      services: {
        ...services,
      },
      kbnTestServer: {
        ...svlSharedConfig.get('kbnTestServer'),
        serverArgs: [
          ...svlSharedConfig.get('kbnTestServer.serverArgs'),
          '--serverless=security',
          ...(options.kbnTestServerArgs || []),
        ],
        env: {
          ...svlSharedConfig.get('kbnTestServer.env'),
          ...options.kbnTestServerEnv,
        },
      },
      testFiles: options.testFiles,
      junit: options.junit,

      mochaOpts: {
        ...svlSharedConfig.get('mochaOpts'),
        grep: '/^(?!.*@brokenInServerless).*@serverless.*/',
      },
      reporter: '../../../node_modules/mocha-multi-reporters',
      reporterOptions: {
        configFile: './cypress/reporter_config.json',
      },
    };
  };
}
