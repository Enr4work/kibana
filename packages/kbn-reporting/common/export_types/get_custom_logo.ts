/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import type { Headers, IUiSettingsClient } from '@kbn/core/server';
import { UI_SETTINGS_CUSTOM_PDF_LOGO } from '../constants';

export const getCustomLogo = async (uiSettingsClient: IUiSettingsClient, headers: Headers) => {
  const logo: string = await uiSettingsClient.get(UI_SETTINGS_CUSTOM_PDF_LOGO);

  // continue the pipeline
  return { headers, logo };
};
