/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Component, Fragment } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { Route } from '@kbn/shared-ux-router';
import qs from 'query-string';

import {
  EuiButton,
  EuiCallOut,
  EuiLink,
  EuiCheckbox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPageSection,
  EuiScreenReaderOnly,
  EuiSpacer,
  EuiSearchBar,
  EuiSwitch,
  EuiTable,
  EuiTableBody,
  EuiTableHeader,
  EuiTableHeaderCell,
  EuiTableHeaderCellCheckbox,
  EuiTablePagination,
  EuiTableRow,
  EuiTableRowCell,
  EuiTableRowCellCheckbox,
  EuiText,
} from '@elastic/eui';

import {
  PageLoading,
  PageError,
  reactRouterNavigate,
  attemptToURIDecode,
} from '../../../../../shared_imports';
import { getDataStreamDetailsLink, getIndexDetailsLink } from '../../../../services/routing';
import { documentationService } from '../../../../services/documentation';
import { AppContextConsumer } from '../../../../app_context';
import { renderBadges } from '../../../../lib/render_badges';
import { NoMatch, DataHealth } from '../../../../components';
import { IndexActionsContextMenu } from '../index_actions_context_menu';
import { CreateIndexButton } from '../create_index/create_index_button';

const getHeaders = ({ showIndexStats }) => {
  const headers = {};

  headers.name = i18n.translate('xpack.idxMgmt.indexTable.headers.nameHeader', {
    defaultMessage: 'Name',
  });

  if (showIndexStats) {
    headers.health = i18n.translate('xpack.idxMgmt.indexTable.headers.healthHeader', {
      defaultMessage: 'Health',
    });

    headers.status = i18n.translate('xpack.idxMgmt.indexTable.headers.statusHeader', {
      defaultMessage: 'Status',
    });

    headers.primary = i18n.translate('xpack.idxMgmt.indexTable.headers.primaryHeader', {
      defaultMessage: 'Primaries',
    });

    headers.replica = i18n.translate('xpack.idxMgmt.indexTable.headers.replicaHeader', {
      defaultMessage: 'Replicas',
    });

    headers.documents = i18n.translate('xpack.idxMgmt.indexTable.headers.documentsHeader', {
      defaultMessage: 'Docs count',
    });

    headers.size = i18n.translate('xpack.idxMgmt.indexTable.headers.storageSizeHeader', {
      defaultMessage: 'Storage size',
    });
  }

  headers.data_stream = i18n.translate('xpack.idxMgmt.indexTable.headers.dataStreamHeader', {
    defaultMessage: 'Data stream',
  });

  return headers;
};

export class IndexTable extends Component {
  static getDerivedStateFromProps(props, state) {
    // Deselect any indices which no longer exist, e.g. they've been deleted.
    const { selectedIndicesMap } = state;
    const indexNames = props.indices.map((index) => index.name);
    const selectedIndexNames = Object.keys(selectedIndicesMap);
    const missingIndexNames = selectedIndexNames.filter((selectedIndexName) => {
      return !indexNames.includes(selectedIndexName);
    });

    if (missingIndexNames.length) {
      const newMap = { ...selectedIndicesMap };
      missingIndexNames.forEach((missingIndexName) => delete newMap[missingIndexName]);
      return { selectedIndicesMap: newMap };
    }

    return null;
  }

  constructor(props) {
    super(props);

    this.state = {
      selectedIndicesMap: {},
    };
  }

  componentDidMount() {
    this.props.loadIndices();
    const { location, filterChanged } = this.props;
    const { filter } = qs.parse((location && location.search) || '');
    if (filter) {
      const decodedFilter = attemptToURIDecode(filter);

      try {
        const filter = EuiSearchBar.Query.parse(decodedFilter);
        filterChanged(filter);
      } catch (e) {
        this.setState({ filterError: e });
      }
    }
  }

