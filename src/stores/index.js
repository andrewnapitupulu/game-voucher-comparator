'use strict';

const codashop = require('./codashop');
const unipin = require('./unipin');
const lapakgaming = require('./lapakgaming');
const duniagames = require('./duniagames');
const { makeGenericAdapters } = require('./generic-json');
const { createUniversalAdapter } = require('./universal-page');
const { listStores } = require('../config/stores');

const DEDICATED = {
  codashop,
  unipin,
  lapakgaming,
  duniagames
};

function buildRegistryAdapters() {
  const publicAdaptersEnabled = String(process.env.ENABLE_PUBLIC_PAGE_ADAPTERS || 'true').toLowerCase() !== 'false';
  if (!publicAdaptersEnabled) return [];
  return listStores().map((store) => DEDICATED[store.id] || createUniversalAdapter(store));
}

function selectAdapters(adapters, { offset = 0, limit = adapters.length, storeIds = [] } = {}) {
  if (storeIds.length) {
    const selected = new Set(storeIds);
    return adapters.filter((adapter) => selected.has(adapter.id));
  }
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.max(1, Math.min(20, Number(limit) || 8));
  return adapters.slice(safeOffset, safeOffset + safeLimit);
}

function getStoreAdapters(options = {}) {
  const registryAdapters = buildRegistryAdapters();
  const selectedRegistry = selectAdapters(registryAdapters, options);
  const includeFeeds = !options.offset && !options.storeIds?.length;
  return includeFeeds ? [...selectedRegistry, ...makeGenericAdapters()] : selectedRegistry;
}

function getStoreAdapterCount() {
  return buildRegistryAdapters().length;
}

module.exports = { getStoreAdapters, getStoreAdapterCount, buildRegistryAdapters };
