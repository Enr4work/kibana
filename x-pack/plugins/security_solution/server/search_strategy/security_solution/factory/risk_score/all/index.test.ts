/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import { riskScore } from '.';
import type { IEsSearchResponse } from '@kbn/data-plugin/public';
import type { HostRiskScore } from '../../../../../../common/search_strategy';
import { RiskScoreEntity, RiskSeverity } from '../../../../../../common/search_strategy';
import * as buildQuery from './query.risk_score.dsl';
import { get } from 'lodash/fp';
import { ruleRegistryMocks } from '@kbn/rule-registry-plugin/server/mocks';
import type { IRuleDataClient } from '@kbn/rule-registry-plugin/server';
import { createMockEndpointAppContext } from '../../../../../endpoint/mocks';
import type { RiskScoreRequestOptions } from '../../../../../../common/api/search_strategy';
import { RiskQueries } from '../../../../../../common/api/search_strategy';

export const mockSearchStrategyResponse: IEsSearchResponse<HostRiskScore> = {
  rawResponse: {
    took: 1,
    timed_out: false,
    _shards: {
      total: 2,
      successful: 2,
      skipped: 1,
      failed: 0,
    },
    hits: {
      max_score: null,
      hits: [
        {
          _id: '4',
          _index: 'index',
          _source: {
            '@timestamp': '1234567899',
            host: {
              name: 'testUsername',
              risk: {
                rule_risks: [],
                calculated_level: RiskSeverity.high,
                calculated_score_norm: 75,
                multipliers: [],
                category_1_count: 10,
                category_1_score: 20,
                category_2_count: 1,
                category_2_score: 10,
              },
            },
          },
        },
      ],
    },
  },
  isPartial: false,
  isRunning: false,
  total: 2,
  loaded: 2,
};

const searchMock = jest.fn();

const mockDeps = {
  esClient: {} as IScopedClusterClient,
  ruleDataClient: {
    ...(ruleRegistryMocks.createRuleDataClient('.alerts-security.alerts') as IRuleDataClient),
    getReader: jest.fn((_options?: { namespace?: string }) => ({
      search: searchMock,
      getDynamicIndexPattern: jest.fn(),
    })),
  },
  savedObjectsClient: {} as SavedObjectsClientContract,
  endpointContext: createMockEndpointAppContext(),
  request: {} as KibanaRequest,
};

export const mockOptions: RiskScoreRequestOptions = {
  defaultIndex: ['logs-*'],
  riskScoreEntity: RiskScoreEntity.host,
  includeAlertsCount: true,
  factoryQueryType: RiskQueries.hostsRiskScore,
};

describe('buildRiskScoreQuery search strategy', () => {
  const buildKpiRiskScoreQuery = jest.spyOn(buildQuery, 'buildRiskScoreQuery');

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('buildDsl', () => {
    test('should build dsl query', () => {
      riskScore.buildDsl(mockOptions);
      expect(buildKpiRiskScoreQuery).toHaveBeenCalledWith(mockOptions);
    });
  });

  test('should not enhance data when includeAlertsCount is false', async () => {
    const result = await riskScore.parse(
      { ...mockOptions, includeAlertsCount: false },
      mockSearchStrategyResponse,
      mockDeps
    );

    expect(get('data[0].alertsCount', result)).toBeUndefined();
  });

  test('should enhance data with alerts count', async () => {
    const alertsCunt = 9999;
    searchMock.mockReturnValue({
      aggregations: {
        alertsByEntity: {
          buckets: [
            {
              key: 'testUsername',
              doc_count: alertsCunt,
              oldestAlertTimestamp: {
                value_as_string: '12345566',
              },
            },
          ],
        },
      },
    });

    const result = await riskScore.parse(mockOptions, mockSearchStrategyResponse, mockDeps);

    expect(get('data[0].alertsCount', result)).toBe(alertsCunt);
  });

  test('should enhance data with alerts oldest timestamp', async () => {
    const oldestAlertTimestamp = 'oldestTimestamp_test';
    searchMock.mockReturnValue({
      aggregations: {
        oldestAlertTimestamp: {
          value_as_string: oldestAlertTimestamp,
        },
      },
    });

    searchMock.mockReturnValue({
      aggregations: {
        alertsByEntity: {
          buckets: [
            {
              key: 'testUsername',
              doc_count: 1,
              oldestAlertTimestamp: {
                value_as_string: oldestAlertTimestamp,
              },
            },
          ],
        },
      },
    });

    const result = await riskScore.parse(mockOptions, mockSearchStrategyResponse, mockDeps);

    expect(get('data[0].oldestAlertTimestamp', result)).toBe(oldestAlertTimestamp);
  });

  test('should filter enhance query by time range', async () => {
    await riskScore.parse(
      {
        ...mockOptions,
        alertsTimerange: {
          from: 'now-5m',
          to: 'now',
          interval: '1m',
        },
      },
      mockSearchStrategyResponse,
      mockDeps
    );

    expect(searchMock.mock.calls[0][0].query.bool.filter).toEqual(
      expect.arrayContaining([
        {
          range: {
            '@timestamp': { format: 'strict_date_optional_time', gte: 'now-5m', lte: 'now' },
          },
        },
      ])
    );
  });
});