  componentWillUnmount() {
    // When you deep-link to an index from the data streams tab, the hidden indices are toggled on.
    // However, this state is lost when you navigate away. We need to clear the filter too, or else
    // navigating back to this tab would just show an empty list because the backing indices
    // would be hidden.
    this.props.filterChanged('');
  }

  readURLParams() {
    const { location } = this.props;
    const { includeHiddenIndices } = qs.parse((location && location.search) || '');
    return {
      includeHiddenIndices: includeHiddenIndices === 'true',
    };
  }

  setIncludeHiddenParam(hidden) {
    const { pathname, search } = this.props.location;
    const params = qs.parse(search);
    if (hidden) {
      params.includeHiddenIndices = 'true';
    } else {
      delete params.includeHiddenIndices;
    }
    this.props.history.push(pathname + '?' + qs.stringify(params));
  }

  onSort = (column) => {
    const { sortField, isSortAscending, sortChanged } = this.props;

    const newIsSortAscending = sortField === column ? !isSortAscending : true;
    sortChanged(column, newIsSortAscending);
  };

  renderFilterError() {
    const { filterError } = this.state;

    if (!filterError) {
      return;
    }

    return (
      <>
        <EuiSpacer />
        <EuiCallOut
          iconType="faceSad"
          color="danger"
          title={i18n.translate('xpack.idxMgmt.indexTable.invalidSearchErrorMessage', {
            defaultMessage: 'Invalid search: {errorMessage}',

            values: {
              errorMessage: filterError.message,
            },
          })}
        />
        <EuiSpacer />
      </>
    );
  }

  onFilterChanged = ({ query, error }) => {
    if (error) {
      this.setState({ filterError: error });
    } else {
      this.props.filterChanged(query);
      this.setState({ filterError: null });
    }
  };

  getFilters = (extensionsService) => {
    const { allIndices } = this.props;
    return extensionsService.filters.reduce((accum, filterExtension) => {
      const filtersToAdd = filterExtension(allIndices);
      return [...accum, ...filtersToAdd];
    }, []);
  };

  toggleAll = () => {
    const allSelected = this.areAllItemsSelected();
    if (allSelected) {
      return this.setState({ selectedIndicesMap: {} });
    }
    const { indices } = this.props;
    const selectedIndicesMap = {};
    indices.forEach(({ name }) => {
      selectedIndicesMap[name] = true;
    });
    this.setState({
      selectedIndicesMap,
    });
  };

  toggleItem = (name) => {
    this.setState(({ selectedIndicesMap }) => {
      const newMap = { ...selectedIndicesMap };
      if (newMap[name]) {
        delete newMap[name];
      } else {
        newMap[name] = true;
      }
      return {
        selectedIndicesMap: newMap,
      };
    });
  };

  isItemSelected = (name) => {
    return !!this.state.selectedIndicesMap[name];
  };

  areAllItemsSelected = () => {
    const { indices } = this.props;
    const indexOfUnselectedItem = indices.findIndex((index) => !this.isItemSelected(index.name));
    return indexOfUnselectedItem === -1;
  };

  buildHeader(headers) {
    const { sortField, isSortAscending } = this.props;
    return Object.entries(headers).map(([fieldName, label]) => {
      const isSorted = sortField === fieldName;
      // we only want to make index name column 25% width when there are more columns displayed
      const widthClassName =
        fieldName === 'name' && Object.keys(headers).length > 2 ? 'indTable__header__width' : '';
      return (
        <EuiTableHeaderCell
          key={fieldName}
          onSort={() => this.onSort(fieldName)}
          isSorted={isSorted}
          isSortAscending={isSortAscending}
          className={widthClassName}
          data-test-subj={`indexTableHeaderCell-${fieldName}`}
        >
          {label}
        </EuiTableHeaderCell>
      );
    });
  }

