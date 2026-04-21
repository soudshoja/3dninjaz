"use server";

// ============================================================================
// Phase 9 (09-01) — Delyva-specific server-action surface.
//
// Next.js 15 "use server" modules can only export `async function`s — plain
// re-exports or non-async const exports fail at build time. So this file
// contains thin wrappers around the heavy lifters in ./shipping.ts rather
// than a barrel re-export.
//
//   import { testDelyvaConnection, bookShipmentForOrder } from '@/actions/delyva';
// ============================================================================

import {
  testDelyvaConnection as _testDelyvaConnection,
  listDelyvaServices as _listDelyvaServices,
  registerWebhooks as _registerWebhooks,
  bookShipmentForOrder as _bookShipmentForOrder,
  cancelShipment as _cancelShipment,
  refreshShipmentStatus as _refreshShipmentStatus,
  quoteRatesForOrder as _quoteRatesForOrder,
  getOrderShipment as _getOrderShipment,
  refreshServiceCatalog as _refreshServiceCatalog,
  getServiceCatalog as _getServiceCatalog,
  updateServiceEnabled as _updateServiceEnabled,
  updateCompanyEnabled as _updateCompanyEnabled,
  batchUpdateServiceEnabled as _batchUpdateServiceEnabled,
} from "./shipping";

export async function testDelyvaConnection() {
  return _testDelyvaConnection();
}

export async function listDelyvaServices() {
  return _listDelyvaServices();
}

export async function registerWebhooks() {
  return _registerWebhooks();
}

export async function bookShipmentForOrder(
  orderId: string,
  serviceCode: string,
  opts?: { quotedPrice?: string | null },
) {
  return _bookShipmentForOrder(orderId, serviceCode, opts);
}

export async function cancelShipment(orderId: string) {
  return _cancelShipment(orderId);
}

export async function refreshShipmentStatus(orderId: string) {
  return _refreshShipmentStatus(orderId);
}

export async function quoteRatesForOrder(orderId: string) {
  return _quoteRatesForOrder(orderId);
}

export async function getOrderShipment(orderId: string) {
  return _getOrderShipment(orderId);
}

// Phase 15 — catalog actions

export async function refreshServiceCatalog() {
  return _refreshServiceCatalog();
}

export async function getServiceCatalog() {
  return _getServiceCatalog();
}

export async function updateServiceEnabled(
  serviceCode: string,
  enabled: boolean,
) {
  return _updateServiceEnabled(serviceCode, enabled);
}

export async function updateCompanyEnabled(
  companyCode: string,
  enabled: boolean,
) {
  return _updateCompanyEnabled(companyCode, enabled);
}

export async function batchUpdateServiceEnabled(
  changes: Record<string, boolean>,
) {
  return _batchUpdateServiceEnabled(changes);
}
