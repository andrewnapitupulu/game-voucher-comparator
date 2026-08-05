'use strict';

const codashop = require('./codashop');
const unipin = require('./unipin');
const lapakgaming = require('./lapakgaming');
const duniagames = require('./duniagames');
const { makeGenericAdapters } = require('./generic-json');

function getStoreAdapters() {
  const publicAdaptersEnabled = String(process.env.ENABLE_PUBLIC_PAGE_ADAPTERS || 'true').toLowerCase() !== 'false';
  const publicAdapters = publicAdaptersEnabled ? [codashop, unipin, lapakgaming, duniagames] : [];
  return [...publicAdapters, ...makeGenericAdapters()];
}

module.exports = { getStoreAdapters };