  buildRowCell(fieldName, value, index, appServices) {
    const { filterChanged, history } = this.props;

    if (fieldName === 'health') {
      return <DataHealth health={value} />;
    } else if (fieldName === 'name') {
      return (
        <Fragment>
          <EuiLink
            data-test-subj="indexTableIndexNameLink"
            onClick={() => history.push(getIndexDetailsLink(value))}
          >
            {value}
          </EuiLink>
          {renderBadges(index, appServices.extensionsService, filterChanged)}
        </Fragment>
      );
    } else if (fieldName === 'data_stream' && value) {
      return (
        <EuiLink
          data-test-subj="dataStreamLink"
          {...reactRouterNavigate(history, {
            pathname: getDataStreamDetailsLink(value),
            search: '?isDeepLink=true',
          })}
        >
          {value}
        </EuiLink>
      );
    } else if (fieldName === 'documents' && value) {
      return Number(value).toLocaleString();
    }

    return value;
  }

  buildRowCells(index, appServices, config) {
    const headers = getHeaders({ showIndexStats: config.enableIndexStats });
    return Object.keys(headers).map((fieldName) => {
      const { name } = index;
      const value = index[fieldName];

      if (fieldName === 'name') {
        return (
          <th
            key={`${fieldName}-${name}`}
            className="euiTableRowCell"
            scope="row"
            data-test-subj={`indexTableCell-${fieldName}`}
          >
            <div className={`euiTableCellContent indTable__cell--${fieldName}`}>
              <span className="eui-textLeft">
                {this.buildRowCell(fieldName, value, index, appServices)}
              </span>
            </div>
          </th>
        );
      }
      return (
        <EuiTableRowCell
          key={`${fieldName}-${name}`}
          truncateText={false}
          data-test-subj={`indexTableCell-${fieldName}`}
          className={'indTable__cell--' + fieldName}
          header={fieldName}
        >
          {this.buildRowCell(fieldName, value, index, appServices)}
        </EuiTableRowCell>
      );
    });
  }

  renderBanners(extensionsService) {
    const { allIndices = [], filterChanged } = this.props;
    return extensionsService.banners.map((bannerExtension, i) => {
      const bannerData = bannerExtension(allIndices);
      if (!bannerData) {
        return null;
      }

      const { type, title, message, filter, filterLabel } = bannerData;

      return (
        <Fragment key={`bannerExtension${i}`}>
          <EuiCallOut color={type} size="m" title={title}>
            <EuiText>
              {message}
              {filter ? (
                <EuiLink onClick={() => filterChanged(filter)}>{filterLabel}</EuiLink>
              ) : null}
            </EuiText>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </Fragment>
      );
    });
  }

  buildRows(appServices, config) {
    const { indices = [] } = this.props;
    return indices.map((index) => {
      const { name } = index;
      return (
        <EuiTableRow
          data-test-subj="indexTableRow"
          isSelected={this.isItemSelected(name)}
          isSelectable
          key={`${name}-row`}
        >
          <EuiTableRowCellCheckbox key={`checkbox-${name}`}>
            <EuiCheckbox
              type="inList"
              id={`checkboxSelectIndex-${name}`}
              checked={this.isItemSelected(name)}
              onChange={() => {
                this.toggleItem(name);
              }}
              data-test-subj="indexTableRowCheckbox"
              aria-label={i18n.translate('xpack.idxMgmt.indexTable.selectIndexAriaLabel', {
                defaultMessage: 'Select this row',
              })}
            />
          </EuiTableRowCellCheckbox>
          {this.buildRowCells(index, appServices, config)}
        </EuiTableRow>
      );
    });
  }

  renderPager() {
    const { pager, pageChanged, pageSizeChanged } = this.props;
    return (
      <EuiTablePagination
        activePage={pager.getCurrentPageIndex()}
        itemsPerPage={pager.itemsPerPage}
        itemsPerPageOptions={[10, 50, 100]}
        pageCount={pager.getTotalPages()}
        onChangeItemsPerPage={pageSizeChanged}
        onChangePage={pageChanged}
      />
    );
  }

  onItemSelectionChanged = (selectedIndices) => {
    this.setState({ selectedIndices });
  };

  renderToggleControl({ name, label }) {
    const { toggleNameToVisibleMap, toggleChanged } = this.props;
    return (
      <EuiFlexItem key={name} grow={false}>
        <EuiSwitch
          id={`checkboxToggles-${name}`}
          data-test-subj={`checkboxToggles-${name}`}
          checked={toggleNameToVisibleMap[name]}
          onChange={(event) => toggleChanged(name, event.target.checked)}
          label={label}
        />
      </EuiFlexItem>
    );
  }

  render() {
    const {
      filter,
      filterChanged,
      indices,
      loadIndices,
      indicesLoading,
      indicesError,
      allIndices,
      pager,
    } = this.props;

    const { includeHiddenIndices } = this.readURLParams();
    const hasContent = !indicesLoading && !indicesError;

    if (!hasContent) {
      if (indicesLoading) {
        return (
          <PageLoading>
            <FormattedMessage
              id="xpack.idxMgmt.indexTable.loadingIndicesDescription"
              defaultMessage="Loading indices…"
            />
          </PageLoading>
        );
      }

      if (indicesError) {
        if (indicesError.status === 403) {
          return (
            <PageError
              title={
                <FormattedMessage
                  id="xpack.idxMgmt.pageErrorForbidden.title"
                  defaultMessage="You do not have permissions to use Index Management"
                />
              }
            />
          );
        }

        return (
          <PageError
            title={
              <FormattedMessage
                id="xpack.idxMgmt.indexTable.serverErrorTitle"
                defaultMessage="Error loading indices"
              />
            }
            error={indicesError.body}
          />
        );
      }
    }

    const { selectedIndicesMap } = this.state;
    const atLeastOneItemSelected = Object.keys(selectedIndicesMap).length > 0;

    return (
      <AppContextConsumer>
        {({ services, config }) => {
          const { extensionsService } = services;
          const headers = getHeaders({ showIndexStats: config.enableIndexStats });
          const columnsCount = Object.keys(headers).length + 1;
          return (
            <EuiPageSection paddingSize="none">
              <EuiFlexGroup alignItems="center">
                <EuiFlexItem grow={true}>
                  <EuiText color="subdued">
                    <FormattedMessage
                      id="xpack.idxMgmt.home.idxMgmtDescription"
                      defaultMessage="Update your Elasticsearch indices individually or in bulk. {learnMoreLink}"
                      values={{
                        learnMoreLink: (
                          <EuiLink
                            href={documentationService.getIdxMgmtDocumentationLink()}
                            target="_blank"
                            external
                          >
                            {i18n.translate(
                              'xpack.idxMgmt.indexTableDescription.learnMoreLinkText',
                              {
                                defaultMessage: 'Learn more.',
                              }
                            )}
                          </EuiLink>
                        ),
                      }}
                    />
                  </EuiText>
                </EuiFlexItem>

                <EuiFlexItem grow={false}>
                  {(indicesLoading && allIndices.length === 0) || indicesError ? null : (
                    <EuiFlexGroup>
                      {extensionsService.toggles.map((toggle) => {
                        return this.renderToggleControl(toggle);
                      })}

                      <EuiFlexItem grow={false}>
                        <EuiSwitch
                          id="checkboxShowHiddenIndices"
                          data-test-subj="indexTableIncludeHiddenIndicesToggle"
                          checked={includeHiddenIndices}
                          onChange={(event) => this.setIncludeHiddenParam(event.target.checked)}
                          label={
                            <FormattedMessage
                              id="xpack.idxMgmt.indexTable.hiddenIndicesSwitchLabel"
                              defaultMessage="Include hidden indices"
                            />
                          }
                        />
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  )}
                </EuiFlexItem>
              </EuiFlexGroup>

              <EuiSpacer size="l" />

              {this.renderBanners(extensionsService)}

              <EuiFlexGroup gutterSize="l" alignItems="center">
                {atLeastOneItemSelected ? (
                  <EuiFlexItem grow={false}>
                    <Route
                      key="menu"
                      render={() => (
                        <IndexActionsContextMenu
                          indexNames={Object.keys(selectedIndicesMap)}
                          isOnListView={true}
                          resetSelection={() => {
                            this.setState({ selectedIndicesMap: {} });
                          }}
                        />
                      )}
                    />
                  </EuiFlexItem>
                ) : null}

                {(indicesLoading && allIndices.length === 0) || indicesError ? null : (
                  <Fragment>
                    <EuiFlexItem>
                      <EuiSearchBar
                        filters={
                          this.getFilters(extensionsService).length > 0
                            ? this.getFilters(extensionsService)
                            : null
                        }
                        defaultQuery={filter}
                        query={filter}
                        box={{
                          incremental: true,
                          placeholder: i18n.translate(
                            'xpack.idxMgmt.indexTable.systemIndicesSearchInputPlaceholder',
                            {
                              defaultMessage: 'Search',
                            }
                          ),
                          'data-test-subj': 'indicesSearch',
                        }}
                        aria-label={i18n.translate(
                          'xpack.idxMgmt.indexTable.systemIndicesSearchIndicesAriaLabel',
                          {
                            defaultMessage: 'Search indices',
                          }
                        )}
                        data-test-subj="indexTableFilterInput"
                        onChange={this.onFilterChanged}
                      />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiButton
                        isLoading={indicesLoading}
                        color="success"
                        onClick={loadIndices}
                        iconType="refresh"
                        data-test-subj="reloadIndicesButton"
                      >
                        <FormattedMessage
                          id="xpack.idxMgmt.indexTable.reloadIndicesButton"
                          defaultMessage="Reload indices"
                        />
                      </EuiButton>
                    </EuiFlexItem>
                  </Fragment>
                )}
                <EuiFlexItem grow={false}>
                  <CreateIndexButton loadIndices={loadIndices} />
                </EuiFlexItem>
              </EuiFlexGroup>

              {this.renderFilterError()}

              <EuiSpacer size="m" />

              <div style={{ maxWidth: '100%', overflow: 'auto' }}>
                <EuiTable className="indTable" data-test-subj="indexTable">
                  <EuiScreenReaderOnly>
                    <caption role="status" aria-relevant="text" aria-live="polite">
                      <FormattedMessage
                        id="xpack.idxMgmt.indexTable.captionText"
                        defaultMessage="Below is the indices table containing {count, plural, one {# row} other {# rows}} out of {total}."
                        values={{ count: indices.length, total: pager.totalItems }}
                      />
                    </caption>
                  </EuiScreenReaderOnly>

                  <EuiTableHeader>
                    <EuiTableHeaderCellCheckbox>
                      <EuiCheckbox
                        id="selectAllIndexes"
                        checked={this.areAllItemsSelected()}
                        onChange={this.toggleAll}
                        type="inList"
                        aria-label={i18n.translate(
                          'xpack.idxMgmt.indexTable.selectAllIndicesAriaLabel',
                          {
                            defaultMessage: 'Select all rows',
                          }
                        )}
                      />
                    </EuiTableHeaderCellCheckbox>
                    {this.buildHeader(headers)}
                  </EuiTableHeader>

                  <EuiTableBody>
                    {indices.length > 0 ? (
                      this.buildRows(services, config)
                    ) : (
                      <EuiTableRow>
                        <EuiTableRowCell align="center" colSpan={columnsCount}>
                          <NoMatch
                            loadIndices={loadIndices}
                            filter={filter}
                            resetFilter={() => filterChanged('')}
                            extensionsService={extensionsService}
                          />
                        </EuiTableRowCell>
                      </EuiTableRow>
                    )}
                  </EuiTableBody>
                </EuiTable>
              </div>

              <EuiSpacer size="m" />

              {indices.length > 0 ? this.renderPager() : null}
            </EuiPageSection>
          );
        }}
      </AppContextConsumer>
    );
  }
}
